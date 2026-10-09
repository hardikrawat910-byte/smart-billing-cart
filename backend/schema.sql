-- SmartCart / Smart Billing Cart - MySQL 8.0.16+ schema.
-- seed.py creates exactly this automatically; this file documents it for your report
-- and lets you create it by hand in MySQL Workbench if you prefer.

CREATE DATABASE IF NOT EXISTS smart_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_billing;

CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  full_name      VARCHAR(120) NOT NULL,
  email          VARCHAR(255) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,      -- "!google" = signs in with Google only
  google_sub     VARCHAR(64) NULL UNIQUE,    -- Google account id (Google sign-in)
  organization   VARCHAR(120) NULL,
  role           ENUM('user','admin') NOT NULL DEFAULT 'user',
  wallet_balance DECIMAL(10,2) NOT NULL DEFAULT 0,  -- SmartCart Wallet (INR)
    shopping_budget DECIMAL(10, 2) NULL,               -- optional spending limit
  created_at     DATETIME NOT NULL,
  updated_at     DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE products (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  category      VARCHAR(60)  NOT NULL,
  description   TEXT NULL,
  image_url     VARCHAR(500) NULL,
  price         DECIMAL(10,2) NOT NULL,
    mrp             DECIMAL(10, 2) NULL,               -- printed MRP; above price = an offer
  stock         INT NOT NULL DEFAULT 0,
  qr_code       VARCHAR(120) NOT NULL UNIQUE,  -- the product code: barcode number on the pack or QR label text
  weight_min_g  DECIMAL(8,1) NULL,             -- expected weight range (scale check)
  weight_max_g  DECIMAL(8,1) NULL,
  ref_color     VARCHAR(7) NULL,               -- reference colour #rrggbb (camera check)
  status        ENUM('draft','published') NOT NULL DEFAULT 'draft',
  deleted_at    DATETIME NULL,                 -- soft delete keeps order history intact
  created_at    DATETIME NOT NULL,
  updated_at    DATETIME NOT NULL,
  CONSTRAINT ck_products_price CHECK (price >= 0),
  CONSTRAINT ck_products_stock CHECK (stock >= 0),
  CONSTRAINT ck_products_weight_range
    CHECK (weight_min_g IS NULL OR weight_max_g IS NULL OR weight_min_g <= weight_max_g)
) ENGINE=InnoDB;

