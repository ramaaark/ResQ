CREATE DATABASE IF NOT EXISTS resq_barangay_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE resq_barangay_db;

CREATE TABLE IF NOT EXISTS residents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  contact_number VARCHAR(30) NOT NULL,
  address VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  email VARCHAR(150) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  role_title VARCHAR(100) NOT NULL DEFAULT 'Barangay Official',
  password_hash VARCHAR(255) NOT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tracking_number VARCHAR(40) NOT NULL UNIQUE,
  resident_id INT UNSIGNED NOT NULL,
  category ENUM('Crime', 'Accident', 'Fire', 'Medical Emergency', 'Others') NOT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH') NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  incident_date DATE NOT NULL,
  latitude DECIMAL(10, 7) NULL DEFAULT NULL,
  longitude DECIMAL(10, 7) NULL DEFAULT NULL,
  location_description VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status ENUM('Pending', 'Responding', 'Resolved') NOT NULL DEFAULT 'Pending',
  truthful_confirmed TINYINT(1) NOT NULL DEFAULT 1,
  admin_notes TEXT NULL DEFAULT NULL,
  responded_by INT UNSIGNED NULL DEFAULT NULL,
  responded_at DATETIME NULL DEFAULT NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL DEFAULT NULL,
  deleted_by INT UNSIGNED NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_reports_resident (resident_id),
  INDEX idx_reports_status (status),
  INDEX idx_reports_category (category),
  INDEX idx_reports_priority (priority),
  INDEX idx_reports_incident_date (incident_date),
  INDEX idx_reports_deleted (is_deleted),
  CONSTRAINT fk_reports_resident FOREIGN KEY (resident_id) REFERENCES residents(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reports_admin FOREIGN KEY (responded_by) REFERENCES admins(id)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS report_media (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  report_id INT UNSIGNED NOT NULL,
  media_type ENUM('photo', 'video', 'audio') NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_media_report (report_id),
  INDEX idx_media_deleted (is_deleted),
  CONSTRAINT fk_media_report FOREIGN KEY (report_id) REFERENCES reports(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  resident_id INT UNSIGNED NOT NULL,
  report_id INT UNSIGNED NOT NULL,
  tracking_number VARCHAR(40) NOT NULL,
  status_at_event ENUM('Pending', 'Responding', 'Resolved') NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_resident (resident_id),
  INDEX idx_notif_read (is_read),
  INDEX idx_notif_deleted (is_deleted),
  CONSTRAINT fk_notif_resident FOREIGN KEY (resident_id) REFERENCES residents(id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_notif_report FOREIGN KEY (report_id) REFERENCES reports(id)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO admins (id, username, email, full_name, role_title, password_hash)
VALUES (
  1,
  'barangay_admin',
  'admin@barangayresq.ph',
  'Capt. Elena Santos',
  'Barangay Emergency Officer',
  '$2y$10$gQgIY8FkF.nhdf1Td84PSOU9QSFwxlZMLNCL/m.q7VKue7RNLip9O'
);

INSERT IGNORE INTO residents (id, full_name, email, contact_number, address, password_hash)
VALUES (
  1,
  'Juan Dela Cruz',
  'juan.delacruz@resident.ph',
  '09171234567',
  'Purok 2, Mabini St., Barangay San Isidro',
  '$2y$10$cZdJMh4Hh7ScarCn3YbZyOB2oRAvVDKpPYt8KbC0OqCWrb3NGHzdC'
);

INSERT IGNORE INTO reports (
  id,
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
  truthful_confirmed,
  admin_notes,
  responded_by,
  responded_at,
  created_at
)
VALUES
(
  1,
  'RESQ-SEED-1001',
  1,
  'Medical Emergency',
  'HIGH',
  '09171234567',
  DATE_SUB(CURDATE(), INTERVAL 3 DAY),
  14.5995000,
  120.9842000,
  'Purok 2, Near Barangay Health Center',
  'Elderly resident experienced sudden dizziness and chest discomfort near the covered court.',
  'Resolved',
  1,
  'Barangay ambulance team assisted and transported patient safely.',
  1,
  DATE_SUB(NOW(), INTERVAL 3 DAY),
  DATE_SUB(NOW(), INTERVAL 3 DAY)
),
(
  2,
  'RESQ-SEED-1002',
  1,
  'Accident',
  'MEDIUM',
  '09171234567',
  DATE_SUB(CURDATE(), INTERVAL 2 DAY),
  14.6012000,
  120.9860000,
  'Rizal Avenue Corner Sampaguita St.',
  'Minor collision between a tricycle and a bicycle causing traffic slowdown.',
  'Responding',
  1,
  'Barangay tanod unit dispatched to manage traffic and assist drivers.',
  1,
  DATE_SUB(NOW(), INTERVAL 2 DAY),
  DATE_SUB(NOW(), INTERVAL 2 DAY)
),
(
  3,
  'RESQ-SEED-1003',
  1,
  'Fire',
  'HIGH',
  '09171234567',
  DATE_SUB(CURDATE(), INTERVAL 1 DAY),
  14.5980000,
  120.9825000,
  'Purok 4, Behind Public Market',
  'Electrical post sparking near residential rooftops with light smoke observed.',
  'Pending',
  1,
  NULL,
  NULL,
  NULL,
  DATE_SUB(NOW(), INTERVAL 1 DAY)
),
(
  4,
  'RESQ-SEED-1004',
  1,
  'Crime',
  'LOW',
  '09171234567',
  CURDATE(),
  14.6004000,
  120.9851000,
  'Purok 1, Streetlight Post 12',
  'Suspicious loitering and tampered padlock spotted on the community storage shed.',
  'Pending',
  1,
  NULL,
  NULL,
  NULL,
  NOW()
);

INSERT IGNORE INTO notifications (
  id,
  resident_id,
  report_id,
  tracking_number,
  status_at_event,
  title,
  message,
  is_read,
  created_at
)
VALUES
(
  1,
  1,
  1,
  'RESQ-SEED-1001',
  'Resolved',
  'Barangay Staff Responded — Resolved',
  'Report RESQ-SEED-1001 has been marked Resolved by Barangay Emergency Officer.',
  0,
  DATE_SUB(NOW(), INTERVAL 3 DAY)
),
(
  2,
  1,
  2,
  'RESQ-SEED-1002',
  'Responding',
  'Barangay Staff Responded — Responding',
  'Barangay tanod team is currently Responding to report RESQ-SEED-1002.',
  0,
  DATE_SUB(NOW(), INTERVAL 2 DAY)
);
