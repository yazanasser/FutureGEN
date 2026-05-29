'use strict';

const fs = require('fs');
const path = require('path');
const {
    escapeHtml,
    formatArticleBody,
    resolveToolUrl,
    textToHtml
} = require('../js/route-utils');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATES_DIR = path.join(ROOT, 'templates');

const textCache = new Map();

function readTextCached(filePath) {
    const stat = fs.statSync(filePath);
    const cached = textCache.get(filePath);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.value;
    }

    const value = fs.readFileSync(filePath, 'utf8');
    textCache.set(filePath, {
        mtimeMs: stat.mtimeMs,
        value
    });

    return value;
}

function readTemplate(fileName, fallbackFileName) {
    const templatePath = path.join(TEMPLATES_DIR, fileName);
    if (fs.existsSync(templatePath)) {
        return readTextCached(templatePath);
    }

    return readTextCached(path.join(ROOT, fallbackFileName));
}

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttribute(value) {
    return escapeHtml(String(value || ''));
}

function replaceInnerHtmlById(html, id, innerHtml) {
    const pattern = new RegExp(`(<([a-z0-9-]+)[^>]*\\bid="${escapeRegex(id)}"[^>]*>)([\\s\\S]*?)(</\\2>)`, 'gi');
    return html.replace(pattern, `$1${innerHtml}$4`);
}

function setAttributeById(html, id, attribute, value) {
    const escapedValue = escapeAttribute(value);
    const openTagPattern = new RegExp(`(<[^>]*\\bid="${escapeRegex(id)}"[^>]*)(>)`, 'gi');
    const attributePattern = new RegExp(`\\s${escapeRegex(attribute)}="[^"]*"`, 'i');

    return html.replace(openTagPattern, (match, start, end) => {
        if (attributePattern.test(start)) {
            return `${start.replace(attributePattern, ` ${attribute}="${escapedValue}"`)}${end}`;
        }

        return `${start} ${attribute}="${escapedValue}"${end}`;
    });
}

function injectBeforeBodyEnd(html, snippet) {
    return html.replace(/<\/body>/i, `${snippet}\n</body>`);
}

function buildBootstrapSnippet(route) {
    const template = readTemplate('route-bootstrap.html', 'tool.html');
    const payload = JSON.stringify(route).replace(/</g, '\\u003c');
    return template.replace('__ROUTE_JSON__', payload);
}

function buildSpecItems(tool) {
    const items = [];

    if (tool.category) {
        items.push({ label: 'Category', value: tool.category });
    }

    if (tool.pricing) {
        items.push({ label: 'Pricing', value: tool.pricing });
    }

    const visitUrl = resolveToolUrl(tool);
    if (visitUrl) {
        try {
            const host = new URL(visitUrl).hostname.replace(/^www\./i, '');
            items.push({ label: 'Website', value: host });
        } catch (error) {
            items.push({ label: 'Website', value: visitUrl });
        }
    }

    items.push({ label: 'Slug', value: tool.slug || '' });

    return items.filter(item => item.value);
}

function buildSpecsHtml(tool) {
    const items = buildSpecItems(tool);

    return items.map(item => `
      <div class="spec-item">
        <span class="spec-label">${escapeHtml(item.label)}</span>
        <span class="spec-value">${escapeHtml(item.value)}</span>
      </div>
    `).join('');
}

function buildFeatureItems(tool) {
    const items = [];

    // Use the most comprehensive English description for feature extraction
    const descSource = tool.long_description || tool.description || tool.desc_en || '';
    if (descSource) {
        const descriptionBits = String(descSource)
            .split(/(?<=[.!?])\s+/)
            .map(bit => bit.trim())
            .filter(Boolean)
            .slice(0, 2);

        descriptionBits.forEach(bit => items.push(bit.replace(/[.!?]+$/, '')));
    }

    if (tool.category) {
        items.push(`${tool.category} workflow support`);
    }

    if (tool.pricing) {
        items.push(`Pricing model: ${tool.pricing}`);
    }

    return [...new Set(items)].filter(Boolean).slice(0, 4);
}

