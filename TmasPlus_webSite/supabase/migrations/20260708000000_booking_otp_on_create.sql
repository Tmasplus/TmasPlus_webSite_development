-- ============================================================================
-- ROLLBACK — OTP: se genera en la APP al INICIAR el servicio y nunca cambia.
--
-- Contexto: se intentó generar el OTP con triggers de base de datos (uno al
-- CREAR la reserva y un "candado" al actualizar). Esto ROMPIÓ la generación
-- real: la App escribe el OTP cuando el conductor inicia el viaje (STARTED), y
-- el candado se lo impedía porque el OTP ya venía puesto desde la creación.
--
-- Comportamiento correcto (el nativo de la App): el OTP no existe al crear la
-- reserva; la App lo genera al iniciar el servicio y luego no lo modifica. No
-- se necesita ningún trigger para eso.
--
-- Esta migración simplemente elimina los triggers/funciones dañinos para dejar
-- el sistema como estaba antes.
--
-- EJECUTAR EN EL PROYECTO SECUNDARIO / DE LA APP (utofhxgzkdhljrixperh),
-- en Supabase Studio -> SQL Editor.
-- ============================================================================

drop trigger  if exists trg_lock_booking_otp on public.bookings;
drop trigger  if exists trg_set_booking_otp  on public.bookings;
drop function if exists public.lock_booking_otp();
drop function if exists public.set_booking_otp();
