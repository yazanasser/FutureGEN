/**
 * router.js — central URL router
 * Supports:
 * - /tools/:toolSlug
 * - /news/:articleSlug
 * - /category/:categorySlug
 * - /page/:staticPage
 * - legacy redirects: /tool/:slug and .html slugs
 */

class CentralRouter {
    constructor() {
        this.currentTemplate = this.getMetaTemplate();
        this.routeIndex = null;

        this.routes = [
            { pattern: /^\/?(?:index(?:\.html)?)?$/i, type: 'home' },
            { pattern: /^\/about\/?$/i, type: 'home', subType: 'about' },
            { pattern: /^\/contact\/?$/i, type: 'home', subType: 'contact' },
            { pattern: /^\/page\/([a-z0-9-]+)\/?$/i, type: 'page' },
            { pattern: /^\/category\/([a-z0-9-]+)\/?$/i, type: 'category' },
            { pattern: /^\/tools\/([^/]+)\/?$/i, type: 'tool' },
            { pattern: /^\/tool\/([^/]+)\/?$/i, type: 'legacyTool' },
            { pattern: /^\/news\/([^/]+)\/?$/i, type: 'news' },
            { pattern: /^\/article\/([^/]+)\/?$/i, type: 'legacyNews' },
            { pattern: /^\/news\/?(?:news\.html)?$/i, type: 'newsList' }
        ];        this.init();
        this.initInterceptors();
    }

    getMetaTemplate() {
        const meta = document.querySelector('meta[name="template"]');
        return meta ? meta.getAttribute('content') : 'unknown';
    }

    async loadRouteIndex() {
        if (this.routeIndex) return this.routeIndex;
        try {
            const response = await fetch('/data/route-index.json?v=6', { cache: 'no-store' });
            if (response.ok) {
                this.routeIndex = await response.json();
            }
        } catch (error) {
            console.warn('[Router] route-index unavailable', error);
        }
        return this.routeIndex;
    }

