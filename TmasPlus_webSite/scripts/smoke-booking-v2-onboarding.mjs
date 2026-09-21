// Explicit, temporary HTTP smoke test for Prueba only. Creates its own Auth
// accounts (confirmed, no email), cleans only their exact IDs, never resets users.
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { strict as assert } from 'node:assert';
import { createClient } from '@supabase/supabase-js';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = 'lhqhdnjmewyipuwifzsl';
const url = `https://${project}.supabase.co`;
if (process.argv[2] !== '--run' || process.argv.length !== 3) throw new Error('Use --run to create and clean temporary test accounts.');
if (readFileSync(join(root, 'supabase/.temp/project-ref'), 'utf8').trim() !== project) throw new Error('Prueba only.');
const cli = join(root, 'node_modules/supabase/dist/supabase.js');
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 120000 });
  if (result.error || result.status !== 0) throw new Error('Prueba CLI operation failed; credentials/output intentionally suppressed.');
  return JSON.parse(result.stdout);
}
function sql(body) {
  const dir = mkdtempSync(join(tmpdir(), 'tplus-onboarding-smoke-'));
  const file = join(dir, 'query.sql');
  try {
    writeFileSync(file, body, { flag: 'wx' });
    return run(['db', 'query', '--linked', '--file', file, '--output', 'json']);
  } finally { rmSync(file, { force: true }); rmdirSync(dir); }
}
const keys = run(['projects', 'api-keys', '--project-ref', project, '--output', 'json']);
const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
const anonKey = keys.find(k => k.name === 'anon')?.api_key;
if (!serviceKey || !anonKey) throw new Error('Expected project keys unavailable; no accounts created.');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const viewer = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const tag = randomUUID().replaceAll('-', '');
const password = randomUUID() + 'aA9!';
const emails = ['admin', 'customer', 'driver', 'company', 'invalid'].map(role => `${role}.${tag}@tmasplus.test`);
const createdAuth = [];
const literal = value => `'${value.replaceAll("'", "''")}'`;
let testPassed = false;
try {
  const { data, error } = await admin.auth.admin.createUser({ email: emails[0], password, email_confirm: true });
  assert.ifError(error); createdAuth.push(data.user.id);
  const aid = data.user.id;
  assert.match(aid, /^[0-9a-f-]{36}$/);
  sql(`BEGIN;
    INSERT INTO public.persona(id,auth_id,nombre,telefono,email)
      VALUES('${aid}','${aid}','HTTP smoke admin','${tag.slice(0,18)}',${literal(emails[0])});
    INSERT INTO public.persona_rol(id_persona,rol) VALUES('${aid}','admin'); COMMIT;`);
  const login = await viewer.auth.signInWithPassword({ email: emails[0], password }); assert.ifError(login.error);
  const catalog = await viewer.schema('booking_v2').from('core_car_types').select('id').eq('is_active', true).limit(1).single();
  assert.ifError(catalog.error);
  const inputs = ['customer', 'driver', 'company'].map((user_type, i) => ({ user_type, email: emails[i + 1], password,
    first_name: 'HTTP smoke', last_name: user_type, mobile: `${tag.slice(0,16)}${i}`,
    company_name: 'HTTP fixture', make: `HTTP-${tag.slice(0,12)}`, model: 'Test model', plate: `SM${tag.slice(0,10)}`,
    vehicle_type: catalog.data.id,
  }));
  const users = [];
  for (const input of inputs) {
    const response = await viewer.functions.invoke('booking-v2-create-user', { body: input });
    if (response.error) {
      const detail = await response.error.context?.json?.().catch(() => null);
      throw new Error(`HTTP onboarding failed (${input.user_type}): ${detail?.error ?? response.error.message}`);
    }
    assert.ok(response.data?.user?.auth_id); createdAuth.push(response.data.user.auth_id);
    users.push(response.data.user);
    assert.equal(response.data.user.approved, false); assert.equal(response.data.user.blocked, true);
    const canonical = await viewer.schema('booking_v2').from('core_users').select('id,user_type,blocked').eq('id', response.data.user.id).single();
    assert.ifError(canonical.error); assert.equal(canonical.data.user_type, input.user_type);
    if (input.user_type === 'driver') {
      const car = await viewer.schema('booking_v2').from('core_cars').select('id,driver_id').eq('id', response.data.car.id).single();
      assert.ifError(car.error); assert.equal(car.data.driver_id, response.data.user.id);
      const approve = await viewer.schema('booking_v2').rpc('admin_update_profile', {
        p_id: response.data.user.id, p_user: { approved: true, blocked: false }, p_car: null,
      });
      assert.ifError(approve.error); assert.equal(approve.data.user.approved, true);
    }
  }
  const invalid = await viewer.functions.invoke('booking-v2-create-user', {
    body: { ...inputs[1], email: emails[4], mobile: `${tag.slice(0,16)}9`, vehicle_type: 'missing', plate: `SM${tag.slice(0,10)}F` },
  });
  assert.ok(invalid.error, 'Invalid category must fail');
  const orphan = sql(`SELECT count(*)::int AS n FROM auth.users WHERE email=${literal(emails[4])};`);
  assert.equal(orphan.rows[0].n, 0, 'Failed SQL must compensate Auth');
  const customer = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await customer.auth.signInWithPassword({ email: emails[1], password })).error);
  const forbidden = await customer.functions.invoke('booking-v2-create-user', { body: inputs[0] });
  assert.equal(forbidden.error?.context?.status, 403, 'Non-admin must be denied');
  testPassed = true;
} finally {
  // Exact generated emails cover a response lost after commit, without touching
  // any pre-existing or user-supplied account. SQL verifies identities first.
  const owned = sql(`SELECT id FROM auth.users WHERE email IN (${emails.map(literal).join(',')});`).rows.map(r => r.id);
  for (const id of owned) assert.match(id, /^[0-9a-f-]{36}$/);
  if (owned.length) {
    const ids = owned.map(literal).join(',');
    sql(`BEGIN;
      CREATE TEMP TABLE smoke_ids ON COMMIT DROP AS SELECT id FROM public.persona WHERE auth_id IN (${ids});
      DELETE FROM public.referral_codes WHERE driver_id IN (SELECT id FROM smoke_ids);
      DELETE FROM public.cars WHERE driver_id IN (SELECT id FROM smoke_ids);
      DELETE FROM public.vehiculo WHERE id_conductor IN (SELECT id FROM smoke_ids);
      DELETE FROM public.marca_vehiculo m WHERE nombre='HTTP-${tag.slice(0,12)}'
        AND NOT EXISTS(SELECT 1 FROM public.vehiculo v WHERE v.id_marca=m.id);
      DELETE FROM public.perfil_conductor WHERE id_persona IN (SELECT id FROM smoke_ids);
      DELETE FROM public.perfil_cliente WHERE id_persona IN (SELECT id FROM smoke_ids);
      DELETE FROM public.perfil_empresa WHERE id_persona IN (SELECT id FROM smoke_ids);
      DELETE FROM public.persona_rol WHERE id_persona IN (SELECT id FROM smoke_ids);
      DELETE FROM public.users WHERE auth_id IN (${ids});
      DELETE FROM public.persona WHERE id IN (SELECT id FROM smoke_ids);
      COMMIT;`);
    for (const id of owned) assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  }
  console.log(JSON.stringify({ project, httpOnboarding: testPassed ? 'passed' : 'failed', temporaryAccountsCleaned: owned.length }));
}
