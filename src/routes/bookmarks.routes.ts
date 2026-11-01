import { FastifyPluginAsync } from 'fastify';
import { eq, and, desc, asc, ilike, or, arrayContains, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { bookmarks, highlights } from '../db/schema.js';
import { extractArticleFromUrl } from '../services/scraper.service.js';
import { generateBookmarkSynthesis } from '../services/gemini.service.js';
import crypto from 'node:crypto';

export const bookmarksRoutes: FastifyPluginAsync = async (fastify) => {
  // All bookmark routes are protected with single-user token auth
  fastify.addHook('preHandler', fastify.authenticate);

  // 1. Extract metadata from URL without saving
  fastify.post('/extract', async (request, reply) => {
    const { url } = (request.body as { url?: string }) || {};
    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    try {
      const extracted = await extractArticleFromUrl(url);
      return extracted;
    } catch (err: any) {
      return reply.code(422).send({
        error: 'Failed to extract article metadata',
        message: err.message,
      });
    }
  });

  // 2. Query / List bookmarks with full filtering & search
  fastify.get('/', async (request) => {
    const query = request.query as {
      tab?: string;
      tag?: string;
      search?: string;
      sortBy?: 'newest' | 'read-time' | 'title';
      filterChip?: 'all' | 'quick' | 'longform';
      limit?: string;
      offset?: string;
    };

    const tab = query.tab || 'my-list';
    const tag = query.tag;
    const search = query.search?.trim();
    const sortBy = query.sortBy || 'newest';
    const filterChip = query.filterChip || 'all';
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const offset = Math.max(0, Number(query.offset) || 0);

    const conditions: any[] = [];

    // Tab filter
    if (tab === 'favorites') {
      conditions.push(eq(bookmarks.isFavorite, true));
    } else if (tab === 'archive') {
      conditions.push(eq(bookmarks.isArchived, true));
    } else if (tab === 'my-list') {
      conditions.push(eq(bookmarks.isArchived, false));
    } else if (tab === 'articles') {
      conditions.push(eq(bookmarks.contentType, 'article'));
    } else if (tab === 'videos') {
      conditions.push(eq(bookmarks.contentType, 'video'));
    } else if (tab === 'newsletters') {
      conditions.push(eq(bookmarks.contentType, 'newsletter'));
    }

    // Tag filter
    if (tag) {
      conditions.push(arrayContains(bookmarks.tags, [tag]));
    }

    // Search query
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(bookmarks.title, pattern),
          ilike(bookmarks.excerpt, pattern),
          ilike(bookmarks.domain, pattern),
          ilike(bookmarks.author, pattern)
        )
      );
    }

    let sortOrder;
    if (sortBy === 'read-time') {
      sortOrder = asc(bookmarks.readTimeMinutes);
    } else if (sortBy === 'title') {
      sortOrder = asc(bookmarks.title);
    } else {
      sortOrder = desc(bookmarks.addedOn);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    let items = await db.query.bookmarks.findMany({
      where: whereClause,
      orderBy: [sortOrder],
      limit,
      offset,
      with: {
        highlights: true,
      },
    });

    // Apply quick / longform filter chip
    if (filterChip === 'quick') {
      items = items.filter((b) => b.readTimeMinutes <= 5);
    } else if (filterChip === 'longform') {
      items = items.filter((b) => b.readTimeMinutes > 10);
    }

    // Map highlights count for frontend convenience
    const formatted = items.map((b) => ({
      ...b,
      savedAgo: b.savedAgo || 'Just now',
      highlightsCount: b.highlights?.length || 0,
    }));

    return {
      items: formatted,
      total: formatted.length,
    };
  });

  // 3. Ingest new bookmark (with auto-extraction and optional AI summary)
  fastify.post('/', async (request, reply) => {
    const body = (request.body as any) || {};
    const rawUrl = body.url;

    if (!rawUrl) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    let title = body.title;
    let domain = body.domain;
    let author = body.author;
    let publishedDate = body.publishedDate;
    let readTimeMinutes = body.readTimeMinutes;
    let wordCount = body.wordCount;
    let excerpt = body.excerpt;
    let coverImage = body.coverImage;
    let contentType = body.contentType || 'article';
    let fullContentHtml = body.fullContentHtml;

    // Automatic extraction if full details were not provided
    if (!title || !fullContentHtml || body.autoExtract) {
      try {
        const extracted = await extractArticleFromUrl(rawUrl);
        title = title || extracted.title;
        domain = domain || extracted.domain;
        author = author || extracted.author;
        publishedDate = publishedDate || extracted.publishedDate;
        readTimeMinutes = readTimeMinutes || extracted.readTimeMinutes;
        wordCount = wordCount || extracted.wordCount;
        excerpt = excerpt || extracted.excerpt;
        coverImage = coverImage || extracted.coverImage;
        contentType = contentType || extracted.contentType;
        fullContentHtml = fullContentHtml || extracted.fullContentHtml;
      } catch (e) {
        // Fallback to domain name if extraction fails
        if (!domain) {
          try {
            domain = new URL(rawUrl).hostname.replace(/^www\./, '');
          } catch {
            domain = 'web';
          }
        }
        title = title || domain;
      }
    }

    // AI Enrichment if requested or automatically enabled
    let aiSummary = body.aiSummary;
    let aiTakeaways = body.aiTakeaways || [];
    let tags = Array.isArray(body.tags) ? body.tags : [];

    if (body.autoSummarize !== false) {
      const aiResult = await generateBookmarkSynthesis({
        title,
        excerpt,
        content: fullContentHtml,
      });

      if (aiResult) {
        aiSummary = aiSummary || aiResult.summary;
        aiTakeaways = aiTakeaways.length > 0 ? aiTakeaways : aiResult.keyTakeaways;
        if (tags.length === 0 && aiResult.suggestedTags?.length > 0) {
          tags = aiResult.suggestedTags;
        }
      }
    }

    const bookmarkId = body.id || `bm-${crypto.randomUUID()}`;

    const [inserted] = await db
      .insert(bookmarks)
      .values({
        id: bookmarkId,
        title: title || 'Saved Link',
        subtitle: body.subtitle,
        url: rawUrl,
        domain: domain || 'web',
        author: author || 'Unknown',
        authorTitle: body.authorTitle,
        authorAvatar: body.authorAvatar,
        publishedDate: publishedDate || 'Just now',
        readTimeMinutes: Number(readTimeMinutes) || 5,
        wordCount: Number(wordCount) || 500,
        excerpt: excerpt || `Archived bookmark from ${domain}`,
        coverImage: coverImage || null,
        contentType: contentType,
        tags: tags,
        collection: body.collection || 'reading-list',
        isFavorite: Boolean(body.isFavorite),
        isArchived: Boolean(body.isArchived),
        isRead: Boolean(body.isRead),
        readProgressPercent: Number(body.readProgressPercent) || 0,
        remainingMinutes: body.remainingMinutes !== undefined ? Number(body.remainingMinutes) : Number(readTimeMinutes) || 5,
        savedAgo: body.savedAgo || 'Just now',
        curatorNote: body.curatorNote,
        fullContentHtml: fullContentHtml,
        aiSummary: aiSummary,
        aiTakeaways: aiTakeaways,
      })
      .returning();

    return reply.code(201).send({
      ...inserted,
      savedAgo: inserted.savedAgo || 'Just now',
      highlightsCount: 0,
    });
  });

  // 4. Batch Operations (archive, favorite, delete)
  fastify.post('/batch', async (request, reply) => {
    const { ids, action } = (request.body as { ids?: string[]; action?: string }) || {};

    if (!Array.isArray(ids) || ids.length === 0 || !action) {
      return reply.code(400).send({ error: 'ids array and action are required' });
    }

    if (action === 'archive') {
      await db.update(bookmarks).set({ isArchived: true }).where(inArray(bookmarks.id, ids));
    } else if (action === 'unarchive') {
      await db.update(bookmarks).set({ isArchived: false }).where(inArray(bookmarks.id, ids));
    } else if (action === 'favorite') {
      await db.update(bookmarks).set({ isFavorite: true }).where(inArray(bookmarks.id, ids));
    } else if (action === 'unfavorite') {
      await db.update(bookmarks).set({ isFavorite: false }).where(inArray(bookmarks.id, ids));
    } else if (action === 'delete') {
      await db.delete(bookmarks).where(inArray(bookmarks.id, ids));
    } else {
      return reply.code(400).send({ error: `Unsupported batch action: ${action}` });
    }

    return { status: 'success', count: ids.length, action };
  });

  // 5. Get single bookmark with full HTML & highlights
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, id),
      with: {
        highlights: true,
      },
    });

    if (!item) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    return {
      ...item,
      highlightsCount: item.highlights?.length || 0,
    };
  });

  // 6. Update bookmark (favorite, archive, read progress, tags, etc.)
  fastify.patch('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as any) || {};

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (body.title !== undefined) updateData.title = body.title;
    if (body.isFavorite !== undefined) updateData.isFavorite = Boolean(body.isFavorite);
    if (body.isArchived !== undefined) updateData.isArchived = Boolean(body.isArchived);
    if (body.isRead !== undefined) updateData.isRead = Boolean(body.isRead);
    if (body.readProgressPercent !== undefined) updateData.readProgressPercent = Number(body.readProgressPercent);
    if (body.remainingMinutes !== undefined) updateData.remainingMinutes = Number(body.remainingMinutes);
    if (body.curatorNote !== undefined) updateData.curatorNote = body.curatorNote;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.collection !== undefined) updateData.collection = body.collection;

    const [updated] = await db
      .update(bookmarks)
      .set(updateData)
      .where(eq(bookmarks.id, id))
      .returning();

    if (!updated) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    return updated;
  });

  // 7. Delete single bookmark
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [deleted] = await db
      .delete(bookmarks)
      .where(eq(bookmarks.id, id))
      .returning();

    if (!deleted) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    return { status: 'deleted', id };
  });

  // 8. On-demand AI Synthesis / Summarize with Gemini
  fastify.post('/:id/summarize', async (request, reply) => {
    const { id } = request.params as { id: string };

    const item = await db.query.bookmarks.findFirst({
      where: eq(bookmarks.id, id),
    });

    if (!item) {
      return reply.code(404).send({ error: 'Bookmark not found' });
    }

    let fullContentHtml = item.fullContentHtml;
    if (item.url && (!fullContentHtml || !fullContentHtml.includes('reader-extracted-root'))) {
      try {
        const extracted = await extractArticleFromUrl(item.url);
        if (extracted.fullContentHtml) {
          fullContentHtml = extracted.fullContentHtml;
        }
      } catch {}
    }

    const aiResult = await generateBookmarkSynthesis({
      title: item.title,
      excerpt: item.excerpt || undefined,
      content: fullContentHtml || undefined,
    });

    if (!aiResult) {
      return reply.code(503).send({ error: 'AI summarization unavailable or API key missing' });
    }

    const [updated] = await db
      .update(bookmarks)
      .set({
        fullContentHtml: fullContentHtml,
        aiSummary: aiResult.summary,
        aiTakeaways: aiResult.keyTakeaways,
        tags: Array.from(new Set([...item.tags, ...aiResult.suggestedTags])),
        updatedAt: new Date(),
      })
      .where(eq(bookmarks.id, id))
      .returning();

    return updated;
  });
};
