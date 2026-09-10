-- Align the cloned legacy schema with the intended App flow:
-- OTP is generated when a service starts, never when a booking is inserted.

drop trigger if exists trg_generate_booking_otp on public.bookings;
drop trigger if exists trg_set_booking_otp on public.bookings;
drop trigger if exists trg_lock_booking_otp on public.bookings;

drop function if exists public.generate_booking_otp();
drop function if exists public.set_booking_otp();
drop function if exists public.lock_booking_otp();
