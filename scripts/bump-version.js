/**
 * bump-version.js
 * Auto-updates version.json with a new timestamp fingerprint.
 * Run this before every deployment to ensure all clients detect the update.
 *
 * Usage:
 *   node scripts/bump-version.js
 *
 * Called automatically by `npm run predeploy` or `npm run version:bump`.
 */

const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '..', 'version.json');

// Generate fingerprint: YYYYMMDDHHmmss format + unix timestamp
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const fingerprint = [
  now.getFullYear(),
  pad(now.getMonth() + 1),
  pad(now.getDate()),
  pad(now.getHours()),
  pad(now.getMinutes()),
  pad(now.getSeconds())
].join('');

const versionData = {
  v: fingerprint,
  t: Math.floor(now.getTime() / 1000)
};

fs.writeFileSync(versionFile, JSON.stringify(versionData) + '\n', 'utf8');
console.log(`[bump-version] ✅ version.json updated → v${fingerprint} (t=${versionData.t})`);

// ─── Update ?v= cache-busting params on local JS files in HTML pages ───────
// This ensures Mac Safari/Chrome (and all browsers) fetch fresh JS files
// after every deploy — they see a new URL and cannot use any cached version.
const htmlFiles = ['index.html', 'tool.html', 'news.html'].map(f => path.join(__dirname, '..', f));

for (const htmlFile of htmlFiles) {
  if (!fs.existsSync(htmlFile)) continue;
  let html = fs.readFileSync(htmlFile, 'utf8');
  const before = html;

  // Match LOCAL JS paths only: must start right after a quote (src="  or src=')
  // This prevents matching /js/ that appears mid-path in CDN URLs like bootstrap@5.3.3/dist/js/...
  // Replaces the ?v= param (or adds one) with the new fingerprint
  html = html.replace(/(?<=["'])(\.?\/js\/[^"'?#\s]+)(?:\?v=[^"'&\s]*)?(?=["'])/g, `$1?v=${fingerprint}`);

  if (html !== before) {
    fs.writeFileSync(htmlFile, html, 'utf8');
    console.log(`[bump-version] ✅ ${path.basename(htmlFile)} JS cache params updated → v${fingerprint}`);
  }
}
