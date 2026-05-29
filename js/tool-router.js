/**
 * tool-router.js — canonical tool route resolver with cache.
 * Supports direct access to /tools/:slug on both SSR and static-host fallbacks.
 */

const CACHE_VERSION = 'v8';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour (was 24h — shorter so new tools appear quickly)
const ROUTE_INDEX_CACHE_KEY = 'futuregen_route_index_v8';
const ROUTE_BOOTSTRAP_KEY = '__FUTUREGEN_ROUTE__';

const memoryCache = {};
let routeIndexMemory = null;
let _currentToolData = null; // Store tool data for language switching
let _currentChunkData = null; // Store peer data so related cards can re-render on language changes

const STATIC_PAGES = new Set([
    'index', 'index.html',
    'about', 'about.html',
    'contact', 'contact.html',
    'privacy', 'privacy.html',
    'terms', 'terms.html',
    'news', 'news.html',
    'sitemap', 'sitemap.xml',
    'robots', 'robots.txt',
    ''
]);

document.addEventListener('DOMContentLoaded', () => {
    initToolPage();
});

window.addEventListener('RouteChanged', (event) => {
    if (event.detail.type === 'tool') {
        initToolPage(event.detail.slug);
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
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function getBootstrapRoute() {
    const route = window[ROUTE_BOOTSTRAP_KEY];
    if (!route || route.type !== 'tool') return null;
    return route;
}

function extractSlugFromPath() {
    const match = window.location.pathname.match(/^\/tools\/([^/]+)\/?$/i);
    if (!match) return '';
    return normalizeSlug(decodeURIComponent(match[1]));
}

async function getRouteIndex() {
    if (routeIndexMemory) return routeIndexMemory;

    try {
        const cached = localStorage.getItem(ROUTE_INDEX_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.timestamp && parsed.data && Date.now() - parsed.timestamp < CACHE_TTL_MS) {
                routeIndexMemory = parsed.data;
                hydrateToolAliases(routeIndexMemory);
                return routeIndexMemory;
            }
        }
    } catch (error) {
        console.warn('Route index cache read failed', error);
    }

    try {
        const response = await fetch(`/data/route-index.json?v=${CACHE_VERSION}`, { cache: 'no-cache' });
        if (!response.ok) return null;

        routeIndexMemory = await response.json();
        hydrateToolAliases(routeIndexMemory);

        setTimeout(() => {
            try {
                localStorage.setItem(ROUTE_INDEX_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: routeIndexMemory }));
            } catch (error) {
                // Ignore local storage limits
            }
        }, 0);

        return routeIndexMemory;
    } catch (error) {
        console.warn('Route index fetch failed', error);
        return null;
    }
}

function hydrateToolAliases(index) {
    if (!index || !index.tools) return;

    if (typeof routesApi().buildToolAliasMap === 'function') {
        index.tools.aliases = routesApi().buildToolAliasMap(index);
        return;
    }

    index.tools.aliases = index.tools.aliases || {};
}

async function resolveCanonicalToolSlug(slug) {
    const index = await getRouteIndex();
    if (!index || !index.tools || !index.tools.aliases) return slug;
    return index.tools.aliases[slug] || slug;
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
    if (!tool) return '';
    // Priority 1: Explicit long description
    // Priority 2: Generic Arabic description (often long)
    return tool.long_description_ar || tool.desc_ar || tool.description_ar || tool.descAr || tool.ar_description || '';
}

function getEnglishLongDescription(tool) {
    if (!tool) return '';
    // Priority 1: Explicit long description
    // Priority 2: Generic English description (often long)
    return tool.long_description || tool.description || tool.desc_en || '';
}

function getDescriptionFallback(tool, lang) {
    const isAr = String(lang || '').toLowerCase() === 'ar';
    const name = (tool && tool.name) || (isAr ? 'هذه الأداة' : 'this tool');
    const category = (tool && tool.category) || (isAr ? 'الذكاء الاصطناعي' : 'AI');
    return isAr
        ? `استكشف ${name} ضمن فئة ${category} على FutureGen.`
        : `Discover ${name}, an AI tool in ${category}, on FutureGen.`;
}

