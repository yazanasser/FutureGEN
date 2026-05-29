'use strict';

const fs = require('fs');
const path = require('path');
const {
    getNewsRoute,
    getRouteIndex,
    getToolRoute
} = require('./content-store');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ROUTE_INDEX_PATH = path.join(DATA_DIR, 'route-index.json');

const REBUILD_COOLDOWN_MS = 30000; // 30 seconds between rebuilds

let cache = {
    index: null,
    loadedAt: 0,
    mtimeMs: 0
};

let lastRebuildMs = 0;

function loadIndex() {
    try {
        const stat = fs.statSync(ROUTE_INDEX_PATH);
        if (!cache.index || cache.mtimeMs !== stat.mtimeMs) {
            cache.index = getRouteIndex();
            cache.loadedAt = Date.now();
            cache.mtimeMs = stat.mtimeMs;
        }
    } catch (e) {
        if (!cache.index) {
            cache.index = { tools: { bySlug: {} }, news: { bySlug: {} }, categories: { bySlug: {} }, pages: {} };
        }
    }
    return cache.index;
}

function normalizePath(inputPath) {
    let clean = decodeURIComponent(inputPath || '/').split('?')[0].split('#')[0].trim();
    if (!clean.startsWith('/')) clean = `/${clean}`;
    if (clean.length > 1 && clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
}

function resolveAlias(slug, aliasMap) {
    if (!aliasMap || !slug) return slug;
    return aliasMap[slug] || slug;
}

/**
 * Attempt a single throttled index rebuild.
 * Returns true if a rebuild was performed, false if skipped (cooldown).
 */
function tryRebuildIndex() {
    const now = Date.now();
    if (now - lastRebuildMs < REBUILD_COOLDOWN_MS) return false;

    try {
        require('../scripts/migrate-routing-data').buildRouteIndex();
        lastRebuildMs = Date.now();
        cache.index = null; // force reload on next access
        cache.mtimeMs = 0;
        loadIndex();
        return true;
    } catch (e) {
        console.error('Failed to rebuild route index:', e.message || e);
        lastRebuildMs = Date.now(); // still set cooldown to avoid retry storm
        return false;
    }
}

function resolveRoute(inputPath) {
    const index = loadIndex();
    const pathName = normalizePath(inputPath);

    if (pathName === '/' || pathName === '/index' || pathName === '/index.html' || pathName === '/about' || pathName === '/contact') {
        return { type: 'home', statusCode: 200 };
    }

    if (pathName === '/news' || pathName === '/news.html') {
        return { type: 'news_list', statusCode: 200 };
    }

    const oldTool = pathName.match(/^\/tool\/([^/]+)$/i);
    if (oldTool) {
        return {
            type: 'redirect',
            statusCode: 301,
            location: `/tools/${oldTool[1].replace(/\.html$/i, '')}`
        };
    }

    const oldArticle = pathName.match(/^\/article\/([^/]+)$/i);
    if (oldArticle) {
        return {
            type: 'redirect',
            statusCode: 301,
            location: `/news/${oldArticle[1].replace(/\.html$/i, '')}`
        };
    }

    const toolMatch = pathName.match(/^\/tools\/([^/]+)$/i);
    if (toolMatch) {
        const requested = toolMatch[1].replace(/\.html$/i, '').toLowerCase();
        let route = getToolRoute(requested);
        if (!route) {
            /* Try to rebuild the index once (throttled) in case a new tool was
               added to a chunk file after the last build. */
            tryRebuildIndex();
            route = getToolRoute(requested);
        }
        if (!route) {
            /* Slug still not found — serve tool.html shell so the client-side
               tool-router.js can attempt its own chunk-file lookup and show a
               graceful "not found" UI instead of a hard server 404. */
            return { type: 'tool_shell', statusCode: 200, slug: requested };
        }
        const canonical = route.slug;
        if (canonical !== requested) {
            return { type: 'redirect', statusCode: 301, location: `/tools/${canonical}` };
        }
        return { type: 'tool', statusCode: 200, slug: canonical, data: route.data };
    }

    const newsMatch = pathName.match(/^\/news\/([^/]+)$/i);
    if (newsMatch) {
        const requested = newsMatch[1].replace(/\.html$/i, '').toLowerCase();
        let route = getNewsRoute(requested);
        if (!route) {
            tryRebuildIndex();
            route = getNewsRoute(requested);
        }
        if (!route) return { type: 'news_shell', statusCode: 200, slug: requested };
        const canonical = route.slug;
        if (canonical !== requested) {
            return { type: 'redirect', statusCode: 301, location: `/news/${canonical}` };
        }
        return { type: 'news', statusCode: 200, slug: canonical, data: route.data };
    }

    const categoryMatch = pathName.match(/^\/category\/([^/]+)$/i);
    if (categoryMatch) {
        const slug = categoryMatch[1].toLowerCase();
        const categories = (index.categories && index.categories.bySlug) || {};
        let category = categories[slug];
        if (!category) return { type: 'not_found', statusCode: 404 };
        return { type: 'category', statusCode: 200, slug, data: category };
    }

    const pageMatch = pathName.match(/^\/page\/([^/]+)$/i);
    if (pageMatch) {
        const slug = pageMatch[1].toLowerCase();
        const pageId = (index.pages || {})[slug];
        if (!pageId) return { type: 'not_found', statusCode: 404 };
        return { type: 'page', statusCode: 200, slug, data: { pageId } };
    }

    return { type: 'not_found', statusCode: 404 };
}

module.exports = {
    resolveRoute,
    loadIndex
};