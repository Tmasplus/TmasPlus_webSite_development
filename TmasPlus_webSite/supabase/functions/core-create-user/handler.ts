// Dependency injection keeps authorization/rollback behavior testable without Auth writes.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-app-platform, x-app-environment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export function createOnboardingHandler(createClient: any, env: (name: string) => string | undefined) {
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
      const { data: auth, error: authError } = await viewer.auth.getUser(authorization.slice(7));
      if (authError || !auth?.user) return json({ error: 'Sesión inválida' }, 401);
      const db = viewer;
      const { error: permissionError } = await db.rpc('web_require_admin');
      if (permissionError) return json({ error: 'Administrador autorizado requerido' }, 403);
      let input;
      try { input = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Datos inválidos' }, 400);
      if (!['customer', 'driver', 'company'].includes(input.user_type)) return json({ error: 'Tipo de usuario inválido' }, 400);
      const required = ['email', 'password', 'first_name', 'last_name', 'mobile'];
      if (input.user_type === 'driver') required.push('make', 'model', 'plate', 'vehicle_type');
      if (required.some(key => typeof input[key] !== 'string' || !input[key].trim())) {
        return json({ error: 'Complete los datos obligatorios del usuario y vehículo' }, 400);
      }
      if (input.password.length < 8 || input.mobile.trim().length > 20) {
        return json({ error: 'Contraseña de mínimo 8 caracteres y teléfono de máximo 20' }, 400);
      }
      const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const email = input.email.trim().toLowerCase();
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password: input.password, email_confirm: true,
        user_metadata: { first_name: input.first_name.trim(), last_name: input.last_name.trim(), user_type: input.user_type },
      });
      if (createError || !created?.user) return json({ error: createError?.message ?? 'No se pudo crear la cuenta' }, 409);
      // Password never reaches SQL, logs or public profile metadata.
      const { password: _password, ...profile } = input;
      const { data, error } = await db.rpc('web_admin_create_profile', {
        p_auth_id: created.user.id, p_input: { ...profile, email },
      });
      if (error) {
        // A Postgres error guarantees transaction rollback. Transport failures do
        // not: do not delete a potentially committed account on an uncertain result.
        if (/^[0-9A-Z]{5}$/.test(error.code ?? '')) {
          const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
          if (!cleanupError) return json({ error: `No se guardó el alta: ${error.message}` }, 400);
        }
        return json({ error: 'No se pudo confirmar el alta. Revise el correo en Usuarios antes de reintentar; puede requerir reconciliar Auth.', reconciliationRequired: true }, 503);
      }
      if (!data?.user) return json({ error: 'Alta sin confirmación; revise Usuarios antes de reintentar', reconciliationRequired: true }, 503);
      return json({ ...data, authCreated: true });
    } catch {
      return json({ error: 'No se pudo confirmar la operación. Revise Usuarios antes de reintentar.' }, 503);
    }
  };
}
