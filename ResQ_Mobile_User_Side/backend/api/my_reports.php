<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

$resident = requireResidentAuth();
$pdo = getDatabaseConnection();

$reportStmt = $pdo->prepare(
    'SELECT
        r.id,
        r.tracking_number,
        r.category,
        r.priority,
        r.contact_number,
        r.incident_date,
        r.latitude,
        r.longitude,
        r.location_description,
        r.description,
        r.status,
        r.admin_notes,
        r.responded_at,
        r.created_at,
        r.updated_at,
        a.full_name AS responder_name
     FROM reports r
     LEFT JOIN admins a ON r.responded_by = a.id
     WHERE r.resident_id = ? AND r.is_deleted = 0
     ORDER BY r.created_at DESC, r.id DESC'
);
$reportStmt->execute([(int) $resident['id']]);
$reports = $reportStmt->fetchAll();

$reportIds = array_map(static fn (array $r): int => (int) $r['id'], $reports);
$mediaByReport = [];

if ($reportIds !== []) {
    $placeholders = implode(',', array_fill(0, count($reportIds), '?'));
    $mediaStmt = $pdo->prepare(
        "SELECT id, report_id, media_type, original_name, mime_type, file_size, created_at
         FROM report_media
         WHERE report_id IN ({$placeholders}) AND is_deleted = 0
         ORDER BY id ASC"
    );
    $mediaStmt->execute($reportIds);

    foreach ($mediaStmt->fetchAll() as $mediaRow) {
        $rid = (int) $mediaRow['report_id'];
        $mediaRow['url'] = '../backend/api/media.php?id=' . (int) $mediaRow['id'];
        $mediaByReport[$rid][] = $mediaRow;
    }
}

foreach ($reports as &$report) {
    $rid = (int) $report['id'];
    $report['media'] = $mediaByReport[$rid] ?? [];
}
unset($report);

$unreadStmt = $pdo->prepare(
    'SELECT COUNT(*) FROM notifications WHERE resident_id = ? AND is_read = 0 AND is_deleted = 0'
);
$unreadStmt->execute([(int) $resident['id']]);
$unreadCount = (int) $unreadStmt->fetchColumn();

sendJson([
    'success' => true,
    'reports' => $reports,
    'unread_notifications' => $unreadCount,
]);
