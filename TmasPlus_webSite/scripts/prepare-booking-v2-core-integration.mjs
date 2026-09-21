// Canonical core integration for Prueba. Default is rollback-only.
// Default: install + test + ROLLBACK. Commit requires --apply --backup <private manifest>.
import { readFileSync, mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = 'lhqhdnjmewyipuwifzsl';
if (readFileSync(join(root,'supabase/.temp/project-ref'),'utf8').trim() !== project) {
  throw new Error('Refusing non-Prueba project.');
}
const args = process.argv.slice(2);
const apply = args[0] === '--apply';
if (args.length && !(apply && args.length === 3 && args[1] === '--backup')) {
  throw new Error('Use no arguments for rollback test, or --apply --backup <manifest>.');
}
if (apply) {
  const path = resolve(args[2]);
  const backup = JSON.parse(readFileSync(path,'utf8'));
  const age = Date.now() - Date.parse(backup.createdAt);
  if (backup.project !== project || backup.archive !== 'application.dump' || !backup.archiveDecoded ||
    !Number.isFinite(age) || age < 0 || age > 86400000 ||
    !['public','booking_v2','auth'].every(s => backup.schemas?.includes(s))) {
    throw new Error('Fresh verified Prueba application backup required.');
  }
  const hash = createHash('sha256').update(readFileSync(join(dirname(path),backup.archive))).digest('hex');
  if (hash !== backup.sha256) throw new Error('Backup checksum mismatch.');
}
const files = ['003_core_test_entities.sql','004_booking_core_references.sql','005_core_booking_reads.sql','006_core_category_commands.sql','007_legacy_fixture_updates.sql','008_core_onboarding.sql'];
const patches = files.map(name => {
  const body = readFileSync(join(root,'database/core',name),'utf8').replace(/\r\n/g,'\n');
  if (body.includes('$core_body$')) throw new Error('Unexpected SQL delimiter.');
  const hash = createHash('sha256').update(body).digest('hex');
  return `DO $core_patch$ BEGIN
    IF EXISTS (SELECT 1 FROM booking_v2.test_patch_receipts WHERE name='core/${name}' AND sha256<>'${hash}') THEN
      RAISE EXCEPTION 'Applied core patch changed: ${name}';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM booking_v2.test_patch_receipts WHERE name='core/${name}') THEN
      EXECUTE $core_body$${body}$core_body$;
      INSERT INTO booking_v2.test_patch_receipts(name,sha256) VALUES ('core/${name}','${hash}');
    END IF;
  END $core_patch$;`;
}).join('\n');
const tests = ['booking_v2_core_integration_test.sql','booking_v2_core_onboarding_test.sql']
  .map(name => readFileSync(join(root,'database/tests',name),'utf8')).join('\n');
const precondition = `DO $ready$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM booking_v2.test_patch_receipts WHERE name='core/002_core_routines.sql')
  THEN RAISE EXCEPTION 'Install the core foundation first'; END IF;
END $ready$;`;
const prefix = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='45s';\n";
const sql = prefix + precondition + patches + tests + '\nROLLBACK;\n' +
  (apply ? prefix + precondition + patches + "\nNOTIFY pgrst, 'reload schema';\nCOMMIT;" : '');
const temp = mkdtempSync(join(tmpdir(),'tplus-core-foundation-'));
const file = join(temp,'foundation.sql');
try {
  writeFileSync(file,sql,{flag:'wx'});
  const run = spawnSync(process.execPath,[join(root,'node_modules/supabase/dist/supabase.js'),
    'db','query','--linked','--file',file,'--output','json'],{cwd:root,encoding:'utf8',timeout:120000});
  if (run.error || run.status !== 0) {
    process.stderr.write(run.stderr || run.stdout || 'Core foundation failed.');
    process.exitCode=1;
  } else console.log(JSON.stringify({project,stage:'core-booking-integration',tests:'passed',
    changesInThisRun:apply?'committed':'rolled back'},null,2));
} finally {
  rmSync(file,{force:true});
  rmdirSync(temp);
}
