/**
 * navbar.js — Shared navbar functionality for tool.html and news.html
 * Handles: theme toggle, language toggle, auth button, search, toast, user state.
 */
(function () {
    'use strict';

    /* ─── Toast ─────────────────────────────────────────────── */
    function showToast(message, type) {
        type = type || 'info';
        var palette = {
            success: '#22c55e',
            error:   '#ef4444',
            info:    '#6366f1',
            warning: '#f59e0b'
        };
        var iconMap = {
            success: 'fa-check-circle',
            error:   'fa-times-circle',
            info:    'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        var color = palette[type] || palette.info;
        var icon  = iconMap[type]  || iconMap.info;

        var container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.style.cssText =
                'position:fixed;top:24px;right:24px;z-index:999999;' +
                'display:flex;flex-direction:column;gap:10px;pointer-events:none;';
            document.body.appendChild(container);
        }

        var toast = document.createElement('div');
        toast.style.cssText =
            'background:var(--bg-white,#fff);color:var(--text-dark,#101010);' +
            'padding:12px 16px;border-radius:10px;' +
            'box-shadow:0 4px 20px rgba(0,0,0,0.18);' +
            'display:flex;align-items:center;gap:10px;' +
            'font-size:14px;font-weight:600;min-width:200px;max-width:320px;' +
            'border-left:4px solid ' + color + ';' +
            'opacity:0;transform:translateX(40px);' +
            'transition:all 0.3s cubic-bezier(0.4,0,0.2,1);' +
            'pointer-events:auto;';
        toast.innerHTML =
            '<i class="fas ' + icon + '" style="color:' + color + ';font-size:1.1rem;flex-shrink:0;"></i>' +
            '<span>' + message + '</span>';
        container.appendChild(toast);

        requestAnimationFrame(function () {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });
        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
        }, 3000);
    }
    window.showToast = showToast;

    /* ─── Theme ──────────────────────────────────────────────── */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        var icon = document.querySelector('#themeToggle i');
        if (icon) {
            icon.className = theme === 'dark'
                ? 'bi bi-brightness-alt-high-fill'
                : 'fa-solid fa-moon';
        }
        /* Logo swap */
        var logo = document.querySelector('.navbar-brand img');
        if (logo) {
            logo.src = theme === 'dark'
                ? '/Images/logo-dark-futuregen.png'
                : '/Images/Logo.png';
        }
    }

    /* ─── Language ───────────────────────────────────────────── */
    function applyLang(lang) {
        window.currentLang = lang;
        localStorage.setItem('lang', lang);
        localStorage.setItem('preferredLanguage', lang);

        /* Never flip layout direction — only swap text content */
        document.documentElement.setAttribute('lang', lang);

        var langBtn = document.getElementById('langToggle');
        if (langBtn) langBtn.textContent = lang === 'ar' ? 'English' : 'العربية';

        /* Update [data-en] / [data-ar] text nodes */
        document.querySelectorAll('[data-en],[data-ar]').forEach(function (el) {
            var val = el.getAttribute('data-' + lang);
            if (val !== null) el.textContent = val;
            var ph = el.getAttribute('data-' + lang + '-placeholder');
            if (ph !== null) el.placeholder = ph;
        });

        /* Notify news loader of language change */
        if (typeof window.__NEWS_ON_LANGUAGE_CHANGED__ === 'function') {
            window.__NEWS_ON_LANGUAGE_CHANGED__();
        }

        window.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { lang: lang }
        }));
    }

    /* ─── User State ─────────────────────────────────────────── */
    function updateFavoritesButton() {
        var favBtn  = document.getElementById('favoritesBtn');
        var authBtn = document.getElementById('authButton');
        var lang    = localStorage.getItem('lang') || 'en';
        try {
            var u = JSON.parse(localStorage.getItem('currentUser'));
            if (u && u.isLoggedIn) {
                if (favBtn) favBtn.style.display = 'inline-flex';
                if (authBtn) {
                    authBtn.innerHTML =
                        '<i class="fas fa-sign-out-alt me-2"></i>' +
                        '<span>' + (lang === 'ar' ? 'تسجيل الخروج' : 'Logout') + '</span>';
                }
            } else {
                if (favBtn) favBtn.style.display = 'none';
                if (authBtn) {
                    authBtn.innerHTML =
                        '<i class="fas fa-user me-2"></i>' +
                        '<span>' + (lang === 'ar' ? 'تسجيل الدخول' : 'Sign In') + '</span>';
                }
            }
        } catch (e) {
            if (favBtn) favBtn.style.display = 'none';
        }
    }
    window.updateFavoritesButton = updateFavoritesButton;

    /* noop stubs expected by tool.html inline scripts */
    window.updateAllFavoriteButtons = window.updateAllFavoriteButtons || function () {
        updateFavoritesButton();
    };
    window.saveFavoritesArray = window.saveFavoritesArray || function () {};
    window.updateUserInterface  = window.updateUserInterface  || function () {
        updateFavoritesButton();
    };

    /* ─── Search ─────────────────────────────────────────────── */
    function handleSearch() {
        var input = document.getElementById('searchInput');
        var q     = input ? input.value.trim() : '';
        /* On non-home pages, redirect to home with the search query */
        window.location.href = q ? '/?q=' + encodeURIComponent(q) : '/';
    }

    /* ─── Open Auth Modal ────────────────────────────────────── */
    function openAuthModal() {
        var modalEl = document.getElementById('authModal');
        if (!modalEl) { window.location.href = '/?openLogin=1'; return; }
        if (window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(modalEl).show();
        }
    }

    /* ─── Init ───────────────────────────────────────────────── */
    function init() {
        /* Apply persisted theme */
        var savedTheme = localStorage.getItem('theme') || 'light';
        applyTheme(savedTheme);

        /* Apply persisted language */
        var savedLang = localStorage.getItem('lang') || localStorage.getItem('preferredLanguage') || 'en';
        window.currentLang = savedLang;
        applyLang(savedLang);

        /* Sync navbar with login state */
        updateFavoritesButton();

        /* Theme toggle */
        var themeBtn = document.getElementById('themeToggle');
        if (themeBtn && !themeBtn.dataset.navbarInited) {
            themeBtn.dataset.navbarInited = '1';
            themeBtn.addEventListener('click', function () {
                var cur = document.documentElement.getAttribute('data-theme') || 'light';
                applyTheme(cur === 'light' ? 'dark' : 'light');
            });
        }

        /* Language toggle */
        var langBtn = document.getElementById('langToggle');
        if (langBtn && !langBtn.dataset.navbarInited) {
            langBtn.dataset.navbarInited = '1';
            langBtn.addEventListener('click', function () {
                var cur = localStorage.getItem('lang') || 'en';
                applyLang(cur === 'en' ? 'ar' : 'en');
            });
        }

        /* Auth button */
        var authBtn = document.getElementById('authButton');
        if (authBtn && !authBtn.dataset.navbarInited) {
            authBtn.dataset.navbarInited = '1';
            authBtn.addEventListener('click', function () {
                var u = null;
                try { u = JSON.parse(localStorage.getItem('currentUser')); } catch (e) {}
                if (u && u.isLoggedIn) {
                    /* Logged-in: log out immediately then open login modal */
                    var lang = localStorage.getItem('lang') || 'en';
                    localStorage.removeItem('currentUser');
                    updateFavoritesButton();
                    showToast(lang === 'ar' ? 'تم تسجيل الخروج' : 'Logged out', 'success');
                    setTimeout(openAuthModal, 300);
                } else {
                    openAuthModal();
                }
            });
        }

        /* Search */
        var searchBtn   = document.getElementById('searchBtn');
        var searchInput = document.getElementById('searchInput');
        if (searchBtn && !searchBtn.dataset.navbarInited) {
            searchBtn.dataset.navbarInited = '1';
            searchBtn.addEventListener('click', handleSearch);
        }
        if (searchInput && !searchInput.dataset.navbarInited) {
            searchInput.dataset.navbarInited = '1';
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') handleSearch();
            });
        }

        /* After auth modal closes, refresh user state */
        var authModal = document.getElementById('authModal');
        if (authModal && !authModal.dataset.navbarInited) {
            authModal.dataset.navbarInited = '1';
            authModal.addEventListener('hidden.bs.modal', function () {
                updateFavoritesButton();
            });
        }

        /* Auto-open login if URL contains ?openLogin=1 */
        if (window.location.search.includes('openLogin=1')) {
            window.history.replaceState(null, '', window.location.pathname);
            setTimeout(openAuthModal, 400);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
