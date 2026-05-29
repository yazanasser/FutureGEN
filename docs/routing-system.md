# FutureGen Routing Architecture (Production)

## 1) Architecture Design

Pipeline:

`Incoming URL -> Router -> Slug Parser -> Route Index Lookup -> Render Template -> SEO Meta Injection`

Core components added:

- `scripts/migrate-routing-data.js`
  - Bulk migration for tool/news slugs.
  - Writes canonical slug per tool, plus alias map.
  - Generates `data/route-index.json`.
- `data/route-index.json` (generated)
  - `tools.bySlug`, `tools.aliases`
  - `news.bySlug`, `news.aliases`
  - `categories.bySlug`
  - `pages`
- `server/route-resolver.js`
  - Cached route resolver with canonical redirect handling.
- `server/app.js`
  - Express runtime implementation (SSR-style metadata injection).
- Client routers upgraded:
  - `js/router.js`
  - `js/tool-router.js`
  - `js/news-router.js`

## 2) URL Structure

Supported canonical routes:

- `/tools/:toolSlug`
- `/news/:articleSlug`
- `/category/:categorySlug`
- `/page/:staticPage`

Legacy compatibility routes with 301:

- `/tool/:slug` -> `/tools/:slug`
- `/article/:slug` -> `/news/:slug`
- `/tools/:slug.html` -> `/tools/:slug`
- `/news/:slug.html` -> `/news/:slug`

## 3) Slug System

Shared logic lives in `js/slug-utils.js`:

- lowercase
- normalize unicode (`NFKD`)
- strip special chars
- collapse spaces/underscores to hyphens
- duplicate-safe strategy:
  - `ai-chat`
  - `ai-chat-2`
  - `ai-chat-3`

## 4) Database / Content Mapping

Tool record after migration:

- `id`
- `name`
- `description`
- `category`
- `slug` (new canonical)
- `legacySlugs` (optional aliases)

Migration command:

```bash
npm run migrate:routing
```

This updates chunk files in `data/*.json` and writes `data/route-index.json`.

## 5) SEO Implementation

Per dynamic route:

- unique `<title>`
- unique `<meta name="description">`
- OpenGraph (`og:title`, `og:description`, `og:url`, `og:image`)
- canonical URL (`<link rel="canonical">`)
- 404 pages set `noindex`

Client-side SEO is updated in:

- `js/tool-router.js`
- `js/news-router.js`

Server-side SEO injection is available in:

- `server/app.js`

## 6) Performance Strategy

- Route index cache (`localStorage` + memory cache)
- Chunked tool data by first character (`/data/a.json`, etc.)
- Route resolution from in-memory hash map (`O(1)` average)
- Adjacent chunk prefetch for tool pages
- Headers updated for route index caching:
  - `_headers`

## 7) Redirect Strategy

Updated configs:

- `vercel.json`
- `firebase.json`
- `_redirects`

All old URL formats either resolve or 301 to canonical URLs.

## 8) Safe Migration Plan (No Downtime)

1. Deploy code with backward-compatible redirects first.
2. Run migration in staging: `npm run migrate:routing`.
3. Validate:
   - random 100 tool URLs
   - random 50 news URLs
   - old links (`/tool/*`, `.html`) return 301.
4. Deploy migrated data + `route-index.json`.
5. Enable production traffic.
6. Regenerate sitemap using canonical paths.
7. Monitor:
   - 404 rate
   - redirect hit ratio
   - crawl stats in Search Console.

Rollback:

- Keep previous data snapshot.
- Revert route index + chunk files.
- Keep redirects (safe to retain).

## 9) Framework-Agnostic Resolver Pattern

### Express / Fastify

Use `server/route-resolver.js` directly and map:

- `tool -> tool.html`
- `news -> news.html`
- `category/page/home -> index.html`
- `redirect -> 301`
- `not_found -> 404`

### Next.js

- Use `getServerSideProps` or App Router route handlers.
- Load `route-index.json` into memory once per server instance.
- Resolve slug + redirect canonical if alias.
- Return dynamic metadata with `generateMetadata`.

### PHP

- `index.php` front controller reads request URI.
- Load cached JSON index (`route-index.json`).
- Resolve route type + canonical redirects.
- Include template (`tool.php`, `news.php`, `home.php`) + emit metadata.

## 10) Deployment Commands

```bash
npm install
npm run migrate:routing
npm run start:routing
```

For static-host mode (Vercel/Firebase/Netlify), deploy with updated routing configs and generated `data/route-index.json`.
