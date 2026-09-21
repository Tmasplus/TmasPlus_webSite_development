// Additive, closed core foundation ONLY. Does not switch the web or migrate v2 identities.
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
const files = ['001_core_structure.sql','002_core_routines.sql'];
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
const snapshot = `CREATE TEMP TABLE core_original_routines ON COMMIT DROP AS
  SELECT p.oid,md5(pg_get_functiondef(p.oid)) AS hash FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','booking_v2') AND p.prokind IN ('f','p');`;
const tests = readFileSync(join(root,'database/tests/booking_v2_core_foundation_test.sql'),'utf8');
// All assertions run in the SAME transaction as the installation, before any commit.
const sql = `BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='45s';\n${snapshot}\n${patches}\n${tests}\n${apply ? 'COMMIT;' : 'ROLLBACK;'}`;
const temp = mkdtempSync(join(tmpdir(),'tplus-core-foundation-'));
const file = join(temp,'foundation.sql');
try {
  writeFileSync(file,sql,{flag:'wx'});
  const run = spawnSync(process.execPath,[join(root,'node_modules/supabase/dist/supabase.js'),
    'db','query','--linked','--file',file,'--output','json'],{cwd:root,encoding:'utf8',timeout:120000});
  if (run.error || run.status !== 0) {
    process.stderr.write(run.stderr || run.stdout || 'Core foundation failed.');
    process.exitCode=1;
  } else console.log(JSON.stringify({project,stage:'closed-core-foundation',tests:'passed',
    result:apply?'committed':'rolled back',webSwitched:false,identitiesMigrated:false},null,2));
} finally {
  rmSync(file,{force:true});
  rmdirSync(temp);
}
