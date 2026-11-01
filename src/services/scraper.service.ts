import * as cheerio from 'cheerio';
import { extract } from '@extractus/article-extractor';

export interface ExtractedArticleMetadata {
  title: string;
  url: string;
  domain: string;
  author: string;
  publishedDate?: string;
  readTimeMinutes: number;
  wordCount: number;
  excerpt: string;
  coverImage?: string;
  contentType: 'article' | 'video' | 'newsletter';
  fullContentHtml?: string;
}

function resolveUrl(raw: string | undefined, baseUrl: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:') || trimmed.startsWith('#')) {
    return trimmed || undefined;
  }
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return trimmed;
  }
}

function extractYouTubeEmbed(urlStr: string): { embedUrl: string; isShort: boolean } | null {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      if (id) return { embedUrl: `https://www.youtube.com/embed/${id}`, isShort: false };
    }
    if (host.includes('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/shorts/')[1]?.split('/')[0];
        if (id) return { embedUrl: `https://www.youtube.com/embed/${id}`, isShort: true };
      }
      const v = u.searchParams.get('v');
      if (v) return { embedUrl: `https://www.youtube.com/embed/${v}`, isShort: false };
    }
  } catch {}
  return null;
}

async function inlineExpiringSvgImages($: cheerio.CheerioAPI, root: cheerio.Cheerio<any>, baseUrl: string) {
  const imgs = root.find('img').toArray();
  await Promise.all(
    imgs.slice(0, 12).map(async (imgEl) => {
      const $img = $(imgEl);
      const src = $img.attr('src') || $img.attr('data-src');
      if (!src) return;
      const absUrl = resolveUrl(src, baseUrl);
      if (!absUrl) return;
      $img.attr('src', absUrl);

      // Inline small SVG images (such as Document360 signed SVG icons that expire quickly)
      if (absUrl.toLowerCase().includes('.svg')) {
        try {
          const resp = await fetch(absUrl, { signal: AbortSignal.timeout(4000) });
          if (resp.ok) {
            const svgText = await resp.text();
            if (svgText.includes('<svg') && svgText.length < 100_000) {
              const b64 = Buffer.from(svgText, 'utf8').toString('base64');
              $img.attr('src', `data:image/svg+xml;base64,${b64}`);
            }
          }
        } catch {}
      }
    })
  );
}

const ALLOWED_CLASSES = new Set([
  'reader-extracted-root',
  'reader-callout',
  'reader-callout-body',
  'reader-callout-title',
  'reader-steps',
  'reader-code-figure',
  'reader-code-header',
  'reader-code-title-name',
  'reader-code-title-lang',
  'reader-card-grid',
  'reader-card',
  'reader-icon-img',
  'reader-video-embed',
  'reader-video-short',
  'line',
  'highlighted',
]);

