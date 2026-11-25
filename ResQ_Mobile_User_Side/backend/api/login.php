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
    $errors['identifier'] = 'Email address or mobile number is required.';
}

if (trim($password) === '') {
    $errors['password'] = 'Password is required.';
}

if ($errors !== []) {
    sendJson([
        'success' => false,
        'message' => 'Please enter both your login credential and password.',
        'errors' => $errors,
    ], 422);
}

$pdo = getDatabaseConnection();
$stmt = $pdo->prepare(
    'SELECT id, full_name, email, contact_number, address, password_hash, created_at
     FROM residents
     WHERE (email = ? OR contact_number = ?) AND is_deleted = 0
     LIMIT 1'
);
$stmt->execute([strtolower($identifier), $identifier]);
$row = $stmt->fetch();

if (!$row || !password_verify($password, (string) $row['password_hash'])) {
    sendJson([
        'success' => false,
        'message' => 'Invalid email/mobile number or password.',
    ], 401);
}

session_regenerate_id(true);
$_SESSION['resident_id'] = (int) $row['id'];

unset($row['password_hash']);

sendJson([
    'success' => true,
    'message' => 'Signed in successfully.',
    'resident' => $row,
]);
