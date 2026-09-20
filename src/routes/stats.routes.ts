import { FastifyPluginAsync } from 'fastify';
import { db } from '../db/index.js';
import { bookmarks, highlights } from '../db/schema.js';

export const statsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', fastify.authenticate);

  fastify.get('/cadence', async () => {
    const allBookmarks = await db.query.bookmarks.findMany();
    const allHighlights = await db.query.highlights.findMany();

    const finishedArticles = allBookmarks.filter((b) => b.isArchived || b.isRead);
    const finishedCount = finishedArticles.length;
    const totalMinutesRead = finishedArticles.reduce((acc, curr) => acc + (curr.readTimeMinutes || 0), 0);
    const totalMinutesInLibrary = allBookmarks.reduce((acc, curr) => acc + (curr.readTimeMinutes || 0), 0);

    const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const todayIndex = (new Date().getDay() + 6) % 7;

    const days = dayNames.map((day, idx) => {
      const isToday = idx === todayIndex;
      const count = isToday ? finishedCount : 0;
      const height = count > 0 ? `${Math.min(100, Math.max(25, count * 30))}%` : '8%';
      return { day, count, height, isToday };
    });

    const counts = {
      myList: allBookmarks.filter((b) => !b.isArchived).length,
      favorites: allBookmarks.filter((b) => b.isFavorite).length,
      archive: allBookmarks.filter((b) => b.isArchived).length,
      highlights: allHighlights.length,
      articles: allBookmarks.filter((b) => b.contentType === 'article').length,
      videos: allBookmarks.filter((b) => b.contentType === 'video').length,
      newsletters: allBookmarks.filter((b) => b.contentType === 'newsletter').length,
    };

    const tagSet = new Set<string>();
    allBookmarks.forEach((b) => b.tags?.forEach((t) => tagSet.add(t)));
    const uniqueTags = Array.from(tagSet);

    return {
      finishedCount,
      totalMinutesRead,
      totalMinutesInLibrary,
      days,
      counts,
      uniqueTags,
    };
  });
};
