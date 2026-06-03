// Revisa el estado COMPLETO de un usuario: auth.users vs public.users (+ driver).
// Uso: node scripts/check-user-state.mjs shiliwalastore@gmail.com
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
function loadEnv() {
  const env = {};
  const raw = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trimStart().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return { ...env, ...process.env };
}
const env = loadEnv();
const email = (process.argv[2] || 'shiliwalastore@gmail.com').trim().toLowerCase();
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n🔎 Estado completo de: ${email}\n${'='.repeat(60)}`);

// public.users (todas las columnas) por email
const { data: rows, error } = await admin.from('users').select('*').eq('email', email);
if (error) {
  console.log(`❌ Error consultando public.users: ${error.message}`);
} else if (!rows || rows.length === 0) {
  console.log(`🟧 public.users: NO existe ninguna fila con ese email.`);
  console.log(`   → Confirma la DESINCRONIZACIÓN: está en auth.users pero NO en public.users.`);
} else {
  console.log(`✅ public.users: ${rows.length} fila(s):`);
  for (const r of rows) {
    console.log('  -', JSON.stringify({
      id: r.id, auth_id: r.auth_id, email: r.email,
      user_type: r.user_type, approved: r.approved,
      first_name: r.first_name, last_name: r.last_name,
      mobile: r.mobile, created_at: r.created_at,
    }, null, 0));
  }
}
console.log(`${'='.repeat(60)}\n`);
