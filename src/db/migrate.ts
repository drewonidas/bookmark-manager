import { pool } from './index.js';

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subtitle TEXT,
        url TEXT NOT NULL,
        domain TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT 'Unknown',
        author_title TEXT,
        author_avatar TEXT,
        published_date TEXT,
        added_on TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        read_time_minutes INTEGER NOT NULL DEFAULT 5,
        word_count INTEGER DEFAULT 0,
        excerpt TEXT,
        cover_image TEXT,
        content_type VARCHAR(20) NOT NULL DEFAULT 'article',
        tags TEXT[] NOT NULL DEFAULT '{}',
        collection TEXT NOT NULL DEFAULT 'reading-list',
        is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
        is_archived BOOLEAN NOT NULL DEFAULT FALSE,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        read_progress_percent INTEGER DEFAULT 0,
        remaining_minutes INTEGER,
        saved_ago TEXT,
        full_content_html TEXT,
        curator_note TEXT,
        ai_summary TEXT,
        ai_takeaways TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS highlights (
        id TEXT PRIMARY KEY,
        bookmark_id TEXT NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        color VARCHAR(20) NOT NULL DEFAULT 'yellow',
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_bookmarks_is_archived ON bookmarks(is_archived);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_is_favorite ON bookmarks(is_favorite);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_tags ON bookmarks USING GIN(tags);
      CREATE INDEX IF NOT EXISTS idx_highlights_bookmark_id ON highlights(bookmark_id);
    `);

    console.log('Database tables verified/created successfully.');
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
