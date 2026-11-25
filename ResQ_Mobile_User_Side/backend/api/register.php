<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$input = readJsonInput();

$fullName = trim((string) ($input['full_name'] ?? ''));
$email = trim((string) ($input['email'] ?? ''));
$contactNumber = trim((string) ($input['contact_number'] ?? ''));
$address = trim((string) ($input['address'] ?? ''));
$password = (string) ($input['password'] ?? '');
$confirmPassword = (string) ($input['confirm_password'] ?? '');

$errors = [];

if ($fullName === '' || mb_strlen($fullName) < 2) {
    $errors['full_name'] = 'Full name is required (at least 2 characters).';
}

if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Please enter a valid email address.';
}

if ($contactNumber === '' || !isValidPhoneNumber($contactNumber)) {
    $errors['contact_number'] = 'Enter a valid mobile number (e.g., 09171234567).';
}

if ($address === '' || mb_strlen($address) < 4) {
    $errors['address'] = 'Barangay address / purok is required.';
}

if (trim($password) === '' || mb_strlen($password) < 8) {
    $errors['password'] = 'Password must be at least 8 characters long.';
}

if ($confirmPassword === '' || $password !== $confirmPassword) {
    $errors['confirm_password'] = 'Passwords do not match.';
}

if ($errors !== []) {
    sendJson([
        'success' => false,
        'message' => 'Please review the highlighted registration fields.',
        'errors' => $errors,
    ], 422);
}

$pdo = getDatabaseConnection();

$existingStmt = $pdo->prepare(
    'SELECT id FROM residents WHERE email = ? AND is_deleted = 0 LIMIT 1'
);
$existingStmt->execute([strtolower($email)]);

if ($existingStmt->fetch()) {
    sendJson([
        'success' => false,
        'message' => 'An account with this email already exists.',
        'errors' => ['email' => 'This email is already registered.'],
    ], 409);
}

$passwordHash = password_hash($password, PASSWORD_BCRYPT);

$insertStmt = $pdo->prepare(
    'INSERT INTO residents (full_name, email, contact_number, address, password_hash)
     VALUES (?, ?, ?, ?, ?)'
);

$insertStmt->execute([
    $fullName,
    strtolower($email),
    $contactNumber,
    $address,
    $passwordHash,
]);

$newId = (int) $pdo->lastInsertId();

session_regenerate_id(true);
$_SESSION['resident_id'] = $newId;

$resident = getAuthenticatedResident();

sendJson([
    'success' => true,
    'message' => 'Registration completed. Welcome to ResQ.',
    'resident' => $resident,
], 201);
