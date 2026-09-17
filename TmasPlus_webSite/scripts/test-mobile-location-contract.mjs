import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {resolve} from 'node:path';
const source=readFileSync(process.argv[2]
  ? resolve(process.argv[2],'common/services/driverLocationTask.ts')
  : new URL('../../../prueba2/App/common/services/driverLocationTask.ts',import.meta.url),'utf8');
const storage=new Map([['driver_tracking_active_booking_id','trip-1'],['driver_tracking_active_driver_id','driver-1']]);
let task,session=null;
const requests=[];
const mocks={
  'expo-location':{},
  'expo-task-manager':{defineTask(_name,callback){task=callback;}},
  '@react-native-async-storage/async-storage':{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v)},
  '@/config/SupabaseConfig':{SUPABASE_URL:'https://test.invalid',SUPABASE_ANON_KEY:'public-key',getSafeSession:async()=>session},
  '@/common/services/backgroundLocationConsent':{},
};
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
  {module,exports:module.exports,console:{log(){},warn(){},error(){}},require(name){assert.ok(name in mocks,name);return mocks[name];},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true};}});
assert.equal(typeof task,'function');
const sample={data:{locations:[{timestamp:Date.now(),coords:{latitude:4.6,longitude:-74.08,accuracy:5}}]}};
await task(sample);
assert.equal(requests.length,0,'No session must not send anonymous GPS');
session={access_token:'driver-session'};
await task(sample);
assert.equal(requests.length,1);
assert.equal(requests[0].url,'https://test.invalid/rest/v1/rpc/record_vehicle_position');
assert.equal(requests[0].options.headers.Authorization,'Bearer driver-session');
assert.equal(requests[0].options.headers['Content-Profile'],'booking_v2');
const body=JSON.parse(requests[0].options.body);
assert.equal(body.p_booking_id,'trip-1');assert.equal(body.p_lat,4.6);assert.equal(body.p_lng,-74.08);
assert.equal(body.driver_id,undefined,'Driver identity must come from the authenticated server');
console.log('PASS: background GPS uses session, v2 RPC, sample timestamp, and server-side identity.');