function getLongDescription(tool, lang) {
    tool = tool || {};
    const isAr = String(lang || '').toLowerCase() === 'ar';
    const arabic = getArabicLongDescription(tool);
    const english = getEnglishLongDescription(tool);
    
    // For details page, we want the "Long" version. 
    // We prioritize the requested language's long description, then fallback to other language's long description.
    const description = isAr
        ? (arabic || english || '')
        : (english || arabic || '');
    
    return description || getDescriptionFallback(tool, lang);
}

function getShortDescription(tool, lang) {
    tool = tool || {};
    const isAr = String(lang || '').toLowerCase() === 'ar';
    
    // Priority 1: Explicit short description fields
    let shortDesc = isAr ? tool.short_description_ar : tool.short_description;
    
    if (!shortDesc) {
        // Priority 2: Cross-language short description
        shortDesc = isAr ? tool.short_description : tool.short_description_ar;
    }
    
    if (shortDesc) return shortDesc;
    
    // Priority 3: Fallback to truncating the long description if no short version exists
    return makeShortDescription(getLongDescription(tool, lang));
}

function getPreferredDescription(tool) {
    const currentLang = String(window.currentLang || localStorage.getItem('lang') || localStorage.getItem('preferredLanguage') || document.documentElement.lang || 'en').toLowerCase();
    return getLongDescription(tool, currentLang) || 'No description available.';
}

function findToolInCollection(collection, canonicalSlug, fallbackTool) {
    if (!collection) return null;

    if (Array.isArray(collection)) {
        collection = collection.reduce((map, tool) => {
            if (tool && typeof tool === 'object') {
                const slug = normalizeSlug(tool.slug || tool.id || tool.name || '');
                if (slug) map[slug] = tool;
            }
            return map;
        }, {});
    }

    const slug = normalizeSlug(canonicalSlug);
    if (slug && collection[slug]) return collection[slug];

    const fallbackSlug = normalizeSlug(fallbackTool && (fallbackTool.slug || fallbackTool.id || fallbackTool.name));
    if (fallbackSlug && collection[fallbackSlug]) return collection[fallbackSlug];

    const fallbackName = normalizeSlug(fallbackTool && fallbackTool.name);
    const values = Object.values(collection);
    return values.find((tool) => {
        if (!tool || typeof tool !== 'object') return false;
        return normalizeSlug(tool.slug || tool.id || '') === slug
            || normalizeSlug(tool.slug || tool.id || '') === fallbackSlug
            || (fallbackName && normalizeSlug(tool.name || '') === fallbackName);
    }) || null;
}

function mergeToolData(baseTool, fullTool) {
    if (!baseTool && !fullTool) return null;
    const merged = { ...(baseTool || {}), ...(fullTool || {}) };
    const arabicDescription = getArabicLongDescription(fullTool) || getArabicLongDescription(baseTool);
    if (arabicDescription) merged.desc_ar = arabicDescription;
    if (!merged.long_description_ar && arabicDescription) merged.long_description_ar = arabicDescription;
    if (!merged.short_description_ar && arabicDescription) merged.short_description_ar = makeShortDescription(arabicDescription);
    if (!merged.description && (baseTool || fullTool)) {
        merged.description = (baseTool && baseTool.description) || (fullTool && fullTool.description) || '';
    }
    if (!merged.long_description) {
        merged.long_description = getEnglishLongDescription(merged);
    }
    if (!merged.short_description && merged.long_description) {
        merged.short_description = makeShortDescription(merged.long_description);
    }
    return merged;
}

function getToolSummary(index, slug) {
    if (!index || !index.tools || !index.tools.bySlug) return null;
    return index.tools.bySlug[slug] || null;
}

function getBootstrapTool(canonicalSlug) {
    const route = getBootstrapRoute();
    if (!route) return null;

    const routeSlug = normalizeSlug(route.slug || '');
    if (canonicalSlug && routeSlug !== canonicalSlug) {
        return null;
    }

    return route.data || null;
}

