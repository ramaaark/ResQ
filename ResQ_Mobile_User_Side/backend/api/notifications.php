<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

$resident = requireResidentAuth();
$pdo = getDatabaseConnection();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = readJsonInput();
    $markAll = (bool) ($input['mark_all'] ?? false);
    $notificationId = (int) ($input['notification_id'] ?? 0);

    if ($markAll) {
        $stmt = $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1
             WHERE resident_id = ? AND is_deleted = 0 AND is_read = 0'
        );
        $stmt->execute([(int) $resident['id']]);
    } elseif ($notificationId > 0) {
        $stmt = $pdo->prepare(
            'UPDATE notifications
             SET is_read = 1
             WHERE id = ? AND resident_id = ? AND is_deleted = 0'
        );
        $stmt->execute([$notificationId, (int) $resident['id']]);
    }

    sendJson(['success' => true, 'message' => 'Notifications updated.']);
}

$stmt = $pdo->prepare(
    'SELECT
        n.id,
        n.report_id,
        n.tracking_number,
        n.status_at_event,
        n.title,
        n.message,
        n.is_read,
        n.created_at
     FROM notifications n
     INNER JOIN reports r ON n.report_id = r.id
     WHERE n.resident_id = ? AND n.is_deleted = 0 AND r.is_deleted = 0
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT 30'
);
$stmt->execute([(int) $resident['id']]);
$notifications = $stmt->fetchAll();

$unreadCount = 0;
foreach ($notifications as $item) {
    if ((int) $item['is_read'] === 0) {
        $unreadCount++;
    }
}

sendJson([
    'success' => true,
    'notifications' => $notifications,
    'unread_count' => $unreadCount,
]);