async function extractRichDomContent(html: string, baseUrl: string): Promise<string | null> {
  const $ = cheerio.load(html);

  // Select the most specific article/documentation/main container available
  const candidateSelectors = [
    'article.docs-content',
    '.sl-markdown-content',
    'article.editor360-preview-content',
    '.markdown-body',
    '[itemprop="articleBody"]',
    '.article-body',
    '.article-content',
    '.post-content',
    '.entry-content',
    'main article',
    '[role="main"] article',
    'article',
    'main#main-content',
    'main#main',
    'main',
    '[role="main"]',
    '#main-content',
    '#content',
  ];

  let $root: cheerio.Cheerio<any> | null = null;
  for (const sel of candidateSelectors) {
    const found = $(sel).first();
    if (found.length > 0 && found.text().trim().length > 80) {
      $root = found.clone();
      break;
    }
  }

  if (!$root) {
    return null;
  }

  // Convert terminal command bars (e.g. omp.sh "$ curl -fsSL ...") into clean terminal code blocks before removing buttons
  $root.find('code').each((_, codeEl) => {
    const $code = $(codeEl);
    if ($code.closest('pre').length === 0 && ($code.hasClass('terminal') || $code.text().trim().startsWith('curl '))) {
      const parentBar = $code.parent();
      if (parentBar.length) {
        const cmdText = $code.text().trim();
        parentBar.replaceWith(
          `<figure class="reader-code-figure"><figcaption class="reader-code-header"><span class="reader-code-title-name">Terminal</span><span class="reader-code-title-lang">sh</span></figcaption><pre><code>$ ${cmdText}</code></pre></figure>`
        );
      }
    }
  });

  // Strip scripts, styles, navs, footers, copy buttons, anchor link icons, marquees, and decorative overlays
  $root
    .find(
      [
        'script',
        'style',
        'noscript',
        'template',
        'canvas',
        'nav',
        'footer',
        '.skip-link',
        'a.anchor-link',
        'a.sl-anchor-link',
        'a.header-anchor',
        '.table-of-contents',
        '.breadcrumbs',
        '.pagination',
        '.marquee',
        '[role="tablist"]',
        'button[aria-label*="Copy"]',
        'button[aria-pressed]',
        'button',
        '[aria-hidden="true"]:empty',
      ].join(', ')
    )
    .remove();

  // Unwrap heading wrappers (e.g., Starlight / Astro .heading-wrapper) so h2/h3 sit directly in flow
  $root.find('.heading-wrapper, .sl-heading-wrapper').each((_, wrap) => {
    const $wrap = $(wrap);
    const heading = $wrap.find('h1, h2, h3, h4, h5, h6').first();
    if (heading.length) {
      $wrap.replaceWith(heading);
    }
  });

  // Normalize callouts / admonitions (<aside>, .aside-card, .admonition, .callout)
  $root.find('aside, .aside-card, .admonition, .callout').each((_, el) => {
    const $el = $(el);
    const rawStyle = ($el.attr('style') || '').toLowerCase();
    const rawClass = ($el.attr('class') || '').toLowerCase();
    let variant = 'info';
    if (rawStyle.includes('warning') || rawClass.includes('warning') || rawClass.includes('caution')) {
      variant = 'warning';
    } else if (rawStyle.includes('danger') || rawStyle.includes('error') || rawClass.includes('danger')) {
      variant = 'danger';
    } else if (rawStyle.includes('tip') || rawStyle.includes('success') || rawClass.includes('tip')) {
      variant = 'tip';
    }
    $el.addClass('reader-callout').attr('data-callout-variant', variant);
    $el.find('.aside-card-body').addClass('reader-callout-body');
    $el.find('p.font-semibold').first().addClass('reader-callout-title');
  });

  // Normalize step lists
  $root.find('[data-nb-steps] > ol, .steps > ol').each((_, ol) => {
    $(ol).addClass('reader-steps');
  });

  // Normalize code figures & pre blocks
  $root.find('figure').each((_, fig) => {
    const $fig = $(fig);
    if ($fig.find('pre').length > 0) {
      $fig.addClass('reader-code-figure');
      const $cap = $fig.find('figcaption').first();
      if ($cap.length > 0) {
        $cap.addClass('reader-code-header');
        $cap.find('.nb-code-title-name').addClass('reader-code-title-name');
        $cap.find('.nb-code-title-lang').addClass('reader-code-title-lang');
      } else {
        const lang =
          $fig.attr('data-nb-lang') ||
          $fig.find('pre').attr('data-language') ||
          $fig.find('pre').attr('data-nb-lang');
        if (lang) {
          $fig.prepend(
            `<figcaption class="reader-code-header"><span class="reader-code-title-name">Code</span><span class="reader-code-title-lang">${lang}</span></figcaption>`
          );
        }
      }
    }
  });

  // Normalize card / tile grids (e.g. Rocket.Chat .custom-tile-holder / .custom-tile)
  $root.find('.custom-tile-holder').addClass('reader-card-grid');
  $root.find('.custom-tile').addClass('reader-card');

  // Resolve all image URLs and classify icon-sized images
  await inlineExpiringSvgImages($, $root, baseUrl);
  $root.find('img').each((_, img) => {
    const $img = $(img);
    const widthAttr = Number($img.attr('width') || 0);
    const styleAttr = ($img.attr('style') || '').toLowerCase();
    const cls = ($img.attr('class') || '').toLowerCase();
    if (
      (widthAttr > 0 && widthAttr <= 80) ||
      styleAttr.includes('width:60px') ||
      styleAttr.includes('width: 60px') ||
      cls.includes('adv-wysiwyg-img') ||
      cls.includes('h-6 w-6') ||
      $img.closest('.reader-card, .custom-tile').length > 0
    ) {
      $img.addClass('reader-icon-img');
    }
  });

  // Resolve all anchor hrefs and open external links in a new tab
  $root.find('a[href]').each((_, a) => {
    const $a = $(a);
    const href = $a.attr('href');
    const resolved = resolveUrl(href, baseUrl);
    if (resolved) {
      $a.attr('href', resolved);
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        $a.attr('target', '_blank').attr('rel', 'noopener noreferrer');
      }
    }
  });

  // Remove empty duplicate h1 if the article also has h2 sections
  const firstH1 = $root.find('h1').first();
  if (firstH1.length > 0 && $root.find('h2').length > 0) {
    firstH1.remove();
  }

  // Strip noisy foreign layout classes & inline styles while preserving semantic reader-* and syntax classes
  $root.find('*').each((_, el) => {
    const $el = $(el);
    $el.removeAttr('style');
    const rawClasses = ($el.attr('class') || '').split(/\s+/).filter(Boolean);
    const kept = rawClasses.filter((c) => ALLOWED_CLASSES.has(c) || c.startsWith('nb-shiki-'));
    if (kept.length > 0) {
      $el.attr('class', kept.join(' '));
    } else {
      $el.removeAttr('class');
    }
  });

  const cleanedHtml = $root.html()?.trim() || '';
  return cleanedHtml.length > 50 ? `<div class="reader-extracted-root">${cleanedHtml}</div>` : null;
}

