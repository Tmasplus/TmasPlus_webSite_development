-- Sanitized schema-only baseline from CTO_db_tmasplus-desarrollo.
-- Contains no table rows and omits external HTTP triggers/secrets.
-- Test/staging use only.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.4
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'Esquema principal para la aplicación T+Plus - Sistema de transporte urbano';


--
-- Name: service_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_stage AS ENUM (
    'created',
    'arrival_pickup',
    'started',
    'arrival_destination',
    'completed',
    'paid',
    'cancelled'
);


--
-- Name: app_is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_id::text = auth.uid()::text AND user_type = 'admin') $$;


--
-- Name: app_is_driver(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_is_driver() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.users WHERE auth_id::text = auth.uid()::text AND user_type = 'driver') $$;


--
-- Name: app_owns_booking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_owns_booking(bid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = bid AND (b.customer = public.app_user_id() OR b.driver = public.app_user_id())) $$;


--
-- Name: app_tracking_driver_ok(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_tracking_driver_ok(bid uuid, did uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = bid AND b.driver = did) $$;


--
-- Name: app_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.app_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ SELECT id FROM public.users WHERE auth_id::text = auth.uid()::text LIMIT 1 $$;


--
-- Name: assign_referral_code_on_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_referral_code_on_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_new_code VARCHAR(10);
  v_already_has_code BOOLEAN;
BEGIN
  -- Verificar que el usuario acaba de ser aprobado y es conductor
  IF NEW.approved = TRUE AND OLD.approved = FALSE AND NEW.user_type = 'driver' THEN
    
    -- 🚨 VALIDACIÓN CRÍTICA: ¿Ya tiene código?
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE driver_id = NEW.id) INTO v_already_has_code;
    
    IF NOT v_already_has_code THEN
      v_new_code := public.generate_unique_referral_code(NEW.first_name);
      
      INSERT INTO public.referral_codes (
        driver_id,
        referral_code,
        is_active,
        total_referrals
      ) VALUES (
        NEW.id,
        v_new_code,
        TRUE,
        0
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: calculate_total_cost(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_total_cost() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.total_cost := GREATEST(
    COALESCE(NEW.trip_cost, 0)
      + COALESCE(NEW.convenience_fees, 0)
      - COALESCE(NEW.discount, 0),
    COALESCE(NEW.min_fare_snapshot, 0)
  );
  RETURN NEW;
END;
$$;


--
-- Name: check_email_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_email_exists(check_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  exists_in_users    BOOLEAN;
  exists_in_auth     BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.users WHERE lower(email) = lower(check_email)
  ) INTO exists_in_users;

  SELECT EXISTS(
    SELECT 1 FROM auth.users WHERE lower(email) = lower(check_email)
  ) INTO exists_in_auth;

  RETURN exists_in_users OR exists_in_auth;
END;
$$;


--
-- Name: check_favorite_places_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_favorite_places_limit() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_count INTEGER;
BEGIN
  IF NEW.is_favorite = true THEN
    SELECT COUNT(*)
      INTO current_count
      FROM public.favorite_places
     WHERE user_id = NEW.user_id
       AND is_favorite = true;

    IF current_count >= 5 THEN
      RAISE EXCEPTION 'Límite alcanzado: máximo 5 lugares favoritos por usuario.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: check_phone_exists(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_phone_exists(check_phone text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  normalized TEXT := regexp_replace(check_phone, '\D', '', 'g');
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM public.users
    WHERE regexp_replace(COALESCE(mobile,''), '\D', '', 'g') = normalized
      AND normalized <> ''
  );
END;
$$;


--
-- Name: create_referral_on_driver_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_referral_on_driver_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Solo si el conductor fue aprobado y es tipo driver y tiene referral_id
  IF NEW.approved = TRUE 
     AND NEW.user_type = 'driver' 
     AND OLD.approved = FALSE 
     AND NEW.referral_id IS NOT NULL 
     AND NEW.referral_id != '' THEN
    
    -- Obtener el driver_id del conductor que refirió
    SELECT driver_id INTO v_referrer_id
    FROM public.referral_codes
    WHERE referral_code = NEW.referral_id
      AND is_active = TRUE
    LIMIT 1;
    
    -- Si se encontró el código de referido válido
    IF v_referrer_id IS NOT NULL THEN
      -- Crear registro de referido
      INSERT INTO public.referrals (
        referral_code_id,
        referrer_id,
        referred_driver_id,
        referral_code,
        status,
        reward_claimed
      )
      SELECT 
        id,
        driver_id,
        NEW.id,
        referral_code,
        'completed',
        FALSE
      FROM public.referral_codes
      WHERE referral_code = NEW.referral_id
        AND is_active = TRUE
      LIMIT 1;
      
      -- Incrementar contador de referidos
      UPDATE public.referral_codes
      SET total_referrals = total_referrals + 1
      WHERE referral_code = NEW.referral_id
        AND is_active = TRUE;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION create_referral_on_driver_approval(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.create_referral_on_driver_approval() IS 'Crea registro de referido automáticamente cuando se aprueba un conductor que tiene código de referido';


--
-- Name: ensure_referral_code(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_referral_code(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.referral_codes WHERE driver_id = p_user_id) THEN
    RETURN;
  END IF;

  SELECT first_name INTO v_name FROM public.users WHERE id = p_user_id;

  INSERT INTO public.referral_codes (driver_id, referral_code)
  VALUES (p_user_id, public.generate_referral_code(v_name))
  ON CONFLICT (driver_id) DO NOTHING;
END;
$$;


--
-- Name: fill_vehicle_info_on_driver_assign(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fill_vehicle_info_on_driver_assign() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_plate   VARCHAR(20);
  v_make    VARCHAR(100);
  v_model   VARCHAR(100);
  v_color   VARCHAR(100);
  v_mobile  VARCHAR(50);
BEGIN
  -- Only run when a driver is being set for the first time
  IF NEW.driver IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.driver IS DISTINCT FROM NEW.driver) THEN
    SELECT
      c.plate,
      c.make,
      c.model,
      c.color
    INTO
      v_plate, v_make, v_model, v_color
    FROM public.cars c
    WHERE c.driver_id = NEW.driver
      AND c.is_active = true
    ORDER BY c.updated_at DESC
    LIMIT 1;

    SELECT REGEXP_REPLACE(u.mobile, '^\+57', '')
    INTO v_mobile
    FROM public.users u
    WHERE u.id = NEW.driver
    LIMIT 1;

    IF FOUND OR v_plate IS NOT NULL THEN
      NEW.plate_number   := COALESCE(NEW.plate_number,   v_plate);
      NEW.vehicle_make   := COALESCE(NEW.vehicle_make,   v_make);
      NEW.car_model      := COALESCE(NEW.car_model,      v_model);
      NEW.vehicle_model  := COALESCE(NEW.vehicle_model,  v_model);
      NEW.car_color      := COALESCE(NEW.car_color,      v_color);
      NEW.vehicle_color  := COALESCE(NEW.vehicle_color,  v_color);
      NEW.driver_contact := COALESCE(NEW.driver_contact, v_mobile);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: generate_booking_otp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_booking_otp() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.otp IS NULL OR NEW.otp = '' THEN
    NEW.otp := LPAD((FLOOR(RANDOM() * 10000))::int::text, 4, '0');
    NEW.otp_verified := COALESCE(NEW.otp_verified, false);
    NEW.otp_generated_at := COALESCE(NEW.otp_generated_at, NOW());
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: generate_booking_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_booking_reference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  IF NEW.reference IS NULL THEN
    -- Generar referencia de 6 caracteres
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    NEW.reference := result;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: generate_referral_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_referral_code(p_name text) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_prefix text;
  v_suffix text;
  v_code   text;
BEGIN
  v_prefix := upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z]', '', 'g'));
  v_prefix := substr(v_prefix || 'XXX', 1, 3);

  LOOP
    v_suffix := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    v_code   := v_prefix || '-' || v_suffix;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.referral_codes WHERE referral_code = v_code
    );
  END LOOP;

  RETURN v_code;
END;
$$;


--
-- Name: generate_unique_referral_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_referral_code() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  new_code VARCHAR(10);
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generar código de 8 caracteres alfanuméricos
    new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    
    -- Verificar que no existe
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE referral_code = new_code) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;


