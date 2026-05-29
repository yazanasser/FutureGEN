const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('data/route-index.json', 'utf8'));
const tools = Object.values(data.tools.bySlug);

let maxDesc = 0;
let maxLong = 0;
let maxDescAr = 0;
let maxLongAr = 0;

let overLimitDesc = 0;
let overLimitLong = 0;
let overLimitDescAr = 0;
let overLimitLongAr = 0;

tools.forEach(t => {
    const descLen = (t.description || '').length;
    const longLen = (t.long_description || '').length;
    const descArLen = (t.desc_ar || '').length;
    const longArLen = (t.long_description_ar || '').length;
    
    if (descLen > maxDesc) maxDesc = descLen;
    if (longLen > maxLong) maxLong = longLen;
    if (descArLen > maxDescAr) maxDescAr = descArLen;
    if (longArLen > maxLongAr) maxLongAr = longArLen;
    
    if (descLen > 173) overLimitDesc++;
    if (longLen > 1003) overLimitLong++;
    if (descArLen > 173) overLimitDescAr++;
    if (longArLen > 1003) overLimitLongAr++;
});

console.log(`Total tools in index: ${tools.length}`);
console.log(`Max description (EN): ${maxDesc}`);
console.log(`Max long_description (EN): ${maxLong}`);
console.log(`Max description (AR): ${maxDescAr}`);
console.log(`Max long_description (AR): ${maxLongAr}`);
console.log(`Overlimit EN: ${overLimitDesc} / ${overLimitLong}`);
console.log(`Overlimit AR: ${overLimitDescAr} / ${overLimitLongAr}`);
