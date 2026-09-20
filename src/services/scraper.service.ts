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

  // Fetch HTML directly for meta tags and Open Graph fallback
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
  let fullContentHtml = articleResult?.content || '';
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