--
-- Name: generate_unique_referral_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_unique_referral_code(user_name text) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  base_prefix TEXT;
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  -- Tomar las primeras 3 letras del nombre, o usar 'DRV' si el nombre está vacío
  base_prefix := UPPER(SUBSTRING(COALESCE(NULLIF(regexp_replace(user_name, '[^a-zA-Z]', '', 'g'), ''), 'DRV') FROM 1 FOR 3));
  
  LOOP
    -- Concatenar el prefijo con un guion y 5 caracteres aleatorios (mayúsculas y números)
    new_code := base_prefix || '-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5));
    
    -- Validar que no existe en la base de datos
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE referral_code = new_code) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN new_code;
END;
$$;


--
-- Name: get_active_booking_by_plate(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_booking_by_plate(p_plate text) RETURNS TABLE(booking_id uuid, driver_lat numeric, driver_lng numeric, last_update timestamp with time zone, booking_status text, driver_name text, car_model text, car_color text, plate_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id                   AS booking_id,
    bt.lat                 AS driver_lat,
    bt.lng                 AS driver_lng,
    bt.created_at          AS last_update,
    b.status::text         AS booking_status,
    b.driver_name::text    AS driver_name,
    b.car_model::text      AS car_model,
    b.car_color::text      AS car_color,
    b.plate_number::text   AS plate_number
  FROM public.bookings b
  LEFT JOIN public.booking_tracking bt ON bt.booking_id = b.id
  WHERE lower(trim(b.plate_number)) = lower(trim(p_plate))
    AND b.status IN ('ACCEPTED', 'ARRIVED', 'STARTED')
  ORDER BY bt.created_at DESC NULLS LAST
  LIMIT 1;
END;
$$;


--
-- Name: get_auth_profile(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_auth_profile() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user RECORD;
BEGIN
  -- Seleccionamos todas las columnas del perfil
  SELECT *
  INTO v_user 
  FROM public.users 
  WHERE auth_id = auth.uid() 
  LIMIT 1;

  -- Si el perfil no existe, retorna nulo
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  -- Retorna los datos empaquetados en un JSON
  RETURN row_to_json(v_user)::jsonb;
END;
$$;


--
-- Name: get_customer_recent_trips(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_customer_recent_trips(p_user_id text) RETURNS TABLE(id uuid, customer_id text, pickup_location jsonb, destination_location jsonb, drop_location jsonb, created_at timestamp with time zone, distance double precision, duration double precision, price double precision, status text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id,
    b.customer_id::TEXT,
    b.pickup_location::JSONB,
    b.destination_location::JSONB,
    b.drop_location::JSONB,
    b.created_at,
    b.distance::DOUBLE PRECISION,
    b.duration::DOUBLE PRECISION,
    b.price::DOUBLE PRECISION,
    b.status::TEXT
  FROM bookings b
  WHERE b.customer_id::TEXT = p_user_id
  ORDER BY b.created_at DESC
  LIMIT 5;
END;
$$;


--
-- Name: get_favorite_count(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_favorite_count(p_user_id uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::INTEGER
    FROM public.favorite_places
   WHERE user_id = p_user_id
     AND is_favorite = true;
$$;


--
-- Name: get_my_memberships(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_memberships(conductor_id uuid) RETURNS TABLE(uid uuid, conductor uuid, status character varying, costo numeric, fecha_inicio date, fecha_terminada date, periodo integer, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.uid,
    m.conductor,
    m.status,
    m.costo,
    m.fecha_inicio,
    m.fecha_terminada,
    m.periodo,
    m.created_at,
    m.updated_at
  FROM memberships m
  WHERE m.conductor = conductor_id
  ORDER BY m.created_at DESC;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: service_data_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_data_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    stage public.service_stage NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    driver_id uuid,
    customer_id uuid,
    location_lat double precision,
    location_lng double precision,
    distance_km numeric(10,2),
    duration_seconds integer,
    price_calculated numeric(10,2),
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT snapshot_raw_shape CHECK ((((stage = 'created'::public.service_stage) AND (raw_data ? 'category'::text) AND (raw_data ? 'estimated_price'::text)) OR ((stage = 'arrival_pickup'::public.service_stage) AND (raw_data ? 'driver_arrived_time'::text)) OR ((stage = 'started'::public.service_stage) AND (raw_data ? 'otp_verified'::text)) OR ((stage = 'arrival_destination'::public.service_stage) AND (raw_data ? 'trip_end_time'::text)) OR ((stage = 'completed'::public.service_stage) AND (raw_data ? 'final_price'::text)) OR ((stage = 'paid'::public.service_stage) AND (raw_data ? 'payment_mode'::text)) OR ((stage = 'cancelled'::public.service_stage) AND (raw_data ? 'cancelled_by'::text) AND (raw_data ? 'reason'::text))))
);


--
-- Name: get_service_timeline(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_service_timeline(p_booking_id uuid) RETURNS SETOF public.service_data_snapshots
    LANGUAGE sql STABLE
    AS $$
  SELECT * FROM service_data_snapshots
  WHERE booking_id = p_booking_id
  ORDER BY captured_at ASC;
$$;


--
-- Name: handle_auth_user_confirmed(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_auth_user_confirmed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.email_confirmed_at IS NOT NULL)
     OR (TG_OP = 'UPDATE' AND NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL) THEN
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM public.users WHERE uid = NEW.id) THEN
        INSERT INTO public.users(uid, email, created_at)
        VALUES (NEW.id, NEW.email, now());
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'handle_auth_user_confirmed: excepción ignorada: %', SQLERRM;
      -- Aquí podrías insertar en una tabla de logs para analizar después
    END;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_driver_approval(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_driver_approval() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_new_code VARCHAR(10);
  v_already_has_code BOOLEAN;
  v_referrer_id UUID;
BEGIN
  IF NEW.approved = TRUE AND OLD.approved = FALSE AND NEW.user_type = 'driver' THEN
    
    -- ACCIÓN A: GENERAR SU PROPIO CÓDIGO
    SELECT EXISTS(SELECT 1 FROM public.referral_codes WHERE driver_id = NEW.id) INTO v_already_has_code;
    
    IF NOT v_already_has_code THEN
      v_new_code := public.generate_unique_referral_code(NEW.first_name);
      INSERT INTO public.referral_codes (driver_id, referral_code, is_active, total_referrals) 
      VALUES (NEW.id, v_new_code, TRUE, 0);
    END IF;

    -- ACCIÓN B: RECOMPENSAR A QUIEN LO INVITÓ
    IF NEW.referral_id IS NOT NULL AND NEW.referral_id != '' THEN
      SELECT driver_id INTO v_referrer_id FROM public.referral_codes
      WHERE referral_code = NEW.referral_id AND is_active = TRUE LIMIT 1;

      IF v_referrer_id IS NOT NULL THEN
        UPDATE public.referral_codes
        SET total_referrals = total_referrals + 1
        WHERE referral_code = NEW.referral_id AND is_active = TRUE;

        INSERT INTO public.referrals (
          referral_code_id,
          referrer_id,
          referred_driver_id,
          referral_code,
          status,
          reward_claimed
        )
        SELECT 
          id,
          driver_id,
          NEW.id,
          referral_code,
          'approved', -- 🚨 ARREGLO: Cambiado de 'completed' a 'approved' respetando tu CHECK CONSTRAINT
          FALSE
        FROM public.referral_codes
        WHERE referral_code = NEW.referral_id
        LIMIT 1;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  INSERT INTO public.users (
    auth_id,
    email,
    first_name,
    last_name,
    mobile,
    user_type,
    document_type,
    document_number,
    referred_by_code,
    is_active
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'customer'),
    NEW.raw_user_meta_data->>'document_type',
    NEW.raw_user_meta_data->>'document_number',
    NULLIF(NEW.raw_user_meta_data->>'referred_by_code', ''),
    true
  )
  ON CONFLICT (auth_id) DO UPDATE SET
    email            = NEW.email,
    first_name       = COALESCE(NEW.raw_user_meta_data->>'first_name',       users.first_name),
    last_name        = COALESCE(NEW.raw_user_meta_data->>'last_name',        users.last_name),
    mobile           = COALESCE(NEW.raw_user_meta_data->>'phone',            users.mobile),
    user_type        = COALESCE(NEW.raw_user_meta_data->>'user_type',        users.user_type),
    document_type    = COALESCE(NEW.raw_user_meta_data->>'document_type',    users.document_type),
    document_number  = COALESCE(NEW.raw_user_meta_data->>'document_number',  users.document_number),
    referred_by_code = COALESCE(NULLIF(NEW.raw_user_meta_data->>'referred_by_code',''), users.referred_by_code)
  RETURNING id INTO v_user_id;

  -- Generar el código propio (AAA-XXXXX) si todavía no existe.
  PERFORM public.ensure_referral_code(v_user_id);

  RETURN NEW;
END;
$$;


--
-- Name: notify_new_booking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_new_booking() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  notification JSON;
BEGIN
  -- Solo notificar si es una nueva reserva
  IF NEW.status = 'NEW' AND OLD IS NULL THEN
    notification = json_build_object(
      'booking_id', NEW.id,
      'customer_city', NEW.customer_city,
      'pickup_address', NEW.pickup_address,
      'drop_address', NEW.drop_address,
      'car_type', NEW.car_type,
      'trip_cost', NEW.trip_cost,
      'distance', NEW.distance
    );
    
    -- Notificar a través del canal de Supabase Realtime
    PERFORM pg_notify('new_booking', notification::text);
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: search_immediate_bookings(numeric, numeric, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_immediate_bookings(driver_lat numeric, driver_lng numeric, range_km numeric, driver_id uuid) RETURNS TABLE(id uuid, reference character varying, customer_name character varying, customer_contact character varying, customer_token text, pickup_address text, drop_address text, pickup_lat numeric, pickup_lng numeric, drop_lat numeric, drop_lng numeric, booking_date timestamp with time zone, distance_to_pickup numeric, booking_distance numeric, duration integer, estimate numeric, driver_share numeric, car_type character varying, trip_type character varying, payment_mode character varying, observations text, customer_id uuid, status character varying)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id,
    b.reference,
    b.customer_name,
    b.customer_contact,
    b.customer_token,
    b.pickup_address,
    b.drop_address,
    b.pickup_lat,
    b.pickup_lng,
    b.drop_lat,
    b.drop_lng,
    b.booking_date,
    -- Calcular distancia desde driver actual a pickup (en km)
    ROUND(
      (
        3959 * acos(
          cos(radians(driver_lat)) * cos(radians(b.pickup_lat::numeric)) * 
          cos(radians(b.pickup_lng::numeric) - radians(driver_lng)) + 
          sin(radians(driver_lat)) * sin(radians(b.pickup_lat::numeric))
        )
      )::numeric / 1.60934, 
      2
    ) as distance_to_pickup,
    b.distance,
    b.duration,
    b.estimate,
    b.driver_share,
    b.car_type,
    b.trip_type,
    b.payment_mode,
    b.observations,
    b.customer,
    b.status
  FROM public.bookings b
  WHERE 
    -- Filtros principales
    b.booking_type = 'immediate'
    AND b.status = 'NEW'
    AND b.driver IS NULL
    -- Rango de distancia
    AND (
      3959 * acos(
        cos(radians(driver_lat)) * cos(radians(b.pickup_lat::numeric)) * 
        cos(radians(b.pickup_lng::numeric) - radians(driver_lng)) + 
        sin(radians(driver_lat)) * sin(radians(b.pickup_lat::numeric))
      )
    ) / 1.60934 <= range_km
    -- Excluir si el driver ya tiene esta reserva o está rechazada
    AND (b.requested_drivers::jsonb ? driver_id::text) IS NOT TRUE
    -- Ordenar por distancia (más cercanos primero)
  ORDER BY distance_to_pickup ASC, b.created_at DESC
  LIMIT 50;
END;
$$;


--
-- Name: snapshot_on_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.snapshot_on_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE stage_val service_stage;
BEGIN
  -- En UPDATE, solo actuar si cambió status. En INSERT, siempre.
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  stage_val := CASE NEW.status
    WHEN 'NEW' THEN 'created'::service_stage
    WHEN 'ARRIVED' THEN 'arrival_pickup'::service_stage
    WHEN 'STARTED' THEN 'started'::service_stage
    WHEN 'REACHED' THEN 'arrival_destination'::service_stage
    WHEN 'COMPLETE' THEN 'completed'::service_stage
    WHEN 'PAID' THEN 'paid'::service_stage
    WHEN 'CANCELLED' THEN 'cancelled'::service_stage
    ELSE NULL
  END;
  IF stage_val IS NULL THEN RETURN NEW; END IF;

  -- 🛡️ A: la captura del snapshot NUNCA debe abortar el cambio de estado de la reserva
  BEGIN
    INSERT INTO service_data_snapshots (
      booking_id, stage, driver_id, customer_id,
      location_lat, location_lng, distance_km, duration_seconds,
      price_calculated, raw_data
    ) VALUES (
      NEW.id, stage_val, NEW.driver, NEW.customer,
      NEW.pickup_lat, NEW.pickup_lng, NEW.distance,
      -- 🎯 Fase 2: total_trip_time*60, y si es null, cae a (trip_end - trip_start)
      COALESCE(
        NEW.total_trip_time * 60,
        CASE WHEN NEW.trip_end_time IS NOT NULL
              AND NEW.trip_start_time IS NOT NULL
              AND NEW.trip_end_time >= NEW.trip_start_time
             THEN round(extract(epoch from (NEW.trip_end_time - NEW.trip_start_time)))::int
        END
      ),
      CASE
        WHEN stage_val IN ('created','arrival_pickup','started')
          THEN NEW.estimate
        ELSE NEW.total_cost
      END,
      jsonb_build_object(
        'status_from', COALESCE(OLD.status, 'NULL'),
        'status_to', NEW.status,
        'category', NEW.car_type,
        'estimated_price', NEW.estimate,
        'driver_arrived_time', NEW.driver_arrived_time,
        'trip_end_time', NEW.trip_end_time,
        'final_price', NEW.total_cost,
        'otp_verified', NEW.otp_verified,
        'payment_mode', NEW.payment_mode,
        'cancelled_by', NEW.cancelled_by,
        'reason', NEW.reason
      )
    )
    ON CONFLICT (booking_id, stage)
    DO UPDATE SET
      captured_at = EXCLUDED.captured_at,
      raw_data = service_data_snapshots.raw_data || EXCLUDED.raw_data;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'snapshot_on_status_change falló para booking % stage %: %', NEW.id, stage_val, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


--
-- Name: update_bookings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_bookings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_call_notifications_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_call_notifications_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_complaints_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_complaints_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_complaints_user_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_complaints_user_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Obtener el user_type del usuario que crea la queja
  SELECT user_type INTO NEW.user_type
  FROM public.users
  WHERE id = NEW.user_id;

  -- Si no se encuentra, usar 'customer' por defecto
  IF NEW.user_type IS NULL THEN
    NEW.user_type = 'customer';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_favorite_places_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_favorite_places_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    driver_id uuid,
    car_type_id uuid,
    car_id uuid,
    status character varying(20) DEFAULT 'NEW'::character varying,
    pickup_location jsonb NOT NULL,
    destination_location jsonb NOT NULL,
    drop_location jsonb,
    distance numeric(10,2),
    duration integer,
    price numeric(10,2) NOT NULL,
    total_trip_time integer,
    trip_start_time timestamp with time zone,
    trip_end_time timestamp with time zone,
    driver_arrived_time timestamp with time zone,
    start_time bigint,
    end_time bigint,
    driver_status character varying(50),
    customer_status character varying(50) DEFAULT 'NEW'::character varying,
    driver_name character varying(200),
    driver_image text,
    driver_contact character varying(20),
    driver_rating numeric(2,1),
    car_image text,
    vehicle_number character varying(50),
    vehicle_model character varying(50),
    vehicle_make character varying(50),
    vehicle_color character varying(30),
    customer_token text,
    driver_token text,
    payment_mode character varying(20) DEFAULT 'cash'::character varying,
    prepaid boolean DEFAULT false,
    rating integer,
    review text,
    reason text,
    cancelled_by character varying(20),
    cancellation_time time without time zone,
    cancelled_at bigint,
    incident jsonb,
    customer_city character varying(100),
    driver_city character varying(100),
    reference character varying(50),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer uuid,
    customer_name character varying(255),
    customer_email character varying(255),
    customer_contact character varying(20),
    driver uuid,
    driver_active_status boolean DEFAULT false,
    pickup_address text,
    pickup_lat numeric(10,8),
    pickup_lng numeric(11,8),
    drop_address text,
    drop_lat numeric(10,8),
    drop_lng numeric(11,8),
    car_type character varying(50),
    car_model character varying(100),
    plate_number character varying(20),
    trip_type character varying(50),
    trip_urban character varying(50),
    estimate numeric(10,2),
    trip_cost numeric(10,2),
    convenience_fees numeric(10,2) DEFAULT 0,
    discount numeric(10,2) DEFAULT 0,
    total_cost numeric(10,2),
    driver_share numeric(10,2),
    payment_gateway character varying(50),
    otp character varying(4),
    promo_applied boolean DEFAULT false,
    promo_code character varying(50),
    promo_details jsonb,
    observations text,
    requested_drivers jsonb DEFAULT '{}'::jsonb,
    driver_estimates jsonb DEFAULT '{}'::jsonb,
    waypoints jsonb DEFAULT '[]'::jsonb,
    coords jsonb,
    booking_date timestamp with time zone DEFAULT now(),
    booking_type character varying(20) DEFAULT 'immediate'::character varying,
    otp_verified boolean DEFAULT false,
    otp_generated_at timestamp with time zone,
    otp_verified_at timestamp with time zone,
    otp_timer_started_at timestamp with time zone,
    otp_timer_duration integer DEFAULT 180,
    car_color character varying(100),
    request_expires_at timestamp with time zone,
    customer_rating smallint,
    customer_review text,
    min_fare_snapshot numeric(10,2),
    CONSTRAINT bookings_customer_rating_check CHECK (((customer_rating >= 1) AND (customer_rating <= 5))),
    CONSTRAINT bookings_rating_check CHECK (((rating >= 1) AND (rating <= 5))),
    CONSTRAINT bookings_status_check CHECK (((status)::text = ANY (ARRAY['NEW'::text, 'PENDING'::text, 'ACCEPTED'::text, 'STARTED'::text, 'ARRIVED'::text, 'REACHED'::text, 'COMPLETE'::text, 'PAID'::text, 'CANCELLED'::text])))
);


--
-- Name: TABLE bookings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bookings IS 'Tabla principal de reservas de viajes';


--
-- Name: COLUMN bookings.min_fare_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bookings.min_fare_snapshot IS 'Piso de cobro (car_types.min_fare) capturado al crear la reserva. Usado por calculate_total_cost() para que total_cost no quede bajo min_fare tras descuentos/promos.';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    auth_id uuid,
    email character varying(255) NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    mobile character varying(20),
    user_type character varying(20) DEFAULT 'customer'::character varying NOT NULL,
    wallet_balance numeric(10,2) DEFAULT 0.00,
    location jsonb,
    profile_image text,
    rating numeric(2,1) DEFAULT 0.0,
    total_rides integer DEFAULT 0,
    is_verified boolean DEFAULT false,
    approved boolean DEFAULT true,
    blocked boolean DEFAULT false,
    referral_id character varying(10),
    city character varying(100),
    driver_active_status boolean DEFAULT false,
    license_number character varying(50),
    license_image text,
    license_image_back text,
    verify_id_image text,
    verify_id_image_bk text,
    push_token text,
    user_platform character varying(10),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    car_type character varying(50),
    car_image text,
    vehicle_number character varying(20),
    vehicle_make character varying(100),
    company_name character varying(255),
    total_trips integer DEFAULT 0,
    total_earnings numeric(10,2) DEFAULT 0,
    is_active boolean DEFAULT true,
    verified boolean DEFAULT false,
    verify_id_image_data text,
    document_type character varying(10),
    document_number character varying(30),
    soat_image text,
    card_prop_image text,
    card_prop_image_bk text,
    referred_by_code character varying(50),
    bank_number character varying(50),
    push_platform text,
    push_device_model text,
    push_token_updated_at timestamp with time zone,
    CONSTRAINT users_push_platform_check CHECK ((push_platform = ANY (ARRAY['ios'::text, 'android'::text])))
);

ALTER TABLE ONLY public.users REPLICA IDENTITY FULL;


--
-- Name: COLUMN users.push_platform; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.push_platform IS 'Plataforma del último dispositivo que registró push_token: ios | android';


--
-- Name: COLUMN users.push_device_model; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.push_device_model IS 'Modelo del dispositivo (Device.modelName de expo-device). Debugging por marca/modelo';


--
-- Name: COLUMN users.push_token_updated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.push_token_updated_at IS 'Última vez que push_token fue re-registrado. Detectar tokens stale >90 días';


--
-- Name: active_bookings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.active_bookings AS
 SELECT b.id,
    b.customer_id,
    b.driver_id,
    b.car_type_id,
    b.car_id,
    b.status,
    b.pickup_location,
    b.destination_location,
    b.drop_location,
    b.distance,
    b.duration,
    b.price,
    b.total_trip_time,
    b.trip_start_time,
    b.trip_end_time,
    b.driver_arrived_time,
    b.start_time,
    b.end_time,
    b.driver_status,
    b.customer_status,
    b.driver_name,
    b.driver_image,
    b.driver_contact,
    b.driver_rating,
    b.car_image,
    b.vehicle_number,
    b.vehicle_model,
    b.vehicle_make,
    b.vehicle_color,
    b.customer_token,
    b.driver_token,
    b.payment_mode,
    b.prepaid,
    b.rating,
    b.review,
    b.reason,
    b.cancelled_by,
    b.cancellation_time,
    b.cancelled_at,
    b.incident,
    b.customer_city,
    b.driver_city,
    b.reference,
    b.created_at,
    b.updated_at,
    b.customer,
    b.customer_name,
    b.customer_email,
    b.customer_contact,
    b.driver,
    b.driver_active_status,
    b.pickup_address,
    b.pickup_lat,
    b.pickup_lng,
    b.drop_address,
    b.drop_lat,
    b.drop_lng,
    b.car_type,
    b.car_model,
    b.plate_number,
    b.trip_type,
    b.trip_urban,
    b.estimate,
    b.trip_cost,
    b.convenience_fees,
    b.discount,
    b.total_cost,
    b.driver_share,
    b.payment_gateway,
    b.otp,
    b.promo_applied,
    b.promo_code,
    b.promo_details,
    b.observations,
    b.requested_drivers,
    b.driver_estimates,
    b.waypoints,
    b.coords,
    b.booking_date,
    b.booking_type,
    b.otp_verified,
    b.otp_generated_at,
    b.otp_verified_at,
    (((c.first_name)::text || ' '::text) || (c.last_name)::text) AS customer_full_name,
    c.mobile AS customer_mobile,
    (((d.first_name)::text || ' '::text) || (d.last_name)::text) AS driver_full_name,
    d.mobile AS driver_mobile
   FROM ((public.bookings b
     LEFT JOIN public.users c ON ((b.customer = c.id)))
     LEFT JOIN public.users d ON ((b.driver = d.id)))
  WHERE ((b.status)::text = ANY ((ARRAY['NEW'::character varying, 'ACCEPTED'::character varying, 'STARTED'::character varying, 'ARRIVED'::character varying])::text[]));


--
-- Name: booking_stats; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.booking_stats AS
 SELECT customer,
    count(*) AS total_bookings,
    count(
        CASE
            WHEN ((status)::text = 'COMPLETE'::text) THEN 1
            ELSE NULL::integer
        END) AS completed_bookings,
    count(
        CASE
            WHEN ((status)::text = 'CANCELLED'::text) THEN 1
            ELSE NULL::integer
        END) AS cancelled_bookings,
    sum(
        CASE
            WHEN ((status)::text = 'PAID'::text) THEN total_cost
            ELSE (0)::numeric
        END) AS total_spent,
    avg(
        CASE
            WHEN ((status)::text = 'COMPLETE'::text) THEN total_trip_time
            ELSE NULL::integer
        END) AS avg_trip_time
   FROM public.bookings
  GROUP BY customer;


--
-- Name: booking_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_tracking (
    id bigint NOT NULL,
    booking_id uuid NOT NULL,
    driver_id uuid,
    lat numeric(10,8) NOT NULL,
    lng numeric(11,8) NOT NULL,
    accuracy real,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

ALTER TABLE ONLY public.booking_tracking REPLICA IDENTITY FULL;


--
-- Name: booking_tracking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.booking_tracking_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: booking_tracking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.booking_tracking_id_seq OWNED BY public.booking_tracking.id;


--
-- Name: call_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_notifications (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    driver_name text NOT NULL,
    channel_name text NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: car_brands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.car_brands (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: car_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.car_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    base_price numeric(10,2) NOT NULL,
    price_per_km numeric(10,2) NOT NULL,
    image text,
    capacity integer DEFAULT 4,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    base_price_inter numeric(10,2) DEFAULT 0 NOT NULL,
    price_per_km_inter numeric(10,2) DEFAULT 0 NOT NULL,
    rate_per_hour numeric(10,2) DEFAULT 0 NOT NULL,
    rate_per_hour_inter numeric(10,2) DEFAULT 0 NOT NULL,
    valor_hora numeric(10,2) DEFAULT 0 NOT NULL,
    min_fare numeric(10,2) DEFAULT 0 NOT NULL,
    min_fare_inter numeric(10,2) DEFAULT 0 NOT NULL,
    delta_aeropuerto numeric(10,2) DEFAULT 0 NOT NULL,
    delta_aeropuerto_prog numeric(10,2) DEFAULT 0 NOT NULL,
    convenience_fee numeric(10,2) DEFAULT 0 NOT NULL,
    convenience_fee_type text DEFAULT 'percentage'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    umbral_intermunicipal_km numeric(10,2) DEFAULT 29 NOT NULL
);


--
-- Name: cars; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cars (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid,
    make character varying(50) NOT NULL,
    model character varying(50) NOT NULL,
    color character varying(30),
    plate character varying(20) NOT NULL,
    car_image_1 text,
    capacity integer DEFAULT 4,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    soat_image text,
    soat_expiry_date date,
    card_prop_image text,
    card_prop_image_back text,
    tecnomecanica_image text,
    tecnomecanica_expiry_date date,
    camara_comercio_image text,
    service_type character varying(50) DEFAULT 'particular'::character varying,
    car_image_2 text,
    fuel_type character varying,
    transmission character varying,
    features jsonb
);


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    booking_id uuid,
    complaint_type character varying(20) DEFAULT 'queja'::character varying NOT NULL,
    subject character varying(120) NOT NULL,
    body text NOT NULL,
    priority character varying(10) DEFAULT 'media'::character varying NOT NULL,
    evidence_urls jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    admin_response text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_type character varying(20) DEFAULT 'customer'::character varying,
    CONSTRAINT complaints_complaint_type_check CHECK (((complaint_type)::text = ANY ((ARRAY['queja'::character varying, 'reclamo'::character varying, 'sugerencia'::character varying, 'otro'::character varying])::text[]))),
    CONSTRAINT complaints_priority_check CHECK (((priority)::text = ANY ((ARRAY['baja'::character varying, 'media'::character varying, 'alta'::character varying])::text[]))),
    CONSTRAINT complaints_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_review'::character varying, 'resolved'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT complaints_user_type_check CHECK (((user_type)::text = ANY ((ARRAY['customer'::character varying, 'driver'::character varying, 'admin'::character varying])::text[])))
);


--
-- Name: favorite_places; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.favorite_places (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    description text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    type_address character varying(30) DEFAULT 'Otro'::character varying,
    is_favorite boolean DEFAULT true NOT NULL,
    usage_count integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT favorite_places_type_address_check CHECK (((type_address)::text = ANY ((ARRAY['Casa'::character varying, 'Trabajo'::character varying, 'Gimnasio'::character varying, 'Supermercado'::character varying, 'Parque'::character varying, 'Escuela'::character varying, 'Restaurante'::character varying, 'Otro'::character varying])::text[])))
);


--
-- Name: memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.memberships (
    uid uuid DEFAULT gen_random_uuid() NOT NULL,
    conductor uuid NOT NULL,
    status character varying(20) DEFAULT 'PENDIENTE'::character varying NOT NULL,
    costo numeric(10,2) DEFAULT 157200 NOT NULL,
    fecha_inicio date DEFAULT CURRENT_DATE NOT NULL,
    fecha_terminada date NOT NULL,
    periodo integer DEFAULT 30 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: notification_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_events (
    id bigint NOT NULL,
    user_id uuid NOT NULL,
    event_type character varying(40) NOT NULL,
    booking_id uuid,
    title text,
    body text,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    expo_receipt_id text,
    error_message text,
    CONSTRAINT notification_events_status_check CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'delivered'::character varying, 'failed'::character varying, 'not_registered'::character varying, 'skipped'::character varying])::text[])))
);


--
-- Name: TABLE notification_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notification_events IS 'Auditoría de push notifications transaccionales enviadas. Ver Edge Function sendPush.';


--
-- Name: notification_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_events_id_seq OWNED BY public.notification_events.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title character varying(100) NOT NULL,
    message text NOT NULL,
    type character varying(20) DEFAULT 'general'::character varying,
    is_read boolean DEFAULT false,
    data jsonb,
    booking_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: promos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title character varying(100) NOT NULL,
    description text,
    discount_type character varying(20),
    discount_value numeric(10,2),
    min_amount numeric(10,2),
    max_discount numeric(10,2),
    start_date date,
    end_date date,
    is_active boolean DEFAULT true,
    usage_limit integer,
    used_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: referral_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referral_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    driver_id uuid NOT NULL,
    referral_code character varying(10) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    total_referrals integer DEFAULT 0
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    referral_code_id uuid NOT NULL,
    referred_driver_id uuid NOT NULL,
    referral_code character varying(10) NOT NULL,
    referred_at timestamp with time zone DEFAULT now(),
    status character varying(20) DEFAULT 'pending'::character varying,
    reward_claimed boolean DEFAULT false,
    referrer_id uuid,
    CONSTRAINT referrals_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: COLUMN referrals.referrer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.referrals.referrer_id IS 'ID del conductor que hizo el referido (quien refirió)';


--
-- Name: saved_addresses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    name character varying(100),
    address text NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(11,8) NOT NULL,
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: signup_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signup_errors (
    id bigint NOT NULL,
    auth_id uuid,
    email text,
    sqlstate text,
    message text,
    payload jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: signup_errors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.signup_errors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: signup_errors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.signup_errors_id_seq OWNED BY public.signup_errors.id;


--
-- Name: tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    status character varying(20) NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(11,8) NOT NULL,
    timestamp_ms bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    rated_by uuid,
    booking_id uuid,
    rate integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_ratings_rate_check CHECK (((rate >= 1) AND (rate <= 5)))
);


--
-- Name: wallet_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type character varying(10) NOT NULL,
    amount numeric(10,2) NOT NULL,
    balance numeric(10,2) NOT NULL,
    description text NOT NULL,
    booking_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: booking_tracking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_tracking ALTER COLUMN id SET DEFAULT nextval('public.booking_tracking_id_seq'::regclass);


--
-- Name: notification_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events ALTER COLUMN id SET DEFAULT nextval('public.notification_events_id_seq'::regclass);


--
-- Name: signup_errors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_errors ALTER COLUMN id SET DEFAULT nextval('public.signup_errors_id_seq'::regclass);


--
-- Name: booking_tracking booking_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_tracking
    ADD CONSTRAINT booking_tracking_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: call_notifications call_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_notifications
    ADD CONSTRAINT call_notifications_pkey PRIMARY KEY (id);


--
-- Name: car_brands car_brands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_brands
    ADD CONSTRAINT car_brands_pkey PRIMARY KEY (id);


--
-- Name: car_types car_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.car_types
    ADD CONSTRAINT car_types_pkey PRIMARY KEY (id);


--
-- Name: cars cars_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cars
    ADD CONSTRAINT cars_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: favorite_places favorite_places_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_places
    ADD CONSTRAINT favorite_places_pkey PRIMARY KEY (id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (uid);


--
-- Name: notification_events notification_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: promos promos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promos
    ADD CONSTRAINT promos_pkey PRIMARY KEY (id);


--
-- Name: referral_codes referral_codes_driver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_driver_id_key UNIQUE (driver_id);


--
-- Name: referral_codes referral_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_pkey PRIMARY KEY (id);


--
-- Name: referral_codes referral_codes_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_referral_code_key UNIQUE (referral_code);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: saved_addresses saved_addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_addresses
    ADD CONSTRAINT saved_addresses_pkey PRIMARY KEY (id);


--
-- Name: service_data_snapshots service_data_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_data_snapshots
    ADD CONSTRAINT service_data_snapshots_pkey PRIMARY KEY (id);


--
-- Name: signup_errors signup_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signup_errors
    ADD CONSTRAINT signup_errors_pkey PRIMARY KEY (id);


--
-- Name: service_data_snapshots snapshot_unique_stage; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_data_snapshots
    ADD CONSTRAINT snapshot_unique_stage UNIQUE (booking_id, stage);


--
-- Name: tracking tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking
    ADD CONSTRAINT tracking_pkey PRIMARY KEY (id);


--
-- Name: user_ratings user_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_pkey PRIMARY KEY (id);


--
-- Name: users users_auth_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);


--
-- Name: users users_auth_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_id_unique UNIQUE (auth_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: wallet_history wallet_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_history
    ADD CONSTRAINT wallet_history_pkey PRIMARY KEY (id);


--
-- Name: call_notifications_channel_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_notifications_channel_name_idx ON public.call_notifications USING btree (channel_name);


--
-- Name: call_notifications_customer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_notifications_customer_id_idx ON public.call_notifications USING btree (customer_id);


--
-- Name: call_notifications_driver_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX call_notifications_driver_id_idx ON public.call_notifications USING btree (driver_id);


--
-- Name: car_brands_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX car_brands_name_unique ON public.car_brands USING btree (lower(name));


--
-- Name: car_brands_name_unique_ci; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX car_brands_name_unique_ci ON public.car_brands USING btree (lower(name));


--
-- Name: idx_booking_tracking_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_tracking_booking_id ON public.booking_tracking USING btree (booking_id);


--
-- Name: idx_booking_tracking_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_tracking_created_at ON public.booking_tracking USING btree (created_at DESC);


--
-- Name: idx_booking_tracking_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_tracking_driver_id ON public.booking_tracking USING btree (driver_id);


--
-- Name: idx_bookings_booking_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_booking_date ON public.bookings USING btree (booking_date);


--
-- Name: idx_bookings_booking_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_booking_type ON public.bookings USING btree (booking_type);


--
-- Name: idx_bookings_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_created_at ON public.bookings USING btree (created_at DESC);


--
-- Name: idx_bookings_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer ON public.bookings USING btree (customer);


--
-- Name: idx_bookings_customer_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer_city ON public.bookings USING btree (customer_city);


--
-- Name: idx_bookings_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer_id ON public.bookings USING btree (customer_id);


--
-- Name: idx_bookings_customer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_customer_status ON public.bookings USING btree (customer_status);


--
-- Name: idx_bookings_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_driver ON public.bookings USING btree (driver);


--
-- Name: idx_bookings_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_driver_id ON public.bookings USING btree (driver_id);


--
-- Name: idx_bookings_driver_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_driver_status ON public.bookings USING btree (driver_status);


--
-- Name: idx_bookings_driver_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_driver_status_created ON public.bookings USING btree (driver, status, created_at DESC);


--
-- Name: idx_bookings_immediate_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_immediate_created ON public.bookings USING btree (created_at DESC) WHERE (((booking_type)::text = 'immediate'::text) AND ((status)::text = 'NEW'::text));


--
-- Name: idx_bookings_immediate_pickup_coords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_immediate_pickup_coords ON public.bookings USING btree (booking_type, status, driver) WHERE (((booking_type)::text = 'immediate'::text) AND ((status)::text = 'NEW'::text) AND (driver IS NULL));


--
-- Name: idx_bookings_otp_generated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_otp_generated_at ON public.bookings USING btree (otp_generated_at) WHERE ((otp IS NOT NULL) AND (otp_verified = false));


--
-- Name: idx_bookings_otp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_otp_status ON public.bookings USING btree (otp, otp_verified, status);


--
-- Name: idx_bookings_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_reference ON public.bookings USING btree (reference);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status_created ON public.bookings USING btree (status, created_at DESC);


--
-- Name: idx_bookings_type_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_type_customer ON public.bookings USING btree (booking_type, customer);


--
-- Name: idx_bookings_type_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_type_driver ON public.bookings USING btree (booking_type, driver);


--
-- Name: idx_bookings_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_type_status ON public.bookings USING btree (booking_type, status);


--
-- Name: idx_cars_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cars_driver_id ON public.cars USING btree (driver_id);


--
-- Name: idx_complaints_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_booking_id ON public.complaints USING btree (booking_id);


--
-- Name: idx_complaints_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_created_at ON public.complaints USING btree (created_at DESC);


--
-- Name: idx_complaints_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_status ON public.complaints USING btree (status);


--
-- Name: idx_complaints_type_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_type_priority ON public.complaints USING btree (complaint_type, priority);


--
-- Name: idx_complaints_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_user_id ON public.complaints USING btree (user_id);


--
-- Name: idx_complaints_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_user_type ON public.complaints USING btree (user_type);


--
-- Name: idx_favorite_places_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorite_places_created ON public.favorite_places USING btree (created_at DESC);


--
-- Name: idx_favorite_places_usage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorite_places_usage ON public.favorite_places USING btree (user_id, usage_count DESC);


--
-- Name: idx_favorite_places_user_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorite_places_user_favorite ON public.favorite_places USING btree (user_id, is_favorite) WHERE (is_favorite = true);


--
-- Name: idx_favorite_places_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorite_places_user_id ON public.favorite_places USING btree (user_id);


--
-- Name: idx_favorite_places_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_favorite_places_user_type ON public.favorite_places USING btree (user_id, type_address);


--
-- Name: idx_memberships_conductor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_conductor ON public.memberships USING btree (conductor);


--
-- Name: idx_memberships_fecha_terminada; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_fecha_terminada ON public.memberships USING btree (fecha_terminada);


--
-- Name: idx_memberships_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_memberships_status ON public.memberships USING btree (status);


--
-- Name: idx_notification_events_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_events_booking ON public.notification_events USING btree (booking_id) WHERE (booking_id IS NOT NULL);


--
-- Name: idx_notification_events_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_events_type_time ON public.notification_events USING btree (event_type, sent_at DESC);


--
-- Name: idx_notification_events_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_events_user_time ON public.notification_events USING btree (user_id, sent_at DESC);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_referral_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_codes_code ON public.referral_codes USING btree (referral_code);


--
-- Name: idx_referral_codes_driver; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_referral_codes_driver ON public.referral_codes USING btree (driver_id);


--
-- Name: idx_referral_codes_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referral_codes_driver_id ON public.referral_codes USING btree (driver_id);


--
-- Name: idx_referrals_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_code_id ON public.referrals USING btree (referral_code_id);


--
-- Name: idx_referrals_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_driver_id ON public.referrals USING btree (referred_driver_id);


--
-- Name: idx_referrals_referred_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_referrals_referred_unique ON public.referrals USING btree (referred_driver_id);


--
-- Name: idx_referrals_referrer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referrer_id ON public.referrals USING btree (referrer_id);


--
-- Name: idx_snapshots_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshots_booking_id ON public.service_data_snapshots USING btree (booking_id);


--
-- Name: idx_snapshots_booking_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshots_booking_stage ON public.service_data_snapshots USING btree (booking_id, stage);


--
-- Name: idx_snapshots_stage_captured; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_snapshots_stage_captured ON public.service_data_snapshots USING btree (stage, captured_at DESC);


--
-- Name: idx_tracking_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracking_booking ON public.booking_tracking USING btree (booking_id);


--
-- Name: idx_tracking_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tracking_booking_id ON public.tracking USING btree (booking_id);


--
-- Name: idx_users_auth_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_auth_id ON public.users USING btree (auth_id);


--
-- Name: idx_users_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_city ON public.users USING btree (city);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);


--
-- Name: idx_users_push_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_push_active ON public.users USING btree (push_platform, user_type, driver_active_status) WHERE (push_token IS NOT NULL);


--
-- Name: idx_users_referral_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referral_id ON public.users USING btree (referral_id);


--
-- Name: idx_users_referred_by_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referred_by_code ON public.users USING btree (referred_by_code);


--
-- Name: idx_users_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_user_type ON public.users USING btree (user_type);


--
-- Name: idx_wallet_history_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_history_user_id ON public.wallet_history USING btree (user_id);


--
-- Name: bookings 	send_trip_summary_on_completed; Type: TRIGGER; Schema: public; Owner: -
--

-- External HTTP trigger omitted from the test baseline (secret and old-project URL removed).


--
-- Name: bookings booking-events; Type: TRIGGER; Schema: public; Owner: -
--

-- External HTTP trigger omitted from the test baseline (secret and old-project URL removed).


--
-- Name: call_notifications call_notifications_updated_at_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER call_notifications_updated_at_trigger BEFORE UPDATE ON public.call_notifications FOR EACH ROW EXECUTE FUNCTION public.update_call_notifications_timestamp();


--
-- Name: favorite_places trg_check_favorite_limit_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_favorite_limit_insert BEFORE INSERT ON public.favorite_places FOR EACH ROW EXECUTE FUNCTION public.check_favorite_places_limit();


--
-- Name: favorite_places trg_check_favorite_limit_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_favorite_limit_update BEFORE UPDATE ON public.favorite_places FOR EACH ROW WHEN (((old.is_favorite = false) AND (new.is_favorite = true))) EXECUTE FUNCTION public.check_favorite_places_limit();


--
-- Name: complaints trg_complaints_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_complaints_updated_at BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.update_complaints_updated_at();


--
-- Name: complaints trg_complaints_user_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_complaints_user_type BEFORE INSERT ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.update_complaints_user_type();


--
-- Name: favorite_places trg_favorite_places_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_favorite_places_updated_at BEFORE UPDATE ON public.favorite_places FOR EACH ROW EXECUTE FUNCTION public.update_favorite_places_updated_at();


--
-- Name: bookings trg_generate_booking_otp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_booking_otp BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.generate_booking_otp();


--
-- Name: users trigger_approval_email; Type: TRIGGER; Schema: public; Owner: -
--

-- External HTTP trigger omitted from the test baseline (secret and old-project URL removed).


--
-- Name: bookings trigger_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_bookings_updated_at();


--
-- Name: bookings trigger_calculate_total_cost; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_calculate_total_cost BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.calculate_total_cost();


--
-- Name: bookings trigger_fill_vehicle_on_driver_assign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_fill_vehicle_on_driver_assign BEFORE INSERT OR UPDATE OF driver ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.fill_vehicle_info_on_driver_assign();


--
-- Name: bookings trigger_generate_booking_reference; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_booking_reference BEFORE INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.generate_booking_reference();


--
-- Name: users trigger_handle_driver_approval; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_handle_driver_approval AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_driver_approval();


--
-- Name: bookings trigger_notify_new_booking; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_notify_new_booking AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_new_booking();


--
-- Name: bookings trigger_snapshot_on_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_snapshot_on_insert AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.snapshot_on_status_change();


--
-- Name: bookings trigger_snapshot_on_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_snapshot_on_status_change AFTER UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.snapshot_on_status_change();


--
-- Name: users trigger_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_users_updated_at();


--
-- Name: bookings update_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cars update_cars_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cars_updated_at BEFORE UPDATE ON public.cars FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: booking_tracking booking_tracking_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_tracking
    ADD CONSTRAINT booking_tracking_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_car_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_car_id_fkey FOREIGN KEY (car_id) REFERENCES public.cars(id);


--
-- Name: bookings bookings_car_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_car_type_id_fkey FOREIGN KEY (car_type_id) REFERENCES public.car_types(id);


--
-- Name: bookings bookings_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: call_notifications call_notifications_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_notifications
    ADD CONSTRAINT call_notifications_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES auth.users(id);


--
-- Name: call_notifications call_notifications_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_notifications
    ADD CONSTRAINT call_notifications_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES auth.users(id);


--
-- Name: cars cars_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cars
    ADD CONSTRAINT cars_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: complaints complaints_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: complaints complaints_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: favorite_places favorite_places_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.favorite_places
    ADD CONSTRAINT favorite_places_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals fk_referrals_referrer; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: memberships memberships_conductor_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.memberships
    ADD CONSTRAINT memberships_conductor_fkey FOREIGN KEY (conductor) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: notification_events notification_events_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: notification_events notification_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_events
    ADD CONSTRAINT notification_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referral_codes referral_codes_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referral_codes
    ADD CONSTRAINT referral_codes_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referral_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referral_code_id_fkey FOREIGN KEY (referral_code_id) REFERENCES public.referral_codes(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referred_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referred_driver_id_fkey FOREIGN KEY (referred_driver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: saved_addresses saved_addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_addresses
    ADD CONSTRAINT saved_addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: service_data_snapshots service_data_snapshots_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_data_snapshots
    ADD CONSTRAINT service_data_snapshots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: service_data_snapshots service_data_snapshots_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_data_snapshots
    ADD CONSTRAINT service_data_snapshots_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);


--
-- Name: service_data_snapshots service_data_snapshots_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_data_snapshots
    ADD CONSTRAINT service_data_snapshots_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id);


--
-- Name: tracking tracking_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracking
    ADD CONSTRAINT tracking_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: user_ratings user_ratings_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: user_ratings user_ratings_rated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_ratings user_ratings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_ratings
    ADD CONSTRAINT user_ratings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_auth_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_auth_id_fkey FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wallet_history wallet_history_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_history
    ADD CONSTRAINT wallet_history_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: wallet_history wallet_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_history
    ADD CONSTRAINT wallet_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: memberships Actualizar membresía propia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Actualizar membresía propia" ON public.memberships FOR UPDATE USING ((conductor = auth.uid())) WITH CHECK ((conductor = auth.uid()));


--
-- Name: cars Admins can create cars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can create cars" ON public.cars FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text) AND (users.approved = true)))));


--
-- Name: complaints Admins can manage all complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all complaints" ON public.complaints USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text)))));


--
-- Name: favorite_places Admins can manage all favorite places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage all favorite places" ON public.favorite_places USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text)))));


--
-- Name: cars Admins can view all cars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all cars" ON public.cars FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text) AND (users.approved = true)))));


--
-- Name: notifications Admins can view all notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all notifications" ON public.notifications FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text) AND (users.approved = true)))));


--
-- Name: tracking Admins can view all tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all tracking" ON public.tracking FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text) AND (users.approved = true)))));


--
-- Name: wallet_history Admins can view all wallet history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can view all wallet history" ON public.wallet_history FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.auth_id = auth.uid()) AND ((users.user_type)::text = 'admin'::text) AND (users.approved = true)))));


--
-- Name: memberships Allow all operations on memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow all operations on memberships" ON public.memberships USING (true) WITH CHECK (true);


--
-- Name: users Allow anonymous read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read" ON public.users FOR SELECT USING (true);


--
-- Name: cars Allow anonymous read cars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow anonymous read cars" ON public.cars FOR SELECT USING (true);


--
-- Name: car_types Allow modify car_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow modify car_types" ON public.car_types TO authenticated USING (true) WITH CHECK (true);


--
-- Name: car_types Allow read car_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow read car_types" ON public.car_types FOR SELECT TO authenticated USING (true);


--
-- Name: car_brands Anyone can read active car brands; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active car brands" ON public.car_brands FOR SELECT TO authenticated, anon USING ((is_active = true));


--
-- Name: cars Drivers can create own cars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Drivers can create own cars" ON public.cars FOR INSERT TO authenticated WITH CHECK ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: cars Drivers can view own cars; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Drivers can view own cars" ON public.cars FOR SELECT TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: cars Drivers read own car; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Drivers read own car" ON public.cars FOR SELECT TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: users Drivers read own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Drivers read own row" ON public.users FOR SELECT TO authenticated USING ((auth_id = auth.uid()));


--
-- Name: cars Drivers update own car; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Drivers update own car" ON public.cars FOR UPDATE TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: users Drivers update own row; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Drivers update own row" ON public.users FOR UPDATE TO authenticated USING ((auth_id = auth.uid())) WITH CHECK ((auth_id = auth.uid()));


--
-- Name: memberships Eliminar membresía propia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Eliminar membresía propia" ON public.memberships FOR DELETE USING ((conductor = auth.uid()));


--
-- Name: memberships Insertar membresías propia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insertar membresías propia" ON public.memberships FOR INSERT WITH CHECK ((conductor = auth.uid()));


--
-- Name: memberships Leer membresías propias; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Leer membresías propias" ON public.memberships FOR SELECT USING ((conductor = auth.uid()));


--
-- Name: referral_codes Permitir validacion publica de codigos de referido; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Permitir validacion publica de codigos de referido" ON public.referral_codes FOR SELECT USING ((is_active = true));


--
-- Name: favorite_places Users can delete own favorite places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own favorite places" ON public.favorite_places FOR DELETE USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: bookings Users can delete their own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own bookings" ON public.bookings FOR DELETE USING ((((auth.uid())::text = (customer)::text) OR ((auth.uid())::text = (driver)::text) OR ((( SELECT users.user_type
   FROM public.users
  WHERE (users.id = auth.uid())))::text = 'admin'::text)));


--
-- Name: complaints Users can insert own complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own complaints" ON public.complaints FOR INSERT WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: favorite_places Users can insert own favorite places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own favorite places" ON public.favorite_places FOR INSERT WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: bookings Users can insert their own bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own bookings" ON public.bookings FOR INSERT WITH CHECK (((auth.uid())::text = (customer)::text));


--
-- Name: complaints Users can update own complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own complaints" ON public.complaints FOR UPDATE USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid())))) WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: favorite_places Users can update own favorite places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own favorite places" ON public.favorite_places FOR UPDATE USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid())))) WITH CHECK ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: complaints Users can view own complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own complaints" ON public.complaints FOR SELECT USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: favorite_places Users can view own favorite places; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own favorite places" ON public.favorite_places FOR SELECT USING ((user_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: call_notifications Users can view their own call notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own call notifications" ON public.call_notifications FOR SELECT USING (((auth.uid() = customer_id) OR (auth.uid() = driver_id)));


--
-- Name: users Usuarios pueden actualizar su propio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON public.users FOR UPDATE TO authenticated USING ((auth_id = auth.uid())) WITH CHECK ((auth_id = auth.uid()));


--
-- Name: users Usuarios pueden ver su propio perfil; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden ver su propio perfil" ON public.users FOR SELECT TO authenticated USING ((auth_id = auth.uid()));


--
-- Name: service_data_snapshots admin read all snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin read all snapshots" ON public.service_data_snapshots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((u.auth_id = auth.uid()) AND ((u.user_type)::text = 'admin'::text)))));


--
-- Name: complaints admin_read_all_complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_read_all_complaints ON public.complaints FOR SELECT TO authenticated USING (true);


--
-- Name: complaints admin_view_all_complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_view_all_complaints ON public.complaints FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND ((users.user_type)::text = ANY ((ARRAY['admin'::character varying, 'company'::character varying])::text[]))))));


