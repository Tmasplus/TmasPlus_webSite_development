// Only unauthenticated requests: this test cannot send campaigns.
import assert from 'node:assert/strict';
const url='https://lhqhdnjmewyipuwifzsl.supabase.co/functions/v1/booking-v2-mass-push';
const options=await fetch(url,{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,x-app-platform,x-app-environment'},signal:AbortSignal.timeout(20000)});
assert.equal(options.status,200);
assert.match(options.headers.get('Access-Control-Allow-Headers')??'',/x-app-platform/);
const denied=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({campaignId:'00000000-0000-0000-0000-000000000000'}),signal:AbortSignal.timeout(20000)});
assert.equal(denied.status,401);
console.log('PASS: browser preflight and unauthenticated campaign rejection. No notifications sent.');
