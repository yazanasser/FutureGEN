const fs = require('fs');
const path = require('path');

const MAIN_JS_PATH = path.join(__dirname, '..', 'js', 'main.js');

function makeShortDescription(text, limit = 170) {
    if (!text) return '';
    const cleanText = String(text).trim().replace(/\s+/g, ' ');
    if (cleanText.length <= limit) return cleanText;

    const preview = cleanText.slice(0, limit + 1);
    const boundary = preview.search(/\s+\S*$/);
    const cutAt = boundary > 0 ? boundary : limit;
    return cleanText.slice(0, cutAt).trim() + '...';
}

function migrate() {
    console.log('Reading main.js...');
    let content = fs.readFileSync(MAIN_JS_PATH, 'utf8');

    // Find the aiTools array
    const startMarker = 'const aiTools = [';
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
        console.error('Could not find aiTools array start.');
        return;
    }

    // This is a naive but effective way to find the end of the array for this specific file
    // which we know ends with '];' after a huge block of objects.
    const endIndex = content.lastIndexOf('];');
    if (endIndex === -1 || endIndex < startIndex) {
        console.error('Could not find aiTools array end.');
        return;
    }

    const arrayContent = content.slice(startIndex + startMarker.length, endIndex);
    
    // We'll parse the objects one by one using a more robust regex or split
    // Since it's a huge file, JSON.parse might fail if it's not strictly JSON (it's JS)
    // But we can try to wrap it in brackets and see.
    
    console.log('Processing tools...');
    try {
        // Wrap in [ ] to make it valid JSON if possible, but it's JS so it has trailing commas etc.
        // We'll use eval() in a controlled way since we are running locally on known code.
        const tools = eval('[' + arrayContent + ']');
        console.log(`Found ${tools.length} tools.`);

        let changedCount = 0;
        const migratedTools = tools.map(tool => {
            let changed = false;
            
            // Handle English
            const longEn = tool.long_description || tool.description || tool.desc_en || '';
            const currentShortEn = tool.short_description || '';
            
            if (!currentShortEn || currentShortEn === longEn) {
                const newShort = makeShortDescription(longEn);
                if (newShort !== currentShortEn) {
                    tool.short_description = newShort;
                    changed = true;
                }
            }
            
            // Ensure long_description exists
            if (!tool.long_description && (tool.description || tool.desc_en)) {
                tool.long_description = tool.description || tool.desc_en;
                changed = true;
            }

            // Handle Arabic
            const longAr = tool.long_description_ar || tool.desc_ar || tool.description_ar || '';
            const currentShortAr = tool.short_description_ar || '';
            
            if (longAr && (!currentShortAr || currentShortAr === longAr)) {
                const newShortAr = makeShortDescription(longAr);
                if (newShortAr !== currentShortAr) {
                    tool.short_description_ar = newShortAr;
                    changed = true;
                }
            }
            
            if (longAr && !tool.long_description_ar) {
                tool.long_description_ar = longAr;
                changed = true;
            }

            if (changed) changedCount++;
            return tool;
        });

        console.log(`Updated ${changedCount} tools.`);

        // Convert back to JS string
        // We'll use JSON.stringify and then format it slightly to look like the original
        // The original has one object per line or multi-line. 
        // To be safe and keep it readable, we'll do 2-space indent.
        const newArrayContent = migratedTools.map(t => JSON.stringify(t, null, 2)).join(',\n');
        
        const newFileContent = content.slice(0, startIndex + startMarker.length) + 
                               '\n' + newArrayContent + '\n' + 
                               content.slice(endIndex);

        console.log('Writing back to main.js...');
        fs.writeFileSync(MAIN_JS_PATH, newFileContent, 'utf8');
        console.log('Migration complete.');

    } catch (e) {
        console.error('Error during migration:', e);
    }
}

migrate();