--
-- Name: bookings admins_delete_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_delete_bookings ON public.bookings FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((lower((u.email)::text) = lower((auth.jwt() ->> 'email'::text))) AND ((u.user_type)::text = 'admin'::text)))));


--
-- Name: bookings admins_insert_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_insert_bookings ON public.bookings FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((lower((u.email)::text) = lower((auth.jwt() ->> 'email'::text))) AND ((u.user_type)::text = 'admin'::text)))));


--
-- Name: bookings admins_see_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_see_all ON public.bookings FOR SELECT USING (((( SELECT users.user_type
   FROM public.users
  WHERE (users.id = auth.uid())))::text = 'admin'::text));


--
-- Name: bookings admins_update_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_update_bookings ON public.bookings FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((lower((u.email)::text) = lower((auth.jwt() ->> 'email'::text))) AND ((u.user_type)::text = 'admin'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.users u
  WHERE ((lower((u.email)::text) = lower((auth.jwt() ->> 'email'::text))) AND ((u.user_type)::text = 'admin'::text)))));


--
-- Name: booking_tracking auth_view_active_bookings_tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY auth_view_active_bookings_tracking ON public.booking_tracking FOR SELECT TO authenticated USING ((booking_id IN ( SELECT bookings.id
   FROM public.bookings
  WHERE ((bookings.status)::text = ANY ((ARRAY['ACCEPTED'::character varying, 'ARRIVED'::character varying, 'STARTED'::character varying])::text[])))));


