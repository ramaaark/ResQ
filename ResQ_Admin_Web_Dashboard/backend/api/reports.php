<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

requireAdminAuth();
$pdo = getDatabaseConnection();

$search = trim((string) ($_GET['search'] ?? ''));
$dateFilter = trim((string) ($_GET['date'] ?? ''));
$priorityFilter = strtoupper(trim((string) ($_GET['priority'] ?? '')));
$categoryFilter = trim((string) ($_GET['category'] ?? ''));
$statusFilter = trim((string) ($_GET['status'] ?? ''));
$archived = ((string) ($_GET['archived'] ?? '0')) === '1' ? 1 : 0;

$whereClauses = ['r.is_deleted = ?'];
$params = [$archived];

if ($search !== '') {
    $like = '%' . $search . '%';
    $whereClauses[] = '(r.tracking_number LIKE ? OR r.contact_number LIKE ? OR r.location_description LIKE ? OR r.description LIKE ? OR res.full_name LIKE ?)';
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
}

if ($dateFilter !== '') {
    $whereClauses[] = 'DATE(r.created_at) = ?';
    $params[] = $dateFilter;
}

if (in_array($priorityFilter, ['LOW', 'MEDIUM', 'HIGH'], true)) {
    $whereClauses[] = 'r.priority = ?';
    $params[] = $priorityFilter;
}

if (in_array($categoryFilter, ['Crime', 'Accident', 'Fire', 'Medical Emergency', 'Others'], true)) {
    $whereClauses[] = 'r.category = ?';
    $params[] = $categoryFilter;
}

if (in_array($statusFilter, ['Pending', 'Responding', 'Resolved'], true)) {
    $whereClauses[] = 'r.status = ?';
    $params[] = $statusFilter;
}

$whereSql = implode(' AND ', $whereClauses);

$query = "
    SELECT
        r.id,
        r.tracking_number,
        r.resident_id,
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
        r.responded_by,
        r.responded_at,
        r.is_deleted,
        r.deleted_at,
        r.created_at,
        r.updated_at,
        res.full_name AS resident_name,
        res.email AS resident_email,
        adm.full_name AS responder_name
    FROM reports r
    INNER JOIN residents res ON r.resident_id = res.id
    LEFT JOIN admins adm ON r.responded_by = adm.id
    WHERE {$whereSql}
    ORDER BY r.created_at DESC, r.id DESC
";

$stmt = $pdo->prepare($query);
$stmt->execute($params);
$reports = $stmt->fetchAll();

$reportIds = array_map(static fn (array $row): int => (int) $row['id'], $reports);
$mediaMap = [];

if ($reportIds !== []) {
    $placeholders = implode(',', array_fill(0, count($reportIds), '?'));
    $mediaStmt = $pdo->prepare(
        "SELECT id, report_id, media_type, original_name, mime_type, file_size, created_at
         FROM report_media
         WHERE report_id IN ({$placeholders})
         ORDER BY id ASC"
    );
    $mediaStmt->execute($reportIds);

    foreach ($mediaStmt->fetchAll() as $mediaRow) {
        $rid = (int) $mediaRow['report_id'];
        $mediaRow['url'] = '../backend/api/media.php?id=' . (int) $mediaRow['id'];
        $mediaMap[$rid][] = $mediaRow;
    }
}

foreach ($reports as &$report) {
    $rid = (int) $report['id'];
    $items = $mediaMap[$rid] ?? [];
    $report['media'] = $items;

    $counts = ['photo' => 0, 'video' => 0, 'audio' => 0];
    foreach ($items as $item) {
        $type = (string) $item['media_type'];
        if (isset($counts[$type])) {
            $counts[$type]++;
        }
    }
    $report['media_counts'] = $counts;
}
unset($report);

$statusDistribution = ['Pending' => 0, 'Responding' => 0, 'Resolved' => 0];
$statusRows = $pdo->query(
    'SELECT status, COUNT(*) AS total FROM reports WHERE is_deleted = 0 GROUP BY status'
)->fetchAll();
foreach ($statusRows as $sr) {
    $key = (string) $sr['status'];
    if (isset($statusDistribution[$key])) {
        $statusDistribution[$key] = (int) $sr['total'];
    }
}

$categoryCounts = [
    'Crime' => 0,
    'Accident' => 0,
    'Fire' => 0,
    'Medical Emergency' => 0,
    'Others' => 0,
];
$catRows = $pdo->query(
    'SELECT category, COUNT(*) AS total FROM reports WHERE is_deleted = 0 GROUP BY category'
)->fetchAll();
foreach ($catRows as $cr) {
    $key = (string) $cr['category'];
    if (isset($categoryCounts[$key])) {
        $categoryCounts[$key] = (int) $cr['total'];
    }
}

$priorityCounts = ['LOW' => 0, 'MEDIUM' => 0, 'HIGH' => 0];
$prioRows = $pdo->query(
    'SELECT priority, COUNT(*) AS total FROM reports WHERE is_deleted = 0 GROUP BY priority'
)->fetchAll();
foreach ($prioRows as $pr) {
    $key = (string) $pr['priority'];
    if (isset($priorityCounts[$key])) {
        $priorityCounts[$key] = (int) $pr['total'];
    }
}

$dateRows = $pdo->query(
    'SELECT DATE(created_at) AS report_date, COUNT(*) AS total
     FROM reports
     WHERE is_deleted = 0
     GROUP BY DATE(created_at)
     ORDER BY report_date ASC'
)->fetchAll();

$byDate = array_map(
    static fn (array $row): array => [
        'date' => (string) $row['report_date'],
        'count' => (int) $row['total'],
    ],
    $dateRows
);

$totalActive = $statusDistribution['Pending']
    + $statusDistribution['Responding']
    + $statusDistribution['Resolved'];

$archivedCount = (int) $pdo->query('SELECT COUNT(*) FROM reports WHERE is_deleted = 1')->fetchColumn();

sendJson([
    'success' => true,
    'reports' => $reports,
    'kpi' => [
        'total' => $totalActive,
        'pending' => $statusDistribution['Pending'],
        'responding' => $statusDistribution['Responding'],
        'resolved' => $statusDistribution['Resolved'],
        'archived' => $archivedCount,
    ],
    'charts' => [
        'status_distribution' => $statusDistribution,
        'by_category' => $categoryCounts,
        'by_priority' => $priorityCounts,
        'by_date' => $byDate,
    ],
]);
