-- Prueba-only additive core foundation. Applied ONLY through prepare-booking-v2-core.mjs.
-- Does not replace existing legacy objects or copy records.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
SET LOCAL search_path = pg_catalog, public, extensions;
DO $guard$ BEGIN
 IF to_regclass('booking_v2.bookings') IS NULL OR to_regclass('public.users') IS NULL OR to_regclass('public.persona') IS NOT NULL THEN
  RAISE EXCEPTION 'Requires original Prueba structure; refusing existing core or missing booking_v2';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_event_trigger e
   JOIN pg_proc p ON p.oid=e.evtfoid
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE e.evtenabled <> 'D'
     AND e.evtevent IN ('ddl_command_start','ddl_command_end')
     AND (e.evttags IS NULL OR e.evttags && ARRAY[
       'CREATE TYPE','CREATE SEQUENCE','CREATE TABLE','ALTER TABLE','ALTER SEQUENCE','REVOKE',
       'CREATE FUNCTION','ALTER FUNCTION','CREATE VIEW','CREATE INDEX','CREATE TRIGGER','GRANT'
     ]::text[])
     -- Reviewed Supabase watcher only issues transactional NOTIFY, discarded by ROLLBACK.
     AND NOT (e.evtname='pgrst_ddl_watch' AND n.nspname='extensions'
       AND p.proname='pgrst_ddl_watch' AND pg_get_functiondef(p.oid)='CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      ''CREATE SCHEMA'', ''ALTER SCHEMA''
    , ''CREATE TABLE'', ''CREATE TABLE AS'', ''SELECT INTO'', ''ALTER TABLE''
    , ''CREATE FOREIGN TABLE'', ''ALTER FOREIGN TABLE''
    , ''CREATE VIEW'', ''ALTER VIEW''
    , ''CREATE MATERIALIZED VIEW'', ''ALTER MATERIALIZED VIEW''
    , ''CREATE FUNCTION'', ''ALTER FUNCTION''
    , ''CREATE TRIGGER''
    , ''CREATE TYPE'', ''ALTER TYPE''
    , ''CREATE RULE''
    , ''COMMENT''
    )
    -- don''t notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from ''pg_temp''
    THEN
      NOTIFY pgrst, ''reload schema'';
    END IF;
  END LOOP;
END; $function$
')
 ) THEN
  RAISE EXCEPTION 'Enabled DDL event triggers require review before this rollback-only test';
 END IF;
