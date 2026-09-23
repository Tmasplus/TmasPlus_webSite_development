// Isolated PostgreSQL, loopback only. Never reads .env or contacts Supabase.
// Extracts DDL and the allowlisted cost trigger only; never webhooks or credentials.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const bin = process.env.CORE_TEST_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const dir = mkdtempSync(join(tmpdir(),'tplus-core-web-'));
const port = 55439;
const run = (name,args) => {
  const r=spawnSync(join(bin,name+'.exe'),args,{encoding:'utf8',windowsHide:true,timeout:60000,
    ...(name==='pg_ctl' ? {stdio:'ignore'} : {})});
  if(r.error || r.status!==0) throw new Error(r.stderr || r.stdout || r.error?.message);
  return r.stdout;
};
const source=readFileSync(resolve(process.env.CORE_TEST_SCHEMA_FILE || 'database/schema_aplicacioncore.sql'),'utf8');
const extract = re => [...source.matchAll(re)].map(m=>m[0]).join('\n');
const schema = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA net;
CREATE SCHEMA storage;
CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_user::text $$;
CREATE FUNCTION net.http_post(url text,body jsonb,headers jsonb) RETURNS bigint LANGUAGE plpgsql AS $$ BEGIN RETURN 1; END $$;
` + extract(/CREATE TYPE "public"\."[^"]+" AS ENUM \([\s\S]*?\);/g)
+ extract(/CREATE TABLE IF NOT EXISTS "public"\."[^"]+" \([\s\S]*?\n\);/g)
+ extract(/CREATE SEQUENCE IF NOT EXISTS "public"\."[^"]+"[\s\S]*?;/g)
+ extract(/ALTER TABLE ONLY "public"\."[^"]+" ALTER COLUMN [^\n]+;/g)
+ extract(/ALTER TABLE ONLY "public"\."[^"]+"\s+ADD CONSTRAINT[\s\S]*?;/g)
+ `CREATE FUNCTION public.persona_actual_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT id FROM persona WHERE auth_id=auth.uid() $$;
CREATE FUNCTION public.es_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM persona_rol WHERE id_persona=persona_actual_id() AND rol='admin') $$;
GRANT USAGE ON SCHEMA public,auth,net TO authenticated,anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
`
+ extract(/CREATE OR REPLACE VIEW "public"\."(?:users|cars|bookings)"[\s\S]*?;/g)
+ 'GRANT SELECT ON public.users,public.cars,public.bookings TO authenticated;'
+ extract(/CREATE OR REPLACE FUNCTION "public"\."(?:comparte_reserva_con|posee_reserva|es_conductor)"[\s\S]*?\$\$;/g)
+ extract(/ALTER TABLE "public"\."[^"]+" ENABLE ROW LEVEL SECURITY;/g)
+ extract(/CREATE POLICY "[^"]+" ON "public"\."[^"]+"[\s\S]*?;/g);
const costTrigger = extract(/CREATE OR REPLACE FUNCTION "public"\."calcular_costo_total"\(\)[\s\S]*?\$\$;/g)
 + extract(/CREATE OR REPLACE TRIGGER "trg_calcular_costo_total"[^\n]+;/g);
if (!costTrigger.includes('EXECUTE FUNCTION')) throw new Error('Missing core cost trigger fixture');
writeFileSync(join(dir,'schema.sql'),schema+costTrigger);
let started=false;
try {
  run('initdb',['-D',join(dir,'data'),'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
  run('pg_ctl',['-D',join(dir,'data'),'-l',join(dir,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']); started=true;
  const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'];
  run('psql',[...args,'-f',join(dir,'schema.sql')]);
  for(const file of ['001_views.sql','002_booking_commands.sql','003_profile_commands.sql','004_onboarding.sql','005_notifications.sql','006_support_views.sql','007_account_access.sql','008_storage_access.sql']) {
    run('psql',[...args,'-f',resolve('database/core_web',file)]);
    console.log('OK '+file);
  }
  run('psql',[...args,'-f',resolve('database/core_web/instalar_core_web.sql')]);
  console.log('OK atomic bundle reapplication');
  console.log(run('psql',[...args,'-f',resolve('database/tests/core_web_test.sql')]));
  console.log('Core web local tests passed. No remote connections. Logs: '+dir);
} finally {
  if(started) run('pg_ctl',['-D',join(dir,'data'),'-m','fast','-w','stop']);
}
