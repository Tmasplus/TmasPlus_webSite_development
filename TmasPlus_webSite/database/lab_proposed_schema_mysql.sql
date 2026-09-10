-- ============================================================================
-- TmasPlus - laboratorio del esquema PROPUESTO (MySQL 8 / MySQL Workbench)
-- ============================================================================
-- Objetivo:
--   Visualizar una estructura normalizada que resuelva las redundancias y
--   ambigüedades detectadas en el esquema actual de Supabase.
--
-- IMPORTANTE:
--   1. Supabase usa PostgreSQL; este archivo es una adaptación para MySQL 8.
--   2. No es todavía una migración para producción.
--   3. No contiene datos reales, credenciales, RLS ni llamadas externas.
--   4. El script recrea solamente la base aislada `tmasplus_proposed_lab`.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS tmasplus_proposed_lab
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE tmasplus_proposed_lab;

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS current_booking_assignments;
DROP VIEW IF EXISTS current_driver_vehicles;
DROP TABLE IF EXISTS outbox_events;
DROP TABLE IF EXISTS booking_access_codes;
DROP TABLE IF EXISTS service_data_snapshots;
DROP TABLE IF EXISTS booking_status_events;
DROP TABLE IF EXISTS booking_fares;
DROP TABLE IF EXISTS booking_assignments;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS driver_vehicle_assignments;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS car_types;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 1. USUARIOS
-- Una identidad interna (id) y una identidad de autenticación (auth_id).
-- La aplicación siempre relaciona datos mediante users.id.
-- auth.uid() se traduce a users.id en la capa de autorización.
-- ============================================================================

