<?php

declare(strict_types=1);

require_once __DIR__ . DIRECTORY_SEPARATOR . 'bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(['success' => false, 'message' => 'Method not allowed.'], 405);
}

$resident = requireResidentAuth();

$allowedCategories = ['Crime', 'Accident', 'Fire', 'Medical Emergency', 'Others'];
$allowedPriorities = ['LOW', 'MEDIUM', 'HIGH'];

$category = trim((string) ($_POST['category'] ?? ''));
$priority = strtoupper(trim((string) ($_POST['priority'] ?? '')));
$contactNumber = trim((string) ($_POST['contact_number'] ?? ''));
$incidentDate = trim((string) ($_POST['incident_date'] ?? ''));
$locationDescription = trim((string) ($_POST['location_description'] ?? ''));
$description = trim((string) ($_POST['description'] ?? ''));
$latitudeRaw = trim((string) ($_POST['latitude'] ?? ''));
$longitudeRaw = trim((string) ($_POST['longitude'] ?? ''));
$truthfulRaw = trim((string) ($_POST['truthful_confirmed'] ?? ''));

$errors = [];

if (!in_array($category, $allowedCategories, true)) {
    $errors['category'] = 'Select a valid emergency category.';
}

if (!in_array($priority, $allowedPriorities, true)) {
    $errors['priority'] = 'Select a valid priority level.';
}

if ($contactNumber === '' || !isValidPhoneNumber($contactNumber)) {
    $errors['contact_number'] = 'Enter a valid resident mobile number.';
}

$today = date('Y-m-d');
$parsedDate = DateTimeImmutable::createFromFormat('Y-m-d', $incidentDate);
$isDateValid = $parsedDate !== false && $parsedDate->format('Y-m-d') === $incidentDate;

if (!$isDateValid) {
    $errors['incident_date'] = 'Select a valid incident date.';
} elseif ($incidentDate < $today) {
    $errors['incident_date'] = 'Backdating is not allowed. Incident date cannot be earlier than today.';
} elseif ($incidentDate > $today) {
    $errors['incident_date'] = 'Incident date cannot be in the future.';
}

if ($locationDescription === '' || mb_strlen($locationDescription) < 3) {
    $errors['location_description'] = 'Location description is required.';
}

$latitude = null;
$longitude = null;

if ($latitudeRaw !== '' || $longitudeRaw !== '') {
    if (!is_numeric($latitudeRaw) || !is_numeric($longitudeRaw)) {
        $errors['location_description'] = 'GPS coordinates must be valid numbers.';
    } else {
        $latFloat = (float) $latitudeRaw;
        $lngFloat = (float) $longitudeRaw;
        if ($latFloat < -90.0 || $latFloat > 90.0 || $lngFloat < -180.0 || $lngFloat > 180.0) {
            $errors['location_description'] = 'GPS coordinates are out of valid geographic range.';
        } else {
            $latitude = round($latFloat, 7);
            $longitude = round($lngFloat, 7);
        }
    }
}

if ($description === '' || mb_strlen($description) < 10) {
    $errors['description'] = 'Please enter a clear incident description (at least 10 characters).';
}

if ($truthfulRaw !== '1' && strtolower($truthfulRaw) !== 'true') {
    $errors['truthful_confirmed'] = 'You must confirm that this report is truthful before submitting.';
}

$mediaRules = [
    'photos' => [
        'media_type' => 'photo',
        'max_bytes' => 10 * 1024 * 1024,
        'extensions' => ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        'mime_prefixes' => ['image/'],
    ],
    'videos' => [
        'media_type' => 'video',
        'max_bytes' => 50 * 1024 * 1024,
        'extensions' => ['mp4', 'webm', 'mov', 'avi', 'mkv'],
        'mime_prefixes' => ['video/'],
    ],
    'audios' => [
        'media_type' => 'audio',
        'max_bytes' => 20 * 1024 * 1024,
        'extensions' => ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'oga'],
        'mime_prefixes' => ['audio/', 'video/webm'],
    ],
];

$validatedUploads = [];
$finfo = new finfo(FILEINFO_MIME_TYPE);

