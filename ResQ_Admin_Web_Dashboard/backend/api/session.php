<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

$admin = getAuthenticatedAdmin();

sendJson([
    'success' => true,
    'authenticated' => $admin !== null,
    'admin' => $admin,
]);
