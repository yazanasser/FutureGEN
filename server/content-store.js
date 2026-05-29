'use strict';

const fs = require('fs');
const path = require('path');
const { textToHtml } = require('../js/route-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ROUTE_INDEX_PATH = path.join(DATA_DIR, 'route-index.json');
const NEWS_SOURCE_PATH = path.join(ROOT, 'site', 'data', 'news.json');
const MAIN_JS_PATH = path.join(ROOT, 'js', 'main.js');

let routeIndexCache = { data: null, mtimeMs: 0 };
let newsBodyCache   = { bySlug: null, mtimeMs: 0 };
let toolChunkCache  = { bySlug: null, filesMtimeSum: 0 };
let mainJsCache     = { bySlug: null, mtimeMs: 0 };
let syncPending     = false;

/* ─── helpers ───────────────────────────────────────────── */

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
    const parts = cleaned.split('/');
    return normalizeSlug(parts.pop() || '');
}

function chunkKeyFor(slug) {
    const c = (slug || '').charAt(0).toLowerCase();
    if (/[a-z]/.test(c) || /[0-9]/.test(c)) return c;
    return 'other';
}

const DESCRIPTION_PREVIEW_LIMIT = 170;
const LONG_DESCRIPTION_LIMIT = 1000;

function normalizeDescriptionText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function makeShortDescription(value, limit = DESCRIPTION_PREVIEW_LIMIT) {
    const text = normalizeDescriptionText(value);
    if (text.length <= limit) return text;

    const preview = text.slice(0, limit + 1);
    const boundary = preview.search(/\s+\S*$/);
    const cutAt = boundary > 0 ? boundary : limit;
    return text.slice(0, cutAt).trim() + '...';
}

function getArabicLongDescription(tool) {
    if (!tool) return '';
    return tool.long_description_ar || tool.desc_ar || tool.description_ar || tool.descAr || tool.ar_description || '';
}

function getEnglishLongDescription(tool) {
    if (!tool) return '';
    return tool.long_description || tool.description || tool.desc_en || '';
}

function buildDescriptionFields(tool) {
    const rawLongEn = getEnglishLongDescription(tool);
    const rawLongAr = getArabicLongDescription(tool);

    // Normalize and truncate descriptions
    const shortEn = makeShortDescription(tool.short_description || rawLongEn, DESCRIPTION_PREVIEW_LIMIT);
    const shortAr = makeShortDescription(tool.short_description_ar || rawLongAr, DESCRIPTION_PREVIEW_LIMIT);
    
    // Description (used for cards) should match short_description length
    const descEn = makeShortDescription(tool.description || tool.desc_en || rawLongEn, DESCRIPTION_PREVIEW_LIMIT);
    const descAr = makeShortDescription(tool.desc_ar || rawLongAr, DESCRIPTION_PREVIEW_LIMIT);

    // Long description capped at 1000 for consistency
    const longEn = makeShortDescription(rawLongEn, LONG_DESCRIPTION_LIMIT);
    const longAr = makeShortDescription(rawLongAr, LONG_DESCRIPTION_LIMIT);

    return {
        description: descEn,
        long_description: longEn,
        short_description: shortEn,
        desc_ar: descAr,
        long_description_ar: longAr,
        short_description_ar: shortAr
    };
}

/* ─── route-index ───────────────────────────────────────── */

function getRouteIndex() {
    try {
        const stat = fs.statSync(ROUTE_INDEX_PATH);
        if (!routeIndexCache.data || routeIndexCache.mtimeMs !== stat.mtimeMs) {
            const raw = fs.readFileSync(ROUTE_INDEX_PATH, 'utf8');
            routeIndexCache.data = JSON.parse(raw);
            routeIndexCache.mtimeMs = stat.mtimeMs;
        }
        return routeIndexCache.data;
    } catch (e) {
        return { tools: { bySlug: {} }, news: { bySlug: {} }, categories: { bySlug: {} }, pages: {} };
    }
}

/* ─── news ──────────────────────────────────────────────── */

