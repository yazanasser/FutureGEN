'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const MAIN_JS_PATH = path.join(ROOT, 'js', 'main.js');

function normalizeSlug(value) {
    return String(value || '')
        .replace(/\.html$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function chunkKeyFor(slug) {
    const c = (slug || '').charAt(0).toLowerCase();
    if (/[a-z]/.test(c) || /[0-9]/.test(c)) return c;
    return 'other';
}

const DESCRIPTION_PREVIEW_LIMIT = 170;

function normalizeDescriptionText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function makeShortDescription(value) {
    const text = normalizeDescriptionText(value);
    if (text.length <= DESCRIPTION_PREVIEW_LIMIT) return text;

    const preview = text.slice(0, DESCRIPTION_PREVIEW_LIMIT + 1);
    const boundary = preview.search(/\s+\S*$/);
    const cutAt = boundary > 0 ? boundary : DESCRIPTION_PREVIEW_LIMIT;
    return text.slice(0, cutAt).trim() + '...';
}

function getArabicLongDescription(tool) {
    return tool.long_description_ar || tool.desc_ar || tool.description_ar || tool.descAr || tool.ar_description || '';
}

function getEnglishLongDescription(tool) {
    return tool.long_description || tool.description || tool.desc_en || '';
}

function extractBalancedArray(src, startIdx) {
    let depth = 0, inStr = false, strChar = '', esc = false;
    for (let i = startIdx; i < src.length; i++) {
        const c = src[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (inStr) { if (c === strChar) inStr = false; continue; }
        if (c === '"' || c === "'") { inStr = true; strChar = c; continue; }
        if (c === '[') depth++;
        else if (c === ']') { depth--; if (depth === 0) return src.slice(startIdx, i + 1); }
    }
    return null;
}

function parseAiToolsFromMainJs() {
    const src = fs.readFileSync(MAIN_JS_PATH, 'utf8');
    const marker = 'const aiTools = [';
    const markerIdx = src.indexOf(marker);
    if (markerIdx === -1) { console.error('Could not find aiTools array'); return []; }
    const bracketIdx = src.indexOf('[', markerIdx);
    const raw = extractBalancedArray(src, bracketIdx);
    if (!raw) { console.error('Could not extract aiTools array'); return []; }
    const json = raw.replace(/,(\s*[}\]])/g, '$1');
    try { return JSON.parse(json); }
    catch (e) { console.error('Parse error:', e.message); return []; }
}

// ── Main rebuild ──
console.log('Parsing main.js...');
const tools = parseAiToolsFromMainJs();
console.log(`Found ${tools.length} tools in main.js`);

if (!tools.length) { console.error('No tools found, aborting.'); process.exit(1); }

// Group tools by chunk key
const chunks = {};
let withDescAr = 0;

tools.forEach(tool => {
    if (!tool || typeof tool !== 'object') return;
    const slug = normalizeSlug(tool.slug || tool.name || '');
    if (!slug) return;

    const key = chunkKeyFor(slug);
    if (!chunks[key]) chunks[key] = {};

    // Skip duplicates (keep first occurrence)
    if (chunks[key][slug]) return;

    const longDescription = getEnglishLongDescription(tool);
    const longDescriptionAr = getArabicLongDescription(tool);
    const descAr = tool.desc_ar || longDescriptionAr;
    if (descAr) withDescAr++;

    chunks[key][slug] = {
        slug,
        id: tool.id || slug,
        name: tool.name || slug,
        description: tool.description || tool.desc_en || longDescription,
        long_description: longDescription,
        short_description: tool.short_description || makeShortDescription(longDescription),
        desc_ar: descAr,
        long_description_ar: longDescriptionAr,
        short_description_ar: tool.short_description_ar || makeShortDescription(longDescriptionAr),
        category: tool.category || 'General',
        logo: tool.logo || '',
        url: tool.url || tool.official_url || tool.directory_url || '',
        pricing: tool.pricing || ''
    };
});

console.log(`Tools with desc_ar: ${withDescAr}`);
console.log(`Chunk keys: ${Object.keys(chunks).length}`);

// Write each chunk file
let totalWritten = 0;
Object.keys(chunks).sort().forEach(key => {
    const filePath = path.join(DATA_DIR, key + '.json');
    const count = Object.keys(chunks[key]).length;
    fs.writeFileSync(filePath, JSON.stringify(chunks[key]), 'utf8');
    totalWritten += count;
    console.log(`  ${key}.json: ${count} tools`);
});

console.log(`\nTotal tools written to chunks: ${totalWritten}`);

// Rebuild route-index.json
try {
    const { buildRouteIndex } = require('./migrate-routing-data');
    console.log('Rebuilding route-index.json...');
    buildRouteIndex();
    console.log('Route-index rebuilt successfully.');
} catch (e) {
    console.warn('Could not auto-rebuild route-index:', e.message);
    console.log('You may need to run: node scripts/migrate-routing-data.js');
}

console.log('\n✅ All chunk files rebuilt with desc_ar from main.js.');