--
-- Name: service_data_snapshots block direct updates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "block direct updates" ON public.service_data_snapshots FOR UPDATE TO authenticated USING (false);


--
-- Name: service_data_snapshots block direct writes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "block direct writes" ON public.service_data_snapshots FOR INSERT TO authenticated WITH CHECK (false);


--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_delete_admin ON public.bookings FOR DELETE USING (public.app_is_admin());


--
-- Name: bookings bookings_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_insert_own ON public.bookings FOR INSERT WITH CHECK (((customer = public.app_user_id()) OR public.app_is_admin()));


--
-- Name: bookings bookings_select_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_select_scoped ON public.bookings FOR SELECT USING (((customer = public.app_user_id()) OR (driver = public.app_user_id()) OR (public.app_is_driver() AND (driver IS NULL) AND ((status)::text = ANY ((ARRAY['NEW'::character varying, 'PENDING'::character varying])::text[]))) OR public.app_is_admin()));


--
-- Name: bookings bookings_update_scoped; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_update_scoped ON public.bookings FOR UPDATE USING (((customer = public.app_user_id()) OR (driver = public.app_user_id()) OR (public.app_is_driver() AND (driver IS NULL) AND ((status)::text = ANY ((ARRAY['NEW'::character varying, 'PENDING'::character varying])::text[]))) OR public.app_is_admin())) WITH CHECK (((customer = public.app_user_id()) OR (driver = public.app_user_id()) OR (public.app_is_driver() AND (driver IS NULL) AND ((status)::text = ANY ((ARRAY['NEW'::character varying, 'PENDING'::character varying])::text[]))) OR public.app_is_admin()));


