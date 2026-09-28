-- ============================================================================
-- TmasPlus - laboratorio del esquema ACTUAL (MySQL 8 / MySQL Workbench)
-- ============================================================================
-- Objetivo:
--   Visualizar y experimentar con la estructura observada en Supabase.
--
-- IMPORTANTE:
--   1. Supabase usa PostgreSQL; este archivo es una ADAPTACION para MySQL 8.
--   2. Conserva nombres, duplicidades y relaciones relevantes del esquema real.
--   3. No contiene datos reales, credenciales, RLS ni llamadas HTTP.
--   4. No debe ejecutarse contra producción.
--   5. Los UUID de PostgreSQL se representan como CHAR(36).
--   6. timestamptz se representa como DATETIME(6); MySQL no conserva la zona.
--
-- El script recrea solamente la base aislada `tmasplus_schema_lab`.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS tmasplus_schema_lab
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tmasplus_schema_lab;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS service_data_snapshots;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS cars;
DROP TABLE IF EXISTS car_types;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- USUARIOS
-- En Supabase, auth_id referencia conceptualmente auth.users.id.
-- El esquema real tiene dos restricciones UNIQUE redundantes sobre auth_id.
-- Aquí se conserva una sola porque ambas protegen exactamente el mismo dato.
-- ============================================================================

