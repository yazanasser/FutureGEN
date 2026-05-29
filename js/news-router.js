/**
 * news-router.js — canonical news route resolver with cache.
 * Resolves direct /news/:slug routes from the existing site/data/news.json source.
 */

const NEWS_CACHE_VERSION = 'v3';
const NEWS_CACHE_TTL_MS = 60 * 60 * 1000;
const NEWS_ROUTE_CACHE_KEY = 'futuregen_news_index_v3';
const NEWS_ROUTE_BOOTSTRAP_KEY = '__FUTUREGEN_ROUTE__';

let newsIndexMemory = null;

document.addEventListener('DOMContentLoaded', () => {
    initNewsPage();
});

window.addEventListener('RouteChanged', (event) => {
    if (event.detail.type === 'news') {
        initNewsPage(event.detail.slug);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

function routesApi() {
    return window.FutureGenRoutes || {};
}

function normalizeSlug(raw) {
    if (typeof routesApi().normalizeSlug === 'function') {
        return routesApi().normalizeSlug(raw);
    }

    return String(raw || '')
        .replace(/\.html$/i, '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function extractNewsSlugFromPath() {
    const match = window.location.pathname.match(/^\/news\/([^/]+)\/?$/i);
    if (!match) return '';
    return normalizeSlug(decodeURIComponent(match[1]));
}

function getBootstrapRoute() {
    const route = window[NEWS_ROUTE_BOOTSTRAP_KEY];
    if (!route || route.type !== 'news') return null;
    return route;
}

function extractNewsItems(documentData) {
    if (Array.isArray(documentData)) return documentData;
    if (documentData && Array.isArray(documentData.articles)) return documentData.articles;
    if (documentData && Array.isArray(documentData.items)) return documentData.items;
    return [];
}

async function getNewsIndex() {
    if (newsIndexMemory) return newsIndexMemory;

    try {
        const cached = localStorage.getItem(NEWS_ROUTE_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.timestamp && parsed.data && Date.now() - parsed.timestamp < NEWS_CACHE_TTL_MS) {
                newsIndexMemory = parsed.data;
                return newsIndexMemory;
            }
        }
    } catch (error) {
        console.warn('News route cache read failed:', error);
    }

    try {
        const response = await fetch('/site/data/news.json', { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error(`Failed to load news source: ${response.status}`);
        }

        const rawData = await response.json();
        const items = extractNewsItems(rawData);
        newsIndexMemory = typeof routesApi().buildNewsIndex === 'function'
            ? routesApi().buildNewsIndex(items)
            : { aliases: {}, bySlug: {}, articles: {} };

        setTimeout(() => {
            try {
                localStorage.setItem(NEWS_ROUTE_CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: newsIndexMemory
                }));
            } catch (error) {
                // Ignore quota issues.
            }
        }, 0);

        return newsIndexMemory;
    } catch (error) {
        console.warn('News route source fetch failed:', error);
        return null;
    }
}

async function resolveCanonicalNewsSlug(slug) {
    const index = await getNewsIndex();
    if (!index || !index.aliases) return slug;
    return index.aliases[slug] || slug;
}

function getBootstrapArticle(canonicalSlug) {
    const route = getBootstrapRoute();
    if (!route) return null;

    const routeSlug = normalizeSlug(route.slug || '');
    if (canonicalSlug && routeSlug !== canonicalSlug) {
        return null;
    }

    return route.data || null;
}

async function initNewsPage(forcedSlug = null) {
    if (!getBootstrapRoute()) {
        toggleNewsLoading(true);
    }

    let slug = forcedSlug ? normalizeSlug(forcedSlug) : extractNewsSlugFromPath();
    if (!slug) {
        slug = normalizeSlug(window.location.pathname.split('/').filter(Boolean).pop());
    }

    if (!slug || slug === 'news.html' || slug === 'news') {
        showNewsError('Invalid news URL. Please navigate from the homepage.');
        return;
    }

    const canonicalSlug = await resolveCanonicalNewsSlug(slug);
    const canonicalPath = `/news/${canonicalSlug}`;
    const currentPath = window.location.pathname.replace(/\/$/, '');
    if (currentPath !== canonicalPath) {
        window.location.replace(canonicalPath);
        return;
    }

    const bootstrapArticle = getBootstrapArticle(canonicalSlug);
    if (bootstrapArticle) {
        renderNewsArticle(bootstrapArticle);
        updateNewsSEO(bootstrapArticle, canonicalSlug);
        return;
    }

    const index = await getNewsIndex();
    if (!index || !index.articles) {
        showNewsError('Failed to load article. Please try again later.');
        return;
    }

    const articleData = index.articles[canonicalSlug];
    if (!articleData) {
        showNewsError('Article not found. It may have been removed or the URL is incorrect.', true);
        return;
    }

    renderNewsArticle(articleData);
    updateNewsSEO(articleData, canonicalSlug);
}

let _currentArticle = null;

function renderNewsArticle(article) {
    _currentArticle = article;
    toggleNewsLoading(false);

    const lang = localStorage.getItem('lang') || 'en';
    const isAr = lang === 'ar';

    const setTextById = (id, text) => {
        const element = document.getElementById(id);
        if (element) element.textContent = text;
    };

    const setHTMLById = (id, html) => {
        const element = document.getElementById(id);
        if (element) element.innerHTML = html;
    };

    const title = isAr
        ? (article.title_ar || article.title_en || article.title || 'Untitled Article')
        : (article.title_en || article.title || 'Untitled Article');

    const author = isAr
        ? (article.author_ar || article.author || 'فريق FutureGen')
        : (article.author || 'FutureGen Team');

    const category = isAr
        ? (article.category_ar || article.category || 'أخبار الذكاء الاصطناعي')
        : (article.category || 'AI News');

    const _fmtBody = routesApi().formatArticleBody || (function(h) { return h; });
    let bodyHtml;
    if (isAr && article.body_ar) {
        bodyHtml = routesApi().textToHtml ? routesApi().textToHtml(article.body_ar) : `<p>${article.body_ar}</p>`;
    } else {
        const rawHtml = article.body_html || (routesApi().textToHtml ? routesApi().textToHtml(article.body_en || article.body || '') : article.body_en || article.body || '<p>No content available.</p>');
        bodyHtml = _fmtBody(rawHtml);
    }

    /* Apply reading direction to the content column */
    const contentEl = document.getElementById('blog-post-page');
    if (contentEl) contentEl.setAttribute('dir', isAr ? 'rtl' : 'ltr');
    const bodyEl = document.getElementById('blog-post-body-container');
    if (bodyEl) bodyEl.style.textAlign = isAr ? 'right' : 'left';
    const titleEl = document.getElementById('blog-post-title');
    if (titleEl) titleEl.style.textAlign = isAr ? 'right' : 'left';

    setTextById('blog-post-title', title);
    setTextById('blog-post-date', article.date ? new Date(article.date).toLocaleDateString(isAr ? 'ar-SA' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }) : '');
    setTextById('blog-post-author', author);
    setTextById('blog-post-category', category);
    setHTMLById('blog-post-body-container', bodyHtml);

    const coverEl = document.getElementById('blog-post-image');
    if (coverEl) {
        if (article.cover_image) {
            coverEl.src = article.cover_image;
            coverEl.alt = article.title || 'Article cover';
            coverEl.style.display = 'block';
            coverEl.onload = () => coverEl.classList.remove('loading');
        } else {
            coverEl.style.display = 'none';
            coverEl.removeAttribute('src');
            coverEl.removeAttribute('alt');
        }
    }

    if (window.gtag) {
        window.gtag('event', 'page_view', {
            page_title: `${article.title} - FutureGen News`,
            page_location: window.location.href,
            page_path: window.location.pathname,
            article_category: article.category
        });
    }
}

function updateNewsSEO(article, slug) {
    const title = `${article.title || 'News'} - FutureGen AI News`;
    const desc = article.excerpt || article.title || 'Latest AI news from FutureGen.';
    const canonicalUrl = `${window.location.origin}/news/${slug}`;
    const imageUrl = article.cover_image || 'https://futuregen.space/Images/Logo.png';

    document.title = title;

    const setMeta = (selector, attr, value) => {
        let element = document.querySelector(selector);
        if (!element) {
            element = document.createElement('meta');
            if (selector.includes('property=')) {
                element.setAttribute('property', selector.match(/property="([^"]+)"/)[1]);
            } else if (selector.includes('name=')) {
                element.setAttribute('name', selector.match(/name="([^"]+)"/)[1]);
            }
            document.head.appendChild(element);
        }
        element.setAttribute(attr, value);
    };

    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[name="robots"]', 'content', 'index,follow');
    setMeta('meta[property="og:type"]', 'content', 'article');
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[property="og:image"]', 'content', imageUrl);
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    setMeta('meta[name="twitter:image"]', 'content', imageUrl);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    if (article.date) {
        setMeta('meta[property="article:published_time"]', 'content', article.date);
    }
}

function toggleNewsLoading(isLoading) {
    const skeleton = document.getElementById('news-loading-state');
    const content = document.getElementById('blog-post-page');
    const errorEl = document.getElementById('news-error-state');

    if (skeleton) skeleton.style.display = isLoading ? 'flex' : 'none';
    if (content) content.style.display = isLoading ? 'none' : 'block';
    if (errorEl) errorEl.style.display = 'none';
}

function showNewsError(message, is404 = false) {
    const skeleton = document.getElementById('news-loading-state');
    const content = document.getElementById('blog-post-page');
    const errorEl = document.getElementById('news-error-state');

    if (skeleton) skeleton.style.display = 'none';
    if (content) content.style.display = 'none';

    if (errorEl) {
        errorEl.style.display = 'block';
        const msgEl = document.getElementById('news-error-message');
        if (msgEl) msgEl.textContent = message;
    }

    document.title = is404 ? 'Article Not Found - FutureGen' : 'Error - FutureGen News';

    const robotsMeta = document.querySelector('meta[name="robots"]') || document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    robotsMeta.setAttribute('content', is404 ? 'noindex,follow' : 'noindex,nofollow');
    if (!robotsMeta.parentNode) document.head.appendChild(robotsMeta);
}

/* Re-render on language change (triggered by navbar.js) */
window.__NEWS_ON_LANGUAGE_CHANGED__ = function () {
    if (_currentArticle) renderNewsArticle(_currentArticle);
};