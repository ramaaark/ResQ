<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

$resident = requireResidentAuth();
$mediaId = (int) ($_GET['id'] ?? 0);

if ($mediaId <= 0) {
    http_response_code(400);
    exit;
}

$pdo = getDatabaseConnection();
$stmt = $pdo->prepare(
    'SELECT m.id, m.stored_name, m.storage_path, m.mime_type, m.original_name
     FROM report_media m
     INNER JOIN reports r ON m.report_id = r.id
     WHERE m.id = ? AND r.resident_id = ? AND m.is_deleted = 0 AND r.is_deleted = 0
     LIMIT 1'
);
$stmt->execute([$mediaId, (int) $resident['id']]);
$media = $stmt->fetch();

if (!$media) {
    http_response_code(404);
    exit;
}

$localPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . basename((string) $media['stored_name']);
$filePath = is_file($localPath) ? $localPath : (string) $media['storage_path'];

if (!is_file($filePath)) {
    http_response_code(404);
    exit;
}

$size = filesize($filePath);
if ($size === false) {
    http_response_code(404);
    exit;
}

$mimeType = (string) $media['mime_type'];
header('Content-Type: ' . $mimeType);
header('Accept-Ranges: bytes');
header('Content-Disposition: inline; filename="' . basename((string) $media['original_name']) . '"');

$rangeHeader = $_SERVER['HTTP_RANGE'] ?? null;
if (is_string($rangeHeader) && preg_match('/bytes=(\d*)-(\d*)/i', $rangeHeader, $matches)) {
    $start = $matches[1] !== '' ? (int) $matches[1] : 0;
    $end = $matches[2] !== '' ? (int) $matches[2] : ($size - 1);

    if ($start > $end || $end >= $size) {
        http_response_code(416);
        header("Content-Range: bytes */{$size}");
        exit;
    }

    $length = $end - $start + 1;
    http_response_code(206);
    header("Content-Range: bytes {$start}-{$end}/{$size}");
    header('Content-Length: ' . $length);

    $handle = fopen($filePath, 'rb');
    if ($handle !== false) {
        fseek($handle, $start);
        $remaining = $length;
        while ($remaining > 0 && !feof($handle)) {
            $chunk = fread($handle, min(8192, $remaining));
            if ($chunk === false) {
                break;
            }
            echo $chunk;
            $remaining -= strlen($chunk);
        }
        fclose($handle);
    }
    exit;
}

header('Content-Length: ' . $size);
readfile($filePath);
exit;
