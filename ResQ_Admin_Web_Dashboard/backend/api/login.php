<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$input = readJsonInput();

$identifier = trim((string) ($input['identifier'] ?? ''));
$password = (string) ($input['password'] ?? '');

$errors = [];

if ($identifier === '') {
    $errors['identifier'] = 'Admin username or email is required.';
}

if (trim($password) === '') {
    $errors['password'] = 'Password is required.';
}

if ($errors !== []) {
    sendJson([
        'success' => false,
        'message' => 'Enter both your official credential and password.',
        'errors' => $errors,
    ], 422);
}

$pdo = getDatabaseConnection();
$stmt = $pdo->prepare(
    'SELECT id, username, email, full_name, role_title, password_hash, created_at
     FROM admins
     WHERE (username = ? OR email = ?) AND is_deleted = 0
     LIMIT 1'
);
$stmt->execute([$identifier, strtolower($identifier)]);
$row = $stmt->fetch();

if (!$row || !password_verify($password, (string) $row['password_hash'])) {
    sendJson([
        'success' => false,
        'message' => 'Invalid barangay official credentials.',
    ], 401);
}

session_regenerate_id(true);
$_SESSION['admin_id'] = (int) $row['id'];

unset($row['password_hash']);

sendJson([
    'success' => true,
    'message' => 'Signed in to Barangay Command Dashboard.',
    'admin' => $row,
]);