function loadNewsBodyMap() {
    if (!fs.existsSync(NEWS_SOURCE_PATH)) return {};
    const stat = fs.statSync(NEWS_SOURCE_PATH);
    if (newsBodyCache.bySlug && newsBodyCache.mtimeMs === stat.mtimeMs) {
        return newsBodyCache.bySlug;
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(NEWS_SOURCE_PATH, 'utf8'));
    } catch (e) {
        return {};
    }
    const articles = Array.isArray(raw) ? raw : (raw.articles || raw.posts || raw.items || []);
    const map = {};
    articles.forEach((item) => {
        if (!item) return;
        const titleSlug = normalizeSlug(item.title_en || item.title || '').slice(0, 140);
        const candidates = [
            item.slug,
            slugFromUrl(item.source_url || item.id),
            titleSlug,
            normalizeSlug(item.id || '')
        ].filter(Boolean);
        const enriched = {
            slug: candidates[0] || 'article',
            title: item.title_en || item.title || titleSlug || 'Article',
            excerpt: item.summary_en || item.summary || '',
            date: item.date || '',
            category: item.category_en || item.category || 'AI News',
            body_en: item.body_en || item.body || '',
            body_ar: item.body_ar || '',
            cover_image: item.image || item.cover_image || '',
            author: item.author_en || item.author || 'FutureGen Team',
            title_en: item.title_en || item.title || '',
            title_ar: item.title_ar || ''
        };
        candidates.forEach((s) => { if (s && !map[s]) map[s] = enriched; });
    });
    newsBodyCache.bySlug = map;
    newsBodyCache.mtimeMs = stat.mtimeMs;
    return map;
}

function getNewsRoute(slug) {
    if (!slug) return null;
    const lookup = normalizeSlug(slug);
    const index = getRouteIndex();
    const news = (index.news && index.news.bySlug) || {};
    const indexEntry = news[lookup] || null;
    const bodyMap = loadNewsBodyMap();
    const enriched = bodyMap[lookup] || null;
    if (!indexEntry && !enriched) return null;
    const base = indexEntry || {};
    const enrich = enriched || {};
    const bodySource = enrich.body_en || enrich.body_ar || base.excerpt || '';
    const merged = {
        ...base,
        ...enrich,
        slug: base.slug || enrich.slug || lookup,
        title: base.title || enrich.title || enrich.title_en || enrich.title_ar || 'Article',
        body: bodySource,
        body_html: textToHtml(bodySource),
        cover_image: enrich.cover_image || base.cover_image || '',
        author: enrich.author || base.author || 'FutureGen Team',
        category: base.category || enrich.category || 'AI News',
        excerpt: base.excerpt || enrich.excerpt || ''
    };
    return { slug: merged.slug, data: merged };
}

/* ─── chunk files ───────────────────────────────────────── */

function loadToolChunkMap() {
    let entries = [];
    try { entries = fs.readdirSync(DATA_DIR); } catch (e) { return {}; }

    const chunkFiles = entries.filter((f) => /^[a-z0-9]\.json$|^other\.json$/i.test(f));

    /* Use sum of individual file mtimes — directory mtime doesn't update
       when a file inside changes. */
    let filesMtimeSum = 0;
    chunkFiles.forEach((file) => {
        try { filesMtimeSum += fs.statSync(path.join(DATA_DIR, file)).mtimeMs; } catch (e) {}
    });

    if (toolChunkCache.bySlug && toolChunkCache.filesMtimeSum === filesMtimeSum) {
        return toolChunkCache.bySlug;
    }

    const map = {};
    chunkFiles.forEach((file) => {
        const fullPath = path.join(DATA_DIR, file);
        try {
            const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            if (raw && typeof raw === 'object') {
                Object.keys(raw).forEach((key) => {
                    const tool = raw[key];
                    if (!tool || typeof tool !== 'object') return;
                    const slug = normalizeSlug(tool.slug || tool.id || key || tool.name || '');
                    if (!slug || map[slug]) return;
                    map[slug] = {
                        slug,
                        id: tool.id || slug,
                        name: tool.name || slug,
                        ...buildDescriptionFields(tool),
                        category: tool.category || '',
                        categorySlug: tool.categorySlug || normalizeSlug(tool.category || ''),
                        logo: tool.logo || '',
                        url: tool.url || tool.official_url || '',
                        pricing: tool.pricing || ''
                    };
                });
            }
        } catch (e) { /* skip malformed */ }
    });

    toolChunkCache.bySlug = map;
    toolChunkCache.filesMtimeSum = filesMtimeSum;
    return map;
}

/* ─── main.js fallback ──────────────────────────────────── */

/**
 * Walk through the source extracting balanced [ ... ] starting at startIdx.
 * Returns the raw string of the array (including outer brackets).
 */