--
-- Name: call_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: car_brands; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.car_brands ENABLE ROW LEVEL SECURITY;

--
-- Name: car_brands car_brands_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY car_brands_select_all ON public.car_brands FOR SELECT TO authenticated, anon USING (true);


--
-- Name: car_brands car_brands_write_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY car_brands_write_all ON public.car_brands TO authenticated, anon USING (true) WITH CHECK (true);


--
-- Name: cars; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cars ENABLE ROW LEVEL SECURITY;

--
-- Name: cars cars_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cars_delete_own ON public.cars FOR DELETE TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: cars cars_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cars_insert_own ON public.cars FOR INSERT TO authenticated WITH CHECK ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: cars cars_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cars_select_own ON public.cars FOR SELECT TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: cars cars_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cars_update_own ON public.cars FOR UPDATE TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid())))) WITH CHECK ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: bookings customers_see_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customers_see_own ON public.bookings FOR SELECT USING (((auth.uid())::text = (customer)::text));


--
-- Name: bookings drivers_can_update_bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drivers_can_update_bookings ON public.bookings FOR UPDATE USING ((((auth.uid())::text = (customer)::text) OR ((auth.uid())::text = (driver_id)::text) OR ((( SELECT users.user_type
   FROM public.users
  WHERE (users.id = auth.uid())))::text = 'admin'::text))) WITH CHECK ((((auth.uid())::text = (customer)::text) OR ((auth.uid())::text = (driver_id)::text) OR ((( SELECT users.user_type
   FROM public.users
  WHERE (users.id = auth.uid())))::text = 'admin'::text)));


