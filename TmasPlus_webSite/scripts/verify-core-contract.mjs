import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]);
const sql=walk('database/core_web').filter(f=>/00[1-8]_.*\.sql$/.test(f)).map(f=>readFileSync(f,'utf8')).join('\n');
assert(!/CREATE\s+TABLE\b/i.test(sql),'Core adapter must not create tables');
assert(!/\bbooking_v2\b/.test(sql),'Retired schema dependency');
const tables=new Set([...sql.matchAll(/CREATE OR REPLACE VIEW public\.(\w+)/g)].map(m=>m[1]));
['bookings','reserva_snapshot','persona','user-profiles','user-documents','car-images','booking-media','driver-documents','vehicle-documents','public-site-assets'].forEach(t=>tables.add(t));
const rpcs=new Set([...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)/g)].map(m=>m[1]));
['get_perfil_dashboard','verificar_disponibilidad'].forEach(t=>rpcs.add(t));
let calls=0;
for(const f of walk('src').filter(f=>/\.tsx?$/.test(f))){
 const s=readFileSync(f,'utf8');
 assert(!/\.schema\(['"]booking_v2/.test(s),f+': retired schema');
 for(const m of s.matchAll(/\.from\(['"]([^'"]+)['"]\)/g)) {assert(tables.has(m[1]),f+': unsupported relation '+m[1]);calls++;}
 for(const m of s.matchAll(/\.rpc\(['"]([^'"]+)['"]/g)) assert(rpcs.has(m[1]),f+': unsupported RPC '+m[1]);
 for(const m of s.matchAll(/functions\.invoke\(['"]([^'"]+)['"]/g)) {
  assert(m[1].startsWith('core-'),f+': retired function '+m[1]);
  assert(existsSync('supabase/functions/'+m[1]+'/index.ts'),'Missing Edge Function '+m[1]);
 }
}
const config=readFileSync('supabase/config.toml','utf8');
assert(!config.includes('booking_v2')&&!config.includes('booking-v2'),'Retired deployment config');
for(const m of config.matchAll(/entrypoint = "\.\/([^"]+)"/g)) assert(existsSync('supabase/'+m[1]),'Missing configured entrypoint');
assert(readFileSync('src/config/supabase.ts','utf8').includes("const EXPECTED_PROJECT_REF = 'zvplcamcyldcquxqnftb'"),'Wrong project guard');
if(existsSync('dist/assets')) for(const f of walk('dist/assets').filter(f=>f.endsWith('.js'))) {
 assert(!/lhqhdnjmewyipuwifzsl|utofhxgzkdhljrixperh|booking_v2/.test(readFileSync(f,'utf8')),'Old project found in bundle');
}
console.log('Core contract OK: '+calls+' static reads/writes, RPCs, Edge entrypoints, no new tables or test-project bundle references.');
