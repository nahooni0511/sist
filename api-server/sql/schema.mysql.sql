CREATE DATABASE IF NOT EXISTS sistrun_hub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE sistrun_hub;

CREATE TABLE IF NOT EXISTS apps (
  app_id VARCHAR(100) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (app_id),
  KEY idx_apps_package_name (package_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_releases (
  id CHAR(36) NOT NULL,
  app_id VARCHAR(100) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  version_name VARCHAR(100) NOT NULL,
  version_code INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  sha256 CHAR(64) NOT NULL,
  file_size BIGINT NOT NULL,
  auto_update TINYINT(1) NOT NULL DEFAULT 0,
  changelog TEXT NOT NULL,
  uploaded_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_releases_app_version (app_id, version_code),
  KEY idx_releases_package_name (package_name),
  KEY idx_releases_uploaded_at (uploaded_at),
  CONSTRAINT fk_releases_app FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS settings (
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  PRIMARY KEY (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS devices (
  device_id VARCHAR(120) NOT NULL,
  device_type VARCHAR(30) NULL,
  model_name VARCHAR(120) NULL,
  location_name VARCHAR(255) NULL,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  last_seen_at VARCHAR(30) NULL,
  PRIMARY KEY (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_packages (
  device_id VARCHAR(120) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  version_code INT NOT NULL,
  PRIMARY KEY (device_id, package_name),
  CONSTRAINT fk_device_packages_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_modules (
  device_id VARCHAR(120) NOT NULL,
  module_name VARCHAR(120) NOT NULL,
  port_number INT NOT NULL,
  PRIMARY KEY (device_id, module_name),
  KEY idx_device_modules_device (device_id),
  CONSTRAINT fk_device_modules_device FOREIGN KEY (device_id) REFERENCES devices(device_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS commands (
  id CHAR(36) NOT NULL,
  device_id VARCHAR(120) NOT NULL,
  type VARCHAR(30) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  started_at VARCHAR(30) NULL,
  finished_at VARCHAR(30) NULL,
  result_message TEXT NULL,
  result_code INT NULL,
  PRIMARY KEY (id),
  KEY idx_commands_device_created (device_id, created_at),
  KEY idx_commands_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS store_devices (
  device_id VARCHAR(120) NOT NULL,
  device_name VARCHAR(160) NULL,
  model_name VARCHAR(160) NULL,
  platform VARCHAR(40) NULL,
  os_version VARCHAR(60) NULL,
  app_store_version VARCHAR(60) NULL,
  ip_address VARCHAR(64) NULL,
  last_synced_at VARCHAR(30) NULL,
  created_at VARCHAR(30) NOT NULL,
  updated_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (device_id),
  KEY idx_store_devices_last_synced (last_synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS store_device_packages (
  device_id VARCHAR(120) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  version_name VARCHAR(100) NULL,
  version_code INT NOT NULL,
  synced_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (device_id, package_name),
  KEY idx_store_device_packages_package (package_name),
  CONSTRAINT fk_store_device_packages_device FOREIGN KEY (device_id) REFERENCES store_devices(device_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS store_sync_logs (
  id CHAR(36) NOT NULL,
  device_id VARCHAR(120) NOT NULL,
  synced_at VARCHAR(30) NOT NULL,
  package_count INT NOT NULL,
  update_count INT NOT NULL DEFAULT 0,
  app_store_version VARCHAR(60) NULL,
  ip_address VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_store_sync_logs_device_synced (device_id, synced_at),
  CONSTRAINT fk_store_sync_logs_device FOREIGN KEY (device_id) REFERENCES store_devices(device_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS store_update_events (
  id CHAR(36) NOT NULL,
  device_id VARCHAR(120) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  app_id VARCHAR(100) NULL,
  release_id CHAR(36) NULL,
  target_version_name VARCHAR(100) NULL,
  target_version_code INT NULL,
  event_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL,
  message TEXT NULL,
  metadata JSON NULL,
  created_at VARCHAR(30) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_store_update_events_device_created (device_id, created_at),
  KEY idx_store_update_events_package_created (package_name, created_at),
  CONSTRAINT fk_store_update_events_device FOREIGN KEY (device_id) REFERENCES store_devices(device_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO settings (setting_key, setting_value)
VALUES
  ('API_BASE_URL', 'http://10.0.2.2:4000'),
  ('AI_BOX_IP', '192.168.0.10');