--
-- Name: bookings drivers_see_assigned; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drivers_see_assigned ON public.bookings FOR SELECT USING (((auth.uid())::text = (driver_id)::text));


--
-- Name: bookings drivers_see_available_immediates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY drivers_see_available_immediates ON public.bookings FOR SELECT USING ((((( SELECT users.user_type
   FROM public.users
  WHERE (users.id = auth.uid())))::text = 'driver'::text) AND ((booking_type)::text = 'immediate'::text) AND (driver_id IS NULL) AND ((status)::text = ANY (ARRAY['NEW'::text, 'PENDING'::text]))));


--
-- Name: favorite_places; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.favorite_places ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: service_data_snapshots read own booking snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own booking snapshots" ON public.service_data_snapshots FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bookings b
  WHERE ((b.id = service_data_snapshots.booking_id) AND ((b.customer = auth.uid()) OR (b.driver = auth.uid()))))));


--
-- Name: referral_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_codes referral_codes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY referral_codes_select_own ON public.referral_codes FOR SELECT TO authenticated USING ((driver_id IN ( SELECT users.id
   FROM public.users
  WHERE (users.auth_id = auth.uid()))));


--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: users rls_users_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_users_insert_own ON public.users FOR INSERT WITH CHECK ((auth.uid() = auth_id));