function extractBalancedArray(src, startIdx) {
    let depth = 0;
    let inStr = false;
    let strChar = '';
    let esc = false;

    for (let i = startIdx; i < src.length; i++) {
        const c = src[i];
        if (esc)          { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (inStr) {
            if (c === strChar) inStr = false;
            continue;
        }
        if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
        if (c === '[') { depth++; }
        else if (c === ']') {
            depth--;
            if (depth === 0) return src.slice(startIdx, i + 1);
        }
    }
    return null;
}

function parseAiToolsFromMainJs(src) {
    const marker = 'const aiTools = [';
    const markerIdx = src.indexOf(marker);
    if (markerIdx === -1) return [];

    const bracketIdx = src.indexOf('[', markerIdx);
    if (bracketIdx === -1) return [];

    const raw = extractBalancedArray(src, bracketIdx);
    if (!raw) return [];

    /* Normalise to valid JSON: remove JS trailing commas */
    const json = raw.replace(/,(\s*[}\]])/g, '$1');
    try {
        return JSON.parse(json);
    } catch (e) {
        console.warn('[content-store] Could not parse aiTools array from main.js:', e.message);
        return [];
    }
}

function loadMainJsToolMap() {
    try {
        const stat = fs.statSync(MAIN_JS_PATH);
        if (mainJsCache.bySlug && mainJsCache.mtimeMs === stat.mtimeMs) {
            return mainJsCache.bySlug;
        }
        const src = fs.readFileSync(MAIN_JS_PATH, 'utf8');
        const tools = parseAiToolsFromMainJs(src);

        const map = {};
        tools.forEach((tool) => {
            if (!tool || typeof tool !== 'object') return;
            const slug = normalizeSlug(tool.slug || tool.name || '');
            if (!slug || map[slug]) return;
            map[slug] = {
                slug,
                id: tool.id || slug,
                name: tool.name || slug,
                ...buildDescriptionFields(tool),
                category: tool.category || 'General',
                categorySlug: normalizeSlug(tool.category || 'general'),
                logo: tool.logo || '',
                url: tool.url || tool.official_url || tool.directory_url || '',
                pricing: tool.pricing || ''
            };
        });

        mainJsCache.bySlug = map;
        mainJsCache.mtimeMs = stat.mtimeMs;
        console.log(`[content-store] Loaded ${tools.length} tools from main.js`);
        return map;
    } catch (e) {
        return mainJsCache.bySlug || {};
    }
}

function findToolInMap(map, lookup, baseTool) {
    if (!map) return null;

    const candidates = [
        lookup,
        baseTool && baseTool.slug,
        baseTool && baseTool.id,
        baseTool && baseTool.name
    ].map(normalizeSlug).filter(Boolean);

    for (const candidate of candidates) {
        if (map[candidate]) return map[candidate];
    }

    const baseName = normalizeSlug(baseTool && baseTool.name);
    return Object.values(map).find((tool) => {
        if (!tool || typeof tool !== 'object') return false;
        return candidates.includes(normalizeSlug(tool.slug || tool.id || ''))
            || (baseName && normalizeSlug(tool.name || '') === baseName);
    }) || null;
}

function mergeToolData(baseTool, fullTool) {
    if (!baseTool && !fullTool) return null;
    if (!fullTool) return baseTool;

    const merged = { ...(baseTool || {}), ...fullTool };
    const arabicDescription = getArabicLongDescription(fullTool) || getArabicLongDescription(baseTool);
    if (arabicDescription) merged.desc_ar = arabicDescription;
    if (!merged.long_description_ar && arabicDescription) merged.long_description_ar = arabicDescription;
    if (!merged.short_description_ar && arabicDescription) merged.short_description_ar = makeShortDescription(arabicDescription);
    if (!merged.description) {
        merged.description = (baseTool && baseTool.description) || (fullTool && fullTool.description) || '';
    }
    if (!merged.long_description) merged.long_description = getEnglishLongDescription(merged);
    if (!merged.short_description && merged.long_description) {
        merged.short_description = makeShortDescription(merged.long_description);
    }
    return merged;
}

/* ─── background sync: main.js → chunk files → route-index ─ */

