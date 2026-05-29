/**
 * fix-sitemaps.js
 * Removes .html extensions from all sitemap URLs to match the clean URL routing.
 * Also updates lastmod dates to current date.
 * 
 * Usage: node scripts/fix-sitemaps.js
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// Find all sitemap*.xml files
const files = fs.readdirSync(root).filter(f => /^sitemap\d*\.xml$/i.test(f));

let totalFixed = 0;

files.forEach(file => {
  const filePath = path.join(root, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Count .html occurrences before fix
  const matches = (content.match(/\.html<\/loc>/g) || []).length;
  
  // Remove .html from all <loc> URLs
  content = content.replace(/\.html<\/loc>/g, '</loc>');
  
  // Update all lastmod dates to today
  content = content.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${today}</lastmod>`);
  
  fs.writeFileSync(filePath, content, 'utf8');
  totalFixed += matches;
  console.log(`[fix-sitemaps] ✅ ${file}: fixed ${matches} URLs, updated lastmod to ${today}`);
});

// Also update sitemap-index.xml lastmod
const indexPath = path.join(root, 'sitemap-index.xml');
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  indexContent = indexContent.replace(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g, `<lastmod>${today}</lastmod>`);
  fs.writeFileSync(indexPath, indexContent, 'utf8');
  console.log(`[fix-sitemaps] ✅ sitemap-index.xml: updated lastmod to ${today}`);
}

console.log(`\n[fix-sitemaps] Total: ${totalFixed} .html extensions removed across ${files.length} sitemaps.`);
