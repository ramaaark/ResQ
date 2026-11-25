<?php

declare(strict_types=1);

ini_set('display_errors', '0');

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config' . DIRECTORY_SEPARATOR . 'database.php';

if (session_status() === PHP_SESSION_NONE) {
    $sessionDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'sessions';
    if (!is_dir($sessionDir)) {
        @mkdir($sessionDir, 0755, true);
    }
    if (is_dir($sessionDir)) {
        session_save_path($sessionDir);
    }
    session_name('RESQ_ADMIN_SESS');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function sendJson(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readJsonInput(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return $decoded;
}

function getAuthenticatedAdmin(): ?array
{
    $adminId = $_SESSION['admin_id'] ?? null;
    if (!is_int($adminId) && !ctype_digit((string) $adminId)) {
        return null;
    }

    $pdo = getDatabaseConnection();
    $stmt = $pdo->prepare(
        'SELECT id, username, email, full_name, role_title, created_at
         FROM admins
         WHERE id = ? AND is_deleted = 0
         LIMIT 1'
    );
    $stmt->execute([(int) $adminId]);
    $admin = $stmt->fetch();

    if (!$admin) {
        unset($_SESSION['admin_id']);
        return null;
    }

    return $admin;
}

function requireAdminAuth(): array
{
    $admin = getAuthenticatedAdmin();
    if ($admin === null) {
        sendJson([
            'success' => false,
            'message' => 'Admin authentication required.',
        ], 401);
    }

    return $admin;
}
