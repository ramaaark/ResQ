<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$admin = requireAdminAuth();
$input = readJsonInput();

$reportId = (int) ($input['report_id'] ?? 0);
$newStatus = trim((string) ($input['status'] ?? ''));
$adminNotes = trim((string) ($input['admin_notes'] ?? ''));

if ($reportId <= 0) {
    sendJson(['success' => false, 'message' => 'Valid report ID is required.'], 422);
}

if (!in_array($newStatus, ['Pending', 'Responding', 'Resolved'], true)) {
    sendJson(['success' => false, 'message' => 'Invalid report status selected.'], 422);
}

$pdo = getDatabaseConnection();

$findStmt = $pdo->prepare(
    'SELECT id, resident_id, tracking_number, status
     FROM reports
     WHERE id = ? AND is_deleted = 0
     LIMIT 1'
);
$findStmt->execute([$reportId]);
$report = $findStmt->fetch();

if (!$report) {
    sendJson(['success' => false, 'message' => 'Report not found.'], 404);
}

try {
    $pdo->beginTransaction();

    $updateStmt = $pdo->prepare(
        'UPDATE reports
         SET status = ?,
             admin_notes = COALESCE(NULLIF(?, ""), admin_notes),
             responded_by = ?,
             responded_at = NOW()
         WHERE id = ? AND is_deleted = 0'
    );
    $updateStmt->execute([
        $newStatus,
        $adminNotes,
        (int) $admin['id'],
        $reportId,
    ]);

    $title = "Barangay Staff Response — {$newStatus}";
    $message = "Barangay official {$admin['full_name']} updated report {$report['tracking_number']} to {$newStatus}.";
    if ($adminNotes !== '') {
        $message .= " Note: {$adminNotes}";
    }

    $notifStmt = $pdo->prepare(
        'INSERT INTO notifications (
            resident_id,
            report_id,
            tracking_number,
            status_at_event,
            title,
            message
        ) VALUES (?, ?, ?, ?, ?, ?)'
    );
    $notifStmt->execute([
        (int) $report['resident_id'],
        $reportId,
        (string) $report['tracking_number'],
        $newStatus,
        $title,
        $message,
    ]);

    $pdo->commit();

    sendJson([
        'success' => true,
        'message' => "Report {$report['tracking_number']} updated to {$newStatus}.",
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    sendJson([
        'success' => false,
        'message' => 'Failed to update report status.',
    ], 500);
}