--
-- Name: users rls_users_select_debug; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_users_select_debug ON public.users FOR SELECT USING (((auth.uid())::text = (auth_id)::text));


--
-- Name: users rls_users_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY rls_users_update_own ON public.users FOR UPDATE USING ((auth.uid() = auth_id)) WITH CHECK ((auth.uid() = auth_id));


--
-- Name: saved_addresses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.saved_addresses ENABLE ROW LEVEL SECURITY;

--
-- Name: service_data_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_data_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_tracking service_role_all_tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_role_all_tracking ON public.booking_tracking TO service_role USING (true) WITH CHECK (true);


--
-- Name: signup_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.signup_errors ENABLE ROW LEVEL SECURITY;

--
-- Name: tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: complaints user_view_own_complaints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_view_own_complaints ON public.complaints FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_events users read own notification events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users read own notification events" ON public.notification_events FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: users users update own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update own" ON public.users FOR UPDATE TO authenticated USING ((auth_id = auth.uid())) WITH CHECK ((auth_id = auth.uid()));


--
-- Name: users users update own by id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users update own by id" ON public.users FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: users users: update by id or auth_id; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users: update by id or auth_id" ON public.users FOR UPDATE TO authenticated USING (((id = auth.uid()) OR (auth_id = auth.uid()))) WITH CHECK (((id = auth.uid()) OR (auth_id = auth.uid())));


--
-- Name: wallet_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_history ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


