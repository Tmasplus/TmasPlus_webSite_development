// Runs ONLY against the linked Prueba project. Default is an all-rollback test.
// --apply commits the tested patches, never the production baseline or real data.
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../', import.meta.url));
const expected = 'lhqhdnjmewyipuwifzsl';
const linked = readFileSync(join(root,'supabase','.temp','project-ref'),'utf8').trim();
if (linked !== expected) throw new Error(`Refusing project ${linked}; expected Prueba (${expected})`);
if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('Only --apply is supported');
const apply = process.argv.includes('--apply');
const migrations = [
  '20260910000000_fix_booking_v2_membership_identity.sql',
  '20260910010000_preserve_legacy_booking_schedule.sql',
  '20260910020000_booking_v2_pickup_otp.sql',
  '20260910030000_booking_v2_transition_permissions.sql',
  '20260910040000_booking_v2_mobile_projection.sql',
  '20260910050000_booking_v2_mobile_commands.sql',
  '20260910060000_booking_v2_code_delivery.sql',
  '20260910070000_booking_v2_admin_drivers.sql',
  '20260910080000_booking_v2_notification_outbox.sql',
  '20260910090000_booking_v2_rpc_identity_guard.sql',
  '20260915000000_booking_v2_live_locations.sql',
  '20260915010000_booking_v2_mass_notifications.sql',
];
const tests = ['booking_v2_smoke_test.sql','booking_v2_schedule_migration_test.sql'];
const migrationSql = `create table if not exists booking_v2.test_patch_receipts(name text primary key, sha256 text not null);\n` + migrations.map(name => {
  const body = readFileSync(join(root,'supabase','migrations',name),'utf8');
  const hash = createHash('sha256').update(body.replace(/\r\n/g,'\n')).digest('hex');
  return `do $runner$ begin
    if exists(select 1 from booking_v2.test_patch_receipts where name='${name}' and sha256<>'${hash}') then
      raise exception 'Patch changed after application: ${name}';
    end if;
    if not exists(select 1 from booking_v2.test_patch_receipts where name='${name}') then
      execute $migration$${body}$migration$;
      insert into booking_v2.test_patch_receipts values('${name}','${hash}');
    end if;
  end $runner$;`;
}).join('\n');
const testSql = tests.map(name => readFileSync(join(root,'database','tests',name),'utf8')
  .replace(/^begin;\s*$/im,'').replace(/^rollback;\s*$/im,'')).join('\n');
// First transaction applies the patches and runs fixtures, then rolls everything back.
// In apply mode a second atomic transaction commits patches only after all assertions pass.
const sql = `begin;\n${migrationSql}\n${testSql}\nrollback;\n` +
  (apply ? `begin;\n${migrationSql}\nnotify pgrst, 'reload schema';\ncommit;\n` : '');
const temp = mkdtempSync(join(tmpdir(),'tplus-v2-'));
try {
  const path = join(temp,'verified-patches.sql');
  writeFileSync(path,sql);
  const run = spawnSync(process.execPath,[join(root,'node_modules','supabase','dist','supabase.js'),
    'db','query','--linked','--file',path,'--output','json'],{cwd:root,encoding:'utf8'});
  if (run.error) throw run.error;
  if (run.status !== 0) { process.stderr.write(run.stderr || run.stdout || 'SQL failed'); process.exitCode=1; }
  else console.log(JSON.stringify({project:expected,tests:'passed',patches:apply?'applied':'rolled back',fixtures:'rolled back',migrations},null,2));
} finally {
  // Exact files created by this process only; no recursive deletion.
  rmSync(join(temp,'verified-patches.sql'),{force:true});
  rmdirSync(temp);
}