    sanitizeSlug(rawSlug) {
        return String(rawSlug || '')
            .replace(/\.html$/i, '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    identifyRoute(path) {
        let normalizedPath = path || '/';
        if (normalizedPath.length > 1 && normalizedPath.endsWith('/')) {
            normalizedPath = normalizedPath.slice(0, -1);
        }

        for (const route of this.routes) {
            const match = normalizedPath.match(route.pattern);
            if (match) {
                return {
                    type: route.type,
                    subType: route.subType || '',
                    slug: this.sanitizeSlug(match[1] || '')
                };
            }
        }

        return { type: 'unknown', slug: '' };
    }

    redirectTo(path) {
        if (window.location.pathname !== path) {
            window.location.replace(path);
        }
    }

    async resolveCanonicalSlug(routeObj) {
        if (!routeObj.slug) return routeObj.slug;

        const index = await this.loadRouteIndex();
        if (!index) return routeObj.slug;

        if (routeObj.type === 'tool' || routeObj.type === 'legacyTool') {
            const alias = index.tools && index.tools.aliases ? index.tools.aliases[routeObj.slug] : null;
            return alias || routeObj.slug;
        }

        if (routeObj.type === 'news' || routeObj.type === 'legacyNews') {
            const alias = index.news && index.news.aliases ? index.news.aliases[routeObj.slug] : null;
            return alias || routeObj.slug;
        }

        return routeObj.slug;
    }

    initInterceptors() {
        /**
         * ✅ VISIT WEBSITE INTERCEPTOR (Capture Phase)
         * Prevents main.js from hijacking clicks on "Visit Website" buttons.
         */
        document.addEventListener('click', (e) => {
            const target = e.target;
            const link = target.closest('a.btn-primary, a.visit-website-btn');
            const btn = target.closest('button.visit-website-btn, button.btn-primary');

            let url = '';
            let isVisit = false;

            if (link) {
                const hasExtIcon = link.querySelector('.fa-external-link-alt');
                const text = (link.textContent || '').toLowerCase();
                isVisit = hasExtIcon || text.includes('visit') || text.includes('زيارة');
                url = link.href;
            } else if (btn) {
                const text = (btn.textContent || '').toLowerCase();
                isVisit = text.includes('visit') || text.includes('زيارة');
                url = btn.getAttribute('data-url') || btn.getAttribute('href');
            }

            if (isVisit && url && url !== '#' && !url.includes('javascript:')) {
                console.log('[Router] Intercepted Visit Website:', url);
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();

                const win = window.open(url, '_blank');
                if (win) {
                    try { win.blur(); } catch (err) {}
                }
                window.focus();
                setTimeout(() => window.focus(), 50);
                return false;
            }
        }, true);

        /**
         * ✅ SHOW TOOL DETAILS BRIDGE
         * Overrides window.showToolDetails to redirect to static pages.
         */
        const originalShowToolDetails = window.showToolDetails;
        window.showToolDetails = (toolOrIndex) => {
            console.log('[Router] showToolDetails called:', typeof toolOrIndex);
            
            let tool = toolOrIndex;
            if (typeof toolOrIndex === 'number') {
                tool = (window.aiTools || [])[toolOrIndex];
            } else if (toolOrIndex && typeof toolOrIndex === 'object' && !toolOrIndex.name && toolOrIndex.id) {
                // Handle case where it might be an object but needs lookup
                tool = (window.aiTools || []).find(t => t.id === toolOrIndex.id) || toolOrIndex;
            }

            if (tool && tool.name) {
                const toolPath = (window.FutureGenRoutes && typeof window.FutureGenRoutes.getToolPath === 'function')
                    ? window.FutureGenRoutes.getToolPath(tool)
                    : '/tools/' + tool.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                
                if (toolPath) {
                    // Close search overlay if open
                    const overlay = document.getElementById('search-results-overlay');
                    if (overlay) overlay.style.display = 'none';
                    try { if (typeof window.hideSearchOverlay === 'function') window.hideSearchOverlay(); } catch (e) {}

                    window.location.href = toolPath;
                    return;
                }
            }

            if (originalShowToolDetails) {
                originalShowToolDetails.call(window, toolOrIndex);
            }
        };
    }

    async init() {
        const path = window.location.pathname;
        const hash = window.location.hash;
        let initialRoute = this.identifyRoute(path);

        if (this.currentTemplate === 'home' && (path === '/' || path === '/index.html')) {
            if (hash === '#about') initialRoute.subType = 'about';
            if (hash === '#contact') initialRoute.subType = 'contact';
        }

        if (initialRoute.type === 'legacyTool' && initialRoute.slug) {
            const canonical = await this.resolveCanonicalSlug(initialRoute);
            this.redirectTo(`/tools/${canonical}`);
            return;
        }

        if (initialRoute.type === 'legacyNews' && initialRoute.slug) {
            const canonical = await this.resolveCanonicalSlug(initialRoute);
            this.redirectTo(`/news/${canonical}`);
            return;
        }

        if ((initialRoute.type === 'tool' || initialRoute.type === 'news') && initialRoute.slug) {
            const canonical = await this.resolveCanonicalSlug(initialRoute);
            const expectedPath = `/${initialRoute.type === 'tool' ? 'tools' : 'news'}/${canonical}`;
            // Strip trailing slash before comparing so /news/slug/ and /news/slug are treated the same
            const normalizedCurrentPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
            if (normalizedCurrentPath !== expectedPath) {
                this.redirectTo(expectedPath);
                return;
            }
        }

        if (initialRoute.subType) {
            this.handleStaticPage(initialRoute.subType);
        } else if (initialRoute.type === 'newsList') {
            this.handleNewsListPage();
        } else if (initialRoute.type === 'page') {
            this.handleStaticPage(initialRoute.slug);
        } else if (initialRoute.type === 'category') {
            this.handleCategoryPage(initialRoute.slug);
        }

        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href) return;

            if (href.startsWith('#')) {
                if (this.currentTemplate !== 'home') {
                    event.preventDefault();
                    window.location.href = '/' + href;
                }
                return;
            }

            if (
                (href.startsWith('http') && !link.href.startsWith(window.location.origin)) ||
                href.startsWith('javascript:') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:') ||
                link.getAttribute('target') === '_blank'
            ) {
                return;
            }

            const url = new URL(link.href);
            const targetRoute = this.identifyRoute(url.pathname);

            if (targetRoute.type === 'unknown' || targetRoute.type.startsWith('legacy')) {
                return;
            }

            const sameTemplate =
                (targetRoute.type === this.currentTemplate) ||
                (this.currentTemplate === 'home' && (targetRoute.type === 'category' || targetRoute.type === 'page' || targetRoute.type === 'newsList'));

            if (sameTemplate) {
                event.preventDefault();
                this.navigate(url.pathname, targetRoute, true);
            }
        });

        window.addEventListener('popstate', () => {
            const targetRoute = this.identifyRoute(window.location.pathname);
            this.navigate(window.location.pathname, targetRoute, false);
        });

        window.addEventListener('hashchange', () => {
            const hash = (window.location.hash || '').replace(/^#/, '');
            if (hash === 'featured' || hash === 'categories') {
                if (typeof window.showPage === 'function') window.showPage('home-page');
                const el = document.getElementById(hash);
                if (el) {
                    setTimeout(() => {
                        const y = el.getBoundingClientRect().top + window.scrollY - 90;
                        window.scrollTo({ top: y, behavior: 'smooth' });
                    }, 120);
                }
            }
        });
    }

    navigate(path, routeObj = null, pushState = true) {
        const resolvedRoute = routeObj || this.identifyRoute(path);

        if (pushState) {
            window.history.pushState(null, '', path);
        }

        if (this.currentTemplate === 'home') {
            if (resolvedRoute.subType === 'about' || resolvedRoute.subType === 'contact') {
                this.handleStaticPage(resolvedRoute.subType);
                return;
            }

            if (resolvedRoute.type === 'page') {
                this.handleStaticPage(resolvedRoute.slug);
                return;
            }

            if (resolvedRoute.type === 'category') {
                this.handleCategoryPage(resolvedRoute.slug);
                return;
            }

            if (resolvedRoute.type === 'newsList') {
                this.handleNewsListPage();
                return;
            }

            if (path === '/' || path === '/index.html') {
                if (window.showPage) window.showPage('home-page');
            }
        }

        const event = new CustomEvent('RouteChanged', {
            detail: {
                path,
                type: resolvedRoute.type,
                slug: resolvedRoute.slug
            }
        });
        window.dispatchEvent(event);
    }

    handleStaticPage(type) {
        const show = () => {
            if (window.showStaticPage) {
                window.showStaticPage(type);
            } else {
                setTimeout(show, 100);
            }
        };
        show();
    }

    async handleCategoryPage(categorySlug) {
        const index = await this.loadRouteIndex();
        let categoryName = categorySlug.replace(/-/g, ' ');

        if (index && index.categories && index.categories.bySlug && index.categories.bySlug[categorySlug]) {
            categoryName = index.categories.bySlug[categorySlug].name || categorySlug;
        }

        if (typeof window.filterToolsByCategory === 'function') {
            window.filterToolsByCategory(categoryName, { scroll: false });
        } else if (window.showPage) {
            window.showPage('home-page');
        }
    }

    handleNewsListPage() {
        if (typeof window.showPage === 'function') {
            window.showPage('news-page');
            window.scrollTo(0, 0);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.AppRouter = new CentralRouter();
    window.router = window.AppRouter;
});