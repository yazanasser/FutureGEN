const fs = require('fs');
let content = fs.readFileSync('js/main.js', 'utf8');

// Replace all occurrences of "currentLang" with "window.currentLang"
// But only if it's not already preceded by "window." or "typeof "
// We will use a regex to do this safely.

content = content.replace(/(?<!window\.)(?<!typeof\s+)\bcurrentLang\b/g, 'window.currentLang');

// We also might have "currentLanguage" remaining.
content = content.replace(/(?<!window\.)(?<!typeof\s+)\bcurrentLanguage\b/g, 'window.currentLang');

fs.writeFileSync('js/main.js', content, 'utf8');
console.log('Fixed currentLang references in main.js');
