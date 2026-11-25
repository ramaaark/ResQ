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
    session_name('RESQ_RESIDENT_SESS');
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

function getAuthenticatedResident(): ?array
{
    $residentId = $_SESSION['resident_id'] ?? null;
    if (!is_int($residentId) && !ctype_digit((string) $residentId)) {
        return null;
    }

    $pdo = getDatabaseConnection();
    $stmt = $pdo->prepare(
        'SELECT id, full_name, email, contact_number, address, created_at
         FROM residents
         WHERE id = ? AND is_deleted = 0
         LIMIT 1'
    );
    $stmt->execute([(int) $residentId]);
    $resident = $stmt->fetch();

    if (!$resident) {
        unset($_SESSION['resident_id']);
        return null;
    }

    return $resident;
}

function requireResidentAuth(): array
{
    $resident = getAuthenticatedResident();
    if ($resident === null) {
        sendJson([
            'success' => false,
            'message' => 'Authentication required. Please sign in as a resident.',
        ], 401);
    }

    return $resident;
}

function isValidPhoneNumber(string $phone): bool
{
    $cleaned = preg_replace('/[\s\-\(\)]+/', '', $phone);
    if ($cleaned === null) {
        return false;
    }

    return (bool) preg_match('/^(\+?639\d{9}|09\d{9}|\+?\d{10,15})$/', $cleaned);
}