export async function extractArticleFromUrl(rawUrl: string): Promise<ExtractedArticleMetadata> {
  const normalizedUrl = rawUrl.startsWith('http://') || rawUrl.startsWith('https://')
    ? rawUrl
    : `https://${rawUrl}`;

  const parsedUrl = new URL(normalizedUrl);
  const domain = parsedUrl.hostname.replace(/^www\./, '');

  // Detect video content types based on known domains
  const isVideo =
    domain.includes('youtube.com') ||
    domain.includes('youtu.be') ||
    domain.includes('vimeo.com') ||
    domain.includes('loom.com');

  // Detect newsletters
  const isNewsletter =
    domain.includes('substack.com') ||
    domain.includes('beehiiv.com') ||
    domain.includes('buttondown.email');

  let contentType: 'article' | 'video' | 'newsletter' = 'article';
  if (isVideo) contentType = 'video';
  else if (isNewsletter) contentType = 'newsletter';

  // Try extracting full article with article-extractor
  let articleResult: any = null;
  try {
    articleResult = await extract(normalizedUrl);
  } catch (err) {
    // Graceful fallback to cheerio scraping
  }

  // Fetch HTML directly for rich DOM content, meta tags, and Open Graph fallback
  let html = '';
  try {
    const response = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 BookmarksManager/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      html = await response.text();
    }
  } catch {
    // If direct fetch fails, we continue with whatever article-extractor had
  }

  let title = articleResult?.title || '';
  let author = articleResult?.author || '';
  let publishedDate = articleResult?.published || '';
  let coverImage = articleResult?.image || '';
  let fullContentHtml = '';
  let excerpt = articleResult?.description || '';

  if (html) {
    const $ = cheerio.load(html);

    if (!title) {
      title =
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('title').text().trim() ||
        domain;
    }

    if (!author) {
      author =
        $('meta[name="author"]').attr('content') ||
        $('meta[property="article:author"]').attr('content') ||
        $('meta[name="twitter:creator"]').attr('content') ||
        domain;
    }

    if (!coverImage) {
      coverImage =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content') ||
        undefined;
    }

    if (!excerpt) {
      excerpt =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('meta[name="twitter:description"]').attr('content') ||
        '';
    }

    if (!publishedDate) {
      publishedDate =
        $('meta[property="article:published_time"]').attr('content') ||
        $('time').attr('datetime') ||
        new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    // Prefer rich DOM extraction that preserves headings, callouts, code blocks, steps, and cards
    const richDomHtml = await extractRichDomContent(html, normalizedUrl);
    if (richDomHtml) {
      fullContentHtml = richDomHtml;
    }
  }

  if (!fullContentHtml && articleResult?.content) {
    fullContentHtml = `<div class="reader-extracted-root">${articleResult.content}</div>`;
  }

  // If this is a YouTube video/short, embed the playable video frame in fullContentHtml
  const ytEmbed = extractYouTubeEmbed(normalizedUrl);
  if (ytEmbed) {
    const videoFrameHtml = `<div class="reader-video-embed ${ytEmbed.isShort ? 'reader-video-short' : ''}"><iframe src="${ytEmbed.embedUrl}" title="${title.replace(/"/g, '&quot;')}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`;
    const descHtml = excerpt ? `<p>${excerpt}</p>` : '';
    fullContentHtml = `<div class="reader-extracted-root">${videoFrameHtml}${descHtml}</div>`;
  }

  // Clean title
  title = title.replace(/[\n\r\t]+/g, ' ').trim() || domain;

  // Calculate word count and reading time
  let plainText = '';
  if (fullContentHtml) {
    const $content = cheerio.load(fullContentHtml);
    plainText = $content.text();
  } else if (excerpt) {
    plainText = excerpt;
  }

  const words = plainText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length > 0 ? words.length : 500;
  const readTimeMinutes = Math.max(1, Math.round(wordCount / 220));

  if (!excerpt && plainText) {
    excerpt = plainText.slice(0, 240) + '...';
  }

  return {
    title,
    url: normalizedUrl,
    domain,
    author: author.trim() || domain,
    publishedDate: publishedDate || 'Recently',
    readTimeMinutes,
    wordCount,
    excerpt: excerpt.trim() || `Archived save from ${domain}`,
    coverImage: coverImage || undefined,
    contentType,
    fullContentHtml: fullContentHtml || undefined,
  };
}
