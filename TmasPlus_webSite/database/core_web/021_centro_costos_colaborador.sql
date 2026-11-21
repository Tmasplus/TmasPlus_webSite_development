-- Centro de costos del colaborador en la empresa (junto a cargo/área).
-- Código alfanumérico MAYÚSCULAS, máx. 15 (ej. G2105, 2323, TGSAS). Obligatorio al alta/edición.

ALTER TABLE public.empresa_colaborador
  ADD COLUMN IF NOT EXISTS centro_costos varchar(15);

COMMENT ON COLUMN public.empresa_colaborador.centro_costos IS
  'Código de centro de costos (mayúsculas, máx 15). Identifica dónde pertenece cargo/área.';

CREATE OR REPLACE FUNCTION public._centro_costos_norm(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v text:=upper(nullif(trim(coalesce(p,'')),''));
BEGIN
  IF v IS NULL THEN RETURN NULL; END IF;
  IF length(v)>15 THEN
    RAISE EXCEPTION 'El centro de costos admite máximo 15 caracteres';
  END IF;
  IF v !~ '^[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'El centro de costos solo admite letras y números (sin espacios ni símbolos)';
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public._empresa_colaborador_centro_costos_tg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.centro_costos:=public._centro_costos_norm(NEW.centro_costos);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_colaborador_centro_costos ON public.empresa_colaborador;
CREATE TRIGGER trg_empresa_colaborador_centro_costos
  BEFORE INSERT OR UPDATE OF centro_costos ON public.empresa_colaborador
  FOR EACH ROW EXECUTE FUNCTION public._empresa_colaborador_centro_costos_tg();

-- CREATE OR REPLACE no puede insertar columnas en medio: hay que dropear y recrear.
DROP VIEW IF EXISTS public.web_empresa_colaboradores;
CREATE VIEW public.web_empresa_colaboradores WITH (security_barrier=true) AS
SELECT ec.id AS id_vinculo, ec.id_empresa, p.id, p.nombre AS first_name, p.apellido AS last_name, p.email,
 p.telefono AS mobile, td.nombre AS document_type, p.numero_documento AS document_number, c.nombre AS city,
 ec.cargo, ec.area, ec.centro_costos, ec.activo, ec.creado_en, p.imagen_perfil AS profile_image
FROM public.empresa_colaborador ec
JOIN public.persona p ON p.id=ec.id_persona
LEFT JOIN public.tipo_documento td ON td.id=p.id_tipo_documento
LEFT JOIN public.ciudad c ON c.id=p.id_ciudad_actual
WHERE (SELECT public.es_admin()) OR ec.id_empresa=(SELECT public.empresa_actual_id());

GRANT SELECT ON public.web_empresa_colaboradores TO authenticated;

-- Alta: misma lógica de 019 + centro_costos obligatorio.
CREATE OR REPLACE FUNCTION public.web_empresa_registrar_colaborador(p_empresa uuid,p_auth_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE eid uuid:=public._empresa_contexto(p_empresa); correo text:=lower(public._txt(p_input,'email'));
 pid uuid; existente boolean:=false; centro text:=public._centro_costos_norm(public._txt(p_input,'centro_costos'));
BEGIN
 IF correo IS NULL THEN RAISE EXCEPTION 'Correo obligatorio'; END IF;
 IF centro IS NULL THEN RAISE EXCEPTION 'El centro de costos es obligatorio'; END IF;
 IF EXISTS(SELECT 1 FROM public.persona WHERE id=eid AND bloqueado) THEN RAISE EXCEPTION 'La empresa esta inactiva'; END IF;
 SELECT id INTO pid FROM public.persona WHERE lower(email)=correo;
 IF pid IS NOT NULL THEN
  existente:=true;
  IF NOT EXISTS(SELECT 1 FROM public.persona_rol WHERE id_persona=pid AND rol='cliente')
  THEN RAISE EXCEPTION 'Ese correo pertenece a una cuenta que no es Usuario App'; END IF;
 ELSE
  IF p_auth_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=correo)
  THEN RAISE EXCEPTION 'La cuenta Auth no coincide con el correo del colaborador'; END IF;
  BEGIN
   INSERT INTO public.persona(auth_id,nombre,apellido,email,telefono,id_tipo_documento,numero_documento,
    id_ciudad_actual,bloqueado,verificado)
   VALUES(p_auth_id,public._txt(p_input,'first_name'),public._txt(p_input,'last_name'),correo,public._txt(p_input,'mobile'),
    public._tipo_documento_id(coalesce(public._txt(p_input,'document_type'),'CC')),public._txt(p_input,'document_number'),
    public._ciudad_id(p_input->>'city'),false,false)
   RETURNING id INTO pid;
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'El correo o el telefono ya estan registrados en otra cuenta' USING DETAIL=SQLERRM;
  END;
  INSERT INTO public.persona_rol(id_persona,rol) VALUES(pid,'cliente');
  INSERT INTO public.perfil_cliente(id_persona) VALUES(pid);
  INSERT INTO public.wallet(id_persona) VALUES(pid);
 END IF;
 IF EXISTS(SELECT 1 FROM public.empresa_colaborador WHERE id_empresa=eid AND id_persona=pid)
 THEN RAISE EXCEPTION 'Esa persona ya es colaboradora de la empresa'; END IF;
 INSERT INTO public.empresa_colaborador(id_empresa,id_persona,cargo,area,centro_costos,creado_por)
 VALUES(eid,pid,public._txt(p_input,'cargo'),public._txt(p_input,'area'),centro,public.persona_actual_id());
 RETURN jsonb_build_object('id_persona',pid,'vinculado_existente',existente);
END $$;

-- Vincular existente: + centro_costos.
CREATE OR REPLACE FUNCTION public.web_empresa_vincular_usuario_app(p_empresa uuid,p_persona uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE eid uuid:=public._empresa_contexto(p_empresa);
 centro text:=public._centro_costos_norm(public._txt(p_input,'centro_costos'));
BEGIN
 IF EXISTS(SELECT 1 FROM public.persona WHERE id=eid AND bloqueado) THEN RAISE EXCEPTION 'La empresa esta inactiva'; END IF;
 IF centro IS NULL THEN RAISE EXCEPTION 'El centro de costos es obligatorio'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.web_empresa_buscar_usuario_app(p_empresa,p_input) s WHERE s.persona_id=p_persona)
 THEN RAISE EXCEPTION 'Los datos no coinciden con ese usuario'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.persona_rol WHERE id_persona=p_persona AND rol='cliente')
 THEN RAISE EXCEPTION 'Solo se pueden vincular Usuarios App (clientes)'; END IF;
 IF EXISTS(SELECT 1 FROM public.empresa_colaborador WHERE id_empresa=eid AND id_persona=p_persona)
 THEN RAISE EXCEPTION 'Esa persona ya es colaboradora de la empresa'; END IF;
 INSERT INTO public.empresa_colaborador(id_empresa,id_persona,cargo,area,centro_costos,creado_por)
 VALUES(eid,p_persona,public._txt(p_input,'cargo'),public._txt(p_input,'area'),centro,public.persona_actual_id());
 RETURN jsonb_build_object('id_persona',p_persona,'vinculado_existente',true);
END $$;

-- Editar datos en la empresa (cargo, área, centro de costos).
CREATE OR REPLACE FUNCTION public.web_empresa_actualizar_colaborador(p_empresa uuid,p_persona uuid,p_input jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE eid uuid:=public._empresa_contexto(p_empresa);
 centro text:=public._centro_costos_norm(public._txt(p_input,'centro_costos'));
BEGIN
 IF centro IS NULL THEN RAISE EXCEPTION 'El centro de costos es obligatorio'; END IF;
 UPDATE public.empresa_colaborador
 SET cargo=public._txt(p_input,'cargo'),
     area=public._txt(p_input,'area'),
     centro_costos=centro
 WHERE id_empresa=eid AND id_persona=p_persona;
 IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador no encontrado'; END IF;
END $$;

REVOKE ALL ON FUNCTION public.web_empresa_actualizar_colaborador(uuid,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_empresa_actualizar_colaborador(uuid,uuid,jsonb) TO authenticated;
