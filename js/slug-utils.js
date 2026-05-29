(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.FutureGenSlug = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const MAX_SLUG_LENGTH = 120;

    function toAscii(input) {
        return String(input || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\u0600-\u06FF]/g, ' ')
            .replace(/[^\w\s-]/g, ' ');
    }

    function baseSlug(value, maxLength) {
        const normalized = toAscii(value)
            .toLowerCase()
            .replace(/[_\s]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');

        const trimmed = normalized.slice(0, Math.max(1, maxLength || MAX_SLUG_LENGTH)).replace(/-+$/g, '');
        return trimmed || 'item';
    }

    function createUniqueSlug(value, usedSlugs, maxLength) {
        const seen = usedSlugs || new Set();
        const limit = maxLength || MAX_SLUG_LENGTH;
        const seed = baseSlug(value, limit);

        if (!seen.has(seed)) {
            seen.add(seed);
            return seed;
        }

        let counter = 2;
        while (counter < 100000) {
            const suffix = `-${counter}`;
            const allowedLength = Math.max(1, limit - suffix.length);
            const candidate = `${seed.slice(0, allowedLength)}${suffix}`;
            if (!seen.has(candidate)) {
                seen.add(candidate);
                return candidate;
            }
            counter += 1;
        }

        throw new Error('Unable to generate unique slug after many attempts');
    }

    function normalizeSlug(value) {
        return baseSlug(value, MAX_SLUG_LENGTH);
    }

    return {
        MAX_SLUG_LENGTH,
        normalizeSlug,
        createUniqueSlug
    };
}));