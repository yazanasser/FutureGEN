'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { resolveRoute } = require('./route-resolver');
const {
    renderNewsTemplate,
    renderNotFound,
    renderToolTemplate
} = require('./template-renderer');

const ROOT = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const SITE_URL = process.env.SITE_URL || 'https://futuregen.space';

const app = express();
function getIndexHtml() {
    return fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
}

app.use('/data', express.static(path.join(ROOT, 'data'), { maxAge: 0 }));
app.use('/js', express.static(path.join(ROOT, 'js'), {
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
    }
}));
app.use('/Images', express.static(path.join(ROOT, 'Images'), { maxAge: '30d' }));
app.use(express.static(ROOT, {
    maxAge: 0,
    etag: false,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        }
    }
}));

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;'
    }[char]));
}

function getAbsoluteUrl(url) {
    if (!url) return `${SITE_URL}/Images/Logo.png`;
    if (url.startsWith('http')) return url;
    return `${SITE_URL}/${url.replace(/^\/+/, '')}`;
}

function injectSeo(template, seo) {
    let html = template;

    const setMeta = (attr, attrValue, content) => {
        if (!content) return;
        const safeContent = escapeHtml(content);
        const pattern = new RegExp(`<meta\\s+${attr}="${attrValue}"[^>]*>`, 'i');
        const newTag = `<meta ${attr}="${attrValue}" content="${safeContent}">`;
        
        if (pattern.test(html)) {
            html = html.replace(pattern, newTag);
        } else {
            html = html.replace('</head>', `  ${newTag}\n</head>`);
        }
    };

    // Update Title
    const safeTitle = escapeHtml(seo.title);
    if (/<title>/.test(html)) {
        html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`);
    } else {
        html = html.replace('</head>', `  <title>${safeTitle}</title>\n</head>`);
    }

    // Basic Meta
    setMeta('name', 'description', seo.description);
    if (seo.keywords) setMeta('name', 'keywords', seo.keywords);

    // Canonical
    const safeUrl = escapeHtml(seo.url);
    const canonicalPattern = /<link\s+rel="canonical"[^>]*>/i;
    const newCanonical = `<link rel="canonical" href="${safeUrl}">`;
    if (canonicalPattern.test(html)) {
        html = html.replace(canonicalPattern, newCanonical);
    } else {
        html = html.replace('</head>', `  ${newCanonical}\n</head>`);
    }

    // Open Graph
    setMeta('property', 'og:title', seo.title);
    setMeta('property', 'og:description', seo.description);
    setMeta('property', 'og:url', seo.url);
    setMeta('property', 'og:image', getAbsoluteUrl(seo.image));
    setMeta('property', 'og:type', seo.type || 'website');
    setMeta('property', 'og:site_name', 'FutureGen AI Tools Directory');

    // Twitter
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', seo.title);
    setMeta('name', 'twitter:description', seo.description);
    setMeta('name', 'twitter:image', getAbsoluteUrl(seo.image));
    setMeta('name', 'twitter:site', '@FutureGEN2025');

    return html;
}

function render404(req, res) {
    res.status(404).send(renderNotFound());
}

/* ─── API: resolve a single tool by slug ─────────────────────────────
   Used by tool-router.js as a fallback when the chunk-file cache misses.
   Always reads the live source (main.js + chunk files + route-index).
   ------------------------------------------------------------------- */
app.get('/api/tool-data/:slug', (req, res) => {
    const { getToolRoute } = require('./content-store');
    const slug = String(req.params.slug || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return res.json({ found: false });
    const route = getToolRoute(slug);
    if (!route) return res.json({ found: false, slug });
    res.json({ found: true, slug: route.slug, tool: route.data });
});

app.get('*', (req, res) => {
    const route = resolveRoute(req.path);

    if (route.type === 'redirect') {
        return res.redirect(route.statusCode || 301, route.location);
    }

    if (route.type === 'not_found') {
        return render404(req, res);
    }

    // Handle pages that use the main index.html shell
    if (route.type === 'home' || route.type === 'news_list' || route.type === 'category' || route.type === 'page') {
        const shell = getIndexHtml();
        let seo = {
            title: 'FutureGen - AI Tools Directory',
            description: 'Discover the best AI tools for writing, design, coding, and more. Explore 4,200+ AI tools updated daily.',
            url: `${SITE_URL}${req.path}`,
            image: '/Images/Logo.png'
        };

        if (route.type === 'category') {
            const catName = route.data.name || route.slug;
            seo.title = `${catName} AI Tools - FutureGen`;
            seo.description = `Browse the best ${catName} AI tools. Compare features and pricing for top-rated ${catName} solutions.`;
        } else if (route.type === 'news_list') {
            seo.title = 'Latest AI News - FutureGen';
            seo.description = 'Stay updated with the latest breakthroughs in artificial intelligence, machine learning, and AI tools.';
        } else if (route.type === 'page') {
            const pageName = route.slug.charAt(0).toUpperCase() + route.slug.slice(1);
            seo.title = `${pageName} - FutureGen`;
        }

        return res.status(200).send(injectSeo(shell, seo));
    }

    if (route.type === 'tool_shell') {
        /* Slug not found in index/chunks — serve raw tool.html so the client-side
           tool-router.js can attempt its own lookup and render a graceful UI. */
        return res.status(200).sendFile(path.join(ROOT, 'tool.html'));
    }

    if (route.type === 'news_shell') {
        /* News slug not found — serve raw news.html so the client can show graceful UI. */
        return res.status(200).sendFile(path.join(ROOT, 'news.html'));
    }

    if (route.type === 'tool') {
        const seo = {
            title: `${route.data.name} - FutureGen AI Tools`,
            description: route.data.description || `Explore ${route.data.name} on FutureGen.`,
            url: `${SITE_URL}/tools/${route.slug}`,
            image: route.data.logo,
            type: 'website'
        };
        return res.status(200).send(injectSeo(renderToolTemplate(route), seo));
    }

    if (route.type === 'news') {
        const seo = {
            title: `${route.data.title} - FutureGen AI News`,
            description: route.data.excerpt || `Read ${route.data.title} on FutureGen News.`,
            url: `${SITE_URL}/news/${route.slug}`,
            image: route.data.cover_image,
            type: 'article'
        };
        return res.status(200).send(injectSeo(renderNewsTemplate(route), seo));
    }

    return render404(req, res);
});

app.listen(PORT, () => {
    console.log(`FutureGen router listening on http://localhost:${PORT}`);
});