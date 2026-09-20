import { pgTable, text, integer, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const bookmarks = pgTable('bookmarks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  url: text('url').notNull(),
  domain: text('domain').notNull(),
  author: text('author').notNull().default('Unknown'),
  authorTitle: text('author_title'),
  authorAvatar: text('author_avatar'),
  publishedDate: text('published_date'),
  readTimeMinutes: integer('read_time_minutes').notNull().default(5),
  wordCount: integer('word_count').default(0),
  excerpt: text('excerpt'),
  coverImage: text('cover_image'),
  contentType: text('content_type').notNull().default('article'), // 'article' | 'video' | 'newsletter'
  tags: text('tags').array().notNull().default([]),
  collection: text('collection').notNull().default('reading-list'),
  isFavorite: boolean('is_favorite').notNull().default(false),
  isArchived: boolean('is_archived').notNull().default(false),
  isRead: boolean('is_read').notNull().default(false),
  readProgressPercent: integer('read_progress_percent').default(0),
  remainingMinutes: integer('remaining_minutes'),
  savedAgo: text('saved_ago'),
  addedOn: timestamp('added_on', { withTimezone: true }).notNull().defaultNow(),
  fullContentHtml: text('full_content_html'),
  curatorNote: text('curator_note'),
  aiSummary: text('ai_summary'),
  aiTakeaways: text('ai_takeaways').array().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const highlights = pgTable('highlights', {
  id: text('id').primaryKey(),
  bookmarkId: text('bookmark_id')
    .notNull()
    .references(() => bookmarks.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  color: text('color').notNull().default('yellow'), // 'yellow' | 'terracotta' | 'eucalyptus' | 'iris'
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const bookmarksRelations = relations(bookmarks, ({ many }) => ({
  highlights: many(highlights),
}));

export const highlightsRelations = relations(highlights, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [highlights.bookmarkId],
    references: [bookmarks.id],
  }),
}));

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;
export type Highlight = typeof highlights.$inferSelect;
export type NewHighlight = typeof highlights.$inferInsert;
