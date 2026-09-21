-- Least-privilege reads needed by the existing reservation screens.
GRANT SELECT ON public.persona,public.persona_rol,public.perfil_conductor,
  public.categoria_vehiculo,public.vehiculo,public.marca_vehiculo TO authenticated;
CREATE POLICY booking_core_persona_read ON public.persona FOR SELECT TO authenticated
  USING (booking_v2.is_admin() OR (auth_id=auth.uid() AND NOT bloqueado));
CREATE POLICY booking_core_roles_read ON public.persona_rol FOR SELECT TO authenticated
  USING (booking_v2.is_admin() OR id_persona=booking_v2.current_app_user_id());
CREATE POLICY booking_core_driver_read ON public.perfil_conductor FOR SELECT TO authenticated
  USING (booking_v2.is_admin() OR id_persona=booking_v2.current_app_user_id());
CREATE POLICY booking_core_vehicle_read ON public.vehiculo FOR SELECT TO authenticated
  USING (booking_v2.is_admin() OR id_conductor=booking_v2.current_app_user_id());
CREATE POLICY booking_core_category_read ON public.categoria_vehiculo FOR SELECT TO authenticated
  USING (booking_v2.is_admin() OR activo);
CREATE POLICY booking_core_brand_read ON public.marca_vehiculo FOR SELECT TO authenticated
  USING (booking_v2.is_admin() OR activo);
GRANT SELECT ON booking_v2.core_category_ids TO authenticated;
CREATE POLICY booking_core_category_map_read ON booking_v2.core_category_ids FOR SELECT TO authenticated USING (true);
GRANT SELECT ON booking_v2.core_users,booking_v2.core_cars,booking_v2.core_car_types TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_perfil_dashboard() TO authenticated;

-- No core write policies or grants, signup hooks, raw reserva API, or notifications
-- are opened here. Booking writes still use the existing guarded booking_v2 RPCs.