function syncMainJsToChunks() {
    if (syncPending) return;
    syncPending = true;

    /* Run after current event-loop tick so the HTTP response is not blocked */
    setImmediate(() => {
        syncPending = false;
        try {
            const src = fs.readFileSync(MAIN_JS_PATH, 'utf8');
            const tools = parseAiToolsFromMainJs(src);
            if (!tools.length) return;

            /* Load current route-index to skip already-known slugs */
            const idx = getRouteIndex();
            const knownSlugs = new Set(Object.keys((idx.tools && idx.tools.bySlug) || {}));

            /* Load current chunk maps (keyed by chunkKey) */
            const chunkDirty = {};
            const chunkData  = {};

            tools.forEach((tool) => {
                if (!tool || typeof tool !== 'object') return;
                const slug = normalizeSlug(tool.slug || tool.name || '');
                if (!slug) return;

                const key = chunkKeyFor(slug);
                if (!chunkData[key]) {
                    const p = path.join(DATA_DIR, key + '.json');
                    try {
                        chunkData[key] = JSON.parse(fs.readFileSync(p, 'utf8'));
                    } catch (e) {
                        chunkData[key] = {};
                    }
                }

                if (!chunkData[key][slug]) {
                    // New tool — add it
                    if (knownSlugs.has(slug)) return; // already in route-index but not in chunk — skip
                    chunkData[key][slug] = {
                        slug,
                        id: tool.id || slug,
                        name: tool.name || slug,
                        ...buildDescriptionFields(tool),
                        category: tool.category || 'General',
                        logo: tool.logo || '',
                        url: tool.url || tool.official_url || tool.directory_url || '',
                        pricing: tool.pricing || ''
                    };
                    chunkDirty[key] = true;
                } else {
                    const nextDescriptions = buildDescriptionFields(tool);
                    const current = chunkData[key][slug];
                    Object.keys(nextDescriptions).forEach((field) => {
                        if (!current[field] && nextDescriptions[field]) {
                            current[field] = nextDescriptions[field];
                            chunkDirty[key] = true;
                        }
                    });
                }
            });

            const dirtyKeys = Object.keys(chunkDirty);
            if (!dirtyKeys.length) return;

            /* Write updated chunk files */
            dirtyKeys.forEach((key) => {
                const p = path.join(DATA_DIR, key + '.json');
                fs.writeFileSync(p, JSON.stringify(chunkData[key]), 'utf8');
            });
            console.log(`[content-store] Synced new tools into chunk file(s): ${dirtyKeys.join(', ')}`);

            /* Rebuild route-index */
            try {
                const { buildRouteIndex } = require('../scripts/migrate-routing-data');
                buildRouteIndex();
                /* Invalidate caches so next request picks up the new data */
                toolChunkCache.bySlug       = null;
                toolChunkCache.filesMtimeSum = 0;
                routeIndexCache.data        = null;
                routeIndexCache.mtimeMs     = 0;
                console.log('[content-store] Route-index rebuilt after main.js sync');
            } catch (e) {
                console.warn('[content-store] Route-index rebuild failed:', e.message);
            }
        } catch (e) {
            console.warn('[content-store] syncMainJsToChunks error:', e.message);
        }
    });
}

/* ─── tools ─────────────────────────────────────────────── */

function getToolRoute(slug) {
    if (!slug) return null;
    const lookup = normalizeSlug(slug);

    /* 1 — fast path: route-index */
    const index = getRouteIndex();
    const tools = (index.tools && index.tools.bySlug) || {};
    let data = tools[lookup];
    let foundInMainJs = false;
    let chunkMap = null;

    /* 2 — fallback: scan chunk files (catches tools added since last index build) */
    if (!data) {
        chunkMap = loadToolChunkMap();
        data = chunkMap[lookup];
    }

    /* 3 — hydrate summaries from full chunk data so localized fields are present */
    if (data && !getArabicLongDescription(data)) {
        chunkMap = chunkMap || loadToolChunkMap();
        data = mergeToolData(data, findToolInMap(chunkMap, lookup, data));
    }

    /* 4 — last resort: read aiTools array directly from main.js */
    if (!data || !getArabicLongDescription(data)) {
        const mainMap = loadMainJsToolMap();
        const mainData = findToolInMap(mainMap, lookup, data);
        if (mainData) {
            data = mergeToolData(data, mainData);
            foundInMainJs = true;
        }
        if (foundInMainJs) {
            /* Found in main.js but missing from chunks/index —
               write it into the chunk file and rebuild index in the background */
            syncMainJsToChunks();
        }
    }

    if (!data) return null;
    return { slug: data.slug || lookup, data };
}

module.exports = {
    getRouteIndex,
    getToolRoute,
    getNewsRoute
};
