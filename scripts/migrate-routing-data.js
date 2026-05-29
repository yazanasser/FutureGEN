'use strict';

const fs = require('fs');
const path = require('path');
const { createUniqueSlug, normalizeSlug } = require('../js/slug-utils');
const { buildNewsIndex } = require('../js/route-utils');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const ROUTE_INDEX_PATH = path.join(DATA_DIR, 'route-index.json');
const SITE_NEWS_PATH = path.join(ROOT, 'site', 'data', 'news.json');
const MAIN_JS_PATH = path.join(ROOT, 'js', 'main.js');

function isToolChunkFile(fileName) {
    if (!fileName.endsWith('.json')) return false;
    if (fileName === 'route-index.json') return false;
    const base = fileName.replace('.json', '');
    return /^(?:[a-z0-9]|other)$/i.test(base) && base !== 'news';
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function getCategorySlug(rawCategory) {
    return normalizeSlug(rawCategory || 'uncategorized');
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

function extractNewsItems(documentData) {
    if (Array.isArray(documentData)) return documentData;
    if (documentData && Array.isArray(documentData.articles)) return documentData.articles;
    if (documentData && Array.isArray(documentData.items)) return documentData.items;
    return [];
}

function extractBalancedArray(src, startIdx) {
    let depth = 0;
    let inStr = false;
    let strChar = '';
    let esc = false;

    for (let i = startIdx; i < src.length; i++) {
        const c = src[i];
        if (esc) { esc = false; continue; }
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

function parseAiToolsFromMainJs() {
    if (!fs.existsSync(MAIN_JS_PATH)) return [];
    const src = fs.readFileSync(MAIN_JS_PATH, 'utf8');
    const marker = 'const aiTools = [';
    const markerIdx = src.indexOf(marker);
    if (markerIdx === -1) return [];

    const bracketIdx = src.indexOf('[', markerIdx);
    if (bracketIdx === -1) return [];

    const raw = extractBalancedArray(src, bracketIdx);
    if (!raw) return [];

    const json = raw.replace(/,(\s*[}\]])/g, '$1');
    try {
        return JSON.parse(json);
    } catch (e) {
        console.warn('Could not parse aiTools array from main.js:', e.message);
        return [];
    }
}

function chunkKeyFor(slug) {
    const c = (slug || '').charAt(0).toLowerCase();
    if (/[a-z]/.test(c) || /[0-9]/.test(c)) return c;
    return 'other';
}

function syncMainJsToChunks() {
    const tools = parseAiToolsFromMainJs();
    if (!tools.length) return;

    const chunkData = {};
    const files = fs.readdirSync(DATA_DIR).filter(isToolChunkFile);
    for (const fileName of files) {
        const filePath = path.join(DATA_DIR, fileName);
        const key = fileName.replace('.json', '');
        chunkData[key] = readJson(filePath);
    }

    let addedCount = 0;

    for (const tool of tools) {
        if (!tool || typeof tool !== 'object') continue;
        const slug = normalizeSlug(tool.slug || tool.name || '');
        if (!slug) continue;

        const key = chunkKeyFor(slug);
        if (!chunkData[key]) chunkData[key] = {};

        const updatedTool = {
            slug,
            id: tool.id || slug,
            name: tool.name || slug,
            ...buildDescriptionFields(tool),
            category: tool.category || 'General',
            logo: tool.logo || '',
            url: tool.url || tool.official_url || tool.directory_url || '',
            pricing: tool.pricing || ''
        };

        const existing = chunkData[key][slug];
        if (!existing || JSON.stringify(existing) !== JSON.stringify(updatedTool)) {
            if (!existing) console.log(`Adding missing tool: ${slug}`);
            else addedCount++; // Reuse addedCount to track updates too
            chunkData[key][slug] = updatedTool;
            addedCount++;
        }
    }

    if (addedCount > 0) {
        for (const key of Object.keys(chunkData)) {
            const filePath = path.join(DATA_DIR, key + '.json');
            writeJson(filePath, chunkData[key]);
        }
        console.log(`Synced ${addedCount} new tools from main.js to chunk files.`);
    }
}

function migrateTools() {
    const files = fs.readdirSync(DATA_DIR).filter(isToolChunkFile).sort();
    const usedSlugs = new Set();
    const toolBySlug = {};
    const toolAliasMap = {};
    const categoriesBySlug = {};
    let toolCount = 0;

    for (const fileName of files) {
        const filePath = path.join(DATA_DIR, fileName);
        const chunkKey = fileName.replace('.json', '');
        const chunk = readJson(filePath);
        const migratedChunk = {};

        for (const [legacyKey, tool] of Object.entries(chunk)) {
            const record = tool || {};
            const toolId = String(record.id || legacyKey);
            const canonicalSlug = createUniqueSlug(record.slug || legacyKey || record.name || toolId, usedSlugs);
            const categoryName = String(record.category || 'Uncategorized').trim() || 'Uncategorized';
            const categorySlug = getCategorySlug(categoryName);

            if (!categoriesBySlug[categorySlug]) {
                categoriesBySlug[categorySlug] = {
                    slug: categorySlug,
                    name: categoryName,
                    toolCount: 0
                };
            }
            categoriesBySlug[categorySlug].toolCount += 1;

            const legacySlugs = [];
            if (legacyKey && legacyKey !== canonicalSlug) legacySlugs.push(normalizeSlug(legacyKey));
            if (record.slug && normalizeSlug(record.slug) !== canonicalSlug) legacySlugs.push(normalizeSlug(record.slug));

            const uniqueLegacySlugs = [...new Set(legacySlugs.filter(Boolean))];
            for (const alias of uniqueLegacySlugs) {
                if (alias !== canonicalSlug) toolAliasMap[alias] = canonicalSlug;
            }

            const migratedTool = {
                ...record,
                id: toolId,
                slug: canonicalSlug,
                category: categoryName
            };

            if (uniqueLegacySlugs.length) {
                migratedTool.legacySlugs = uniqueLegacySlugs;
            } else if (Object.prototype.hasOwnProperty.call(migratedTool, 'legacySlugs')) {
                delete migratedTool.legacySlugs;
            }

            migratedChunk[canonicalSlug] = migratedTool;
            toolBySlug[canonicalSlug] = {
                id: toolId,
                slug: canonicalSlug,
                name: record.name || canonicalSlug,
                ...buildDescriptionFields(record),
                category: categoryName,
                categorySlug,
                chunkKey,
                logo: record.logo || '',
                url: record.url || record.official_url || '',
                pricing: record.pricing || ''
            };

            toolCount += 1;
        }

        writeJson(filePath, migratedChunk);
    }

    return {
        toolCount,
        toolBySlug,
        toolAliasMap,
        categoriesBySlug
    };
}

function indexNews() {
    if (!fs.existsSync(SITE_NEWS_PATH)) {
        return { bySlug: {}, aliasMap: {} };
    }
    const newsDocument = readJson(SITE_NEWS_PATH);
    const newsIndex = buildNewsIndex(extractNewsItems(newsDocument));

    return {
        bySlug: newsIndex.bySlug || {},
        aliasMap: newsIndex.aliases || {}
    };
}

function buildRouteIndex() {
    syncMainJsToChunks();

    const tools = migrateTools();
    const news = indexNews();

    const pages = {
        about: 'about-page',
        contact: 'contact-page',
        privacy: 'privacy-page',
        terms: 'terms-page'
    };

    const routeIndex = {
        generatedAt: new Date().toISOString(),
        version: 1,
        tools: {
            count: tools.toolCount,
            bySlug: tools.toolBySlug,
            aliases: tools.toolAliasMap
        },
        categories: {
            bySlug: tools.categoriesBySlug
        },
        news: {
            bySlug: news.bySlug,
            aliases: news.aliasMap
        },
        pages
    };

    writeJson(ROUTE_INDEX_PATH, routeIndex);

    console.log(`Migrated ${tools.toolCount} tools`);
    console.log(`Indexed ${Object.keys(news.bySlug).length} news articles`);
    console.log(`Wrote ${path.relative(ROOT, ROUTE_INDEX_PATH)}`);
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0] || 'build-index';

    if (command === 'sync') {
        console.log('Syncing tools from main.js to chunks...');
        syncMainJsToChunks();
        console.log('Rebuilding index...');
        buildRouteIndex();
    } else if (command === 'build-index') {
        buildRouteIndex();
    } else {
        console.log('Unknown command. Available: sync, build-index');
    }
}

module.exports = { buildRouteIndex, syncMainJsToChunks };
