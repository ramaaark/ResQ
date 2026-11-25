<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$admin = requireAdminAuth();
$input = readJsonInput();

$reportId = (int) ($input['report_id'] ?? 0);
$restore = (bool) ($input['restore'] ?? false);

if ($reportId <= 0) {
    sendJson(['success' => false, 'message' => 'Valid report ID is required.'], 422);
}

$pdo = getDatabaseConnection();

$findStmt = $pdo->prepare('SELECT id, tracking_number FROM reports WHERE id = ? LIMIT 1');
$findStmt->execute([$reportId]);
$report = $findStmt->fetch();

if (!$report) {
    sendJson(['success' => false, 'message' => 'Report record not found.'], 404);
}

try {
    $pdo->beginTransaction();

    if ($restore) {
        $stmt = $pdo->prepare(
            'UPDATE reports
             SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL
             WHERE id = ?'
        );
        $stmt->execute([$reportId]);

        $mediaStmt = $pdo->prepare(
            'UPDATE report_media
             SET is_deleted = 0, deleted_at = NULL
             WHERE report_id = ?'
        );
        $mediaStmt->execute([$reportId]);
    } else {
        $stmt = $pdo->prepare(
            'UPDATE reports
             SET is_deleted = 1, deleted_at = NOW(), deleted_by = ?
             WHERE id = ?'
        );
        $stmt->execute([(int) $admin['id'], $reportId]);

        $mediaStmt = $pdo->prepare(
            'UPDATE report_media
             SET is_deleted = 1, deleted_at = NOW()
             WHERE report_id = ?'
        );
        $mediaStmt->execute([$reportId]);
    }

    $pdo->commit();

    sendJson([
        'success' => true,
        'message' => $restore
            ? "Report {$report['tracking_number']} restored to active reports."
            : "Report {$report['tracking_number']} archived logically without deleting database data.",
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    sendJson([
        'success' => false,
        'message' => 'Failed to update report archive status.',
    ], 500);
}
