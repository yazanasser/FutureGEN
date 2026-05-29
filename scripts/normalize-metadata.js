const fs = require('fs');
const path = require('path');

const MAIN_JS_PATH = path.join(__dirname, '..', 'js', 'main.js');

const DESCRIPTION_PREVIEW_LIMIT = 170;
const LONG_DESCRIPTION_LIMIT = 1000;

function normalizeDescriptionText(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

function makeShortDescription(value, limit) {
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

    const shortEn = makeShortDescription(tool.short_description || rawLongEn, DESCRIPTION_PREVIEW_LIMIT);
    const shortAr = makeShortDescription(tool.short_description_ar || rawLongAr, DESCRIPTION_PREVIEW_LIMIT);
    
    const descEn = makeShortDescription(tool.description || tool.desc_en || rawLongEn, DESCRIPTION_PREVIEW_LIMIT);
    const descAr = makeShortDescription(tool.desc_ar || rawLongAr, DESCRIPTION_PREVIEW_LIMIT);

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

function normalize() {
    console.log('Reading main.js...');
    let content = fs.readFileSync(MAIN_JS_PATH, 'utf8');

    const startMarker = 'const aiTools = [';
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
        console.error('Could not find aiTools array start.');
        return;
    }

    const bracketIdx = content.indexOf('[', startIndex);
    const rawArray = extractBalancedArray(content, bracketIdx);
    
    if (!rawArray) {
        console.error('Could not extract balanced aiTools array.');
        return;
    }

    console.log('Processing tools...');
    try {
        // Clean up trailing commas and other non-JSON but valid JS bits to make it more parseable
        // though we'll use Function constructor to handle the JS objects
        const tools = new Function('return ' + rawArray)();
        console.log(`Found ${tools.length} tools.`);

        let changedCount = 0;
        const normalizedTools = tools.map(tool => {
            const updates = buildDescriptionFields(tool);
            let hasChange = false;
            
            for (const key in updates) {
                if (tool[key] !== updates[key]) {
                    tool[key] = updates[key];
                    hasChange = true;
                }
            }

            if (hasChange) changedCount++;
            return tool;
        });

        console.log(`Normalized ${changedCount} tools.`);

        if (changedCount > 0) {
            console.log('Converting back to string...');
            // One tool per line to keep file size manageable
            const newArrayContent = normalizedTools.map(t => '  ' + JSON.stringify(t)).join(',\n');
            
            const newFileContent = content.slice(0, bracketIdx) + 
                                   '[\n' + newArrayContent + '\n]' + 
                                   content.slice(bracketIdx + rawArray.length);

            console.log('Writing back to main.js...');
            fs.writeFileSync(MAIN_JS_PATH, newFileContent, 'utf8');
            console.log('Normalization complete.');
        } else {
            console.log('No changes needed.');
        }

    } catch (e) {
        console.error('Error during normalization:', e);
    }
}

normalize();
