// Unit contract checks against the actual sibling source. No native runtime/network.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {resolve} from 'node:path';
const source=readFileSync(process.argv[2]
  ? resolve(process.argv[2],'common/services/OtpService.ts')
  : new URL('../../../prueba2/App/common/services/OtpService.ts',import.meta.url),'utf8');
let reply={data:true,error:null};
let state={otp:null,otp_verified:false};
const calls=[];
const client={
  schema(name){assert.equal(name,'booking_v2');return {rpc:async(name,args)=>{calls.push({name,args});return reply;}};},
  from(name){assert.equal(name,'bookings_v2_mobile');return {select(){return {eq(){return {single:async()=>({data:state,error:null})};}};}};},
};
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,
  {exports:module.exports,module,require(name){assert.equal(name,'@/config/SupabaseConfig');return client;}});
const service=module.exports.OtpService;
assert.equal(await service.validateOtp('booking-1',' 1234 '),true);
assert.equal(calls[0].name,'verify_pickup_code');
assert.equal(calls[0].args.p_booking_id,'booking-1');
assert.equal(calls[0].args.p_code,'1234');
reply={data:false,error:null};
assert.equal(await service.validateOtp('booking-1','0000'),false);
reply={data:null,error:{message:'Server rejected'}};
await assert.rejects(()=>service.validateOtp('booking-1','1234'),/Server rejected/);
await assert.rejects(()=>service.markOtpAsVerified('booking-1'),/servidor primero/);
state={otp:null,otp_verified:true};
assert.equal(await service.markOtpAsVerified('booking-1'),true);
await assert.rejects(()=>service.saveOtp(),/servidor/);
assert.equal(service.generateOtp(),'');
console.log('PASS: OTP RPC arguments, invalid code, server error, verification cannot be forged, server-only generation.');
