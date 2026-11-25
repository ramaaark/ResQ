<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

$resident = getAuthenticatedResident();

sendJson([
    'success' => true,
    'authenticated' => $resident !== null,
    'resident' => $resident,
]);
