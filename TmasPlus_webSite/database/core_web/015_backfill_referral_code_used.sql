-- NO aplicado: requiere autorizacion expresa para produccion (escribe en persona).
-- Problema: la app guarda el codigo de referido al registrarse en auth.users.raw_user_meta_data->>'referred_by_code',
-- pero el trigger handle_new_user solo lee 'referral_id' (web). Resultado: persona.codigo_referido_usado queda NULL
-- y la web (y los conteos de la 014) no ven a esas personas. Se detectaron 73 casos (ej. cedula 19332926).
-- Esta migracion copia el codigo desde los metadatos SOLO donde persona.codigo_referido_usado esta vacio.
-- No sobrescribe valores existentes. Pendiente aparte: ajustar handle_new_user para que tambien lea 'referred_by_code'
-- en registros nuevos (si no, el problema se repite).
BEGIN;
SET LOCAL lock_timeout='5s';

-- Respaldo de lo que se va a modificar, para poder revertir.
CREATE TABLE IF NOT EXISTS public._respaldo_015_codigo_referido AS
SELECT p.id AS id_persona,
 coalesce(nullif(trim(a.raw_user_meta_data->>'referred_by_code'),''),
          nullif(trim(a.raw_user_meta_data->>'referral_id'),''),
          nullif(trim(a.raw_user_meta_data->>'referral_code'),'')) AS codigo_copiado
FROM public.persona p JOIN auth.users a ON a.id=p.auth_id
WHERE p.codigo_referido_usado IS NULL
 AND coalesce(nullif(trim(a.raw_user_meta_data->>'referred_by_code'),''),
              nullif(trim(a.raw_user_meta_data->>'referral_id'),''),
              nullif(trim(a.raw_user_meta_data->>'referral_code'),'')) IS NOT NULL;

UPDATE public.persona p SET codigo_referido_usado=upper(r.codigo_copiado)
FROM public._respaldo_015_codigo_referido r
WHERE r.id_persona=p.id AND p.codigo_referido_usado IS NULL;

-- Prevencion: handle_new_user ahora tambien acepta 'referred_by_code' (app) y 'referral_code', ademas de
-- 'referral_id' (web). Unico cambio respecto a la version anterior: la asignacion de v_ref.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_pid       uuid;
  v_first     text := nullif(trim(v_meta->>'first_name'), '');
  v_last      text := nullif(trim(v_meta->>'last_name'), '');
  v_tel       text := regexp_replace(coalesce(v_meta->>'phone', new.phone, ''), '\D', '', 'g');
  v_doc_num   text := nullif(trim(v_meta->>'document_number'), '');
  v_doc_type  text := nullif(trim(v_meta->>'document_type'), '');
  v_id_tipo   int;
  v_user_type text := lower(coalesce(v_meta->>'user_type', ''));
  v_rol       rol_persona;
  v_ref       text := upper(coalesce(nullif(trim(v_meta->>'referral_id'), ''),
                                     nullif(trim(v_meta->>'referred_by_code'), ''),
                                     nullif(trim(v_meta->>'referral_code'), '')));
begin
  if coalesce(v_meta->>'skip_autoprofile', '') = 'true' then
    return new;
  end if;

  if exists (select 1 from persona where auth_id = new.id) then
    return new;
  end if;

  if length(v_tel) > 10 then v_tel := right(v_tel, 10); end if;

  if v_doc_type is not null then
    select id into v_id_tipo from tipo_documento
     where lower(nombre) = lower(v_doc_type)
        or lower(coalesce(acronimo, '')) = lower(v_doc_type)
     limit 1;
  end if;

  v_rol := (case v_user_type
              when 'driver'  then 'conductor'
              when 'company' then 'empresa'
              else 'cliente'
            end)::rol_persona;

  insert into persona (auth_id, nombre, apellido, email, telefono,
                       numero_documento, id_tipo_documento, codigo_referido_usado,
                       bloqueado, verificado)
  values (new.id, coalesce(v_first, 'Usuario'), coalesce(v_last, ''),
          lower(new.email), coalesce(v_tel, ''),
          v_doc_num, v_id_tipo, v_ref, false, false)
  returning id into v_pid;

  insert into persona_rol (id_persona, rol) values (v_pid, v_rol)
  on conflict do nothing;

  if v_rol = 'conductor' then
    insert into perfil_conductor (id_persona, aprobado, activo, en_servicio)
    values (v_pid, false, true, false) on conflict do nothing;
  elsif v_rol = 'empresa' then
    insert into perfil_empresa (id_persona, razon_social)
    values (v_pid, coalesce(nullif(trim(v_meta->>'company_name'), ''),
                            nullif(trim(coalesce(v_first, '') || ' ' || coalesce(v_last, '')), ''),
                            'Empresa'))
    on conflict do nothing;
  else
    insert into perfil_cliente (id_persona) values (v_pid) on conflict do nothing;
  end if;

  insert into wallet (id_persona) values (v_pid) on conflict do nothing;

  return new;
end;
$function$;

COMMIT;

-- Revertir el trigger: volver a poner v_ref text := nullif(trim(v_meta->>'referral_id'), '');
-- Revertir: UPDATE public.persona p SET codigo_referido_usado=NULL FROM public._respaldo_015_codigo_referido r
--   WHERE r.id_persona=p.id AND upper(p.codigo_referido_usado)=upper(r.codigo_copiado);
--   (y luego DROP TABLE public._respaldo_015_codigo_referido)
