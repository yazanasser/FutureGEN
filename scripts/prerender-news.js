'use strict';

/**
 * prerender-news.js
 *
 * Generates a static  news/{slug}/index.html  for every article in
 * site/data/news.json, injecting the correct per-article OG / Twitter
 * meta tags into the news.html template.
 *
 * Run:  node scripts/prerender-news.js
 *   or  npm run prerender:news
 *
 * After running, upload the entire  news/  folder to Hostinger
 * public_html/ alongside the rest of the static files.
 * Hostinger's LiteSpeed will then serve  news/{slug}/index.html  when
 * a crawler or user visits  https://futuregen.space/news/{slug} .
 */

const fs   = require('fs');
const path = require('path');

/* ─── config ──────────────────────────────────────────────────────── */

const ROOT          = path.resolve(__dirname, '..');
const SITE_URL      = 'https://futuregen.space';
const NEWS_SOURCE   = path.join(ROOT, 'site', 'data', 'news.json');
const TEMPLATE_PATH = path.join(ROOT, 'news.html');
const OUTPUT_DIR    = path.join(ROOT, 'news');

/* ─── slug helpers (mirrors content-store.js exactly) ─────────────── */

function normalizeSlug(value) {
    return String(value || '')
        .replace(/\.html$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function slugFromUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const cleaned = raw.replace(/[?#].*$/, '').replace(/\/+$/, '');
    const parts   = cleaned.split('/');
    return normalizeSlug(parts.pop() || '');
}

/* ─── SEO injection (mirrors server/app.js exactly) ───────────────── */

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]
    ));
}

function getAbsoluteUrl(url) {
    if (!url) return `${SITE_URL}/Images/Logo.png`;
    if (url.startsWith('http')) return url;
    return `${SITE_URL}/${url.replace(/^\/+/, '')}`;
}

function injectSeo(template, seo) {
    let html = template;

    function setMeta(attr, attrValue, content) {
        if (!content) return;
        const safeContent = escapeHtml(content);
        const pattern     = new RegExp(`<meta\\s+${escapeRegex(attr)}="${escapeRegex(attrValue)}"[^>]*>`, 'i');
        const newTag      = `<meta ${attr}="${attrValue}" content="${safeContent}">`;
        if (pattern.test(html)) {
            html = html.replace(pattern, newTag);
        } else {
            html = html.replace('</head>', `  ${newTag}\n</head>`);
        }
    }

    /* title */
    const safeTitle = escapeHtml(seo.title);
    if (/<title>/i.test(html)) {
        html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    } else {
        html = html.replace('</head>', `  <title>${safeTitle}</title>\n</head>`);
    }

    /* description */
    setMeta('name', 'description', seo.description);

    /* canonical */
    const safeUrl = escapeHtml(seo.url);
    if (/<link\s+rel="canonical"/i.test(html)) {
        html = html.replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${safeUrl}">`);
    } else {
        html = html.replace('</head>', `  <link rel="canonical" href="${safeUrl}">\n</head>`);
    }

    /* Open Graph */
    setMeta('property', 'og:title',       seo.title);
    setMeta('property', 'og:description', seo.description);
    setMeta('property', 'og:url',         seo.url);
    setMeta('property', 'og:image',       getAbsoluteUrl(seo.image));
    setMeta('property', 'og:type',        'article');
    setMeta('property', 'og:site_name',   'FutureGen AI Tools Directory');

    /* Twitter */
    setMeta('name', 'twitter:card',        'summary_large_image');
    setMeta('name', 'twitter:title',       seo.title);
    setMeta('name', 'twitter:description', seo.description);
    setMeta('name', 'twitter:image',       getAbsoluteUrl(seo.image));
    setMeta('name', 'twitter:site',        '@FutureGEN2025');

    return html;
}

/* ─── fix relative paths so they work from a subdirectory ─────────── */

function fixRelativePaths(html) {
    /*
     * news.html uses paths like  ./Images/favicon.ico
     * When served from  /news/{slug}/  those resolve to
     * /news/{slug}/Images/… which doesn't exist.
     * Replace  href="./"  and  src="./"  with root-absolute equivalents.
     */
    return html.replace(/(href|src|action)="\.\//g, '$1="/');
}

/* ─── main ─────────────────────────────────────────────────────────── */

function run() {
    /* --- load data --- */
    if (!fs.existsSync(NEWS_SOURCE)) {
        console.error(`❌  news.json not found: ${NEWS_SOURCE}`);
        process.exit(1);
    }
    if (!fs.existsSync(TEMPLATE_PATH)) {
        console.error(`❌  news.html template not found: ${TEMPLATE_PATH}`);
        process.exit(1);
    }

    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(NEWS_SOURCE, 'utf8'));
    } catch (e) {
        console.error('❌  Failed to parse news.json:', e.message);
        process.exit(1);
    }

    const articles = Array.isArray(raw) ? raw : (raw.articles || raw.posts || raw.items || []);
    if (!articles.length) {
        console.error('❌  No articles found in news.json');
        process.exit(1);
    }

    /* --- prepare template --- */
    const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf8');
    const template       = fixRelativePaths(templateSource);

    /* --- ensure output root exists --- */
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    /* Create a root-level redirect so /news/ doesn't expose a dir listing */
    const redirectHtml =
`<!DOCTYPE html>
<html><head>
<meta http-equiv="refresh" content="0;url=/news">
<link rel="canonical" href="${SITE_URL}/news">
</head><body></body></html>`;
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), redirectHtml, 'utf8');

    /* --- generate per-article pages --- */
    let count   = 0;
    let skipped = 0;
    const seen  = new Set();

    articles.forEach((article) => {
        if (!article) return;

        /*
         * Slug priority matches content-store.js:
         *   1. article.slug (explicit)
         *   2. last path segment of source_url / id
         *   3. normalised title (truncated)
         */
        const slug =
            normalizeSlug(article.slug || '') ||
            slugFromUrl(article.source_url || article.id || '') ||
            normalizeSlug((article.title_en || article.title || '').slice(0, 140));

        if (!slug) { skipped++; return; }
        if (seen.has(slug)) { skipped++; return; }
        seen.add(slug);

        const title       = article.title_en || article.title || 'AI News Article';
        const description = (article.summary_en || article.summary || '').slice(0, 300);
        const image       = article.image || article.cover_image || '';

        const seo = {
            title:       `${title} - FutureGen AI News`,
            description,
            url:         `${SITE_URL}/news/${slug}`,
            image,
        };

        const html = injectSeo(template, seo);

        const dir = path.join(OUTPUT_DIR, slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
        count++;

        if (count <= 5) {
            console.log(`  ✓ ${slug}`);
        } else if (count === 6) {
            console.log(`  … (${articles.length - 6} more)`);
        }
    });

    console.log(`
✅  Pre-rendered ${count} article pages → news/{slug}/index.html`);
    if (skipped) console.log(`   (${skipped} skipped: no slug or duplicate)`);

    console.log(`
📤  Next steps:
    1. Run:  npm run prerender:news
    2. Upload the entire "news/" folder to Hostinger → public_html/news/
       (upload it alongside index.html, news.html, js/, Images/, etc.)
    3. Verify: open https://futuregen.space/news/<any-slug>/
       and check  View Source  — og:image should show the article image
    4. Test:  https://cards-dev.twitter.com/validator
              https://developers.facebook.com/tools/debug/
`);
}

run();