CREATE TABLE cart_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  product_id  INT NOT NULL,
  quantity    INT NOT NULL DEFAULT 1,
  added_at    DATETIME NOT NULL,
  CONSTRAINT uq_cart_user_product UNIQUE (user_id, product_id),
  CONSTRAINT ck_cart_quantity CHECK (quantity BETWEEN 1 AND 99),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE orders (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  total_amount     DECIMAL(10,2) NOT NULL,
  status           ENUM('completed','cancelled') NOT NULL DEFAULT 'completed',
  idempotency_key  VARCHAR(64) NULL,           -- stops double-billing on retries
  created_at       DATETIME NOT NULL,
  exit_verified_at DATETIME NULL,              -- exit gate: bill QR scanned out (works once)
  exit_verified_by INT NULL,                   -- staff member who scanned it (phone)
  exit_verified_device VARCHAR(40) NULL,       -- or the device, e.g. rpi-cart (Pi camera)
  payment_method   VARCHAR(20) NULL,            -- wallet (NULL = before the wallet existed)
  payment_ref      INT NULL,                    -- wallet_transactions.id of the payment
  CONSTRAINT uq_orders_idempotency UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_orders_exit_staff FOREIGN KEY (exit_verified_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  order_id      INT NOT NULL,
  product_id    INT NOT NULL,
  product_name  VARCHAR(120) NOT NULL,         -- snapshot: renames never rewrite bills
  quantity      INT NOT NULL,
  unit_price    DECIMAL(10,2) NOT NULL,        -- snapshot: price changes never rewrite bills
    unit_mrp        DECIMAL(10, 2) NULL,               -- MRP at purchase when on offer
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE hardware_readings (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  device_id    VARCHAR(40) NOT NULL,
  kind         ENUM('weight','image') NOT NULL,
  weight_g     DECIMAL(8,1) NULL,
  image_file   VARCHAR(120) NULL,
  color_hex    VARCHAR(7) NULL,
  consumed_at  DATETIME NULL,                  -- a reading can verify only one scan
  created_at   DATETIME NOT NULL,
  INDEX ix_hardware_readings_created_at (created_at)
) ENGINE=InnoDB;

CREATE TABLE flagged_transactions (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NOT NULL,
  product_id         INT NOT NULL,
  scanned_code       VARCHAR(120) NOT NULL,
  measured_weight_g  DECIMAL(8,1) NULL,
  expected_min_g     DECIMAL(8,1) NULL,
  expected_max_g     DECIMAL(8,1) NULL,
  measured_color     VARCHAR(7) NULL,
  expected_color     VARCHAR(7) NULL,
  color_distance     DECIMAL(6,1) NULL,
  reasons            VARCHAR(255) NOT NULL,    -- e.g. weight_mismatch,image_mismatch
  status             ENUM('open','approved','rejected') NOT NULL DEFAULT 'open',
  created_at         DATETIME NOT NULL,
  resolved_at        DATETIME NULL,
  resolved_by        INT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE settings (
  name        VARCHAR(40) PRIMARY KEY,          -- e.g. hardware_mode (changed on the Admin page)
  value       VARCHAR(255) NOT NULL,
  updated_at  DATETIME NOT NULL
) ENGINE=InnoDB;

CREATE TABLE topup_requests (                  -- wallet top-up tokens (T-000042)
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,
  status        ENUM('pending','paid','cancelled') NOT NULL DEFAULT 'pending',
  method        VARCHAR(10) NULL,               -- cash / upi
  created_at    DATETIME NOT NULL,
  paid_at       DATETIME NULL,
  confirmed_by  INT NULL,                       -- staff member who took the money
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE wallet_transactions (             -- every change to a wallet, with the balance after it
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  kind           ENUM('topup','payment','refund','adjust') NOT NULL,
  amount         DECIMAL(10,2) NOT NULL,        -- + in, - out
  balance_after  DECIMAL(10,2) NOT NULL,
  method         VARCHAR(20) NULL,              -- cash / upi / wallet / staff / welcome
  order_id       INT NULL,
  topup_id       INT NULL,
  note           VARCHAR(160) NULL,
  created_by     INT NULL,
  created_at     DATETIME NOT NULL,
  INDEX ix_wallet_transactions_user_id (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (topup_id) REFERENCES topup_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE product_images (                  -- product photos taken in the admin form
  product_id  INT PRIMARY KEY,
  mime        VARCHAR(20) NOT NULL,
  data        MEDIUMBLOB NOT NULL,              -- JPEG, at most 900 px
  updated_at  DATETIME NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cart_alerts (                     -- weight on the cart that was never scanned
  id           INT AUTO_INCREMENT PRIMARY KEY,
  reading_id   INT NOT NULL UNIQUE,
  device_id    VARCHAR(40) NOT NULL,
  weight_g     DECIMAL(8,1) NOT NULL,
  status       ENUM('open','scanned','removed','dismissed') NOT NULL DEFAULT 'open',
  created_at   DATETIME NOT NULL,
  resolved_at  DATETIME NULL,
  FOREIGN KEY (reading_id) REFERENCES hardware_readings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shopping_list_items (             -- what the shopper plans to buy (ticks off when in the cart)
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    product_id  INT NOT NULL,
    quantity    INT NOT NULL DEFAULT 1,
    created_at  DATETIME NOT NULL,
    CONSTRAINT uq_list_user_product UNIQUE (user_id, product_id),
    CONSTRAINT ck_list_quantity CHECK (quantity BETWEEN 1 AND 99),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE help_requests (                   -- "Call staff" from the shopper's phone
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    reason      VARCHAR(20) NOT NULL,           -- wont_scan / weight / payment / find / other
    note        VARCHAR(160) NULL,
    location    VARCHAR(60) NULL,
    status      ENUM('open','coming','done','cancelled') NOT NULL DEFAULT 'open',
    staff_id    INT NULL,
    created_at  DATETIME NOT NULL,
    updated_at  DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL
);