END $guard$;
CREATE TYPE public."direccion_mensaje" AS ENUM ('inbound', 'outbound');
CREATE TYPE public."estado_membresia" AS ENUM ('PENDIENTE', 'ACTIVA', 'VENCIDA', 'CANCELADA');
CREATE TYPE public."estado_queja" AS ENUM ('pending', 'in_review', 'resolved', 'rejected');
CREATE TYPE public."estado_referido" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public."estado_reserva" AS ENUM ('NEW', 'PENDING', 'ACCEPTED', 'STARTED', 'ARRIVED', 'REACHED', 'COMPLETE', 'PAID', 'CANCELLED');
CREATE TYPE public."etapa_servicio" AS ENUM ('created', 'arrival_pickup', 'started', 'arrival_destination', 'completed', 'paid', 'cancelled');
CREATE TYPE public."lado_documento" AS ENUM ('frontal', 'posterior', 'selfie');
CREATE TYPE public."modo_pago" AS ENUM ('cash', 'wallet', 'card', 'transfer');
CREATE TYPE public."parentesco" AS ENUM ('hijo', 'conyuge', 'familiar', 'amigo', 'empleado', 'otro');
CREATE TYPE public."plataforma_push" AS ENUM ('ios', 'android');
CREATE TYPE public."prioridad_queja" AS ENUM ('baja', 'media', 'alta');
CREATE TYPE public."rol_persona" AS ENUM ('cliente', 'conductor', 'empresa', 'admin', 'asesor');
CREATE TYPE public."tipo_descuento" AS ENUM ('percentage', 'fixed');
CREATE TYPE public."tipo_documento_vehiculo" AS ENUM ('soat', 'tecnomecanica', 'tarjeta_propiedad', 'camara_comercio', 'foto');
CREATE TYPE public."tipo_movimiento_wallet" AS ENUM ('credit', 'debit');
CREATE TYPE public."tipo_queja" AS ENUM ('queja', 'reclamo', 'sugerencia', 'otro');
CREATE TYPE public."tipo_reserva" AS ENUM ('immediate', 'scheduled');
CREATE SEQUENCE public."categoria_vehiculo_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."ciudad_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."error_registro_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."evento_notificacion_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."interaccion_bot_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."jornada_bot_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."pregunta_entrenamiento_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."reserva_tracking_id_seq" AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE SEQUENCE public."tipo_documento_id_seq" AS integer START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1 NO CYCLE;
CREATE TABLE public."calificacion" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid NOT NULL,
  "id_calificador" uuid,
  "id_reserva" uuid,
  "puntaje" smallint NOT NULL,
  "comentario" text,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."calificacion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."calificacion" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."categoria_vehiculo" (
  "id" integer DEFAULT nextval('public.categoria_vehiculo_id_seq'::regclass) NOT NULL,
  "nombre" character varying(100) NOT NULL,
  "descripcion" text,
  "imagen_url" text,
  "autorizado" boolean DEFAULT true NOT NULL,
  "capacidad" integer DEFAULT 4 NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "tarifa_base" numeric(12,2) DEFAULT 0 NOT NULL,
  "valor_km" numeric(12,2) DEFAULT 0 NOT NULL,
  "valor_hora" numeric(12,2) DEFAULT 0 NOT NULL,
  "tarifa_minima" numeric(12,2) DEFAULT 0 NOT NULL,
  "tarifa_base_inter" numeric(12,2) DEFAULT 0 NOT NULL,
  "valor_km_inter" numeric(12,2) DEFAULT 0 NOT NULL,
  "tarifa_minima_inter" numeric(12,2) DEFAULT 0 NOT NULL,
  "valor_hora_inter" numeric(12,2) DEFAULT 0 NOT NULL,
  "delta_aeropuerto" numeric(12,2) DEFAULT 0 NOT NULL,
  "delta_aeropuerto_prog" numeric(12,2) DEFAULT 0 NOT NULL,
  "convenience_fee" numeric(12,2) DEFAULT 0 NOT NULL,
  "convenience_fee_tipo" public.tipo_descuento DEFAULT 'percentage'::public.tipo_descuento NOT NULL,
  "umbral_intermunicipal_km" numeric(12,2) DEFAULT 29 NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."categoria_vehiculo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."categoria_vehiculo" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."ciudad" (
  "id" integer DEFAULT nextval('public.ciudad_id_seq'::regclass) NOT NULL,
  "nombre" character varying(100) NOT NULL
);
ALTER TABLE public."ciudad" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."ciudad" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."codigo_referido" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid NOT NULL,
  "codigo" character varying(20) NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "total_referidos" integer DEFAULT 0 NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."codigo_referido" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."codigo_referido" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."contrato_empresa" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_empresa" uuid NOT NULL,
  "numero_contrato" text NOT NULL,
  "fecha_inicio" date NOT NULL,
  "fecha_fin" date,
  "estado" character varying(20) DEFAULT 'active'::character varying NOT NULL,
  "ciclo_facturacion" character varying(20) DEFAULT 'monthly'::character varying NOT NULL,
  "limite_credito" numeric(12,2) DEFAULT 0 NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."contrato_empresa" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."contrato_empresa" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."dispositivo_push" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid NOT NULL,
  "push_token" text NOT NULL,
  "plataforma" public.plataforma_push,
  "modelo" text,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."dispositivo_push" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."dispositivo_push" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."documento_persona" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid NOT NULL,
  "tipo" character varying(50) DEFAULT 'identidad'::character varying NOT NULL,
  "lado" public.lado_documento NOT NULL,
  "storage_path" text NOT NULL,
  "whatsapp_media_id" character varying(255),
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."documento_persona" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."documento_persona" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."documento_vehiculo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_vehiculo" uuid NOT NULL,
  "tipo" public.tipo_documento_vehiculo NOT NULL,
  "lado" public.lado_documento,
  "storage_path" text NOT NULL,
  "fecha_vencimiento" date,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."documento_vehiculo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."documento_vehiculo" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."error_registro" (
  "id" bigint DEFAULT nextval('public.error_registro_id_seq'::regclass) NOT NULL,
  "auth_id" uuid,
  "email" text,
  "sqlstate" text,
  "mensaje" text,
  "payload" jsonb,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."error_registro" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."error_registro" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."estado_usuario_bot" (
  "wa_id" character varying(30) NOT NULL,
  "id_persona" uuid,
  "estado" character varying(50) DEFAULT 'IDLE'::character varying NOT NULL,
  "datos" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "ultima_actividad" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."estado_usuario_bot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."estado_usuario_bot" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."evento_notificacion" (
  "id" bigint DEFAULT nextval('public.evento_notificacion_id_seq'::regclass) NOT NULL,
  "id_persona" uuid NOT NULL,
  "tipo_evento" character varying(40) NOT NULL,
  "id_reserva" uuid,
  "titulo" text,
  "cuerpo" text,
  "estado" character varying(20) DEFAULT 'sent'::character varying NOT NULL,
  "expo_receipt_id" text,
  "mensaje_error" text,
  "enviado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."evento_notificacion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."evento_notificacion" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."interaccion_bot" (
  "id" bigint DEFAULT nextval('public.interaccion_bot_id_seq'::regclass) NOT NULL,
  "wa_id" character varying(30) NOT NULL,
  "id_jornada" bigint,
  "direccion" public.direccion_mensaje NOT NULL,
  "tipo_mensaje" text DEFAULT 'text'::text,
  "contenido" text,
  "estado_fsm" text,
  "evento" text,
  "recibido_en" timestamp with time zone DEFAULT now() NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."interaccion_bot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."interaccion_bot" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."jornada_bot" (
  "id" bigint DEFAULT nextval('public.jornada_bot_id_seq'::regclass) NOT NULL,
  "wa_id" character varying(30) NOT NULL,
  "id_persona" uuid,
  "id_reserva" uuid,
  "origen" text,
  "destino" text,
  "estado" text,
  "iniciada_en" timestamp with time zone DEFAULT now() NOT NULL,
  "completada_en" timestamp with time zone
);
ALTER TABLE public."jornada_bot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."jornada_bot" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."lugar_guardado" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid NOT NULL,
  "nombre" character varying(120) NOT NULL,
  "descripcion" text,
  "direccion" text,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "tipo" character varying(30) DEFAULT 'Otro'::character varying NOT NULL,
  "es_predeterminado" boolean DEFAULT false NOT NULL,
  "es_favorito" boolean DEFAULT false NOT NULL,
  "veces_usado" integer DEFAULT 0 NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."lugar_guardado" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."lugar_guardado" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."marca_vehiculo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."marca_vehiculo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."marca_vehiculo" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."membresia" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_conductor" uuid NOT NULL,
  "estado" public.estado_membresia DEFAULT 'PENDIENTE'::public.estado_membresia NOT NULL,
  "costo" numeric(12,2) DEFAULT 157200 NOT NULL,
  "fecha_inicio" date DEFAULT CURRENT_DATE NOT NULL,
  "fecha_fin" date NOT NULL,
  "periodo_dias" integer DEFAULT 30 NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."membresia" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."membresia" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."mensaje_chat" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_reserva" uuid NOT NULL,
  "id_remitente" uuid,
  "rol_remitente" public.rol_persona NOT NULL,
  "remitente_nombre" text,
  "mensaje" text NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."mensaje_chat" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."mensaje_chat" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."movimiento_wallet" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid NOT NULL,
  "tipo" public.tipo_movimiento_wallet NOT NULL,
  "monto" numeric(12,2) NOT NULL,
  "saldo_resultante" numeric(12,2) NOT NULL,
  "descripcion" text NOT NULL,
  "id_reserva" uuid,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."movimiento_wallet" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."movimiento_wallet" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."notificacion" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_persona" uuid,
  "titulo" character varying(120) NOT NULL,
  "mensaje" text NOT NULL,
  "tipo" character varying(30) DEFAULT 'general'::character varying,
  "leido" boolean DEFAULT false NOT NULL,
  "datos" jsonb,
  "id_reserva" uuid,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."notificacion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."notificacion" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."notificacion_llamada" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_cliente" uuid NOT NULL,
  "id_conductor" uuid NOT NULL,
  "canal" text NOT NULL,
  "estado" text DEFAULT 'pending'::text NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."notificacion_llamada" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."notificacion_llamada" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."peaje" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nombre" text NOT NULL,
  "id_ciudad" integer,
  "precio" numeric(12,2) NOT NULL,
  "lat" double precision,
  "lng" double precision,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."peaje" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."peaje" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."perfil_cliente" (
  "id_persona" uuid NOT NULL,
  "total_viajes" integer DEFAULT 0 NOT NULL,
  "calificacion_promedio" numeric(3,2) DEFAULT 0,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."perfil_cliente" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."perfil_cliente" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."perfil_conductor" (
  "id_persona" uuid NOT NULL,
  "aprobado" boolean DEFAULT false NOT NULL,
  "ocupado" boolean DEFAULT false NOT NULL,
  "en_servicio" boolean DEFAULT false NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "whatsapp" boolean DEFAULT false NOT NULL,
  "tipo_servicio" character varying(100),
  "numero_licencia" character varying(50),
  "numero_cuenta_bancaria" character varying(50),
  "calificacion_promedio" numeric(3,2) DEFAULT 0,
  "total_viajes" integer DEFAULT 0 NOT NULL,
  "total_ganancias" numeric(12,2) DEFAULT 0 NOT NULL,
  "pago_seguridad_social" boolean DEFAULT false NOT NULL,
  "codigo_recomendacion" character varying(255),
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."perfil_conductor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."perfil_conductor" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."perfil_empresa" (
  "id_persona" uuid NOT NULL,
  "razon_social" character varying(255) NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."perfil_empresa" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."perfil_empresa" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."persona" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "auth_id" uuid,
  "nombre" character varying(100),
  "apellido" character varying(100),
  "telefono" character varying(30) NOT NULL,
  "email" character varying(255),
  "id_tipo_documento" integer,
  "numero_documento" character varying(50),
  "id_ciudad_actual" integer,
  "id_ciudad_origen" integer,
  "imagen_perfil" text,
  "version_app" character varying(20),
  "codigo_referido_usado" character varying(20),
  "ultima_lat" double precision,
  "ultima_lng" double precision,
  "ubicacion_actualizada_en" timestamp with time zone,
  "bloqueado" boolean DEFAULT false NOT NULL,
  "verificado" boolean DEFAULT false NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."persona" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."persona" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."persona_beneficiario" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_titular" uuid NOT NULL,
  "id_persona" uuid,
  "nombre" character varying(100) NOT NULL,
  "telefono" character varying(30) NOT NULL,
  "parentesco" public.parentesco DEFAULT 'otro'::public.parentesco NOT NULL,
  "es_menor" boolean DEFAULT false NOT NULL,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."persona_beneficiario" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."persona_beneficiario" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."persona_rol" (
  "id_persona" uuid NOT NULL,
  "rol" public.rol_persona NOT NULL,
  "asignado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."persona_rol" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."persona_rol" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."pregunta_entrenamiento" (
  "id" bigint DEFAULT nextval('public.pregunta_entrenamiento_id_seq'::regclass) NOT NULL,
  "wa_id" character varying(30) NOT NULL,
  "pregunta" text NOT NULL,
  "tema" text DEFAULT ''::text,
  "motivo" text DEFAULT ''::text,
  "estado" text DEFAULT 'pending'::text,
  "respuesta_asesor" text,
  "respuesta_sugerida" text DEFAULT ''::text,
  "raw_path" text,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."pregunta_entrenamiento" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."pregunta_entrenamiento" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."promocion" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "titulo" character varying(100) NOT NULL,
  "descripcion" text,
  "tipo_descuento" public.tipo_descuento DEFAULT 'percentage'::public.tipo_descuento NOT NULL,
  "valor_descuento" numeric(12,2) NOT NULL,
  "monto_minimo" numeric(12,2) DEFAULT 0 NOT NULL,
  "descuento_maximo" numeric(12,2),
  "fecha_inicio" date,
  "fecha_fin" date,
  "activo" boolean DEFAULT true NOT NULL,
  "limite_uso" integer,
  "veces_usado" integer DEFAULT 0 NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."promocion" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."promocion" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."queja" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_reportante" uuid NOT NULL,
  "id_reportado" uuid,
  "id_reserva" uuid,
  "tipo" public.tipo_queja DEFAULT 'queja'::public.tipo_queja NOT NULL,
  "asunto" character varying(120) NOT NULL,
  "cuerpo" text NOT NULL,
  "prioridad" public.prioridad_queja DEFAULT 'media'::public.prioridad_queja NOT NULL,
  "estado" public.estado_queja DEFAULT 'pending'::public.estado_queja NOT NULL,
  "evidencias" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "respuesta_admin" text,
  "id_resuelto_por" uuid,
  "resuelto_en" timestamp with time zone,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."queja" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."queja" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."referido" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_codigo_referido" uuid,
  "id_referente" uuid,
  "id_conductor_referido" uuid,
  "codigo" character varying(20) NOT NULL,
  "estado" public.estado_referido DEFAULT 'pending'::public.estado_referido NOT NULL,
  "recompensa_reclamada" boolean DEFAULT false NOT NULL,
  "referido_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."referido" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."referido" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."reserva" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "referencia" character varying(50),
  "id_cliente" uuid,
  "id_conductor" uuid,
  "id_categoria" integer,
  "id_vehiculo" uuid,
  "estado" public.estado_reserva DEFAULT 'NEW'::public.estado_reserva NOT NULL,
  "tipo_reserva" public.tipo_reserva DEFAULT 'immediate'::public.tipo_reserva NOT NULL,
  "id_beneficiario" uuid,
  "id_pasajero" uuid,
  "pasajero_nombre" character varying(100),
  "pasajero_telefono" character varying(30),
  "origen_direccion" text,
  "origen_lat" numeric(10,8),
  "origen_lng" numeric(11,8),
  "destino_direccion" text,
  "destino_lat" numeric(10,8),
  "destino_lng" numeric(11,8),
  "bajada_direccion" text,
  "bajada_lat" numeric(10,8),
  "bajada_lng" numeric(11,8),
  "waypoints" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "distancia_km" numeric(10,2),
  "duracion_seg" integer,
  "precio_estimado" numeric(12,2),
  "precio" numeric(12,2) NOT NULL,
  "costo_viaje" numeric(12,2),
  "convenience_fees" numeric(12,2) DEFAULT 0 NOT NULL,
  "descuento" numeric(12,2) DEFAULT 0 NOT NULL,
  "costo_total" numeric(12,2),
  "ganancia_conductor" numeric(12,2),
  "tarifa_minima_snapshot" numeric(12,2),
  "modo_pago" public.modo_pago DEFAULT 'cash'::public.modo_pago NOT NULL,
  "prepago" boolean DEFAULT false NOT NULL,
  "id_promocion" uuid,
  "otp" character varying(6),
  "otp_verificado" boolean DEFAULT false NOT NULL,
  "otp_generado_en" timestamp with time zone,
  "otp_verificado_en" timestamp with time zone,
  "solicitado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "conductor_llego_en" timestamp with time zone,
  "viaje_inicio_en" timestamp with time zone,
  "viaje_fin_en" timestamp with time zone,
  "cancelado_por" public.rol_persona,
  "cancelado_en" timestamp with time zone,
  "motivo_cancelacion" text,
  "observaciones" text,
  "incidente" jsonb,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."reserva" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."reserva_oferta_conductor" (
  "id_reserva" uuid NOT NULL,
  "id_conductor" uuid NOT NULL,
  "estimado" numeric(12,2),
  "enviado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "expira_en" timestamp with time zone
);
ALTER TABLE public."reserva_oferta_conductor" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva_oferta_conductor" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."reserva_snapshot" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_reserva" uuid NOT NULL,
  "etapa" public.etapa_servicio NOT NULL,
  "capturado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "id_conductor" uuid,
  "id_cliente" uuid,
  "lat" double precision,
  "lng" double precision,
  "distancia_km" numeric(10,2),
  "duracion_seg" integer,
  "precio_calculado" numeric(12,2),
  "datos_crudos" jsonb,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."reserva_snapshot" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva_snapshot" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."reserva_tracking" (
  "id" bigint DEFAULT nextval('public.reserva_tracking_id_seq'::regclass) NOT NULL,
  "id_reserva" uuid NOT NULL,
  "id_conductor" uuid,
  "lat" numeric(10,8) NOT NULL,
  "lng" numeric(11,8) NOT NULL,
  "velocidad" numeric(6,2) DEFAULT 0,
  "rumbo" numeric(6,2) DEFAULT 0,
  "precision_m" real,
  "registrado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."reserva_tracking" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."reserva_tracking" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."tipo_documento" (
  "id" integer DEFAULT nextval('public.tipo_documento_id_seq'::regclass) NOT NULL,
  "nombre" character varying(100) NOT NULL,
  "acronimo" character varying(10)
);
ALTER TABLE public."tipo_documento" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."tipo_documento" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."vehiculo" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "id_conductor" uuid NOT NULL,
  "id_categoria" integer,
  "id_marca" uuid,
  "linea" character varying(100),
  "color" character varying(50),
  "anio" integer,
  "placa" character varying(20) NOT NULL,
  "capacidad" integer DEFAULT 4 NOT NULL,
  "tipo_combustible" character varying(30),
  "transmision" character varying(30),
  "tipo_servicio" character varying(50) DEFAULT 'particular'::character varying,
  "caracteristicas" jsonb,
  "foto_1" text,
  "foto_2" text,
  "activo" boolean DEFAULT true NOT NULL,
  "creado_en" timestamp with time zone DEFAULT now() NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."vehiculo" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."vehiculo" FROM PUBLIC, anon, authenticated;
CREATE TABLE public."wallet" (
  "id_persona" uuid NOT NULL,
  "saldo" numeric(12,2) DEFAULT 0 NOT NULL,
  "saldo_km" numeric(12,2) DEFAULT 0 NOT NULL,
  "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public."wallet" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."wallet" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public."categoria_vehiculo_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."categoria_vehiculo_id_seq" OWNED BY public."categoria_vehiculo"."id";
REVOKE ALL ON SEQUENCE public."ciudad_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."ciudad_id_seq" OWNED BY public."ciudad"."id";
REVOKE ALL ON SEQUENCE public."error_registro_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."error_registro_id_seq" OWNED BY public."error_registro"."id";
REVOKE ALL ON SEQUENCE public."evento_notificacion_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."evento_notificacion_id_seq" OWNED BY public."evento_notificacion"."id";
REVOKE ALL ON SEQUENCE public."interaccion_bot_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."interaccion_bot_id_seq" OWNED BY public."interaccion_bot"."id";
REVOKE ALL ON SEQUENCE public."jornada_bot_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."jornada_bot_id_seq" OWNED BY public."jornada_bot"."id";
REVOKE ALL ON SEQUENCE public."pregunta_entrenamiento_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."pregunta_entrenamiento_id_seq" OWNED BY public."pregunta_entrenamiento"."id";
REVOKE ALL ON SEQUENCE public."reserva_tracking_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."reserva_tracking_id_seq" OWNED BY public."reserva_tracking"."id";
REVOKE ALL ON SEQUENCE public."tipo_documento_id_seq" FROM PUBLIC, anon, authenticated;
ALTER SEQUENCE public."tipo_documento_id_seq" OWNED BY public."tipo_documento"."id";
ALTER TABLE public."calificacion" ADD CONSTRAINT "calificacion_pkey" PRIMARY KEY (id);
ALTER TABLE public."calificacion" ADD CONSTRAINT "calificacion_puntaje_check" CHECK (((puntaje >= 1) AND (puntaje <= 5)));
ALTER TABLE public."calificacion" ADD CONSTRAINT "calificacion_uq" UNIQUE (id_reserva, id_calificador, id_persona);
ALTER TABLE public."categoria_vehiculo" ADD CONSTRAINT "categoria_vehiculo_nombre_key" UNIQUE (nombre);
ALTER TABLE public."categoria_vehiculo" ADD CONSTRAINT "categoria_vehiculo_pkey" PRIMARY KEY (id);
ALTER TABLE public."ciudad" ADD CONSTRAINT "ciudad_nombre_key" UNIQUE (nombre);
ALTER TABLE public."ciudad" ADD CONSTRAINT "ciudad_pkey" PRIMARY KEY (id);
ALTER TABLE public."codigo_referido" ADD CONSTRAINT "codigo_referido_codigo_key" UNIQUE (codigo);
ALTER TABLE public."codigo_referido" ADD CONSTRAINT "codigo_referido_persona_key" UNIQUE (id_persona);
ALTER TABLE public."codigo_referido" ADD CONSTRAINT "codigo_referido_pkey" PRIMARY KEY (id);
ALTER TABLE public."contrato_empresa" ADD CONSTRAINT "contrato_empresa_numero_key" UNIQUE (numero_contrato);
ALTER TABLE public."contrato_empresa" ADD CONSTRAINT "contrato_empresa_pkey" PRIMARY KEY (id);
ALTER TABLE public."dispositivo_push" ADD CONSTRAINT "dispositivo_push_pkey" PRIMARY KEY (id);
ALTER TABLE public."dispositivo_push" ADD CONSTRAINT "dispositivo_push_token_uq" UNIQUE (push_token);
ALTER TABLE public."documento_persona" ADD CONSTRAINT "documento_persona_pkey" PRIMARY KEY (id);
ALTER TABLE public."documento_persona" ADD CONSTRAINT "documento_persona_uq" UNIQUE (id_persona, tipo, lado);
ALTER TABLE public."documento_vehiculo" ADD CONSTRAINT "documento_vehiculo_pkey" PRIMARY KEY (id);
ALTER TABLE public."documento_vehiculo" ADD CONSTRAINT "documento_vehiculo_uq" UNIQUE (id_vehiculo, tipo, lado);
ALTER TABLE public."error_registro" ADD CONSTRAINT "error_registro_pkey" PRIMARY KEY (id);
ALTER TABLE public."estado_usuario_bot" ADD CONSTRAINT "estado_usuario_bot_pkey" PRIMARY KEY (wa_id);
ALTER TABLE public."evento_notificacion" ADD CONSTRAINT "evento_notificacion_pkey" PRIMARY KEY (id);
ALTER TABLE public."interaccion_bot" ADD CONSTRAINT "interaccion_bot_pkey" PRIMARY KEY (id);
ALTER TABLE public."jornada_bot" ADD CONSTRAINT "jornada_bot_pkey" PRIMARY KEY (id);
ALTER TABLE public."lugar_guardado" ADD CONSTRAINT "lugar_guardado_pkey" PRIMARY KEY (id);
ALTER TABLE public."marca_vehiculo" ADD CONSTRAINT "marca_vehiculo_nombre_uq" UNIQUE (nombre);
ALTER TABLE public."marca_vehiculo" ADD CONSTRAINT "marca_vehiculo_pkey" PRIMARY KEY (id);
ALTER TABLE public."membresia" ADD CONSTRAINT "membresia_pkey" PRIMARY KEY (id);
ALTER TABLE public."mensaje_chat" ADD CONSTRAINT "mensaje_chat_no_vacio" CHECK ((char_length(TRIM(BOTH FROM mensaje)) > 0));
ALTER TABLE public."mensaje_chat" ADD CONSTRAINT "mensaje_chat_pkey" PRIMARY KEY (id);
ALTER TABLE public."movimiento_wallet" ADD CONSTRAINT "movimiento_wallet_pkey" PRIMARY KEY (id);
ALTER TABLE public."notificacion" ADD CONSTRAINT "notificacion_pkey" PRIMARY KEY (id);
ALTER TABLE public."notificacion_llamada" ADD CONSTRAINT "notificacion_llamada_pkey" PRIMARY KEY (id);
ALTER TABLE public."peaje" ADD CONSTRAINT "peaje_pkey" PRIMARY KEY (id);
ALTER TABLE public."perfil_cliente" ADD CONSTRAINT "perfil_cliente_pkey" PRIMARY KEY (id_persona);
ALTER TABLE public."perfil_conductor" ADD CONSTRAINT "perfil_conductor_pkey" PRIMARY KEY (id_persona);
ALTER TABLE public."perfil_empresa" ADD CONSTRAINT "perfil_empresa_pkey" PRIMARY KEY (id_persona);
ALTER TABLE public."persona" ADD CONSTRAINT "persona_auth_id_key" UNIQUE (auth_id);
ALTER TABLE public."persona" ADD CONSTRAINT "persona_email_key" UNIQUE (email);
ALTER TABLE public."persona" ADD CONSTRAINT "persona_pkey" PRIMARY KEY (id);
ALTER TABLE public."persona" ADD CONSTRAINT "persona_telefono_key" UNIQUE (telefono);
ALTER TABLE public."persona_beneficiario" ADD CONSTRAINT "persona_beneficiario_pkey" PRIMARY KEY (id);
ALTER TABLE public."persona_beneficiario" ADD CONSTRAINT "persona_beneficiario_uq" UNIQUE (id_titular, telefono);
ALTER TABLE public."persona_rol" ADD CONSTRAINT "persona_rol_pkey" PRIMARY KEY (id_persona, rol);
ALTER TABLE public."pregunta_entrenamiento" ADD CONSTRAINT "pregunta_entrenamiento_pkey" PRIMARY KEY (id);
ALTER TABLE public."promocion" ADD CONSTRAINT "promocion_pkey" PRIMARY KEY (id);
ALTER TABLE public."queja" ADD CONSTRAINT "queja_pkey" PRIMARY KEY (id);
ALTER TABLE public."referido" ADD CONSTRAINT "referido_conductor_uq" UNIQUE (id_conductor_referido);
ALTER TABLE public."referido" ADD CONSTRAINT "referido_pkey" PRIMARY KEY (id);
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_pkey" PRIMARY KEY (id);
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_referencia_key" UNIQUE (referencia);
ALTER TABLE public."reserva_oferta_conductor" ADD CONSTRAINT "reserva_oferta_pkey" PRIMARY KEY (id_reserva, id_conductor);
ALTER TABLE public."reserva_snapshot" ADD CONSTRAINT "reserva_snapshot_etapa_uq" UNIQUE (id_reserva, etapa);
ALTER TABLE public."reserva_snapshot" ADD CONSTRAINT "reserva_snapshot_pkey" PRIMARY KEY (id);
ALTER TABLE public."reserva_tracking" ADD CONSTRAINT "reserva_tracking_pkey" PRIMARY KEY (id);
ALTER TABLE public."tipo_documento" ADD CONSTRAINT "tipo_documento_nombre_key" UNIQUE (nombre);
ALTER TABLE public."tipo_documento" ADD CONSTRAINT "tipo_documento_pkey" PRIMARY KEY (id);
ALTER TABLE public."vehiculo" ADD CONSTRAINT "vehiculo_pkey" PRIMARY KEY (id);
ALTER TABLE public."vehiculo" ADD CONSTRAINT "vehiculo_placa_key" UNIQUE (placa);
ALTER TABLE public."wallet" ADD CONSTRAINT "wallet_pkey" PRIMARY KEY (id_persona);
ALTER TABLE public."calificacion" ADD CONSTRAINT "calificacion_id_calificador_fkey" FOREIGN KEY (id_calificador) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."calificacion" ADD CONSTRAINT "calificacion_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."calificacion" ADD CONSTRAINT "calificacion_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE SET NULL;
ALTER TABLE public."codigo_referido" ADD CONSTRAINT "codigo_referido_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."contrato_empresa" ADD CONSTRAINT "contrato_empresa_id_empresa_fkey" FOREIGN KEY (id_empresa) REFERENCES public.perfil_empresa(id_persona) ON DELETE CASCADE;
ALTER TABLE public."dispositivo_push" ADD CONSTRAINT "dispositivo_push_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."documento_persona" ADD CONSTRAINT "documento_persona_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."documento_vehiculo" ADD CONSTRAINT "documento_vehiculo_id_vehiculo_fkey" FOREIGN KEY (id_vehiculo) REFERENCES public.vehiculo(id) ON DELETE CASCADE;
ALTER TABLE public."estado_usuario_bot" ADD CONSTRAINT "estado_usuario_bot_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."evento_notificacion" ADD CONSTRAINT "evento_notificacion_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."evento_notificacion" ADD CONSTRAINT "evento_notificacion_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE SET NULL;
ALTER TABLE public."interaccion_bot" ADD CONSTRAINT "interaccion_bot_id_jornada_fkey" FOREIGN KEY (id_jornada) REFERENCES public.jornada_bot(id) ON DELETE SET NULL;
ALTER TABLE public."jornada_bot" ADD CONSTRAINT "jornada_bot_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."jornada_bot" ADD CONSTRAINT "jornada_bot_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE SET NULL;
ALTER TABLE public."lugar_guardado" ADD CONSTRAINT "lugar_guardado_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."membresia" ADD CONSTRAINT "membresia_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.perfil_conductor(id_persona) ON DELETE CASCADE;
ALTER TABLE public."mensaje_chat" ADD CONSTRAINT "mensaje_chat_id_remitente_fkey" FOREIGN KEY (id_remitente) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."mensaje_chat" ADD CONSTRAINT "mensaje_chat_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE CASCADE;
ALTER TABLE public."movimiento_wallet" ADD CONSTRAINT "movimiento_wallet_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."movimiento_wallet" ADD CONSTRAINT "movimiento_wallet_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE SET NULL;
ALTER TABLE public."notificacion" ADD CONSTRAINT "notificacion_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."notificacion" ADD CONSTRAINT "notificacion_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE CASCADE;
ALTER TABLE public."notificacion_llamada" ADD CONSTRAINT "notificacion_llamada_id_cliente_fkey" FOREIGN KEY (id_cliente) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."notificacion_llamada" ADD CONSTRAINT "notificacion_llamada_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."peaje" ADD CONSTRAINT "peaje_id_ciudad_fkey" FOREIGN KEY (id_ciudad) REFERENCES public.ciudad(id) ON DELETE SET NULL;
ALTER TABLE public."perfil_cliente" ADD CONSTRAINT "perfil_cliente_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."perfil_conductor" ADD CONSTRAINT "perfil_conductor_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."perfil_empresa" ADD CONSTRAINT "perfil_empresa_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."persona" ADD CONSTRAINT "persona_id_ciudad_actual_fkey" FOREIGN KEY (id_ciudad_actual) REFERENCES public.ciudad(id);
ALTER TABLE public."persona" ADD CONSTRAINT "persona_id_ciudad_origen_fkey" FOREIGN KEY (id_ciudad_origen) REFERENCES public.ciudad(id);
ALTER TABLE public."persona" ADD CONSTRAINT "persona_id_tipo_documento_fkey" FOREIGN KEY (id_tipo_documento) REFERENCES public.tipo_documento(id);
ALTER TABLE public."persona_beneficiario" ADD CONSTRAINT "persona_beneficiario_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."persona_beneficiario" ADD CONSTRAINT "persona_beneficiario_id_titular_fkey" FOREIGN KEY (id_titular) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."persona_rol" ADD CONSTRAINT "persona_rol_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."queja" ADD CONSTRAINT "queja_id_reportado_fkey" FOREIGN KEY (id_reportado) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."queja" ADD CONSTRAINT "queja_id_reportante_fkey" FOREIGN KEY (id_reportante) REFERENCES public.persona(id) ON DELETE CASCADE;
ALTER TABLE public."queja" ADD CONSTRAINT "queja_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE SET NULL;
ALTER TABLE public."queja" ADD CONSTRAINT "queja_id_resuelto_por_fkey" FOREIGN KEY (id_resuelto_por) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."referido" ADD CONSTRAINT "referido_id_codigo_referido_fkey" FOREIGN KEY (id_codigo_referido) REFERENCES public.codigo_referido(id) ON DELETE CASCADE;
ALTER TABLE public."referido" ADD CONSTRAINT "referido_id_conductor_referido_fkey" FOREIGN KEY (id_conductor_referido) REFERENCES public.perfil_conductor(id_persona) ON DELETE CASCADE;
ALTER TABLE public."referido" ADD CONSTRAINT "referido_id_referente_fkey" FOREIGN KEY (id_referente) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_beneficiario_fkey" FOREIGN KEY (id_beneficiario) REFERENCES public.persona_beneficiario(id) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_categoria_fkey" FOREIGN KEY (id_categoria) REFERENCES public.categoria_vehiculo(id) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_cliente_fkey" FOREIGN KEY (id_cliente) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.perfil_conductor(id_persona) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_pasajero_fkey" FOREIGN KEY (id_pasajero) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_promocion_fkey" FOREIGN KEY (id_promocion) REFERENCES public.promocion(id) ON DELETE SET NULL;
ALTER TABLE public."reserva" ADD CONSTRAINT "reserva_id_vehiculo_fkey" FOREIGN KEY (id_vehiculo) REFERENCES public.vehiculo(id) ON DELETE SET NULL;
ALTER TABLE public."reserva_oferta_conductor" ADD CONSTRAINT "reserva_oferta_conductor_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.perfil_conductor(id_persona) ON DELETE CASCADE;
ALTER TABLE public."reserva_oferta_conductor" ADD CONSTRAINT "reserva_oferta_conductor_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE CASCADE;
ALTER TABLE public."reserva_snapshot" ADD CONSTRAINT "reserva_snapshot_id_cliente_fkey" FOREIGN KEY (id_cliente) REFERENCES public.persona(id);
ALTER TABLE public."reserva_snapshot" ADD CONSTRAINT "reserva_snapshot_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.perfil_conductor(id_persona);
ALTER TABLE public."reserva_snapshot" ADD CONSTRAINT "reserva_snapshot_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE CASCADE;
ALTER TABLE public."reserva_tracking" ADD CONSTRAINT "reserva_tracking_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.perfil_conductor(id_persona) ON DELETE SET NULL;
ALTER TABLE public."reserva_tracking" ADD CONSTRAINT "reserva_tracking_id_reserva_fkey" FOREIGN KEY (id_reserva) REFERENCES public.reserva(id) ON DELETE CASCADE;
ALTER TABLE public."vehiculo" ADD CONSTRAINT "vehiculo_id_categoria_fkey" FOREIGN KEY (id_categoria) REFERENCES public.categoria_vehiculo(id) ON DELETE RESTRICT;
ALTER TABLE public."vehiculo" ADD CONSTRAINT "vehiculo_id_conductor_fkey" FOREIGN KEY (id_conductor) REFERENCES public.perfil_conductor(id_persona) ON DELETE CASCADE;
ALTER TABLE public."vehiculo" ADD CONSTRAINT "vehiculo_id_marca_fkey" FOREIGN KEY (id_marca) REFERENCES public.marca_vehiculo(id) ON DELETE SET NULL;
ALTER TABLE public."wallet" ADD CONSTRAINT "wallet_id_persona_fkey" FOREIGN KEY (id_persona) REFERENCES public.persona(id) ON DELETE CASCADE;
