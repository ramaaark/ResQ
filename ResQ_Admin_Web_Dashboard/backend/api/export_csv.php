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

$stmt = $pdo->prepare(
    "SELECT
        r.tracking_number,
        res.full_name AS resident_name,
        r.contact_number,
        r.category,
        r.priority,
        r.status,
        r.location_description,
        r.latitude,
        r.longitude,
        r.description,
        r.incident_date,
        r.created_at,
        r.admin_notes,
        (
            SELECT COUNT(*)
            FROM report_media m
            WHERE m.report_id = r.id AND m.is_deleted = 0
        ) AS media_count
     FROM reports r
     INNER JOIN residents res ON r.resident_id = res.id
     WHERE {$whereSql}
     ORDER BY r.created_at DESC, r.id DESC"
);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$sanitizeCell = static function ($value): string {
    $text = (string) ($value ?? '');
    if ($text !== '' && in_array($text[0], ['=', '+', '@'], true)) {
        return "'" . $text;
    }
    return $text;
};

$filename = 'resq_emergency_reports_' . date('Ymd_His') . '.csv';
header('Content-Type: text/csv; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-store, no-cache, must-revalidate');

$output = fopen('php://output', 'wb');
if ($output !== false) {
    fwrite($output, "\xEF\xBB\xBF");
    fputcsv($output, [
        'Tracking Number',
        'Resident Name',
        'Contact Number',
        'Category',
        'Priority',
        'Status',
        'Location',
        'Latitude',
        'Longitude',
        'Description',
        'Media Count',
        'Incident Date',
        'Submitted Timestamp',
        'Admin Notes',
    ]);

    foreach ($rows as $row) {
        fputcsv($output, [
            $sanitizeCell($row['tracking_number']),
            $sanitizeCell($row['resident_name']),
            $sanitizeCell($row['contact_number']),
            $sanitizeCell($row['category']),
            $sanitizeCell($row['priority']),
            $sanitizeCell($row['status']),
            $sanitizeCell($row['location_description']),
            (string) ($row['latitude'] ?? ''),
            (string) ($row['longitude'] ?? ''),
            $sanitizeCell($row['description']),
            (string) $row['media_count'],
            (string) $row['incident_date'],
            (string) $row['created_at'],
            $sanitizeCell($row['admin_notes']),
        ]);
    }
    fclose($output);
}
exit;
