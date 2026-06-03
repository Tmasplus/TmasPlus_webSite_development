// Diagnóstico de entrega de correo de registro (Supabase Auth)
// Uso:
//   node scripts/diagnose-email.mjs shiliwalastore@gmail.com
//
// Requiere en .env (NO se commitea):
//   VITE_SUPABASE_URL=...                       (ya existe)
//   SUPABASE_SERVICE_ROLE_KEY=...               (añádela: Dashboard → Settings → API → service_role)
//   SUPABASE_SECONDARY_SERVICE_ROLE_KEY=...     (opcional, para revisar el 2º proyecto)
//
// El script NO modifica nada: solo lee.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Carga manual de .env (sin dependencias extra) ---
function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trimStart().startsWith('#')) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch {
    console.error('No pude leer .env'); process.exit(1);
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const email = (process.argv[2] || 'shiliwalastore@gmail.com').trim().toLowerCase();

const projects = [
  { name: 'PRIMARIO', url: env.VITE_SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY },
  { name: 'SECUNDARIO', url: env.VITE_SUPABASE_SECONDARY_URL, key: env.SUPABASE_SECONDARY_SERVICE_ROLE_KEY },
];

// Decodifica el payload de un JWT de Supabase (anon/service_role) sin verificar firma.
// Solo lee role + ref para avisar si pegaste la clave equivocada. No expone el secreto.
function inspectKey(key) {
  try {
    const parts = key.split('.');
    if (parts.length !== 3) return { format: 'no-jwt' }; // ej. sb_secret_... / sb_publishable_...
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return { format: 'jwt', role: payload.role, ref: payload.ref };
  } catch {
    return { format: 'ilegible' };
  }
}

async function findUser(admin, email) {
  // supabase-js 2.39 no tiene getUserByEmail → paginamos listUsers
  let page = 1;
  const perPage = 1000;
  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email);
    if (hit) return { user: hit, totalScanned: (page - 1) * perPage + data.users.length };
    if (data.users.length < perPage) return { user: null, totalScanned: (page - 1) * perPage + data.users.length };
    page++;
  }
  return { user: null, totalScanned: 'muchos (>50k)' };
}

console.log(`\n🔎 Diagnóstico de correo de registro para: ${email}\n${'='.repeat(60)}`);

for (const p of projects) {
  if (!p.url) continue;
  console.log(`\n■ Proyecto ${p.name}  (${p.url.replace('https://', '')})`);
  if (!p.key) {
    console.log(`  ⚠️  Falta service role key (${p.name === 'PRIMARIO' ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_SECONDARY_SERVICE_ROLE_KEY'}) → omitido.`);
    continue;
  }
  // --- Verificación de la clave ANTES de consultar ---
  const expectedRef = p.url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  const info = inspectKey(p.key);
  if (info.format === 'jwt') {
    console.log(`  clave: rol="${info.role}"  ref="${info.ref}"`);
    if (info.role !== 'service_role') {
      console.log(`  🟥 ESA CLAVE NO SIRVE: es "${info.role}", se necesita "service_role".`);
      console.log(`     → Dashboard del proyecto ${expectedRef} → Settings → API → copia el secret "service_role".`);
      continue;
    }
    if (expectedRef && info.ref && info.ref !== expectedRef) {
      console.log(`  🟥 CLAVE DE OTRO PROYECTO: la clave es de "${info.ref}" pero la URL es "${expectedRef}".`);
      continue;
    }
  } else if (info.format === 'no-jwt') {
    console.log(`  clave: formato nuevo (sb_...). Asegúrate de usar el "secret key", no el "publishable".`);
  }

  const admin = createClient(p.url, p.key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const { user, totalScanned } = await findUser(admin, email);
    if (!user) {
      console.log(`  ✅ NO existe en auth.users (escaneados: ${totalScanned}).`);
      console.log(`     → Si tu UI dijo "Verifica tu Correo", el signUp creó el usuario pero el correo no se entregó.`);
      console.log(`     → Causa probable: SMTP de prueba saturado/spam, o "Confirm email" desactivado.`);
    } else {
      console.log(`  ⚠️  YA EXISTE en auth.users:`);
      console.log(`     id:            ${user.id}`);
      console.log(`     creado:        ${user.created_at}`);
      console.log(`     email_confirmed_at: ${user.email_confirmed_at || '— (sin confirmar)'}`);
      console.log(`     last_sign_in_at:    ${user.last_sign_in_at || '— (nunca)'}`);
      if (user.email_confirmed_at) {
        console.log(`\n     🟥 CAUSA ENCONTRADA: el usuario ya está CONFIRMADO.`);
        console.log(`        → signUp() NO reenvía correo a usuarios ya confirmados (anti-enumeración).`);
        console.log(`        → Por eso la UI dice "enviado" pero nunca llega nada.`);
        console.log(`        → Solución: este usuario debe ENTRAR por la App, no re-registrarse.`);
      } else {
        console.log(`\n     🟧 Usuario existe pero SIN confirmar.`);
        console.log(`        → signUp() repetido debería reenviar, pero está sujeto al rate-limit de email (~2/h).`);
        console.log(`        → Revisa spam y configura SMTP propio. Puedes reenviar con resend (ver abajo).`);
      }
    }
  } catch (e) {
    console.log(`  ❌ Error consultando: ${e.message || e}`);
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log('Siguientes comprobaciones manuales en el Dashboard:');
console.log('  • Authentication → Providers → Email → "Confirm email" debe estar ON');
console.log('  • Authentication → Emails → SMTP Settings: ¿hay SMTP propio? (si no, límite ~2/h)');
console.log('  • Authentication → Logs: busca el evento de envío / errores SMTP / rate limit\n');
