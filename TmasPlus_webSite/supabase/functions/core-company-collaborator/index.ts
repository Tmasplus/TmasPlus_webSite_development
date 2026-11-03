// Alta de colaborador (empresa o admin). Si el correo ya es Usuario App solo se vincula; si no, se crea
// la cuenta Auth y el Usuario App con web_empresa_registrar_colaborador (que valida empresa y pertenencia).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-app-platform, x-app-environment',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const env = (name: string) => Deno.env.get(name) ?? '';

const REQUIRED_NEW = ['first_name', 'last_name', 'mobile', 'document_type', 'document_number', 'city', 'password'];

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

    // Solo una empresa activa o un admin pueden llegar a crear cuentas Auth.
    const { data: empresaActual } = await viewer.rpc('empresa_actual_id');
    if (!empresaActual) {
      const { error: adminError } = await viewer.rpc('web_require_admin');
      if (adminError) return json({ error: 'Empresa o administrador autorizado requerido' }, 403);
    }

    let input;
    try { input = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Datos inválidos' }, 400);
    const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Correo inválido' }, 400);
    const companyId = empresaActual ? null : (input.company_id ?? null);
    if (!empresaActual && !companyId) return json({ error: 'Indique la empresa' }, 400);

    const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { password: _password, company_id: _company, ...profile } = input;
    const payload = { ...profile, email };

    const { data: existing, error: lookupError } = await admin.from('persona').select('id').eq('email', email).maybeSingle();
    if (lookupError) return json({ error: 'No se pudo verificar el correo' }, 503);
    if (existing) {
      const { data, error } = await viewer.rpc('web_empresa_registrar_colaborador', {
        p_empresa: companyId, p_auth_id: null, p_input: payload,
      });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    if (REQUIRED_NEW.some((key) => typeof input[key] !== 'string' || !input[key].trim())) {
      return json({ error: 'Complete los datos obligatorios del colaborador' }, 400);
    }
    if (input.password.length < 8) return json({ error: 'La contraseña debe tener mínimo 8 caracteres' }, 400);

    // skip_autoprofile: el trigger on_auth_user_created no crea persona; la crea web_empresa_registrar_colaborador.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email, password: input.password, email_confirm: true,
      user_metadata: {
        user_type: 'customer',
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
        skip_autoprofile: 'true',
      },
    });
    if (createError || !created?.user) {
      return json({ error: createError?.message ?? 'No se pudo crear la cuenta del colaborador' }, 409);
    }
    const { data, error } = await viewer.rpc('web_empresa_registrar_colaborador', {
      p_empresa: companyId, p_auth_id: created.user.id, p_input: payload,
    });
    if (error) {
      if (/^[0-9A-Z]{5}$/.test(error.code ?? '')) {
        const { error: cleanupError } = await admin.auth.admin.deleteUser(created.user.id);
        if (!cleanupError) return json({ error: error.message }, 400);
      }
      return json({
        error: 'No se pudo confirmar el alta. Revise Colaboradores antes de reintentar.',
        reconciliationRequired: true,
      }, 503);
    }
    return json({ ...data, authCreated: true });
  } catch {
    return json({ error: 'No se pudo confirmar la operación. Revise Colaboradores antes de reintentar.' }, 503);
  }
});
