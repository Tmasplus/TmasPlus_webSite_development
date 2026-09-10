-- RLS policies invoke these SECURITY DEFINER helpers as the authenticated role.
-- They expose only the current identity/authorization decision, not mutations.
grant execute on function booking_v2.current_app_user_id() to authenticated;
grant execute on function booking_v2.is_admin() to authenticated;
grant execute on function booking_v2.can_access_booking(uuid) to authenticated;
