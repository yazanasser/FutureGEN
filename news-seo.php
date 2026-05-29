<?php
/**
 * news-seo.php
 *
 * Serves news article pages with correct per-article OG / Twitter meta tags.
 * Called by .htaccess for every /news/{slug} request.
 * Reads site/data/news.json on every request so new articles work automatically.
 */

$SITE_URL = 'https://futuregen.space';

/* ─── slug helpers (same logic as content-store.js) ─────────────── */

function normalizeSlug($value) {
    $value = preg_replace('/\.html$/i', '', (string)$value);
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9-]+/', '-', $value);
    $value = trim($value, '-');
    return $value;
}

function slugFromUrl($url) {
    $url = preg_replace('/[?#].*$/', '', (string)$url);
    $url = rtrim($url, '/');
    $parts = explode('/', $url);
    return normalizeSlug(array_pop($parts));
}

/* ─── extract request slug ───────────────────────────────────────── */

$requestUri = $_SERVER['REQUEST_URI'] ?? '';
$path       = strtok($requestUri, '?');
$path       = rtrim($path, '/');

if (!preg_match('#^/news/([^/]+)$#i', $path, $m)) {
    // Not an article URL — serve plain news.html
    readfile(__DIR__ . '/news.html');
    exit;
}

$requestSlug = normalizeSlug(urldecode($m[1]));

/* ─── load news.json ─────────────────────────────────────────────── */

// Try multiple possible paths for news.json
$possiblePaths = [
    __DIR__ . '/site/data/news.json',
    __DIR__ . '/data/news.json',
    dirname(__DIR__) . '/site/data/news.json',
];
$newsJsonPath = null;
foreach ($possiblePaths as $p) {
    if (file_exists($p)) { $newsJsonPath = $p; break; }
}

$article = null;

if ($newsJsonPath) {
    $rawJson = @file_get_contents($newsJsonPath);
    if ($rawJson) {
        $data = json_decode($rawJson, true);
        // json_decode with true always returns an array, so check for the wrapper key explicitly
        if (isset($data['articles']) && is_array($data['articles'])) {
            $articles = $data['articles'];
        } elseif (isset($data['posts']) && is_array($data['posts'])) {
            $articles = $data['posts'];
        } elseif (isset($data['items']) && is_array($data['items'])) {
            $articles = $data['items'];
        } elseif (isset($data[0])) {
            $articles = $data; // plain array of articles
        } else {
            $articles = [];
        }

        foreach ($articles as $item) {
            if (!$item) continue;

            // Derive slug candidates — same priority as content-store.js
            $candidates = array_filter([
                !empty($item['slug'])       ? normalizeSlug($item['slug'])                                : '',
                !empty($item['source_url']) ? slugFromUrl($item['source_url'])                            : '',
                !empty($item['id'])         ? slugFromUrl($item['id'])                                    : '',
                !empty($item['title_en'])   ? normalizeSlug(substr($item['title_en'], 0, 140))            : '',
                !empty($item['title'])      ? normalizeSlug(substr($item['title'],    0, 140))            : '',
            ]);

            if (in_array($requestSlug, $candidates, true)) {
                $article = $item;
                break;
            }
        }
    }
}

/* ─── build SEO values ───────────────────────────────────────────── */

if ($article) {
    $title       = $article['title_en'] ?? $article['title'] ?? 'AI News';
    $description = $article['summary_en'] ?? $article['summary'] ?? '';
    $description = substr($description, 0, 300);
    $image       = $article['image'] ?? $article['cover_image'] ?? '';
    if ($image && !str_starts_with($image, 'http')) {
        $image = $SITE_URL . '/' . ltrim($image, '/');
    }
    if (!$image) $image = $SITE_URL . '/Images/Logo.png';
} else {
    $title       = 'AI News - FutureGen';
    $description = 'Stay up-to-date with the latest AI news from FutureGen.';
    $image       = $SITE_URL . '/Images/Logo.png';
}

$canonicalUrl = $SITE_URL . '/news/' . $requestSlug;
$seoTitle     = htmlspecialchars($title . ' - FutureGen AI News', ENT_QUOTES | ENT_HTML5, 'UTF-8');
$seoDesc      = htmlspecialchars($description,  ENT_QUOTES | ENT_HTML5, 'UTF-8');
$seoImage     = htmlspecialchars($image,         ENT_QUOTES | ENT_HTML5, 'UTF-8');
$seoUrl       = htmlspecialchars($canonicalUrl,  ENT_QUOTES | ENT_HTML5, 'UTF-8');

/* ─── debug mode (?debug in URL, local/staging only) ────────────── */
if (isset($_GET['debug'])) {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Slug requested : $requestSlug\n";
    echo "JSON path      : " . ($newsJsonPath ?? 'NOT FOUND') . "\n";
    echo "Article found  : " . ($article ? 'YES' : 'NO') . "\n";
    if ($article) {
        echo "Title          : " . ($article['title_en'] ?? $article['title'] ?? '') . "\n";
        echo "Image          : " . ($article['image'] ?? $article['cover_image'] ?? '') . "\n";
    }
    exit;
}

/* ─── load & patch news.html ─────────────────────────────────────── */

$html = file_get_contents(__DIR__ . '/news.html');

// Title
$html = preg_replace('/<title>.*?<\/title>/is',
    '<title>' . $seoTitle . '</title>', $html);

// Description
$html = preg_replace('/<meta\s+name="description"[^>]*>/i',
    '<meta name="description" content="' . $seoDesc . '">', $html);

// Canonical
$html = preg_replace('/<link\s+rel="canonical"[^>]*>/i',
    '<link rel="canonical" href="' . $seoUrl . '">', $html);

// Open Graph
$html = preg_replace('/<meta\s+property="og:title"[^>]*>/i',
    '<meta property="og:title" content="' . $seoTitle . '">', $html);
$html = preg_replace('/<meta\s+property="og:description"[^>]*>/i',
    '<meta property="og:description" content="' . $seoDesc . '">', $html);
$html = preg_replace('/<meta\s+property="og:url"[^>]*>/i',
    '<meta property="og:url" content="' . $seoUrl . '">', $html);
$html = preg_replace('/<meta\s+property="og:image"[^>]*>/i',
    '<meta property="og:image" content="' . $seoImage . '">', $html);
$html = preg_replace('/<meta\s+property="og:type"[^>]*>/i',
    '<meta property="og:type" content="article">', $html);

// Twitter
$html = preg_replace('/<meta\s+name="twitter:title"[^>]*>/i',
    '<meta name="twitter:title" content="' . $seoTitle . '">', $html);
$html = preg_replace('/<meta\s+name="twitter:description"[^>]*>/i',
    '<meta name="twitter:description" content="' . $seoDesc . '">', $html);
$html = preg_replace('/<meta\s+name="twitter:image"[^>]*>/i',
    '<meta name="twitter:image" content="' . $seoImage . '">', $html);

echo $html;
