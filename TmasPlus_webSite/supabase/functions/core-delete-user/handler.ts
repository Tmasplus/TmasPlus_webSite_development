// Eliminación de cuenta por un administrador. Misma lógica que la Edge Function
// `delete-account` de la App (anonimiza persona/perfil_conductor, borra
// documentos y tokens push, banea el acceso) para que ambos caminos dejen la
// cuenta igual: el correo original queda libre y el registro sale de los listados.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-app-platform, x-app-environment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

const ACTIVE_STATES = ['NEW', 'PENDING', 'ACCEPTED', 'ARRIVED', 'STARTED', 'REACHED', 'PAID'];

export function createDeleteUserHandler(createClient: any, env: (name: string) => string | undefined) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return json({ error: 'POST requerido' }, 405);
    try {
      const url = env('SUPABASE_URL');
      if (url !== 'https://zvplcamcyldcquxqnftb.supabase.co') return json({ error: 'Solo disponible en core' }, 403);
      const authorization = req.headers.get('Authorization') ?? '';
      if (!authorization.startsWith('Bearer ')) return json({ error: 'Se requiere sesión' }, 401);
      const viewer = createClient(url, env('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: caller, error: authError } = await viewer.auth.getUser(authorization.slice(7));
      if (authError || !caller?.user) return json({ error: 'Sesión inválida' }, 401);
      const { error: permissionError } = await viewer.rpc('web_require_admin');
      if (permissionError) return json({ error: 'Administrador autorizado requerido' }, 403);

      let input;
      try { input = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
      const pid = typeof input?.id === 'string' ? input.id : '';
      if (!pid) return json({ error: 'Falta el id del usuario' }, 400);

      const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

      // Borrado PERMANENTE (persona + todo lo que cuelga de ella). La BD hace el borrado en una transacción
      // (RPC web_purge_person, database/core_web/010_purge_person.sql); aquí solo se elimina el usuario de auth.
      // dry_run=true devuelve los conteos sin borrar nada.
      if (input?.permanent === true) {
        const dryRun = input?.dry_run !== false;
        const { data: purge, error: purgeError } = await viewer.rpc('web_purge_person', { p_id: pid, p_dry_run: dryRun });
        if (purgeError) {
          const code = String(purgeError.message ?? '').startsWith('VIAJE_ACTIVO') ? 'VIAJE_ACTIVO' : 'PURGE_FAILED';
          return json({ error: code, message: purgeError.message }, code === 'VIAJE_ACTIVO' ? 409 : 400);
        }
        if (!dryRun && purge?.auth_id) {
          const { error: authDelError } = await admin.auth.admin.deleteUser(purge.auth_id);
          if (authDelError) return json({ error: `Datos eliminados, pero no se pudo borrar el acceso: ${authDelError.message}`, counts: purge.counts }, 500);
        }
        return json({ ok: true, dry_run: dryRun, counts: purge?.counts ?? {} });
      }

      const { data: persona, error: pErr } = await admin.from('persona').select('id, auth_id').eq('id', pid).maybeSingle();
      if (pErr) return json({ error: `No se pudo leer el perfil: ${pErr.message}` }, 500);
      if (!persona) return json({ error: 'Usuario no encontrado' }, 404);
      if (persona.auth_id && persona.auth_id === caller.user.id) return json({ error: 'No puede eliminar su propia cuenta de administrador' }, 400);

      const { data: roles } = await admin.from('persona_rol').select('rol').eq('id_persona', pid).eq('rol', 'admin').limit(1);
      if (roles && roles.length > 0) return json({ error: 'No se puede eliminar a un administrador' }, 400);

      const { data: enCurso } = await admin.from('reserva').select('id')
        .or(`id_cliente.eq.${pid},id_conductor.eq.${pid}`).in('estado', ACTIVE_STATES).limit(1);
      if (enCurso && enCurso.length > 0) {
        return json({ error: 'VIAJE_ACTIVO', message: 'El usuario tiene un viaje en curso. Debe finalizarlo antes de eliminarlo.' }, 409);
      }

      const sufijo = (persona.auth_id ?? pid).slice(0, 8);
      const { error: upErr } = await admin.from('persona').update({
        nombre: 'Usuario', apellido: 'eliminado',
        email: `eliminado+${sufijo}@invalid.local`, telefono: `eliminado-${sufijo}`,
        imagen_perfil: null, numero_documento: null, id_tipo_documento: null,
        id_ciudad_actual: null, id_ciudad_origen: null, codigo_referido_usado: null,
        ultima_lat: null, ultima_lng: null, bloqueado: true, verificado: false,
      }).eq('id', pid);
      if (upErr) return json({ error: `No se pudo anonimizar: ${upErr.message}` }, 500);

      await admin.from('perfil_conductor').update({
        aprobado: false, en_servicio: false, activo: false, numero_licencia: null, numero_cuenta_bancaria: null,
      }).eq('id_persona', pid);
      await admin.from('documento_persona').delete().eq('id_persona', pid);
      const { data: vehs } = await admin.from('vehiculo').select('id').eq('id_conductor', pid);
      const vehIds = (vehs ?? []).map((v: { id: string }) => v.id);
      if (vehIds.length > 0) await admin.from('documento_vehiculo').delete().in('id_vehiculo', vehIds);
      await admin.from('dispositivo_push').delete().eq('id_persona', pid);

      if (persona.auth_id) {
        const { error: banError } = await admin.auth.admin.updateUserById(persona.auth_id, {
          email: `eliminado+${sufijo}@invalid.local`,
          password: crypto.randomUUID() + crypto.randomUUID(),
          ban_duration: '876000h',
          user_metadata: { deleted_at: new Date().toISOString() },
        });
        if (banError) return json({ error: `Perfil anonimizado, pero no se pudo cerrar el acceso: ${banError.message}` }, 500);
        await admin.auth.admin.signOut(persona.auth_id).catch(() => {});
      }
      return json({ ok: true, message: 'Cuenta eliminada' });
    } catch {
      return json({ error: 'No se pudo confirmar la operación. Revise Usuarios antes de reintentar.' }, 503);
    }
  };
}