function getChunkKeyForTool(index, canonicalSlug) {
    const summary = getToolSummary(index, canonicalSlug);
    if (summary && summary.chunkKey) return summary.chunkKey;

    const firstChar = canonicalSlug.charAt(0).toLowerCase();
    return /[a-z0-9]/.test(firstChar) ? firstChar : 'other';
}

async function loadToolChunk(chunkKey) {
    const normalizedChunkKey = /^(?:[a-z0-9]|other)$/i.test(chunkKey || '') ? chunkKey : 'other';
    const cacheKey = `futuregen_tools_${CACHE_VERSION}_${normalizedChunkKey}`;
    let chunkData = memoryCache[normalizedChunkKey];

    if (!chunkData) {
        try {
            const cachedItem = localStorage.getItem(cacheKey);
            if (cachedItem) {
                const parsed = JSON.parse(cachedItem);
                if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
                    chunkData = parsed.data;
                    memoryCache[normalizedChunkKey] = chunkData;
                } else {
                    localStorage.removeItem(cacheKey);
                }
            }
        } catch (error) {
            console.warn('Tool chunk cache read failed:', error);
        }
    }

    if (chunkData) {
        return chunkData;
    }

    const response = await fetch(`/data/${normalizedChunkKey}.json?v=${CACHE_VERSION}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch chunk ${normalizedChunkKey}: ${response.status}`);
    }

    chunkData = await response.json();
    memoryCache[normalizedChunkKey] = chunkData;

    setTimeout(() => {
        try {
            localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), data: chunkData }));
        } catch (error) {
            // Ignore quota issues
        }
    }, 0);

    return chunkData;
}

async function initToolPage(forcedSlug = null) {
    if (!getBootstrapRoute()) {
        toggleLoadingState(true);
    }

    let slug = forcedSlug ? normalizeSlug(forcedSlug) : extractSlugFromPath();

    if (!slug) {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        slug = normalizeSlug(pathSegments[pathSegments.length - 1] || '');
    }

    if (STATIC_PAGES.has(slug)) {
        if (!slug || slug === 'index' || slug === 'index.html') {
            window.location.replace('/');
        } else {
            const target = slug.endsWith('.html') ? `/${slug}` : `/${slug}.html`;
            window.location.replace(target);
        }
        return;
    }

    if (window.location.pathname.startsWith('/news/') || window.location.pathname === '/news') {
        window.location.replace(window.location.pathname);
        return;
    }

    if (!slug || slug === 'tool.html' || slug === 'tool') {
        showError('Invalid tool URL.');
        return;
    }

    const canonicalSlug = await resolveCanonicalToolSlug(slug);
    const canonicalPath = `/tools/${canonicalSlug}`;

    if (window.location.pathname !== canonicalPath) {
        window.location.replace(canonicalPath);
        return;
    }

    const index = await getRouteIndex();
    const bootstrappedTool = getBootstrapTool(canonicalSlug);

    const chunkKey = getChunkKeyForTool(index, canonicalSlug);

    if (bootstrappedTool) {
        renderTool(bootstrappedTool);
        updateSEO(bootstrappedTool, canonicalSlug);
        loadToolChunk(chunkKey).then((cd) => {
            const fullTool = findToolInCollection(cd, canonicalSlug, bootstrappedTool);
            const hydratedTool = mergeToolData(bootstrappedTool, fullTool);
            if (hydratedTool) {
                renderTool(hydratedTool);
                updateSEO(hydratedTool, canonicalSlug);
                renderSameCategoryTools(hydratedTool, cd);
                return;
            }
            renderSameCategoryTools(bootstrappedTool, cd);
        }).catch(() => { });
        prefetchAdjacentChunks(chunkKey);
        return;
    }

    try {
        const chunkData = await loadToolChunk(chunkKey);
        let toolData = findToolInCollection(chunkData, canonicalSlug, getToolSummary(index, canonicalSlug));

        /* ── API fallback ──────────────────────────────────────────────────
           If the chunk file cache doesn't have this tool (e.g., it was just
           added to main.js and the chunk hasn't been synced yet), ask the
           server directly. The server reads from main.js on-the-fly.
           ----------------------------------------------------------------- */
        if (!toolData) {
            try {
                const apiRes = await fetch('/api/tool-data/' + encodeURIComponent(canonicalSlug));
                if (apiRes.ok) {
                    const apiJson = await apiRes.json();
                    if (apiJson.found && apiJson.tool) {
                        toolData = apiJson.tool;
                    }
                }
            } catch (apiErr) {
                console.warn('API fallback failed:', apiErr);
            }
        }

        if (!toolData) {
            showError('Tool not found. It may have been removed or the URL is incorrect.', true);
            return;
        }

        renderTool(toolData);
        updateSEO(toolData, canonicalSlug);
        renderSameCategoryTools(toolData, chunkData);
        prefetchAdjacentChunks(chunkKey);
    } catch (error) {
        console.error('Network error loading tool data:', error);
        showError('Failed to load tool details. Please check your connection.');
    }
}

