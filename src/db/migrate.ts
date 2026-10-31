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

    // Seed initial data if bookmarks table is empty
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM bookmarks');
    if (rows[0]?.count === 0) {
      const essayHtml = `
        <p><span class="float-left text-5xl md:text-6xl font-serif font-bold leading-none pr-3 pt-1 text-[#003c36] dark:text-[#b7ede5]">S</span>everal centuries ago, the advent of the printing press did more than mechanically replicate the spoken word: it constructed a physical room of quietude. Unlike the frantic oral marketplace or the transient scrolls of early antiquity, the bound codex possessed a beginning, a spine, and a closure. Within those margins, the human reader was invited to dwell without fear of sudden peripheral distraction.</p>
        <p>Today, however, the digital substrate has dissolved that room. Every word arrives surrounded by the quiet hum of potential interruptions. Hyperlinks urge the eye toward tangential corridors, algorithmically generated notifications compete for micro-seconds of biological attention, and the fundamental posture of reading has shifted from contemplative immersion to navigational skimming. We do not read text so much as we scan for relevance, our eyes bounding across sentences like water skippers upon the surface of an unplumbed pond.</p>
        <blockquote class="my-8 py-3 pl-6 border-l-4 border-[#ad331c] italic text-xl md:text-2xl font-serif leading-relaxed">&ldquo;When attention is shattered into micro-intervals, the mind forgets how to linger inside a complex metaphor. We lose not merely information, but the capacity for unhurried philosophical resonance.&rdquo;</blockquote>
        <p>This transition is not merely stylistic; it is neurological. We are developing a new kind of mind—one that excels at computational sorting, but starves in the presence of unhurried poetic ambiguity. Deep reading requires what cognitive psychologists describe as generative cognitive friction: the pause between paragraphs where the brain relates what has been asserted to the repository of one's own lived autobiography.</p>
        <p>When an interface removes all friction in the name of speed and viral velocity, it also strips away the scaffolding of deliberate synthesis. Deep reading is not simply the passive decodification of graphic symbols upon a plane; it is an active interior drama, in which the reader acts as director, actor, and architect of an unseen mental stage.</p>
        <p>To reclaim deep reading is therefore an act of deliberate resistance. It requires tools that refuse to scream, typography that respects the optical rhythm of the human retina, and archival environments that prioritize contemplative depth over infinite churn.</p>
      `.trim();

      await client.query(
        `INSERT INTO bookmarks (
          id, title, subtitle, url, domain, author, author_title, author_avatar,
          published_date, read_time_minutes, word_count, excerpt, cover_image,
          content_type, tags, collection, is_favorite, is_archived, is_read,
          read_progress_percent, remaining_minutes, saved_ago, full_content_html,
          ai_summary, ai_takeaways
        ) VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25),
        ($26, $27, NULL, $28, $29, $30, NULL, NULL, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, 0, $32, $42, NULL, NULL, '{}'),
        ($43, $44, NULL, $45, $46, $47, NULL, NULL, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, 0, $49, $59, NULL, NULL, '{}'),
        ($60, $61, NULL, $62, $63, $64, NULL, NULL, $65, $66, $67, $68, $69, $70, $71, $72, $73, $74, $75, 0, $66, $76, NULL, NULL, '{}'),
        ($77, $78, NULL, $79, $80, $81, NULL, NULL, $82, $83, 0, $84, $85, $86, $87, $88, $89, $90, $91, 0, $83, $92, NULL, NULL, '{}'),
        ($93, $94, NULL, $95, $96, $97, NULL, NULL, $98, $99, $100, $101, $102, $103, $104, $105, $106, $107, $108, 0, $99, $109, NULL, NULL, '{}'),
        ($110, $111, NULL, $112, $113, $114, NULL, NULL, $115, $116, $117, $118, $119, $120, $121, $122, $123, $124, $125, 0, $116, $126, NULL, NULL, '{}')`,
        [
          // 1
          'lost-art-deep-reading',
          'The Lost Art of Deep Reading in an Age of Infinite Feeds',
          'Why the friction of analog typography and deliberate reading paces rewire our cognitive endurance, and how we can reclaim sustained attention.',
          'https://theatlantic.com/magazine/archive/2024/11/attention-span-fracture-deep-reading/678910/',
          'The Atlantic',
          'Elena Rostova',
          'Cultural Critic & Essayist',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuAQW_Nd7CpkB3pAyUm4TnAEla5_PBfP0ZMkwDqrK9_aJUZJDTHa4OuD3Spfb8Kn9hbIXFS0GX3pdHFx5YNMBF5KqeaF4w_LWBGcH39YeC_Bq4iFGUltNUqZcuSGpfWosG4xhtaOY6oeZfu9hHgkMzFSBi_oWuz1FpY4cdJZFiog3RI28xGF5nCgRz15vEz0VYt0E3oUt_AnwRGuVfFeBenu2xJtCRRRSJWhKRZaHpR6TRboYrDBtThT',
          'Oct 14, 2024',
          8,
          1840,
          'Why the deliberate friction of analog typography, uninterrupted prose, and slower reading paces systematically rewire our long-term cognitive endurance and philosophical empathy.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDjeDf1bYtJuD2lstfxqoWXrPdRGbIHajaEu7tAP8JMLR_svjJy2cSnp6HEMX9OEL8KSWSiQlbFb9mnYK0tgsAU0BTCVP-7dlHRbBmENYt9np9sjWv8HwdrbRXis6cL0ZHBa1bAiBcOVOqpXfJwNNxaLhFKk3UVUSwM781ywMLNjYRwzG0VaiTI5caRvp2aCRpKYX6lfl9o3O3ccOMoLsB-s9yFcb9-kAuYV2ab3Bh3FI1bZGNdwSOW',
          'article',
          ['#longform', '#cognition'],
          'reading-list',
          true,
          false,
          false,
          44,
          4,
          '2 hours ago',
          essayHtml,
          'Digital interfaces dissolve the contemplative space of print by prioritizing speed over cognitive friction. Reclaiming deep reading requires deliberate, distraction-free typography and unhurried mental synthesis.',
          [
            'The shift from print codex to digital feeds replaces contemplative immersion with navigational skimming.',
            'Generative cognitive friction—pausing to connect prose to personal memory—is essential for deep synthesis.',
            'Deliberate reading environments act as resistance against algorithmic attention fragmentation.'
          ],
          // 2
          'spatial-computing-editorial',
          'Spatial Computing and the Evolution of Editorial Interfaces',
          'https://wired.com/story/spatial-computing-editorial-interfaces',
          'Wired Design',
          'Julian Thorne',
          'Yesterday',
          5,
          1250,
          'Exploring how unbounded digital canvases challenge rigid grid systems, redefine visual hierarchy, and transform reading surfaces from tactile paper to infinite spaces.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBGby2Zk1og8mtBjyZP6Vu0VHgSwzZxzBZ27zwirxN1Jisc6n3IpjcsK5zynosGEW_QeyI70YWVvXqEPojhTB-94-RsJeTxJTtmg57HaJK0OudBa5XmGqeWxoEVs_-RFiSIFbsMFLEuzwYmzUsUqSya6hdNY22hZj9yLzbafFdvVRVoi7oVXHdbLWiSH6EctSLmeCV5pX4UyFJ-t_U8o_7pd_LlOcH3Agp4-7ZCGkxTwbhvfZhI1gKg',
          'article',
          ['#typography', '#design'],
          'reading-list',
          false,
          false,
          false,
          'Yesterday',
          // 3
          'crafting-software-furniture',
          'Crafting Software That Feels Like Furniture',
          'https://press.stripe.com/crafting-software-furniture',
          'Stripe Press',
          'Marcus Vance',
          '3 days ago',
          14,
          3100,
          'The tactile qualities of high-craft desktop applications and why deliberate longevity matters far more than endless feature parity.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuC2-IqnHaCMTBGXWwUnNugM_fFB0x7gmrZSYpSUkIKanudAZq7DIwx3jbJisV4e7jaCIiU5WIjyBDwFMHb5PXXiF5ql8dCBZbK3O5O6FzSzuKY_son8xGemgxMXWCLvmHYGW7JfC3mBcmTsOUGIwVvQ4d5C9q-kywPp4UqdfBlTF8qqyTLi8Pzg3fmryN3uX6eStofjFIz5RTt57Mv0mpD-CNI6OUFemW8uT6cdhi7Zvd0BKXRbIw8Q',
          'article',
          ['#craft', '#software'],
          'reading-list',
          false,
          false,
          false,
          '3d ago',
          // 4
          'memory-palaces-digital-nomad',
          'Memory Palaces for the Digital Nomad: Retaining Ideas',
          'https://aeon.co/essays/memory-palaces-and-the-architecture-of-thought',
          'Aeon Magazine',
          'Dr. Clara Beauchamp',
          '4 days ago',
          12,
          2650,
          'Highlighting text is only step one. How connected notes and associative mapping transform passive consumption into lasting mental synthesis.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuAKJcxuHYE97jKJgyTTxeBVREOam6oDSqqbPFg7anYN2Hb7qgd7K-ntMtens8wG-jLqqEDYeNeIJOq1fkZolmFSAbG4SIXEqvgVaPuccD4A4JHvOUTdq5-MQwP0_zUHbfEhXisvtMLM2OZGjspA8XPmTq614ZCeQ4IMDdVqkV6i4R4Mzt1WvCjAjxl-tf-Q-qqUdd4pA4bTTsEs7sn8VrWb32v9x3DijB5CW_td9cTKayx6NxsIG5W7',
          'article',
          ['#notes', '#learning'],
          'reading-list',
          false,
          false,
          false,
          '4d ago',
          // 5
          'dieter-rams-ten-principles',
          'Ten Principles for Good Design: Restored 1979 Lecture',
          'https://youtube.com/watch?v=dieter-rams-1979',
          'YouTube • Design Archive',
          'Braun Archive',
          '1 week ago',
          22,
          'Archival preservation lecture focusing on unobtrusive engineering, timeless aesthetic longevity, and why good design is as little design as possible.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBorK7aICrcY6MuewX0isDXBXu8un2FMjMw2u67gnoDzpqzqHuNNFRIr8-PPqeIe3DZAfJn7Zv1ivffQZ0TGHiLYh2qGb3UGJaSFSHPACdVY8e75E7YIUFv1Lpt5UKR4aE68jt8OiTUgsJLJGSGLG9VJEO8biJqACB_96_m74nFqY6Ts1XAMSd1GYGcDtide4hNlJ6eIX1ODf16IkTuU4C0VFDeP_C9xM1SzWFRF893jI8lCL0cP_wK',
          'video',
          ['#architecture', '#video'],
          'reading-list',
          true,
          false,
          false,
          '1w ago',
          // 6
          'autonomous-agents-workflow',
          'Autonomous Agents in Workflow Automation: A Practical Review',
          'https://technologyreview.com/autonomous-agents-workflow',
          'MIT Tech Review',
          'Samir Patel',
          '1 week ago',
          6,
          1400,
          'Moving past theoretical demos into resilient production software systems that gracefully handle human ambiguities and distributed state.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuCbVlZrZniNz5DcOOByFn5Miwhu2qgQUJSniUhqkrH5_LJZF5zqdY2DdmzBTOtNmetzm0T7gZOMNOviA4fqBCq1nIiroyB8NgtMwAYhijgMAAt9QNuvAR0ofzYf8f-thfT6X6gkj-hIzS_kQJJQQEqwOhYgOaODslLDAXIz-tDIz-0o6id_rrvqyLYlj7j92yiee-IoyTQtMBHXsJN4cOKNTOMRtDJb4ozX2_JunoD8HBRneR207_UV',
          'article',
          ['#ai-agents', '#tech'],
          'reading-list',
          false,
          false,
          false,
          '1w ago',
          // 7
          'quiet-spaces-nordic-architecture',
          'Quiet Spaces: Acoustics and Materials in Nordic Architecture',
          'https://harvarddesignmagazine.org/quiet-spaces-nordic',
          'Harvard Design Magazine',
          'Astrid Lindqvist',
          '2 weeks ago',
          9,
          2200,
          'How contemporary public libraries use natural felt, porous brickwork, and untreated pine to shape sonic sanctuaries amidst metropolitan noise.',
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBoMMA38BKW0bbMOKzVr_NZXjNM0SzNXXLu1PX0FniqZyT4HxSQJNBmkpWd-GNeGceThJxjJFxPwHkukjOHy7HFmKYt0blACAlrqHUSUyLJQZt0Y9RK4A-5O2JuQbFUfiZpvZc3wDsrRMzzq8NzNgp24MUf1zq5BINXyIna_tGsHnGEY4374UDIJA8vq31begxM5mkZnfgG9FcFW_8LN0XKO_0DjETMxi__-PYW2AHbn83o5rlfNVAE',
          'article',
          ['#architecture', '#materials'],
          'reading-list',
          false,
          false,
          false,
          '2w ago',
        ]
      );

      await client.query(
        `INSERT INTO highlights (id, bookmark_id, text, color, note) VALUES
        ('hl-1', 'lost-art-deep-reading', 'The shift from contemplative immersion to navigational skimming changes not just how fast we read, but what thoughts we are capable of forming.', 'yellow', 'Quote for Sunday essay: Compare this with Birkerts'' The Gutenberg Elegies chapter on psychic velocity.'),
        ('hl-2', 'lost-art-deep-reading', 'We are developing a new kind of mind—one that excels at computational sorting, but starves in the presence of unhurried poetic ambiguity.', 'terracotta', 'Paraphrased in Cambridge lecture on media ecology'),
        ('hl-3', 'lost-art-deep-reading', 'Deep reading is not simply the passive decodification of graphic symbols upon a plane; it is an active interior drama.', 'eucalyptus', NULL)`
      );
      console.log('Seeded initial bookmarks and highlights into PostgreSQL.');
    }

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
