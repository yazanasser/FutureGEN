(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./slug-utils'));
    } else {
        root.FutureGenRoutes = factory(root.FutureGenSlug);
    }
}(typeof self !== 'undefined' ? self : this, function (slugApi) {
    'use strict';

    const MAX_NEWS_SLUG_LENGTH = 140;
    const HTML_BODY_PATTERN = /<\/?(?:p|div|ul|ol|li|h[1-6]|br|figure|img|blockquote|strong|em|a)\b/i;

    function fallbackNormalize(value) {
        return String(value || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u0600-\u06FF]/g, ' ')
            .replace(/[^\w\s-]/g, ' ')
            .toLowerCase()
            .replace(/[_\s]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '') || 'item';
    }

    function fallbackUnique(value, used, maxLength) {
        const seen = used || new Set();
        const limit = maxLength || MAX_NEWS_SLUG_LENGTH;
        const seed = fallbackNormalize(String(value || '').slice(0, limit)).slice(0, limit).replace(/-+$/g, '') || 'item';

        if (!seen.has(seed)) {
            seen.add(seed);
            return seed;
        }

        let counter = 2;
        while (counter < 100000) {
            const suffix = `-${counter}`;
            const candidate = `${seed.slice(0, Math.max(1, limit - suffix.length))}${suffix}`;
            if (!seen.has(candidate)) {
                seen.add(candidate);
                return candidate;
            }
            counter += 1;
        }

        throw new Error('Unable to create a unique slug');
    }

    const baseNormalizeSlug = slugApi && typeof slugApi.normalizeSlug === 'function'
        ? slugApi.normalizeSlug
        : fallbackNormalize;

    const createUniqueSlug = slugApi && typeof slugApi.createUniqueSlug === 'function'
        ? slugApi.createUniqueSlug
        : fallbackUnique;

    function normalizeSlug(value) {
        if (value === null || value === undefined) {
            return '';
        }

        const raw = String(value).trim();
        if (!raw) {
            return '';
        }

        return baseNormalizeSlug(raw);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function (char) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                '\'': '&#39;'
            }[char];
        });
    }

    function decodeBasicEntities(value) {
        return String(value || '')
            .replace(/&#x27;|&#39;/gi, '\'')
            .replace(/&quot;/gi, '"')
            .replace(/&apos;/gi, '\'')
            .replace(/&nbsp;/gi, ' ')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&amp;/gi, '&');
    }

    function textToHtml(value) {
        const raw = String(value || '').trim();
        if (!raw) return '<p>No content available.</p>';
        if (HTML_BODY_PATTERN.test(raw)) return formatArticleBody(raw);

        const normalized = decodeBasicEntities(raw).replace(/\r/g, '');
        const paragraphs = normalized.split(/\n{2,}/).map(function (part) {
            return part.trim();
        }).filter(Boolean);

        const safeParagraphs = (paragraphs.length ? paragraphs : [normalized]).map(function (part) {
            return `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`;
        });

        return safeParagraphs.join('');
    }

    /* Break a single massive <p> into readable paragraph chunks (~4 sentences each) */
    function formatArticleBody(html) {
        return html;
    }

    function extractNewsUrlSlug(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';

        try {
            const parsed = new URL(raw);
            const segments = parsed.pathname.split('/').filter(Boolean);
            return normalizeSlug(segments.pop() || '');
        } catch (error) {
            const trimmed = raw.split('?')[0].split('#')[0];
            const segments = trimmed.split('/').filter(Boolean);
            return normalizeSlug(segments.pop() || trimmed);
        }
    }

    function getToolSlug(toolOrName) {
        if (typeof toolOrName === 'string') {
            return normalizeSlug(toolOrName) || 'item';
        }

        const tool = toolOrName || {};
        return normalizeSlug(tool.slug || tool.name || tool.id || '') || 'item';
    }

    function getToolPath(toolOrName) {
        return `/tools/${getToolSlug(toolOrName)}`;
    }

    function getNewsSlugCandidates(article) {
        const item = article || {};
        return [
            item.slug,
            extractNewsUrlSlug(item.source_url || item.id),
            item.title,
            item.title_en,
            item.title_ar,
            item.id
        ].map(function (candidate) {
            return normalizeSlug(candidate);
        }).filter(Boolean);
    }

    function getNewsSlug(article) {
        const candidates = getNewsSlugCandidates(article);
        return candidates[0] || 'article';
    }

    function getNewsPath(article) {
        return `/news/${getNewsSlug(article)}`;
    }

    function normalizeNewsArticle(article, slug) {
        const item = article || {};
        const canonicalSlug = normalizeSlug(slug || item.slug || getNewsSlug(item)) || 'article';
        const title = item.title || item.title_en || item.title_ar || canonicalSlug;
        const excerpt = item.excerpt || item.summary || item.summary_en || item.summary_ar || '';
        const bodySource = item.body_html || item.body || item.body_en || item.body_ar || '';
        const author = item.author || item.author_en || item.author_ar || 'FutureGen Team';
        const category = item.category || item.category_en || item.category_ar || 'AI News';
        const coverImage = item.cover_image || item.image || '';

        return {
            ...item,
            slug: canonicalSlug,
            title: title,
            excerpt: excerpt,
            body: item.body || item.body_en || item.body_ar || '',
            body_html: textToHtml(bodySource),
            author: author,
            category: category,
            cover_image: coverImage
        };
    }

    function buildNewsIndex(items) {
        const sourceItems = Array.isArray(items) ? items : [];
        const used = new Set();
        const aliases = {};
        const bySlug = {};
        const articles = {};

        sourceItems.forEach(function (article) {
            const candidates = getNewsSlugCandidates(article);
            const seed = candidates[0] || 'article';
            const canonicalSlug = createUniqueSlug(seed, used, MAX_NEWS_SLUG_LENGTH);
            const normalizedArticle = normalizeNewsArticle(article, canonicalSlug);

            articles[canonicalSlug] = normalizedArticle;
            bySlug[canonicalSlug] = {
                slug: canonicalSlug,
                title: normalizedArticle.title,
                excerpt: normalizedArticle.excerpt,
                date: normalizedArticle.date || null,
                category: normalizedArticle.category
            };

            candidates.forEach(function (alias) {
                if (alias && alias !== canonicalSlug && !aliases[alias]) {
                    aliases[alias] = canonicalSlug;
                }
            });
        });

        return {
            aliases: aliases,
            bySlug: bySlug,
            articles: articles
        };
    }

    function buildToolAliasMap(routeIndex) {
        const index = routeIndex || {};
        const tools = index.tools || {};
        const bySlug = tools.bySlug || {};
        const aliases = { ...(tools.aliases || {}) };

        Object.keys(bySlug).forEach(function (canonicalSlug) {
            const tool = bySlug[canonicalSlug] || {};
            const candidates = [
                canonicalSlug,
                tool.slug,
                tool.id,
                tool.name
            ];

            candidates.forEach(function (candidate) {
                const alias = normalizeSlug(candidate);
                if (alias && !aliases[alias]) {
                    aliases[alias] = canonicalSlug;
                }
            });
        });

        return aliases;
    }

    function resolveToolUrl(tool) {
        const item = tool || {};
        const rawUrl = String(item.url || item.official_url || '').trim();
        if (!rawUrl) return '';

        if (rawUrl.indexOf('?tool=') !== -1) {
            const target = rawUrl.split('?tool=')[1];
            if (target) {
                try {
                    return decodeURIComponent(target);
                } catch (error) {
                    return target;
                }
            }
        }

        return rawUrl;
    }

    return {
        buildNewsIndex: buildNewsIndex,
        buildToolAliasMap: buildToolAliasMap,
        decodeBasicEntities: decodeBasicEntities,
        escapeHtml: escapeHtml,
        extractNewsUrlSlug: extractNewsUrlSlug,
        formatArticleBody: formatArticleBody,
        getNewsPath: getNewsPath,
        getNewsSlug: getNewsSlug,
        getNewsSlugCandidates: getNewsSlugCandidates,
        getToolPath: getToolPath,
        getToolSlug: getToolSlug,
        normalizeNewsArticle: normalizeNewsArticle,
        normalizeSlug: normalizeSlug,
        resolveToolUrl: resolveToolUrl,
        textToHtml: textToHtml
    };
}));