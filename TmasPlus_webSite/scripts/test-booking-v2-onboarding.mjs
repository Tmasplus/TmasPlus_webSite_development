import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/booking-v2-create-user/handler.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { createOnboardingHandler } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

function setup(options = {}) {
  const calls = [];
  const viewer = {
    auth: { getUser: async () => ({ data: { user: options.invalid ? null : { id: 'admin' } } }) },
    schema: () => ({ rpc: async (name, args) => {
      calls.push({ name, args });
      return name === 'is_admin' ? { data: options.admin !== false } :
        options.sqlError ? { error: options.sqlError } : { data: { user: { id: 'profile' }, car: { id: 'vehicle' } } };
    } }),
  };
  const privileged = { auth: { admin: {
    createUser: async args => { calls.push({ name: 'createAuth', args }); return { data: { user: { id: 'new-auth' } } }; },
    deleteUser: async id => { calls.push({ name: 'deleteAuth', id }); return { error: options.cleanupError }; },
  } } };
  const handler = createOnboardingHandler((_url, key) => key === 'service' ? privileged : viewer, name => ({
    SUPABASE_URL: options.url ?? 'https://lhqhdnjmewyipuwifzsl.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service',
  })[name]);
  const input = { user_type: 'driver', email: 'test@fixture.invalid', password: 'only-test-password', first_name: 'Test',
    last_name: 'Driver', mobile: '1234567', make: 'Test', model: 'Test', plate: 'ABC123', vehicle_type: 'category' };
  const request = (patch = {}, authorization = 'Bearer valid') => new Request('https://test.invalid', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, ...patch }),
  });
  return { handler, request, calls };
}

test('rejects other projects before Auth writes', async () => {
  const t = setup({ url: 'https://source.supabase.co' });
  assert.equal((await t.handler(t.request())).status, 403); assert.equal(t.calls.length, 0);
});
test('rejects missing and invalid sessions', async () => {
  for (const options of [{}, { invalid: true }]) {
    const t = setup(options);
    assert.equal((await t.handler(t.request({}, options.invalid ? 'Bearer invalid' : ''))).status, 401);
    assert.equal(t.calls.length, 0);
  }
});
test('rejects non-admin and blocked administrators before creating Auth', async () => {
  const t = setup({ admin: false });
  assert.equal((await t.handler(t.request())).status, 403);
  assert.deepEqual(t.calls.map(c => c.name), ['is_admin']);
});
test('validates required fields and disallows admin creation', async () => {
  for (const patch of [{ mobile: '' }, { password: 'short' }, { plate: null }, { user_type: 'admin' }]) {
    const t = setup(); assert.equal((await t.handler(t.request(patch))).status, 400);
    assert.deepEqual(t.calls.map(c => c.name), ['is_admin']);
  }
});
test('creates profile with caller authorization; password never goes to SQL', async () => {
  const t = setup(); assert.equal((await t.handler(t.request())).status, 200);
  assert.deepEqual(t.calls.map(c => c.name), ['is_admin', 'createAuth', 'admin_create_profile']);
  assert.equal(t.calls[2].args.p_auth_id, 'new-auth');
  assert.equal('password' in t.calls[2].args.p_input, false);
});
test('compensates only the newly created Auth account on definite SQL rollback', async () => {
  const t = setup({ sqlError: { code: '23505', message: 'duplicate' } });
  assert.equal((await t.handler(t.request())).status, 400);
  assert.deepEqual(t.calls.at(-1), { name: 'deleteAuth', id: 'new-auth' });
});
test('does not delete an account on an uncertain network result', async () => {
  const t = setup({ sqlError: { message: 'network timeout' } });
  const response = await t.handler(t.request()); assert.equal(response.status, 503);
  assert.equal((await response.json()).reconciliationRequired, true);
  assert.equal(t.calls.some(c => c.name === 'deleteAuth'), false);
});
test('reports failed cleanup instead of claiming full rollback', async () => {
  const t = setup({ sqlError: { code: 'P0001', message: 'invalid category' }, cleanupError: new Error('failed') });
  const response = await t.handler(t.request()); assert.equal(response.status, 503);
  assert.equal((await response.json()).reconciliationRequired, true);
});