CREATE TABLE users (
  id                CHAR(36)      NOT NULL,
  auth_id           CHAR(36)      NOT NULL,
  email             VARCHAR(255)  NOT NULL,
  first_name        VARCHAR(120)  NOT NULL,
  last_name         VARCHAR(120)  NOT NULL,
  mobile            VARCHAR(30)   NULL,
  user_type         VARCHAR(30)   NOT NULL,
  city              VARCHAR(120)  NULL,
  profile_image     TEXT          NULL,
  rating            DECIMAL(3,2)  NULL,
  approved          BOOLEAN       NOT NULL DEFAULT FALSE,
  blocked           BOOLEAN       NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN       NOT NULL DEFAULT TRUE,
  deleted_at        DATETIME(6)   NULL,
  created_at        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                  ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_auth_id (auth_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_type_active (user_type, is_active),

  CONSTRAINT chk_users_type
    CHECK (user_type IN ('customer', 'driver', 'admin')),
  CONSTRAINT chk_users_rating
    CHECK (rating IS NULL OR rating BETWEEN 0 AND 5)
) ENGINE=InnoDB;

-- ============================================================================
-- 2. CATALOGO OFICIAL DE CATEGORIAS
-- Es la única fuente de nombres, disponibilidad y configuración comercial.
-- Las tarifas históricas se copian a booking_fares para que no cambien viajes
-- anteriores al editar este catálogo.
-- ============================================================================

CREATE TABLE car_types (
  id                         CHAR(36)      NOT NULL,
  code                       VARCHAR(50)   NOT NULL,
  name                       VARCHAR(120)  NOT NULL,
  description                TEXT          NULL,
  image                      TEXT          NULL,
  capacity                   INT           NOT NULL,
  base_price                 DECIMAL(14,2) NOT NULL DEFAULT 0,
  price_per_km               DECIMAL(14,2) NOT NULL DEFAULT 0,
  base_price_inter           DECIMAL(14,2) NOT NULL DEFAULT 0,
  price_per_km_inter         DECIMAL(14,2) NOT NULL DEFAULT 0,
  rate_per_hour              DECIMAL(14,2) NOT NULL DEFAULT 0,
  rate_per_hour_inter        DECIMAL(14,2) NOT NULL DEFAULT 0,
  min_fare                   DECIMAL(14,2) NOT NULL DEFAULT 0,
  min_fare_inter             DECIMAL(14,2) NOT NULL DEFAULT 0,
  airport_surcharge          DECIMAL(14,2) NOT NULL DEFAULT 0,
  scheduled_airport_surcharge DECIMAL(14,2) NOT NULL DEFAULT 0,
  convenience_fee           DECIMAL(14,2) NOT NULL DEFAULT 0,
  convenience_fee_type      VARCHAR(20)   NOT NULL DEFAULT 'fixed',
  intermunicipal_threshold_km DECIMAL(10,2) NOT NULL DEFAULT 0,
  is_active                  BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at                 DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at                 DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                           ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_car_types_code (code),
  UNIQUE KEY uq_car_types_name (name),

  CONSTRAINT chk_car_types_capacity
    CHECK (capacity > 0),
  CONSTRAINT chk_convenience_fee_type
    CHECK (convenience_fee_type IN ('fixed', 'percentage'))
) ENGINE=InnoDB;

-- ============================================================================
-- 3. VEHICULOS
-- El vehículo físico existe una sola vez, independientemente de su conductor.
-- normalized_plate debe guardarse sin espacios, guiones ni minúsculas.
-- La restricción UNIQUE impide que dos personas registren el mismo vehículo.
-- ============================================================================

CREATE TABLE vehicles (
  id                            CHAR(36)     NOT NULL,
  display_plate                 VARCHAR(20)  NOT NULL,
  normalized_plate              VARCHAR(20)  NOT NULL,
  make                          VARCHAR(120) NOT NULL,
  model                         VARCHAR(120) NOT NULL,
  color                         VARCHAR(80)  NULL,
  capacity                      INT          NOT NULL,
  car_type_id                   CHAR(36)     NOT NULL,
  fuel_type                     VARCHAR(50)  NULL,
  transmission                  VARCHAR(50)  NULL,
  features                      JSON         NULL,
  image_front                   TEXT         NULL,
  image_back                    TEXT         NULL,
  soat_image                    TEXT         NULL,
  soat_expiry_date              DATE         NULL,
  registration_card_image       TEXT         NULL,
  registration_card_back_image  TEXT         NULL,
  inspection_image              TEXT         NULL,
  inspection_expiry_date        DATE         NULL,
  is_active                     BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at                    DATETIME(6)  NULL,
  created_at                    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at                    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                             ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_vehicles_normalized_plate (normalized_plate),
  KEY idx_vehicles_car_type (car_type_id),
  KEY idx_vehicles_active (is_active),

  CONSTRAINT fk_vehicles_car_type
    FOREIGN KEY (car_type_id) REFERENCES car_types(id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_vehicles_capacity
    CHECK (capacity > 0),
  CONSTRAINT chk_normalized_plate
    CHECK (
      normalized_plate = UPPER(normalized_plate)
      AND normalized_plate NOT LIKE '% %'
      AND normalized_plate NOT LIKE '%-%'
    )
) ENGINE=InnoDB;

-- ============================================================================
-- 4. HISTORIAL CONDUCTOR - VEHICULO
-- Se puede transferir un vehículo sin duplicarlo.
-- active_vehicle_key garantiza un solo conductor vigente por vehículo.
-- active_primary_driver_key garantiza un solo vehículo principal por conductor.
-- Un conductor sí puede tener varios vehículos, pero solo uno principal.
-- ============================================================================

CREATE TABLE driver_vehicle_assignments (
  id                         CHAR(36)    NOT NULL,
  driver_id                  CHAR(36)    NOT NULL,
  vehicle_id                 CHAR(36)    NOT NULL,
  valid_from                 DATETIME(6) NOT NULL,
  valid_until                DATETIME(6) NULL,
  is_primary                 BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_by                CHAR(36)    NULL,
  reason                     VARCHAR(255) NULL,
  created_at                 DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  active_vehicle_key CHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN valid_until IS NULL THEN vehicle_id ELSE NULL END
    ) STORED,

  active_primary_driver_key CHAR(36)
    GENERATED ALWAYS AS (
      CASE
        WHEN valid_until IS NULL AND is_primary = TRUE THEN driver_id
        ELSE NULL
      END
    ) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uq_active_vehicle_owner (active_vehicle_key),
  UNIQUE KEY uq_active_primary_vehicle (active_primary_driver_key),
  KEY idx_driver_vehicle_history (driver_id, valid_from, valid_until),
  KEY idx_vehicle_driver_history (vehicle_id, valid_from, valid_until),

  CONSTRAINT fk_driver_vehicle_driver
    FOREIGN KEY (driver_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_driver_vehicle_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_driver_vehicle_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_driver_vehicle_dates
    CHECK (valid_until IS NULL OR valid_until > valid_from)
) ENGINE=InnoDB;

-- ============================================================================
-- 5. MEMBRESIAS
-- Relacionadas con users.id, no directamente con la identidad auth externa.
-- ============================================================================

CREATE TABLE memberships (
  id          CHAR(36)      NOT NULL,
  driver_id   CHAR(36)      NOT NULL,
  status      VARCHAR(30)   NOT NULL DEFAULT 'PENDING',
  amount      DECIMAL(14,2) NOT NULL,
  starts_on   DATE          NOT NULL,
  ends_on     DATE          NOT NULL,
  period_days INT           NOT NULL DEFAULT 30,
  created_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at  DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                              ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  KEY idx_memberships_driver_dates (driver_id, starts_on, ends_on),

  CONSTRAINT fk_memberships_driver
    FOREIGN KEY (driver_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_membership_status
    CHECK (status IN ('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT chk_membership_dates
    CHECK (ends_on >= starts_on),
  CONSTRAINT chk_membership_period
    CHECK (period_days > 0)
) ENGINE=InnoDB;

-- ============================================================================
-- 6. RESERVAS
-- Contiene la solicitud y su estado actual.
-- No duplica customer/customer_id ni driver/driver_id.
-- La asignación de conductor y vehículo vive en booking_assignments.
-- ============================================================================

CREATE TABLE bookings (
  id                      CHAR(36)      NOT NULL,
  reference               VARCHAR(40)   NOT NULL,
  idempotency_key         VARCHAR(100)  NOT NULL,
  customer_id             CHAR(36)      NOT NULL,
  requested_car_type_id   CHAR(36)      NOT NULL,
  status                  VARCHAR(30)   NOT NULL DEFAULT 'NEW',
  booking_type            VARCHAR(30)   NOT NULL DEFAULT 'immediate',
  scheduled_at            DATETIME(6)   NULL,

  pickup_address          TEXT          NOT NULL,
  pickup_lat              DECIMAL(10,7) NOT NULL,
  pickup_lng              DECIMAL(10,7) NOT NULL,
  dropoff_address         TEXT          NOT NULL,
  dropoff_lat             DECIMAL(10,7) NOT NULL,
  dropoff_lng             DECIMAL(10,7) NOT NULL,
  waypoints               JSON          NULL,

  estimated_distance_km   DECIMAL(12,3) NULL,
  estimated_duration_sec  INT           NULL,
  observations            TEXT          NULL,
  payment_mode            VARCHAR(30)   NULL,
  cancelled_by_user_id    CHAR(36)      NULL,
  cancellation_reason     TEXT          NULL,
  scheduled_request_expires_at DATETIME(6) NULL,

  created_at              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at              DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                          ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_reference (reference),
  UNIQUE KEY uq_bookings_idempotency (idempotency_key),
  KEY idx_bookings_customer_created (customer_id, created_at),
  KEY idx_bookings_category (requested_car_type_id),
  KEY idx_bookings_status_created (status, created_at),
  KEY idx_bookings_scheduled (scheduled_at),

  CONSTRAINT fk_bookings_customer
    FOREIGN KEY (customer_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_requested_category
    FOREIGN KEY (requested_car_type_id) REFERENCES car_types(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_cancelled_by
    FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_bookings_status
    CHECK (
      status IN (
        'NEW', 'PENDING', 'ACCEPTED', 'ARRIVED',
        'STARTED', 'REACHED', 'COMPLETE', 'PAID', 'CANCELLED'
      )
    ),
  CONSTRAINT chk_booking_type
    CHECK (booking_type IN ('immediate', 'scheduled')),
  CONSTRAINT chk_booking_schedule
    CHECK (
      (booking_type = 'immediate')
      OR (booking_type = 'scheduled' AND scheduled_at IS NOT NULL)
    ),
  CONSTRAINT chk_pickup_lat
    CHECK (pickup_lat BETWEEN -90 AND 90),
  CONSTRAINT chk_pickup_lng
    CHECK (pickup_lng BETWEEN -180 AND 180),
  CONSTRAINT chk_dropoff_lat
    CHECK (dropoff_lat BETWEEN -90 AND 90),
  CONSTRAINT chk_dropoff_lng
    CHECK (dropoff_lng BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- ============================================================================
-- 7. HISTORIAL DE ASIGNACIONES DE RESERVA
-- Conserva reasignaciones. Nunca es necesario sobrescribir un conductor viejo.
-- active_booking_key permite una sola asignación vigente por reserva.
-- Los campos *_snapshot preservan lo que vio el usuario durante ese servicio.
-- ============================================================================

CREATE TABLE booking_assignments (
  id                       CHAR(36)     NOT NULL,
  booking_id               CHAR(36)     NOT NULL,
  driver_id                CHAR(36)     NOT NULL,
  vehicle_id               CHAR(36)     NOT NULL,
  assigned_at              DATETIME(6)  NOT NULL,
  accepted_at              DATETIME(6)  NULL,
  unassigned_at            DATETIME(6)  NULL,
  assignment_status        VARCHAR(30)  NOT NULL DEFAULT 'assigned',
  assigned_by              CHAR(36)     NULL,
  unassignment_reason      TEXT         NULL,

  driver_name_snapshot     VARCHAR(255) NULL,
  driver_contact_snapshot  VARCHAR(50)  NULL,
  vehicle_plate_snapshot   VARCHAR(20)  NOT NULL,
  vehicle_make_snapshot    VARCHAR(120) NULL,
  vehicle_model_snapshot   VARCHAR(120) NULL,
  vehicle_color_snapshot   VARCHAR(80)  NULL,
  car_type_name_snapshot   VARCHAR(120) NOT NULL,

  created_at               DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  active_booking_key CHAR(36)
    GENERATED ALWAYS AS (
      CASE WHEN unassigned_at IS NULL THEN booking_id ELSE NULL END
    ) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uq_active_booking_assignment (active_booking_key),
  KEY idx_assignment_booking_history (booking_id, assigned_at),
  KEY idx_assignment_driver (driver_id, assigned_at),
  KEY idx_assignment_vehicle (vehicle_id, assigned_at),

  CONSTRAINT fk_assignment_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_assignment_driver
    FOREIGN KEY (driver_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_assigned_by
    FOREIGN KEY (assigned_by) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_assignment_status
    CHECK (
      assignment_status IN (
        'offered', 'assigned', 'accepted', 'rejected',
        'released', 'cancelled'
      )
    ),
  CONSTRAINT chk_assignment_dates
    CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
) ENGINE=InnoDB;

-- ============================================================================
-- 8. TARIFA Y SNAPSHOT ECONOMICO
-- Una fila por reserva. Separa estimación, resultado final y reglas aplicadas.
-- ============================================================================

CREATE TABLE booking_fares (
  id                       CHAR(36)      NOT NULL,
  booking_id               CHAR(36)      NOT NULL,
  currency                 CHAR(3)       NOT NULL DEFAULT 'COP',
  estimated_fare           DECIMAL(14,2) NOT NULL DEFAULT 0,
  base_fare                DECIMAL(14,2) NOT NULL DEFAULT 0,
  distance_fare            DECIMAL(14,2) NOT NULL DEFAULT 0,
  time_fare                DECIMAL(14,2) NOT NULL DEFAULT 0,
  convenience_fee          DECIMAL(14,2) NOT NULL DEFAULT 0,
  airport_surcharge        DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount          DECIMAL(14,2) NOT NULL DEFAULT 0,
  final_fare               DECIMAL(14,2) NULL,
  driver_earnings          DECIMAL(14,2) NULL,
  tariff_snapshot          JSON          NOT NULL,
  calculated_at            DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  finalized_at             DATETIME(6)   NULL,
  created_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at               DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
                                           ON UPDATE CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_fare (booking_id),

  CONSTRAINT fk_fare_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_fare_non_negative
    CHECK (
      estimated_fare >= 0
      AND base_fare >= 0
      AND distance_fare >= 0
      AND time_fare >= 0
      AND convenience_fee >= 0
      AND airport_surcharge >= 0
      AND discount_amount >= 0
      AND (final_fare IS NULL OR final_fare >= 0)
    )
) ENGINE=InnoDB;

-- ============================================================================
-- 9. EVENTOS DE ESTADO
-- Historial inmutable de cada transición. El estado actual sigue en bookings
-- para consultas rápidas, pero debe cambiarse transaccionalmente junto al evento.
-- ============================================================================

CREATE TABLE booking_status_events (
  id             CHAR(36)     NOT NULL,
  booking_id     CHAR(36)     NOT NULL,
  from_status    VARCHAR(30)  NULL,
  to_status      VARCHAR(30)  NOT NULL,
  changed_by     CHAR(36)     NULL,
  source         VARCHAR(30)  NOT NULL,
  reason         TEXT         NULL,
  metadata       JSON         NULL,
  occurred_at    DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  KEY idx_status_events_booking (booking_id, occurred_at),
  KEY idx_status_events_target (to_status, occurred_at),

  CONSTRAINT fk_status_event_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_status_event_user
    FOREIGN KEY (changed_by) REFERENCES users(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_status_event_source
    CHECK (source IN ('web', 'app', 'admin', 'system', 'migration'))
) ENGINE=InnoDB;

-- ============================================================================
-- 10. SNAPSHOTS OPERATIVOS
-- Se conservan para analítica/telemetría, utilizando assignment_id para saber
-- exactamente qué conductor y vehículo aplicaban en esa etapa.
-- ============================================================================

CREATE TABLE service_data_snapshots (
  id                CHAR(36)      NOT NULL,
  booking_id        CHAR(36)      NOT NULL,
  assignment_id     CHAR(36)      NULL,
  stage             VARCHAR(30)   NOT NULL,
  captured_at       DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  location_lat      DECIMAL(10,7) NULL,
  location_lng      DECIMAL(10,7) NULL,
  distance_km       DECIMAL(12,3) NULL,
  duration_seconds  INT           NULL,
  price_calculated  DECIMAL(14,2) NULL,
  raw_data          JSON          NULL,
  created_at        DATETIME(6)   NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_snapshot_booking_stage (booking_id, stage),
  KEY idx_snapshots_assignment (assignment_id),
  KEY idx_snapshots_captured (captured_at),

  CONSTRAINT fk_snapshot_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_snapshot_assignment
    FOREIGN KEY (assignment_id) REFERENCES booking_assignments(id)
    ON DELETE SET NULL,
  CONSTRAINT chk_snapshot_stage
    CHECK (
      stage IN (
        'created', 'arrival_pickup', 'started',
        'arrival_destination', 'completed', 'paid', 'cancelled'
      )
    )
) ENGINE=InnoDB;

-- ============================================================================
-- 11. CODIGOS DE ACCESO / OTP
-- Se almacena hash, no el código plano. Se genera al iniciar el servicio.
-- ============================================================================

CREATE TABLE booking_access_codes (
  id               CHAR(36)     NOT NULL,
  booking_id       CHAR(36)     NOT NULL,
  code_hash        VARCHAR(255) NOT NULL,
  generated_at     DATETIME(6)  NOT NULL,
  expires_at       DATETIME(6)  NOT NULL,
  verified_at      DATETIME(6)  NULL,
  failed_attempts  INT          NOT NULL DEFAULT 0,
  max_attempts     INT          NOT NULL DEFAULT 5,
  invalidated_at   DATETIME(6)  NULL,

  active_booking_key CHAR(36)
    GENERATED ALWAYS AS (
      CASE
        WHEN verified_at IS NULL AND invalidated_at IS NULL THEN booking_id
        ELSE NULL
      END
    ) STORED,

  PRIMARY KEY (id),
  UNIQUE KEY uq_active_booking_access_code (active_booking_key),
  KEY idx_access_code_expiry (expires_at),

  CONSTRAINT fk_access_code_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
    ON DELETE CASCADE,
  CONSTRAINT chk_access_code_dates
    CHECK (expires_at > generated_at),
  CONSTRAINT chk_access_code_attempts
    CHECK (
      failed_attempts >= 0
      AND max_attempts > 0
      AND failed_attempts <= max_attempts
    )
) ENGINE=InnoDB;

-- ============================================================================
-- 12. OUTBOX DE EVENTOS EXTERNOS
-- Evita llamadas HTTP directas desde triggers y permite reintentos idempotentes.
-- ============================================================================

CREATE TABLE outbox_events (
  id               CHAR(36)     NOT NULL,
  aggregate_type   VARCHAR(50)  NOT NULL,
  aggregate_id     CHAR(36)     NOT NULL,
  event_type       VARCHAR(100) NOT NULL,
  idempotency_key  VARCHAR(150) NOT NULL,
  payload          JSON         NOT NULL,
  status           VARCHAR(20)  NOT NULL DEFAULT 'pending',
  attempts         INT          NOT NULL DEFAULT 0,
  available_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  processed_at     DATETIME(6)  NULL,
  last_error       TEXT         NULL,
  created_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

  PRIMARY KEY (id),
  UNIQUE KEY uq_outbox_idempotency (idempotency_key),
  KEY idx_outbox_pending (status, available_at),

  CONSTRAINT chk_outbox_status
    CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  CONSTRAINT chk_outbox_attempts
    CHECK (attempts >= 0)
) ENGINE=InnoDB;

-- ============================================================================
-- VISTAS DE CONVENIENCIA
-- Facilitan consultar el estado actual sin duplicarlo en bookings o vehicles.
-- ============================================================================

CREATE VIEW current_driver_vehicles AS
SELECT
  dva.id AS driver_vehicle_assignment_id,
  dva.driver_id,
  dva.vehicle_id,
  dva.is_primary,
  dva.valid_from
FROM driver_vehicle_assignments dva
WHERE dva.valid_until IS NULL;

CREATE VIEW current_booking_assignments AS
SELECT
  ba.id AS booking_assignment_id,
  ba.booking_id,
  ba.driver_id,
  ba.vehicle_id,
  ba.assignment_status,
  ba.assigned_at,
  ba.accepted_at,
  ba.driver_name_snapshot,
  ba.vehicle_plate_snapshot,
  ba.car_type_name_snapshot
FROM booking_assignments ba
WHERE ba.unassigned_at IS NULL;

-- ============================================================================
-- DATOS FICTICIOS COHERENTES
-- ============================================================================

INSERT INTO car_types (
  id, code, name, description, capacity,
  base_price, price_per_km, is_active
) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'CONFORT_PLUS', 'ConfortPlus', 'Categoría de confort',
    4, 10800, 660, TRUE
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'TAXI_PLUS', 'TaxiPlus', 'Taxi tipo sedán',
    4, 4920, 540, TRUE
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'VAN_PLUS', 'VanPlus', 'Van de pasajeros',
    10, 30000, 390, TRUE
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'X_PLUS', 'XPlus', 'Vehículo particular',
    4, 4800, 20.80, TRUE
  );

INSERT INTO users (
  id, auth_id, email, first_name, last_name, mobile,
  user_type, approved, is_active
) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'cliente.lab@example.com',
    'Cliente', 'Laboratorio', '3000000001',
    'customer', TRUE, TRUE
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'conductor.uno@example.com',
    'Conductor', 'Uno', '3000000002',
    'driver', TRUE, TRUE
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '21000000-0000-0000-0000-000000000003',
    'admin.lab@example.com',
    'Administrador', 'Laboratorio', '3000000003',
    'admin', TRUE, TRUE
  );

-- La placa solo se registra una vez.
INSERT INTO vehicles (
  id, display_plate, normalized_plate,
  make, model, color, capacity, car_type_id, is_active
) VALUES (
  '30000000-0000-0000-0000-000000000001',
  'ABC 123',
  'ABC123',
  'Marca Demo',
  'Modelo A',
  'Negro',
  4,
  '10000000-0000-0000-0000-000000000001',
  TRUE
);

-- El historial permite saber desde cuándo el conductor tiene el vehículo.
INSERT INTO driver_vehicle_assignments (
  id, driver_id, vehicle_id, valid_from,
  is_primary, assigned_by, reason
) VALUES (
  '31000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  NOW(6),
  TRUE,
  '20000000-0000-0000-0000-000000000003',
  'Registro inicial de laboratorio'
);

INSERT INTO bookings (
  id, reference, idempotency_key,
  customer_id, requested_car_type_id,
  status, booking_type,
  pickup_address, pickup_lat, pickup_lng,
  dropoff_address, dropoff_lat, dropoff_lng,
  estimated_distance_km, estimated_duration_sec,
  observations, payment_mode
) VALUES (
  '40000000-0000-0000-0000-000000000001',
  'LAB-0001',
  'lab-create-booking-0001',
  '20000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'ACCEPTED',
  'immediate',
  'Origen ficticio',
  4.6000000,
  -74.0800000,
  'Destino ficticio',
  4.6500000,
  -74.1000000,
  8.50,
  1200,
  'Reserva coherente del modelo propuesto',
  'cash'
);

INSERT INTO booking_assignments (
  id, booking_id, driver_id, vehicle_id,
  assigned_at, accepted_at, assignment_status, assigned_by,
  driver_name_snapshot, driver_contact_snapshot,
  vehicle_plate_snapshot, vehicle_make_snapshot,
  vehicle_model_snapshot, vehicle_color_snapshot,
  car_type_name_snapshot
) VALUES (
  '41000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  NOW(6),
  NOW(6),
  'accepted',
  '20000000-0000-0000-0000-000000000003',
  'Conductor Uno',
  '3000000002',
  'ABC 123',
  'Marca Demo',
  'Modelo A',
  'Negro',
  'ConfortPlus'
);

INSERT INTO booking_fares (
  id, booking_id, estimated_fare,
  base_fare, distance_fare, convenience_fee,
  discount_amount, tariff_snapshot
) VALUES (
  '42000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  20000,
  10800,
  5610,
  0,
  0,
  JSON_OBJECT(
    'car_type_id', '10000000-0000-0000-0000-000000000001',
    'car_type_name', 'ConfortPlus',
    'base_price', 10800,
    'price_per_km', 660
  )
);

INSERT INTO booking_status_events (
  id, booking_id, from_status, to_status,
  changed_by, source, metadata, occurred_at
) VALUES
  (
    '43000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001',
    NULL,
    'NEW',
    '20000000-0000-0000-0000-000000000001',
    'web',
    JSON_OBJECT('message', 'Reserva creada'),
    NOW(6)
  ),
  (
    '43000000-0000-0000-0000-000000000002',
    '40000000-0000-0000-0000-000000000001',
    'NEW',
    'ACCEPTED',
    '20000000-0000-0000-0000-000000000002',
    'app',
    JSON_OBJECT('message', 'Conductor aceptó la reserva'),
    NOW(6)
  );

INSERT INTO service_data_snapshots (
  id, booking_id, assignment_id, stage,
  location_lat, location_lng,
  distance_km, price_calculated, raw_data
) VALUES (
  '44000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'created',
  4.6000000,
  -74.0800000,
  8.50,
  20000,
  JSON_OBJECT('source', 'web')
);

-- El OTP no se inserta porque el servicio todavía está en ACCEPTED.
-- Se crearía al cambiar transaccionalmente a STARTED.

INSERT INTO outbox_events (
  id, aggregate_type, aggregate_id,
  event_type, idempotency_key, payload
) VALUES (
  '45000000-0000-0000-0000-000000000001',
  'booking',
  '40000000-0000-0000-0000-000000000001',
  'booking.accepted',
  'booking:40000000-0000-0000-0000-000000000001:accepted',
  JSON_OBJECT(
    'booking_id', '40000000-0000-0000-0000-000000000001',
    'reference', 'LAB-0001'
  )
);

-- ============================================================================
-- CONSULTAS PARA ENTENDER EL MODELO
-- ============================================================================

-- Reserva con categoría, asignación, conductor y vehículo actuales:
-- SELECT
--   b.reference,
--   b.status,
--   CONCAT(cu.first_name, ' ', cu.last_name) AS customer,
--   ct.name AS requested_category,
--   CONCAT(dr.first_name, ' ', dr.last_name) AS driver,
--   v.display_plate,
--   v.make,
--   v.model
-- FROM bookings b
-- JOIN users cu ON cu.id = b.customer_id
-- JOIN car_types ct ON ct.id = b.requested_car_type_id
-- LEFT JOIN current_booking_assignments cba ON cba.booking_id = b.id
-- LEFT JOIN users dr ON dr.id = cba.driver_id
-- LEFT JOIN vehicles v ON v.id = cba.vehicle_id;

-- Historial de cambios de estado:
-- SELECT b.reference, e.from_status, e.to_status, e.source, e.occurred_at
-- FROM booking_status_events e
-- JOIN bookings b ON b.id = e.booking_id
-- ORDER BY e.occurred_at;

-- Historial de propietarios/conductores del vehículo:
-- SELECT
--   v.display_plate,
--   CONCAT(u.first_name, ' ', u.last_name) AS driver,
--   dva.valid_from,
--   dva.valid_until
-- FROM driver_vehicle_assignments dva
-- JOIN vehicles v ON v.id = dva.vehicle_id
-- JOIN users u ON u.id = dva.driver_id
-- ORDER BY v.normalized_plate, dva.valid_from;

-- ============================================================================
-- REGLAS QUE LA MIGRACION REAL DE POSTGRESQL DEBERA IMPLEMENTAR
-- ============================================================================
-- 1. Cambiar estado, insertar booking_status_events y crear outbox_events en
--    una sola transacción/RPC.
-- 2. Validar que driver_id sea conductor aprobado y activo.
-- 3. Validar que vehicle_id pertenezca actualmente al conductor.
-- 4. Generar booking_access_codes solamente al pasar a STARTED.
-- 5. Guardar hash del OTP y verificarlo mediante una función segura.
-- 6. Normalizar la placa antes de INSERT/UPDATE y aplicar unicidad global.
-- 7. Finalizar la asignación anterior antes de reasignar una reserva.
-- 8. Impedir cambios tarifarios después de finalizar el viaje, salvo proceso
--    administrativo auditado.
-- 9. Crear políticas RLS usando users.auth_id como puente hacia users.id.
-- 10. Procesar outbox_events con reintentos e idempotencia, sin secretos en SQL.
