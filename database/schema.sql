-- Digital Kooli Connect — MySQL schema
-- Run once: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS bhobb7n8b5teluhmc97t
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bhobb7n8b5teluhmc97t;
SET NAMES utf8mb4;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(10) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL DEFAULT '',
  role ENUM('worker','customer','admin') NOT NULL,
  profile_photo VARCHAR(255) NULL,
  language ENUM('en','te','hi') NOT NULL DEFAULT 'en',
  status ENUM('active','suspended','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- One row per PERSON who is a worker (shared identity: location, rating, verification).
CREATE TABLE workers (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  location_updated_at TIMESTAMP NULL,
  rating DECIMAL(2,1) NOT NULL DEFAULT 0,
  total_jobs INT NOT NULL DEFAULT 0,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  verification_requested TINYINT(1) NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_workers_location (latitude, longitude)
) ENGINE=InnoDB;

-- One row per JOB TYPE a worker offers (a worker can have many).
CREATE TABLE worker_listings (
  id CHAR(36) PRIMARY KEY,
  worker_id CHAR(36) NOT NULL,
  skill_category VARCHAR(40) NOT NULL,
  experience VARCHAR(80) NOT NULL DEFAULT '',
  expected_daily_wage INT NOT NULL DEFAULT 0,
  availability_status ENUM('available','booked','unavailable') NOT NULL DEFAULT 'unavailable',
  auto_suppressed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  INDEX idx_listings_worker (worker_id),
  INDEX idx_listings_category_status (skill_category, availability_status)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  location_updated_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE work_categories (
  id VARCHAR(40) PRIMARY KEY,
  name_en VARCHAR(60) NOT NULL,
  name_te VARCHAR(60) NOT NULL,
  name_hi VARCHAR(60) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE bookings (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  worker_id CHAR(36) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  work_request_id CHAR(36) NULL,
  status ENUM('booked','completed') NOT NULL DEFAULT 'booked',
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES worker_listings(id) ON DELETE CASCADE,
  INDEX idx_bookings_worker (worker_id),
  INDEX idx_bookings_customer (customer_id)
) ENGINE=InnoDB;

CREATE TABLE ratings (
  id CHAR(36) PRIMARY KEY,
  booking_id CHAR(36) NOT NULL UNIQUE,
  customer_id CHAR(36) NOT NULL,
  worker_id CHAR(36) NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE reports (
  id CHAR(36) PRIMARY KEY,
  reporter_id CHAR(36) NOT NULL,
  reported_user_id CHAR(36) NOT NULL,
  reason VARCHAR(60) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE work_requests (
  id CHAR(36) PRIMARY KEY,
  customer_id CHAR(36) NOT NULL,
  worker_id CHAR(36) NOT NULL,
  listing_id CHAR(36) NOT NULL,
  category_id VARCHAR(40) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  work_date VARCHAR(20) NOT NULL DEFAULT '',
  start_time VARCHAR(20) NOT NULL DEFAULT '',
  status ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES worker_listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  message VARCHAR(500) NOT NULL,
  type VARCHAR(40) NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notifications_user (user_id)
) ENGINE=InnoDB;

CREATE TABLE status_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  listing_id CHAR(36) NOT NULL,
  worker_id CHAR(36) NOT NULL,
  status VARCHAR(20) NOT NULL,
  at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status_logs_listing_time (listing_id, at)
) ENGINE=InnoDB;

CREATE TABLE otps (
  phone VARCHAR(10) PRIMARY KEY,
  otp VARCHAR(4) NOT NULL,
  expires_at TIMESTAMP NOT NULL
) ENGINE=InnoDB;

CREATE TABLE sessions (
  token CHAR(48) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  role ENUM('worker','customer','admin') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT INTO work_categories (id, name_en, name_te, name_hi, active) VALUES
  ('mason', 'Mason', 'మేస్త్రీ', 'राजमिस्त्री', 1),
  ('helper', 'Helper', 'హెల్పర్', 'सहायक', 1),
  ('painter', 'Painter', 'పెయింటర్', 'पेंटर', 1),
  ('carpenter', 'Carpenter', 'కార్పెంటర్', 'बढ़ई', 1),
  ('plumber', 'Plumber', 'ప్లంబర్', 'प्लंबर', 1),
  ('electrician', 'Electrician', 'ఎలక్ట్రీషియన్', 'इलेक्ट्रीशियन', 1),
  ('agri', 'Agricultural Worker', 'వ్యవసాయ కూలీ', 'कृषि श्रमिक', 1),
  ('construction', 'Construction Worker', 'నిర్మాణ కూలీ', 'निर्माण श्रमिक', 1),
  ('other', 'Other', 'ఇతర', 'अन्य', 1);

INSERT INTO users (id, phone, name, role, language, status) VALUES
  ('admin1', '9999999999', 'Admin', 'admin', 'en', 'active');