function buildFeaturesHtml(tool) {
    const items = buildFeatureItems(tool);
    if (!items.length) {
        return '<li><i class="fas fa-check-circle text-success"></i>Explore the official listing for current capabilities.</li>';
    }

    return items.map(item => `
      <li>
        <i class="fas fa-check-circle text-success"></i>
        ${escapeHtml(item)}
      </li>
    `).join('');
}

function formatDate(value) {
    if (!value) return '';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function ensureRootRelative(url, fallback) {
    if (!url) return fallback || '';
    if (url.startsWith('http') || url.startsWith('/')) return url;
    return `/${url}`;
}

function renderToolTemplate(route) {
    const tool = route.data || {};
    let html = readTemplate('tool-shell.html', 'tool.html');

    html = setAttributeById(html, 'loading-state', 'style', 'display:none;');
    html = setAttributeById(html, 'tool-content', 'style', 'display:block;');
    html = replaceInnerHtmlById(html, 'detail-tool-pricing', escapeHtml(tool.pricing || 'AI Tool'));
    html = replaceInnerHtmlById(html, 'detail-tool-category', escapeHtml(tool.category || 'AI Tool'));
    html = replaceInnerHtmlById(html, 'detail-tool-name', escapeHtml(tool.name || 'Unknown Tool'));
    const longDesc = tool.long_description || tool.description || tool.desc_en || 'No description available.';
    const longDescAr = tool.long_description_ar || tool.desc_ar || tool.description_ar || '';

    html = replaceInnerHtmlById(html, 'detail-tool-full-description', escapeHtml(longDesc));
    html = replaceInnerHtmlById(html, 'detail-tool-description', escapeHtml(longDesc));
    // If there's an Arabic description available, we could potentially inject it here too, 
    // but the client-side tool-router.js will handle the language toggle.
    // For now, ensuring the English long description is present for the initial SEO/SSR.
    
    html = replaceInnerHtmlById(html, 'detail-tool-specs', buildSpecsHtml(tool));
    html = replaceInnerHtmlById(html, 'detail-tool-features', buildFeaturesHtml(tool));

    const toolUrl = resolveToolUrl(tool);
    if (toolUrl) {
        html = setAttributeById(html, 'detail-tool-url', 'href', toolUrl);
    }

    const logoUrl = ensureRootRelative(tool.logo, '/Images/placeholder-logo.png');
    html = setAttributeById(html, 'detail-tool-logo', 'src', logoUrl);
    html = setAttributeById(html, 'detail-tool-logo', 'alt', tool.name || '');

    return injectBeforeBodyEnd(html, buildBootstrapSnippet(route));
}

function renderNewsTemplate(route) {
    const article = route.data || {};
    let html = readTemplate('news-shell.html', 'news.html');

    html = setAttributeById(html, 'news-loading-state', 'style', 'display:none;');
    html = setAttributeById(html, 'news-content', 'style', 'display:block;');
    html = replaceInnerHtmlById(html, 'news-category', escapeHtml(article.category || 'AI News'));
    html = replaceInnerHtmlById(html, 'news-title', escapeHtml(article.title || 'Untitled Article'));
    html = replaceInnerHtmlById(html, 'news-date', escapeHtml(formatDate(article.date)));
    html = replaceInnerHtmlById(html, 'news-author', escapeHtml(article.author || 'FutureGen Team'));
    html = replaceInnerHtmlById(html, 'news-body', formatArticleBody(article.body_html || textToHtml(article.body || '')));

    if (article.cover_image) {
        const coverUrl = ensureRootRelative(article.cover_image);
        html = setAttributeById(html, 'news-cover-img', 'src', coverUrl);
        html = setAttributeById(html, 'news-cover-img', 'alt', article.title || 'Article cover');
        html = setAttributeById(html, 'news-cover-img', 'style', 'display:block;');
    } else {
        html = setAttributeById(html, 'news-cover-img', 'style', 'display:none;');
    }

    return injectBeforeBodyEnd(html, buildBootstrapSnippet(route));
}

function renderNotFound() {
    return readTemplate('not-found.html', 'index.html');
}

module.exports = {
    renderNewsTemplate,
    renderNotFound,
    renderToolTemplate
};