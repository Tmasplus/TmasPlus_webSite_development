// Alta de empresa (solo admin): crea la cuenta Auth de acceso y luego el perfil con web_admin_crear_empresa.
// Si la base rechaza el alta, se borra la cuenta Auth recien creada para no dejar accesos huerfanos.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-app-platform, x-app-environment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const env = (name: string) => Deno.env.get(name) ?? '';

const REQUIRED = [
  'razon_social', 'nit', 'dv', 'tipo_empresa', 'correo_corporativo', 'telefono', 'departamento', 'ciudad',
  'direccion', 'rep_nombre', 'rep_tipo_documento', 'rep_numero_documento', 'rep_email', 'acceso_email', 'password',
];

Deno.serve(async (req: Request) => {
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
    const { error: permissionError } = await viewer.rpc('web_require_admin');
    if (permissionError) return json({ error: 'Administrador autorizado requerido' }, 403);

    let input;
    try { input = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Datos inválidos' }, 400);
    if (REQUIRED.some((key) => typeof input[key] !== 'string' || !input[key].trim())) {
      return json({ error: 'Complete los datos obligatorios de la empresa' }, 400);
    }
    if (input.password.length < 8) return json({ error: 'La contraseña debe tener mínimo 8 caracteres' }, 400);

    const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email = input.acceso_email.trim().toLowerCase();
    // skip_autoprofile: el trigger on_auth_user_created no crea persona; la crea web_admin_crear_empresa.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password: input.password, email_confirm: true,
      user_metadata: { user_type: 'company', company_name: input.razon_social.trim(), skip_autoprofile: 'true' },
    });
    if (createError || !created?.user) {
      return json({ error: createError?.message ?? 'No se pudo crear la cuenta de acceso' }, 409);
    }
    // La contraseña nunca llega a SQL ni a los logs.
    const { password: _password, ...profile } = input;
    const { data, error } = await viewer.rpc('web_admin_crear_empresa', {
      p_auth_id: created.user.id, p_input: { ...profile, acceso_email: email },
    });
    if (error) {
      if (/^[0-9A-Z]{5}$/.test(error.code ?? '')) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        if (!cleanupError) return json({ error: error.message }, 400);
      }
      return json({
        error: 'No se pudo confirmar el alta. Revise Empresas antes de reintentar; puede requerir reconciliar Auth.',
        reconciliationRequired: true,
      }, 503);
    }
    if (!data) return json({ error: 'Alta sin confirmación; revise Empresas antes de reintentar', reconciliationRequired: true }, 503);
    return json({ id: data, authCreated: true });
  } catch {
    return json({ error: 'No se pudo confirmar la operación. Revise Empresas antes de reintentar.' }, 503);
  }
});