function prefetchAdjacentChunks(currentChunkKey) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
    const current = String(currentChunkKey || '').toLowerCase();
    const index = chars.indexOf(current);
    if (index === -1) return;

    const prefetch = (char) => {
        if (!char) return;
        const cacheKey = `futuregen_tools_${CACHE_VERSION}_${char}`;
        if (memoryCache[char] || localStorage.getItem(cacheKey)) return;

        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(() => fetchAndCache(char));
        } else {
            setTimeout(() => fetchAndCache(char), 1000);
        }
    };

    if (index > 0) prefetch(chars[index - 1]);
    if (index < chars.length - 1) prefetch(chars[index + 1]);
}

async function fetchAndCache(char) {
    try {
        await loadToolChunk(char);
    } catch (error) {
        // Ignore prefetch errors.
    }
}

function toggleLoadingState(isLoading) {
    const skeleton = document.getElementById('loading-state');
    const content = document.getElementById('tool-content');
    const errorEl = document.getElementById('error-state');

    if (skeleton) skeleton.style.display = isLoading ? 'flex' : 'none';
    if (content) content.style.display = isLoading ? 'none' : 'block';
    if (errorEl) errorEl.style.display = 'none';
}

function setTextById(id, value) {
    document.querySelectorAll(`[id="${id}"]`).forEach((element) => {
        element.textContent = value;
    });
}

function setHtmlById(id, html) {
    document.querySelectorAll(`[id="${id}"]`).forEach((element) => {
        element.innerHTML = html;
    });
}

function setAttributeById(id, attribute, value) {
    document.querySelectorAll(`[id="${id}"]`).forEach((element) => {
        if (value === null || value === undefined || value === '') {
            element.removeAttribute(attribute);
            return;
        }

        element.setAttribute(attribute, value);
    });
}

function buildSpecItems(tool) {
    const items = [];
    const visitUrl = typeof routesApi().resolveToolUrl === 'function'
        ? routesApi().resolveToolUrl(tool)
        : (tool.url || '');

    const currentLang = String(window.currentLang || localStorage.getItem('lang') || localStorage.getItem('preferredLanguage') || document.documentElement.lang || 'en').toLowerCase();
    const isAr = currentLang === 'ar';

    if (tool.category) {
        items.push({ label: isAr ? 'الفئة' : 'Category', value: tool.category });
    }

    if (tool.pricing) {
        items.push({ label: isAr ? 'التسعير' : 'Pricing', value: tool.pricing });
    }

    if (visitUrl) {
        try {
            const host = new URL(visitUrl).hostname.replace(/^www\./i, '');
            items.push({ label: isAr ? 'الموقع' : 'Website', value: host });
        } catch (error) {
            items.push({ label: isAr ? 'الموقع' : 'Website', value: visitUrl });
        }
    }

    items.push({ label: isAr ? 'المعرف' : 'Slug', value: tool.slug || normalizeSlug(tool.name || tool.id || '') });

    return items.filter((item) => item.value);
}

