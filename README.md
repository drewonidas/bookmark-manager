# Bookmarks — Editorial Sanctuary Backend

A Fastify + PostgreSQL backend service for the **Bookmarks — Editorial Sanctuary** reading and bookmark manager. It provides automated URL metadata and article body extraction, Gemini AI-powered summarization and smart tagging, single-user Bearer token authentication, and full CRUD for bookmarks, highlights, and reading cadence statistics.

---

## 🚀 Key Features

* **High-Performance Fastify Framework:** Built with TypeScript, sensible error handling, and Swagger OpenAPI documentation (`/documentation`).
* **PostgreSQL with Drizzle ORM:** Clean schema definitions, indices on tags and status flags, and automatic self-bootstrapping migrations.
* **Automated Article Scraping & Readability:** Pulls title, author, lead image, word count, estimated reading time, and clean reader HTML (`fullContentHtml`) using `@extractus/article-extractor` and `cheerio`.
* **Gemini AI Synthesis:** Integrates Google's `gemini-3.8-flash` via `@google/genai` to generate executive TL;DR summaries, key takeaway bullet points, and suggested taxonomy tags upon ingest.
* **Single-User Token Authentication:** Timing-safe Bearer token authentication protecting all library endpoints.
* **Full Batch Processing:** In-place bulk archive, unarchive, favorite, and deletion.
* **Reading Cadence Analytics:** Calculates weekly reading pace, minutes read, and daily completions to power the sanctuary dashboard.

---

## 🛠️ Quick Start

### 1. Prerequisites

* **Node.js:** v20+ or v22+
* **Podman:** `podman` and `podman-compose` (or Podman Desktop)

### 2. Start PostgreSQL with Podman

Launch the PostgreSQL container using Podman compose:

```bash
podman-compose up -d
# or using podman run:
# podman run -d --name bookmark_postgres -e POSTGRES_USER=bookmark_user -e POSTGRES_PASSWORD=bookmark_secret -e POSTGRES_DB=bookmark_sanctuary -p 5432:5432 -v postgres_data:/var/lib/postgresql/data:Z docker.io/library/postgres:16-alpine
```

### 3. Configure Environment

Copy `.env.example` to `.env` (or adjust values):

```bash
cp .env.example .env
```

```ini
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
AUTH_TOKEN=sanctuary-secret-token-change-me
DATABASE_URL=postgresql://bookmark_user:bookmark_secret@localhost:5432/bookmark_sanctuary
GEMINI_API_KEY=your_gemini_api_key_here
```

### 4. Install Dependencies & Run

```bash
npm install
npm run dev
```

The server will automatically bootstrap the database tables and start listening at:
* **API Base:** `http://localhost:3001`
* **Swagger OpenAPI Docs:** `http://localhost:3001/documentation`
* **Healthcheck:** `http://localhost:3001/health`

---

## 📡 API Endpoints

All requests to `/api/bookmarks`, `/api/highlights`, and `/api/stats` require:
```http
Authorization: Bearer <AUTH_TOKEN>
```

### Authentication
* `POST /api/auth/login` — Exchange master secret/token for authenticated session:
  ```json
  { "password": "sanctuary-secret-token-change-me" }
  ```
* `GET /api/auth/verify` — Validate token health.

### Bookmarks & Content Ingest
* `POST /api/bookmarks/extract` — Preview URL metadata & full text without saving:
  ```json
  { "url": "https://example.com/article" }
  ```
* `POST /api/bookmarks` — Ingest and save URL (automatically extracts content & runs Gemini AI summary):
  ```json
  {
    "url": "https://example.com/article",
    "collection": "reading-list",
    "tags": ["#architecture", "#type-systems"],
    "autoExtract": true,
    "autoSummarize": true
  }
  ```
* `GET /api/bookmarks` — Filter saved items:
  * Query parameters: `tab` (`my-list`, `favorites`, `archive`, `articles`, `videos`, `newsletters`), `tag`, `search`, `sortBy` (`newest`, `read-time`, `title`), `filterChip` (`all`, `quick`, `longform`).
* `GET /api/bookmarks/:id` — Retrieve full article HTML and highlights.
* `PATCH /api/bookmarks/:id` — Update reading progress, favorite, archive status, notes:
  ```json
  { "readProgressPercent": 65, "isFavorite": true }
  ```
* `DELETE /api/bookmarks/:id` — Delete bookmark and its highlights.
* `POST /api/bookmarks/batch` — Bulk actions:
  ```json
  { "ids": ["bm-1", "bm-2"], "action": "archive" }
  ```
* `POST /api/bookmarks/:id/summarize` — On-demand Gemini AI summary and key takeaways generation.

### Highlights & Annotations
* `GET /api/highlights` — Query all user highlights.
* `POST /api/highlights` — Save a highlighted passage or margin note:
  ```json
  {
    "bookmarkId": "bm-123",
    "text": "The passage highlighted inside the reader...",
    "color": "eucalyptus",
    "note": "Important realization regarding system cohesion."
  }
  ```
* `PATCH /api/highlights/:id` — Edit annotation note or change color.
* `DELETE /api/highlights/:id` — Remove annotation.

### Cadence & Analytics
* `GET /api/stats/cadence` — Returns weekly reading velocity, uninterrupted focus minutes, and shelf counts.
