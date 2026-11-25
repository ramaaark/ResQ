<?php

declare(strict_types=1);

date_default_timezone_set('Asia/Manila');

function getDatabaseConnection(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = '127.0.0.1';
    $dbName = 'resq_barangay_db';
    $user = 'root';
    $pass = '';

    $options = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];

    try {
        $pdo = new PDO(
            "mysql:host={$host};dbname={$dbName};charset=utf8mb4",
            $user,
            $pass,
            $options
        );
    } catch (PDOException $e) {
        $bootstrapPdo = new PDO(
            "mysql:host={$host};charset=utf8mb4",
            $user,
            $pass,
            $options
        );

        $bootstrapPdo->exec(
            "CREATE DATABASE IF NOT EXISTS `{$dbName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        );

        $pdo = new PDO(
            "mysql:host={$host};dbname={$dbName};charset=utf8mb4",
            $user,
            $pass,
            $options
        );
    }

    initializeDatabaseSchema($pdo);

    return $pdo;
}

function initializeDatabaseSchema(PDO $pdo): void
{
    static $initialized = false;

    if ($initialized) {
        return;
    }

    $schemaFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'resq_db.sql';

    $tableCheck = $pdo->query("SHOW TABLES LIKE 'reports'");
    $hasTables = $tableCheck && $tableCheck->fetchColumn() !== false;

    if (!$hasTables && is_file($schemaFile)) {
        $sql = file_get_contents($schemaFile);
        if ($sql !== false) {
            $statements = array_filter(
                array_map('trim', explode(';', $sql)),
                static fn (string $stmt): bool => $stmt !== ''
            );

            foreach ($statements as $statement) {
                $pdo->exec($statement);
            }
        }
    }

    $initialized = true;
}