function buildSpecsHtml(tool) {
    return buildSpecItems(tool).map((item) => `
      <div class="spec-item">
        <span class="spec-label">${routesApi().escapeHtml ? routesApi().escapeHtml(item.label) : item.label}</span>
        <span class="spec-value">${routesApi().escapeHtml ? routesApi().escapeHtml(item.value) : item.value}</span>
      </div>
    `).join('');
}

function buildFeaturesHtml(tool) {
    const currentLang = String(window.currentLang || localStorage.getItem('lang') || localStorage.getItem('preferredLanguage') || document.documentElement.lang || 'en').toLowerCase();
    const useArabic = currentLang === 'ar' && getArabicLongDescription(tool);
    const descSource = getLongDescription(tool, useArabic ? 'ar' : 'en');
    const description = descSource.trim();
    const items = description
        .split(/(?<=[.!?\u0964\u06D4])\s+/)
        .map((sentence) => sentence.trim().replace(/[.!?\u0964\u06D4]+$/, ''))
        .filter(Boolean)
        .slice(0, 2);

    if (tool.category) {
        items.push(useArabic ? `دعم سير عمل ${tool.category}` : `${tool.category} workflow support`);
    }

    if (tool.pricing) {
        items.push(useArabic ? `نموذج التسعير: ${tool.pricing}` : `Pricing model: ${tool.pricing}`);
    }

    const fallbackText = useArabic ? 'استكشف القائمة الرسمية للإمكانيات الحالية.' : 'Explore the official listing for current capabilities.';
    const uniqueItems = [...new Set(items)].filter(Boolean).slice(0, 4);

    return (uniqueItems.length ? uniqueItems : [fallbackText]).map((item) => `
      <li dir="auto">
        <i class="fas fa-check-circle text-success"></i>
        ${routesApi().escapeHtml ? routesApi().escapeHtml(item) : item}
      </li>
    `).join('');
}