CREATE TABLE users (
  id                    CHAR(36)      NOT NULL,
  auth_id               CHAR(36)      NULL,
  email                 VARCHAR(255)  NULL,
  first_name            VARCHAR(255)  NULL,
  last_name             VARCHAR(255)  NULL,
  mobile                VARCHAR(100)  NULL,
  user_type             VARCHAR(50)   NULL,
  wallet_balance        DECIMAL(14,2) NULL,
  location              JSON          NULL,
  profile_image         TEXT          NULL,
  rating                DECIMAL(4,2)  NULL,
  total_rides           INT           NULL,
  is_verified           BOOLEAN       NULL,
  approved              BOOLEAN       NULL,
  blocked               BOOLEAN       NULL,
  referral_id           VARCHAR(255)  NULL,
  city                  VARCHAR(255)  NULL,
  driver_active_status  BOOLEAN       NULL,
  license_number        VARCHAR(255)  NULL,
  license_image         TEXT          NULL,
  license_image_back    TEXT          NULL,
  verify_id_image       TEXT          NULL,
  verify_id_image_bk    TEXT          NULL,
  push_token            TEXT          NULL,
  user_platform         VARCHAR(100)  NULL,
  created_at            DATETIME(6)   NULL,
  updated_at            DATETIME(6)   NULL,
  car_type              VARCHAR(255)  NULL,
  car_image             TEXT          NULL,
  vehicle_number        VARCHAR(100)  NULL,
  vehicle_make          VARCHAR(255)  NULL,
  company_name          VARCHAR(255)  NULL,
  total_trips           INT           NULL,
  total_earnings        DECIMAL(14,2) NULL,
  is_active             BOOLEAN       NULL,
  verified              BOOLEAN       NULL,
  verify_id_image_data  LONGTEXT      NULL,
  document_type         VARCHAR(100)  NULL,
  document_number       VARCHAR(255)  NULL,
  soat_image            TEXT          NULL,
  card_prop_image       TEXT          NULL,
  card_prop_image_bk    TEXT          NULL,
  referred_by_code      VARCHAR(255)  NULL,
  bank_number           VARCHAR(255)  NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_auth_id (auth_id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

-- ============================================================================
-- CATALOGO DE CATEGORIAS
-- Esta es la fuente oficial actual de categorías y tarifas.
-- ============================================================================

CREATE TABLE car_types (
  id                        CHAR(36)      NOT NULL,
  name                      VARCHAR(255)  NOT NULL,
  description               TEXT          NULL,
  base_price                DECIMAL(14,2) NULL,
  price_per_km              DECIMAL(14,2) NULL,
  image                     TEXT          NULL,
  capacity                  INT           NULL,
  is_active                 BOOLEAN       NULL,
  created_at                DATETIME(6)   NULL,
  base_price_inter          DECIMAL(14,2) NULL,
  price_per_km_inter        DECIMAL(14,2) NULL,
  rate_per_hour             DECIMAL(14,2) NULL,
  rate_per_hour_inter       DECIMAL(14,2) NULL,
  valor_hora                DECIMAL(14,2) NULL,
  min_fare                  DECIMAL(14,2) NULL,
  min_fare_inter            DECIMAL(14,2) NULL,
  delta_aeropuerto          DECIMAL(14,2) NULL,
  delta_aeropuerto_prog     DECIMAL(14,2) NULL,
  convenience_fee           DECIMAL(14,2) NULL,
  convenience_fee_type      VARCHAR(50)   NULL,
  updated_at                DATETIME(6)   NULL,
  umbral_intermunicipal_km  DECIMAL(10,2) NULL,

  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ============================================================================
-- VEHICULOS
-- Situación actual:
--   - La categoría está guardada como service_type textual.
--   - No existe car_type_id.
--   - La placa no tiene restricción UNIQUE.
--   - El vehículo está acoplado directamente a un conductor.
-- ============================================================================

CREATE TABLE cars (
  id                         CHAR(36)     NOT NULL,
  driver_id                  CHAR(36)     NULL,
  make                       VARCHAR(255) NULL,
  model                      VARCHAR(255) NULL,
  color                      VARCHAR(255) NULL,
  plate                      VARCHAR(100) NULL,
  car_image_1                TEXT         NULL,
  capacity                   INT          NULL,
  is_active                  BOOLEAN      NULL,
  created_at                 DATETIME(6)  NULL,
  updated_at                 DATETIME(6)  NULL,
  soat_image                 TEXT         NULL,
  soat_expiry_date           DATE         NULL,
  card_prop_image            TEXT         NULL,
  card_prop_image_back       TEXT         NULL,
  tecnomecanica_image        TEXT         NULL,
  tecnomecanica_expiry_date  DATE         NULL,
  camara_comercio_image      TEXT         NULL,
  service_type               VARCHAR(255) NULL,
  car_image_2                TEXT         NULL,
  fuel_type                  VARCHAR(100) NULL,
  transmission               VARCHAR(100) NULL,
  features                   JSON         NULL,

  PRIMARY KEY (id),
  KEY idx_cars_driver_id (driver_id),
  CONSTRAINT fk_cars_driver
    FOREIGN KEY (driver_id) REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- RESERVAS
-- Se mantienen deliberadamente los pares de columnas heredadas/canónicas.
-- ============================================================================

CREATE TABLE bookings (
  id                         CHAR(36)      NOT NULL,
  customer_id                CHAR(36)      NULL,
  driver_id                  CHAR(36)      NULL,
  car_type_id                CHAR(36)      NULL,
  car_id                     CHAR(36)      NULL,
  status                     VARCHAR(50)   NULL DEFAULT 'NEW',
  pickup_location            JSON          NOT NULL,
  destination_location       JSON          NOT NULL,
  drop_location              JSON          NULL,
  distance                   DECIMAL(12,3) NULL,
  duration                   INT           NULL,
  price                      DECIMAL(14,2) NOT NULL,
  total_trip_time            INT           NULL,
  trip_start_time            DATETIME(6)   NULL,
  trip_end_time              DATETIME(6)   NULL,
  driver_arrived_time        DATETIME(6)   NULL,
  start_time                 BIGINT        NULL,
  end_time                   BIGINT        NULL,
  driver_status              VARCHAR(50)   NULL,
  customer_status            VARCHAR(50)   NULL DEFAULT 'NEW',
  driver_name                VARCHAR(255)  NULL,
  driver_image               TEXT          NULL,
  driver_contact             VARCHAR(100)  NULL,
  driver_rating              DECIMAL(4,2)  NULL,
  car_image                  TEXT          NULL,
  vehicle_number             VARCHAR(100)  NULL,
  vehicle_model              VARCHAR(255)  NULL,
  vehicle_make               VARCHAR(255)  NULL,
  vehicle_color              VARCHAR(255)  NULL,
  customer_token             TEXT          NULL,
  driver_token               TEXT          NULL,
  payment_mode               VARCHAR(100)  NULL,
  prepaid                    BOOLEAN       NULL,
  rating                     SMALLINT      NULL,
  review                     TEXT          NULL,
  reason                     TEXT          NULL,
  cancelled_by               VARCHAR(100)  NULL,
  cancellation_time          TIME          NULL,
  cancelled_at               BIGINT        NULL,
  incident                   JSON          NULL,
  customer_city              VARCHAR(255)  NULL,
  driver_city                VARCHAR(255)  NULL,
  reference                  VARCHAR(100)  NULL,
  created_at                 DATETIME(6)   NULL,
  updated_at                 DATETIME(6)   NULL,
  customer                   CHAR(36)      NULL,
  customer_name              VARCHAR(255)  NULL,
  customer_email             VARCHAR(255)  NULL,
  customer_contact           VARCHAR(100)  NULL,
  driver                     CHAR(36)      NULL,
  driver_active_status       BOOLEAN       NULL DEFAULT FALSE,
  pickup_address             TEXT          NULL,
  pickup_lat                 DECIMAL(10,7) NULL,
  pickup_lng                 DECIMAL(10,7) NULL,
  drop_address               TEXT          NULL,
  drop_lat                   DECIMAL(10,7) NULL,
  drop_lng                   DECIMAL(10,7) NULL,
  car_type                   VARCHAR(255)  NULL,
  car_model                  VARCHAR(255)  NULL,
  plate_number               VARCHAR(100)  NULL,
  trip_type                  VARCHAR(100)  NULL,
  trip_urban                 VARCHAR(100)  NULL,
  estimate                   DECIMAL(14,2) NULL,
  trip_cost                  DECIMAL(14,2) NULL,
  convenience_fees           DECIMAL(14,2) NULL,
  discount                   DECIMAL(14,2) NULL,
  total_cost                 DECIMAL(14,2) NULL,
  driver_share               DECIMAL(14,2) NULL,
  payment_gateway            VARCHAR(100)  NULL,
  otp                        VARCHAR(50)   NULL,
  promo_applied              BOOLEAN       NULL,
  promo_code                 VARCHAR(100)  NULL,
  promo_details              JSON          NULL,
  observations               TEXT          NULL,
  requested_drivers          JSON          NULL,
  driver_estimates           JSON          NULL,
  waypoints                  JSON          NULL,
  coords                     JSON          NULL,
  booking_date               DATETIME(6)   NULL,
  booking_type               VARCHAR(100)  NULL,
  otp_verified               BOOLEAN       NULL DEFAULT FALSE,
  otp_generated_at           DATETIME(6)   NULL,
  otp_verified_at            DATETIME(6)   NULL,
  otp_timer_started_at       DATETIME(6)   NULL,
  otp_timer_duration         INT           NULL DEFAULT 180,
  car_color                  VARCHAR(255)  NULL,
  request_expires_at         DATETIME(6)   NULL,
  customer_rating            SMALLINT      NULL,
  customer_review            TEXT          NULL,
  min_fare_snapshot          DECIMAL(14,2) NULL,

  PRIMARY KEY (id),
  KEY idx_bookings_customer_id (customer_id),
  KEY idx_bookings_driver_id (driver_id),
  KEY idx_bookings_car_type_id (car_type_id),
  KEY idx_bookings_car_id (car_id),

  CONSTRAINT chk_bookings_status
    CHECK (
      status IS NULL OR status IN (
        'NEW', 'PENDING', 'ACCEPTED', 'STARTED', 'ARRIVED',
        'REACHED', 'COMPLETE', 'PAID', 'CANCELLED'
      )
    ),
  CONSTRAINT chk_bookings_rating
    CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT chk_bookings_customer_rating
    CHECK (customer_rating IS NULL OR customer_rating BETWEEN 1 AND 5),

  CONSTRAINT fk_bookings_customer
    FOREIGN KEY (customer_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_bookings_driver
    FOREIGN KEY (driver_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_bookings_car_type
    FOREIGN KEY (car_type_id) REFERENCES car_types(id),
  CONSTRAINT fk_bookings_car
    FOREIGN KEY (car_id) REFERENCES cars(id)
) ENGINE=InnoDB;

-- Deliberadamente NO se agrega UNIQUE(reference), porque falta en el esquema
-- actual que estamos reproduciendo.

-- ============================================================================
-- SNAPSHOTS DE ETAPAS
-- ============================================================================

CREATE TABLE service_data_snapshots (
  id                CHAR(36)      NOT NULL,
  booking_id        CHAR(36)      NOT NULL,
  stage             VARCHAR(50)   NOT NULL,
  captured_at       DATETIME(6)   NULL,
  driver_id         CHAR(36)      NULL,
  customer_id       CHAR(36)      NULL,
  location_lat      DECIMAL(10,7) NULL,
  location_lng      DECIMAL(10,7) NULL,
  distance_km       DECIMAL(12,3) NULL,
  duration_seconds  INT           NULL,
  price_calculated  DECIMAL(14,2) NULL,
  raw_data          JSON          NULL,
  created_at        DATETIME(6)   NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_snapshot_booking_stage (booking_id, stage),
  KEY idx_snapshots_driver_id (driver_id),
  KEY idx_snapshots_customer_id (customer_id),

  CONSTRAINT chk_snapshot_stage
    CHECK (
      stage IN (
        'created', 'arrival_pickup', 'started',
        'arrival_destination', 'completed', 'paid', 'cancelled'
      )
    ),
  CONSTRAINT fk_snapshots_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_snapshots_driver
    FOREIGN KEY (driver_id) REFERENCES users(id),
  CONSTRAINT fk_snapshots_customer
    FOREIGN KEY (customer_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ============================================================================
-- MEMBRESIAS
-- En Supabase conductor referencia auth.users.id. Para este laboratorio se
-- relaciona con users.auth_id, que representa esa identidad externa.
-- ============================================================================

CREATE TABLE memberships (
  uid              CHAR(36)      NOT NULL,
  conductor        CHAR(36)      NOT NULL,
  status           VARCHAR(100)  NOT NULL DEFAULT 'PENDIENTE',
  costo            DECIMAL(14,2) NOT NULL DEFAULT 157200,
  fecha_inicio     DATE          NOT NULL,
  fecha_terminada  DATE          NOT NULL,
  periodo          INT           NOT NULL DEFAULT 30,
  created_at       DATETIME(6)   NULL,
  updated_at       DATETIME(6)   NULL,

  PRIMARY KEY (uid),
  KEY idx_memberships_conductor (conductor),
  CONSTRAINT fk_memberships_auth_user
    FOREIGN KEY (conductor) REFERENCES users(auth_id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- DATOS FICTICIOS
-- Reproducen algunos problemas observados sin usar información real.
-- ============================================================================

INSERT INTO car_types (
  id, name, description, capacity, is_active, created_at
) VALUES
  ('10000000-0000-0000-0000-000000000001', 'ConfortPlus', 'Categoría de confort', 4, TRUE, NOW(6)),
  ('10000000-0000-0000-0000-000000000002', 'TaxiPlus',    'Taxi tipo sedán',      4, TRUE, NOW(6)),
  ('10000000-0000-0000-0000-000000000003', 'VanPlus',     'Van de pasajeros',     10, TRUE, NOW(6)),
  ('10000000-0000-0000-0000-000000000004', 'XPlus',       'Vehículo particular',  4, TRUE, NOW(6));

INSERT INTO users (
  id, auth_id, email, first_name, last_name, user_type,
  approved, is_active, created_at
) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'cliente.lab@example.com',
    'Cliente', 'Laboratorio', 'customer',
    TRUE, TRUE, NOW(6)
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'conductor.uno@example.com',
    'Conductor', 'Uno', 'driver',
    TRUE, TRUE, NOW(6)
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000003',
    'conductor.dos@example.com',
    'Conductor', 'Dos', 'driver',
    TRUE, TRUE, NOW(6)
  );

-- Duplicación intencional: la misma placa pertenece a dos conductores.
INSERT INTO cars (
  id, driver_id, make, model, color, plate,
  capacity, is_active, service_type, created_at, updated_at
) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002',
    'Marca Demo', 'Modelo A', 'Negro', 'ABC123',
    4, TRUE, 'servicio_especial', NOW(6), NOW(6)
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000003',
    'Otra Marca', 'Modelo B', 'Blanco', 'ABC123',
    4, TRUE, 'servicio_especial', NOW(6), NOW(6)
  );

-- Reserva moderna parcialmente consistente: tiene categoría oficial y carro.
INSERT INTO bookings (
  id, customer_id, customer, driver_id, driver,
  car_type_id, car_type, car_id, status,
  pickup_location, destination_location,
  pickup_address, drop_address, plate_number,
  price, estimate, trip_cost, total_cost,
  reference, created_at, updated_at
) VALUES (
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000001',
  'ConfortPlus',
  '30000000-0000-0000-0000-000000000001',
  'COMPLETE',
  JSON_OBJECT('address', 'Origen ficticio', 'lat', 4.6000000, 'lng', -74.0800000),
  JSON_OBJECT('address', 'Destino ficticio', 'lat', 4.6500000, 'lng', -74.1000000),
  'Origen ficticio',
  'Destino ficticio',
  'ABC123',
  20000, 20000, 20000, 20000,
  'LAB-0001', NOW(6), NOW(6)
);

-- Reserva heredada: categoría textual sin FK y sin conductor/vehículo.
INSERT INTO bookings (
  id, customer_id, customer,
  car_type_id, car_type, car_id, status,
  pickup_location, destination_location,
  pickup_address, drop_address,
  price, estimate, reference, observations,
  created_at, updated_at
) VALUES (
  '40000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  NULL,
  'servicio_especial',
  NULL,
  'CANCELLED',
  JSON_OBJECT('address', 'Origen heredado', 'lat', 4.6100000, 'lng', -74.0900000),
  JSON_OBJECT('address', 'Destino heredado', 'lat', 4.6200000, 'lng', -74.1100000),
  'Origen heredado',
  'Destino heredado',
  15000, 15000, 'LAB-0002', 'Reserva ficticia para estudiar el modelo',
  NOW(6), NOW(6)
);

-- Reserva inconsistente: driver_id informado y driver heredado nulo.
INSERT INTO bookings (
  id, customer_id, customer, driver_id, driver,
  car_type_id, car_type, car_id, status,
  pickup_location, destination_location,
  plate_number, driver_name,
  price, reference, created_at, updated_at
) VALUES (
  '40000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  NULL,
  '10000000-0000-0000-0000-000000000001',
  'servicio_especial',
  NULL,
  'CANCELLED',
  JSON_OBJECT('address', 'Origen de prueba'),
  JSON_OBJECT('address', 'Destino de prueba'),
  'ABC123',
  'Conductor Uno',
  18000, 'LAB-0003', NOW(6), NOW(6)
);

INSERT INTO service_data_snapshots (
  id, booking_id, stage, captured_at,
  driver_id, customer_id, price_calculated, raw_data, created_at
) VALUES (
  '50000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'completed',
  NOW(6),
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  20000,
  JSON_OBJECT(
    'status_from', 'REACHED',
    'status_to', 'COMPLETE',
    'category', 'ConfortPlus'
  ),
  NOW(6)
);

-- ============================================================================
-- CONSULTAS UTILES EN WORKBENCH
-- ============================================================================

-- Ver columnas repetidas de reservas:
-- SELECT id, customer_id, customer, driver_id, driver,
--        car_type_id, car_type, car_id,
--        vehicle_number, plate_number,
--        vehicle_model, car_model,
--        vehicle_color, car_color
-- FROM bookings;

-- Ver placas duplicadas normalizando espacios y guiones:
-- SELECT
--   UPPER(REPLACE(REPLACE(plate, ' ', ''), '-', '')) AS normalized_plate,
--   COUNT(*) AS records,
--   COUNT(DISTINCT driver_id) AS owners
-- FROM cars
-- GROUP BY normalized_plate
-- HAVING COUNT(*) > 1;

-- Ver categorías textuales sin relación oficial:
-- SELECT car_type, COUNT(*) AS bookings
-- FROM bookings
-- WHERE car_type_id IS NULL
-- GROUP BY car_type;

-- ============================================================================
-- AUTOMATISMOS REALES NO REPLICADOS EN MYSQL
-- ============================================================================
-- Supabase/PostgreSQL contiene actualmente triggers para:
--   - generar OTP antes de INSERT;
--   - generar referencia antes de INSERT;
--   - recalcular total_cost antes de INSERT/UPDATE;
--   - completar datos del vehículo cuando cambia `driver`;
--   - crear snapshots al insertar/cambiar status;
--   - notificar nuevas reservas;
--   - enviar resumen HTTP después de UPDATE;
--   - actualizar updated_at mediante dos triggers redundantes.
--
-- También contiene RLS. MySQL no ofrece un equivalente directo a las políticas
-- de fila de PostgreSQL, por lo que no se simulan en este laboratorio.
