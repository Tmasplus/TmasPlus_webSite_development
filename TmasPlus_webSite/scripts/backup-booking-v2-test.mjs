// Private application backup. Never prints credentials or stores them in Git.
// Usage: node scripts/backup-booking-v2-test.mjs <private-directory> <postgres-bin>
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, statSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = 'lhqhdnjmewyipuwifzsl';
const [directory, postgresBin, ...extra] = process.argv.slice(2);
if (!directory || !postgresBin || extra.length) throw new Error('Expected private directory and PostgreSQL bin directory.');
if (readFileSync(join(root, 'supabase/.temp/project-ref'), 'utf8').trim() !== project) {
  throw new Error('Refusing non-Prueba project.');
}
const repo = realpathSync(resolve(root, '..'));
mkdirSync(resolve(directory), { recursive: true, mode: 0o700 });
const destination = realpathSync(resolve(directory));
const rel = relative(repo, destination);
if (!rel || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('Backup must be outside the repository.');

const cli = spawnSync(process.execPath, [join(root, 'node_modules/supabase/dist/supabase.js'),
  'db', 'dump', '--linked', '--dry-run'], { cwd: root, encoding: 'utf8', timeout: 90000 });
if (cli.error || cli.status !== 0) throw new Error('Could not prepare private backup connection; no credentials printed.');
const pg = {};
for (const line of cli.stdout.split(/\r?\n/)) {
  const match = line.match(/^export (PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)="([^"\r\n]*)"\s*$/);
  if (match) pg[match[1]] = match[2];
}
if (Object.keys(pg).length !== 5 || !Object.values(pg).every(Boolean)) throw new Error('Unexpected connection format.');
if (!(pg.PGHOST === `db.${project}.supabase.co` ||
  (pg.PGHOST.endsWith('.pooler.supabase.com') && pg.PGUSER.endsWith(`.${project}`)))) {
  throw new Error('Backup connection does not identify Prueba.');
}
const pgEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')));
Object.assign(pgEnv, pg, { PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '20' });
const output = mkdtempSync(join(destination, 'booking-v2-before-core-'));
const archive = join(output, 'application.dump');
const suffix = process.platform === 'win32' ? '.exe' : '';
console.log('Creating private application backup (public, booking_v2, auth)...');
const dump = spawnSync(join(postgresBin, `pg_dump${suffix}`), [
  '--no-password', '--format=custom', '--role=postgres', '--lock-wait-timeout=10s',
  '--schema=public', '--schema=booking_v2', '--schema=auth', `--file=${archive}`,
], { env: pgEnv, encoding: 'utf8', timeout: 240000 });
if (dump.error || dump.status !== 0) {
  throw new Error(`Backup failed; incomplete private output remains at ${output}. Do not apply migrations.`);
}
// Decode the archive, not just its table of contents. This is NOT a restore test.
const verify = spawnSync(join(postgresBin, `pg_restore${suffix}`), [
  `--file=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`, archive,
], { encoding: 'utf8', timeout: 90000 });
if (verify.error || verify.status !== 0) throw new Error('Archive could not be decoded. Do not apply migrations.');
const manifest = {
  project, createdAt: new Date().toISOString(), schemas: ['public', 'booking_v2', 'auth'],
  archive: 'application.dump', bytes: statSync(archive).size,
  sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'),
  archiveDecoded: true, restoreTested: false,
  excludes: ['Storage objects', 'Edge Functions and secrets', 'managed schemas and cluster roles'],
};
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output, ...manifest }, null, 2));