/* ── Slug-based favorites (cross-page sync) ── */
function getFavSlugs() {
    try {
        const u = JSON.parse(localStorage.getItem('currentUser'));
        if (!u || !u.isLoggedIn || !u.email) return [];
        const raw = localStorage.getItem('favorites_slugs_' + u.email.toLowerCase());
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
}

function saveFavSlugs(slugs) {
    try {
        const u = JSON.parse(localStorage.getItem('currentUser'));
        if (!u || !u.isLoggedIn || !u.email) return;
        localStorage.setItem('favorites_slugs_' + u.email.toLowerCase(), JSON.stringify(slugs));
    } catch (e) { }
}

function toggleFavSlug(slug) {
    const slugs = getFavSlugs();
    const idx = slugs.indexOf(slug);
    if (idx === -1) { slugs.push(slug); saveFavSlugs(slugs); return true; }
    slugs.splice(idx, 1); saveFavSlugs(slugs); return false;
}

function renderSameCategoryTools(tool, chunkData) {
    const container = document.getElementById('same-category-container');
    const onlyMsg = document.getElementById('only-tool-message');
    if (!container) return;

    _currentChunkData = chunkData || _currentChunkData;

    const category = tool.category || '';
    const currentSlug = tool.slug || '';
    const esc = (v) => String(v || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const favSlugs = getFavSlugs();

    const peers = Object.values(chunkData || {}).filter((t) =>
        t && t.category === category && t.slug !== currentSlug && t.name
    ).slice(0, 6);

    if (!peers.length) {
        if (onlyMsg) onlyMsg.style.display = '';
        return;
    }

    container.innerHTML = peers.map((t) => {
        const currentLang = String(window.currentLang || localStorage.getItem('lang') || localStorage.getItem('preferredLanguage') || document.documentElement.lang || 'en').toLowerCase();
        const isAr = currentLang === 'ar';
        const slug = t.slug || (t.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const path = `/tools/${esc(slug)}`;
        const desc = String(getShortDescription(t, currentLang) || '');
        const isFav = favSlugs.includes(slug);
        const visitUrl = t.url || t.official_url || '';
        return `
        <div class="col-xl-4 col-lg-6 mb-4">
          <div class="card tool-card h-100" style="position:relative;">
            <button class="fav-btn${isFav ? ' on' : ''}" type="button" data-slug="${esc(slug)}" title="Add to favorites">
              <i class="${isFav ? 'fas' : 'far'} fa-heart"></i>
            </button>
            <div class="card-img-top" style="height:200px;">
              <img src="${esc(t.logo || '')}" alt="${esc(t.name)}" loading="lazy"
                style="width:100%;height:200px;object-fit:contain;padding:20px;display:block;background:#fff;"
                onerror="this.onerror=null;this.src='/Images/Logo.png'">
            </div>
            <div class="card-body d-flex flex-column">
              <div class="d-flex justify-content-between align-items-start mb-1">
                <h5 class="card-title">${esc(t.name)}</h5>
                ${t.pricing ? `<span class="badge bg-primary">${esc(t.pricing)}</span>` : ''}
              </div>
              <p class="card-text flex-grow-1">${esc(desc)}</p>
              <div class="mt-auto">
                ${t.category ? `<span class="badge bg-secondary mb-2">${esc(t.category)}</span>` : ''}
                <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
                  ${visitUrl ? `<a href="${esc(visitUrl)}" class="btn btn-primary btn-sm visit-website-btn" style="border-radius:8px;" target="_blank" rel="noopener"><i class="fas fa-external-link-alt me-1"></i>${isAr ? 'زيارة الموقع' : 'Visit Website'}</a>` : ''}
                  <a href="${path}" class="btn btn-outline-primary btn-sm view-details-btn" style="border-radius:8px;"><i class="fas fa-info-circle me-1"></i>${isAr ? 'التفاصيل' : 'Details'}</a>
                </div>
              </div>
            </div>
          </div>
        </div>`;
    }).join('');

    /* Wire fav button clicks */
    container.querySelectorAll('.fav-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const u = (() => { try { return JSON.parse(localStorage.getItem('currentUser')); } catch (_) { return null; } })();
            if (!u || !u.isLoggedIn) { window.location.href = '/?openLogin=1'; return; }
            const slug = btn.getAttribute('data-slug');
            const added = toggleFavSlug(slug);
            btn.classList.toggle('on', added);
            const icon = btn.querySelector('i');
            if (icon) icon.className = (added ? 'fas' : 'far') + ' fa-heart';
            if (typeof showToast === 'function') {
                const isAr = localStorage.getItem('lang') === 'ar';
                showToast(added ? (isAr ? 'تمت الإضافة إلى المفضلة' : 'Added to favorites') : (isAr ? 'تمت الإزالة من المفضلة' : 'Removed from favorites'), added ? 'success' : 'info');
            }
        });
    });
}

function renderTool(tool, chunkData) {
    toggleLoadingState(false);

    const description = getPreferredDescription(tool);
    const visitUrl = typeof routesApi().resolveToolUrl === 'function'
        ? routesApi().resolveToolUrl(tool)
        : (tool.url || '');

    setTextById('detail-tool-pricing', tool.pricing || 'AI Tool');
    setTextById('detail-tool-category', tool.category || 'AI Tool');
    setTextById('detail-tool-name', tool.name || 'Unknown Tool');
    setTextById('detail-tool-full-description', description);
    setTextById('detail-tool-description', description);
    setHtmlById('detail-tool-specs', buildSpecsHtml(tool));
    setHtmlById('detail-tool-features', buildFeaturesHtml(tool));

    document.querySelectorAll('[id="detail-tool-url"]').forEach((button) => {
        if (!visitUrl) {
            button.style.display = 'none';
            button.removeAttribute('href');
            return;
        }

        button.style.display = '';
        button.href = visitUrl;
        button.onclick = () => {
            if (window.gtag) {
                window.gtag('event', 'click', {
                    event_category: 'outbound_link',
                    event_label: tool.name,
                    value: visitUrl
                });
            }
        };
    });

    if (window.gtag) {
        window.gtag('event', 'page_view', {
            page_title: `${tool.name} - FutureGen AI Tools`,
            page_location: window.location.href,
            page_path: window.location.pathname,
            tool_name: tool.name,
            tool_category: tool.category
        });
    }

    // Store tool data for language switching
    _currentToolData = tool;
}