foreach ($mediaRules as $field => $rule) {
    if (!isset($_FILES[$field])) {
        continue;
    }

    $fileBag = $_FILES[$field];
    $names = is_array($fileBag['name']) ? $fileBag['name'] : [$fileBag['name']];
    $tmpNames = is_array($fileBag['tmp_name']) ? $fileBag['tmp_name'] : [$fileBag['tmp_name']];
    $errCodes = is_array($fileBag['error']) ? $fileBag['error'] : [$fileBag['error']];
    $sizes = is_array($fileBag['size']) ? $fileBag['size'] : [$fileBag['size']];

    $count = count($names);
    for ($i = 0; $i < $count; $i++) {
        $errorCode = (int) $errCodes[$i];
        if ($errorCode === UPLOAD_ERR_NO_FILE) {
            continue;
        }

        if ($errorCode !== UPLOAD_ERR_OK) {
            $errors['media'] = 'One of the uploaded files failed to upload cleanly. Please try again.';
            continue;
        }

        $tmpPath = (string) $tmpNames[$i];
        $originalName = basename((string) $names[$i]);
        $fileSize = (int) $sizes[$i];

        if ($fileSize <= 0 || $fileSize > $rule['max_bytes']) {
            $errors['media'] = "File {$originalName} exceeds the allowed size limit.";
            continue;
        }

        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($ext, $rule['extensions'], true)) {
            $errors['media'] = "Unsupported {$rule['media_type']} file extension for {$originalName}.";
            continue;
        }

        $detectedMime = (string) $finfo->file($tmpPath);
        $mimeMatched = false;
        foreach ($rule['mime_prefixes'] as $prefix) {
            if (str_starts_with($detectedMime, $prefix)) {
                $mimeMatched = true;
                break;
            }
        }

        if (!$mimeMatched && $detectedMime !== 'application/octet-stream') {
            $errors['media'] = "File {$originalName} does not match a valid {$rule['media_type']} format.";
            continue;
        }

        $validatedUploads[] = [
            'media_type' => $rule['media_type'],
            'tmp_path' => $tmpPath,
            'original_name' => $originalName,
            'ext' => $ext,
            'mime_type' => $detectedMime !== '' ? $detectedMime : 'application/octet-stream',
            'file_size' => $fileSize,
        ];
    }
}

if ($errors !== []) {
    sendJson([
        'success' => false,
        'message' => 'Please fix the validation errors before submitting.',
        'errors' => $errors,
    ], 422);
}

$uploadsDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads';
if (!is_dir($uploadsDir)) {
    mkdir($uploadsDir, 0755, true);
}

$pdo = getDatabaseConnection();
$movedFiles = [];

try {
    $pdo->beginTransaction();

    $trackingNumber = '';
    for ($attempt = 0; $attempt < 6; $attempt++) {
        $candidate = 'RESQ-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
        $checkStmt = $pdo->prepare('SELECT id FROM reports WHERE tracking_number = ? LIMIT 1');
        $checkStmt->execute([$candidate]);
        if (!$checkStmt->fetch()) {
            $trackingNumber = $candidate;
            break;
        }
    }

    if ($trackingNumber === '') {
        throw new RuntimeException('Unable to generate unique tracking number.');
    }

    $insertReport = $pdo->prepare(
        'INSERT INTO reports (
            tracking_number,
            resident_id,
            category,
            priority,
            contact_number,
            incident_date,
            latitude,
            longitude,
            location_description,
            description,
            status,
            truthful_confirmed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
    );

    $insertReport->execute([
        $trackingNumber,
        (int) $resident['id'],
        $category,
        $priority,
        $contactNumber,
        $incidentDate,
        $latitude,
        $longitude,
        $locationDescription,
        $description,
        'Pending',
    ]);

    $reportId = (int) $pdo->lastInsertId();

    $insertMedia = $pdo->prepare(
        'INSERT INTO report_media (
            report_id,
            media_type,
            original_name,
            stored_name,
            storage_path,
            mime_type,
            file_size
        ) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    $savedMedia = [];
    foreach ($validatedUploads as $item) {
        $storedName = $item['media_type'] . '_' . date('YmdHis') . '_' . bin2hex(random_bytes(5)) . '.' . $item['ext'];
        $destinationPath = $uploadsDir . DIRECTORY_SEPARATOR . $storedName;

        $moved = is_uploaded_file($item['tmp_path'])
            ? move_uploaded_file($item['tmp_path'], $destinationPath)
            : rename($item['tmp_path'], $destinationPath);

        if (!$moved) {
            throw new RuntimeException('Failed to store uploaded file.');
        }

        $movedFiles[] = $destinationPath;

        $insertMedia->execute([
            $reportId,
            $item['media_type'],
            $item['original_name'],
            $storedName,
            $destinationPath,
            $item['mime_type'],
            $item['file_size'],
        ]);

        $savedMedia[] = [
            'id' => (int) $pdo->lastInsertId(),
            'media_type' => $item['media_type'],
            'original_name' => $item['original_name'],
            'mime_type' => $item['mime_type'],
            'file_size' => $item['file_size'],
        ];
    }

    $pdo->commit();

    sendJson([
        'success' => true,
        'message' => 'Emergency report submitted and forwarded to Barangay Command.',
        'report' => [
            'id' => $reportId,
            'tracking_number' => $trackingNumber,
            'category' => $category,
            'priority' => $priority,
            'contact_number' => $contactNumber,
            'incident_date' => $incidentDate,
            'latitude' => $latitude,
            'longitude' => $longitude,
            'location_description' => $locationDescription,
            'description' => $description,
            'status' => 'Pending',
            'media' => $savedMedia,
        ],
    ], 201);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    foreach ($movedFiles as $filePath) {
        if (is_file($filePath)) {
            @unlink($filePath);
        }
    }

    sendJson([
        'success' => false,
        'message' => 'Unable to save report at this moment. Please try again.',
    ], 500);
}
