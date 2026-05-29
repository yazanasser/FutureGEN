<?php
// Secret key - change this to something only you know
define('SECRET_KEY', 'futuregen_secret_2026');

header('Content-Type: application/json');

// Check secret key
if (!isset($_GET['key']) || $_GET['key'] !== SECRET_KEY) {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// Read incoming JSON body
$body = file_get_contents('php://input');
$data = json_decode($body, true);

// Accept both { articles: [...] } and plain array
if (is_array($data) && !isset($data['articles'])) {
    $data = ['articles' => $data];
}

if (!$data || !isset($data['articles'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON or missing articles']);
    exit;
}

$filePath = __DIR__ . '/news.json';

// Write safely using file lock
$fp = fopen($filePath, 'w');
if (!$fp) {
    http_response_code(500);
    echo json_encode(['error' => 'Cannot open file for writing']);
    exit;
}

if (flock($fp, LOCK_EX)) {
    fwrite($fp, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
    flock($fp, LOCK_UN);
}
fclose($fp);

echo json_encode(['success' => true, 'articles' => count($data['articles'])]);