function updateSEO(tool, slug) {
    const description = getPreferredDescription(tool) || `Discover ${tool.name} on FutureGen AI Tools Directory.`;
    const title = `${tool.name} - FutureGen AI Tools`;
    const canonicalUrl = `${window.location.origin}/tools/${slug}`;
    const imageUrl = tool.logo || 'https://futuregen.space/Images/Logo.png';

    document.title = title;

    const setMeta = (selector, attribute, value) => {
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
        element.setAttribute(attribute, value);
    };

    setMeta('meta[name="description"]', 'content', description);
    setMeta('meta[name="robots"]', 'content', 'index,follow');
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:image"]', 'content', imageUrl);
    setMeta('meta[property="og:url"]', 'content', canonicalUrl);
    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', imageUrl);

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
}

function showError(message, is404 = false) {
    const skeleton = document.getElementById('loading-state');
    const content = document.getElementById('tool-content');
    const errorEl = document.getElementById('error-state');

    if (skeleton) skeleton.style.display = 'none';
    if (content) content.style.display = 'none';

    if (errorEl) {
        errorEl.style.display = 'block';
        const msgEl = document.getElementById('error-message');
        if (msgEl) msgEl.textContent = message;
    }

    document.title = is404 ? 'Tool Not Found - FutureGen' : 'Error - FutureGen';

    const robotsMeta = document.querySelector('meta[name="robots"]') || document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    robotsMeta.setAttribute('content', is404 ? 'noindex,follow' : 'noindex,nofollow');
    if (!robotsMeta.parentNode) document.head.appendChild(robotsMeta);
}

/* ── Language change handler ─────────────────────────────────────────
   Re-renders description, features, and translatable headers when the
   user switches language on the tool detail page.
   ----------------------------------------------------------------- */
function _onToolPageLanguageChange() {
    const currentLang = String(window.currentLang || localStorage.getItem('lang') || localStorage.getItem('preferredLanguage') || document.documentElement.lang || 'en').toLowerCase();
    
    if (!_currentToolData) {
        return;
    }

    const tool = _currentToolData;
    
    const description = getPreferredDescription(tool);

    // Update description texts
    setTextById('detail-tool-full-description', description);
    setTextById('detail-tool-description', description);

    // Re-render features with correct language
    setHtmlById('detail-tool-features', buildFeaturesHtml(tool));

    // Re-render specs with correct language
    setHtmlById('detail-tool-specs', buildSpecsHtml(tool));

    if (_currentChunkData) {
        renderSameCategoryTools(tool, _currentChunkData);
    }

    updateSEO(tool, tool.slug || extractSlugFromPath());

    // Update all data-ar / data-en translatable elements on the page
    const langAttr = currentLang === 'ar' ? 'data-ar' : 'data-en';

    document.querySelectorAll('[data-ar][data-en]').forEach((el) => {
        const text = el.getAttribute(langAttr);
        if (text) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = text;
            } else if (!el.querySelector('i') && !el.querySelector('img')) {
                el.textContent = text;
            }
        }
    });
}

// Listen for storage changes (language toggle writes to localStorage)
window.addEventListener('storage', (e) => {
    if (e.key === 'lang' || e.key === 'preferredLanguage') {
        _onToolPageLanguageChange();
    }
});

// Also hook into the global language toggle if it dispatches a custom event
window.addEventListener('languageChanged', () => {
    _onToolPageLanguageChange();
});

// Observe localStorage.setItem calls within the same tab
(function() {
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
        origSetItem.call(this, key, value);
        if (key === 'lang' || key === 'preferredLanguage') {
            window.currentLang = value;
            setTimeout(_onToolPageLanguageChange, 0);
        }
    };
})();
