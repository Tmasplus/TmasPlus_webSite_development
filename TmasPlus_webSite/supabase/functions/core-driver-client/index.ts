// Alta de un cliente por un conductor (Reservas recomendadas). Crea la cuenta Auth sin perfil automatico y el
// Usuario App con app_conductor_registrar_cliente (que valida al conductor y lo deja en su cartera). Despues le
// envia al cliente el correo para crear su contrasena (misma pagina de restablecimiento que usa la app).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-app-platform, x-app-environment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const env = (name: string) => Deno.env.get(name) ?? '';

const REQUIRED = ['first_name', 'last_name', 'mobile', 'email'];
const DEFAULT_RESET_URL = 'https://dashboard.tmasplus.com/reset-password.html';

const randomPassword = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
};

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

    // Solo un conductor aprobado puede llegar a crear cuentas Auth.
    const { error: driverError } = await viewer.rpc('app_conductor_actual');
    if (driverError) return json({ error: 'Solo conductores aprobados pueden registrar clientes' }, 403);

    let input;
    try { input = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Datos inválidos' }, 400);
    if (REQUIRED.some((key) => typeof input[key] !== 'string' || !input[key].trim())) {
      return json({ error: 'Nombre, apellido, celular y correo son obligatorios' }, 400);
    }
    const email = input.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Correo inválido' }, 400);
    const profile = {
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      mobile: input.mobile.trim(),
      email,
      document_type: typeof input.document_type === 'string' ? input.document_type.trim() : null,
      document_number: typeof input.document_number === 'string' ? input.document_number.trim() : null,
    };

    const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: existing, error: lookupError } = await admin.from('persona').select('id').eq('email', email).maybeSingle();
    if (lookupError) return json({ error: 'No se pudo verificar el correo' }, 503);
    if (existing) {
      return json({ error: 'Ese correo ya está registrado: busca al cliente y agrégalo a tu cartera', exists: true }, 409);
    }

    // skip_autoprofile: el trigger on_auth_user_created no crea persona; la crea app_conductor_registrar_cliente.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password: randomPassword(), email_confirm: true,
      user_metadata: {
        user_type: 'customer',
        first_name: profile.first_name,
        last_name: profile.last_name,
        skip_autoprofile: 'true',
      },
    });
    if (createError || !created?.user) {
      return json({ error: createError?.message ?? 'No se pudo crear la cuenta del cliente' }, 409);
    }
    const { data, error } = await viewer.rpc('app_conductor_registrar_cliente', {
      p_auth_id: created.user.id, p_input: profile,
    });
    if (error) {
      if (/^[0-9A-Z]{5}$/.test(error.code ?? '')) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        if (!cleanupError) return json({ error: error.message }, 400);
      }
      return json({
        error: 'No se pudo confirmar el registro. Revisa tu cartera antes de reintentar.',
        reconciliationRequired: true,
      }, 503);
    }

    const redirectTo = env('APP_PASSWORD_RESET_URL') || DEFAULT_RESET_URL;
    const { error: mailError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    return json({
      ...data,
      invitationSent: !mailError,
      warning: mailError ? 'El cliente quedó registrado, pero no se pudo enviar el correo para crear su contraseña.' : null,
    });
  } catch {
    return json({ error: 'No se pudo confirmar la operación. Revisa tu cartera antes de reintentar.' }, 503);
  }
});
