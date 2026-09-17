// Explicit test-only dispatcher. Default is read-only; --send contacts Expo.
import {createClient} from '@supabase/supabase-js';
const url=process.env.TEST_SUPABASE_URL;
const key=process.env.TEST_SUPABASE_SECRET_KEY;
if(!url || new URL(url).hostname!=='lhqhdnjmewyipuwifzsl.supabase.co' || !key) {
  throw new Error('Requires Prueba TEST_SUPABASE_URL and server-only TEST_SUPABASE_SECRET_KEY.');
}
if(process.argv.slice(2).some(a=>a!=='--send')) throw new Error('Only --send is supported');
const send=process.argv.includes('--send');
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const db=client.schema('booking_v2');
if(!send) {
  const {count,error}=await db.from('notification_outbox').select('id',{count:'exact',head:true}).is('sent_at',null);
  if(error) throw new Error(error.message);
  console.log(JSON.stringify({project:'Prueba',pending:count,sent:0,dryRun:true}));
} else {
  const {data:jobs,error}=await db.rpc('claim_notifications',{p_limit:20});
  if(error) throw new Error(error.message);
  let sent=0,failed=0;
  for(const job of jobs??[]) {
    try {
      const {data:user,error:userError}=await client.from('users').select('email,push_token,blocked').eq('id',job.recipient_id).single();
      if(userError || !user?.email?.endsWith('@tmasplus.test') || user.blocked===true) {
        throw new Error('Recipient is not an enabled synthetic test account');
      }
      if(!/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(user.push_token??'')) throw new Error('Test device has no Expo push token');
      const response=await fetch('https://exp.host/--/api/v2/push/send',{
        method:'POST',headers:{'Content-Type':'application/json',...(process.env.EXPO_ACCESS_TOKEN?{Authorization:`Bearer ${process.env.EXPO_ACCESS_TOKEN}`}:{})},
        body:JSON.stringify({to:user.push_token,title:'T+ Prueba: reserva actualizada',body:'Abre la app de pruebas para consultar el servicio.',data:job.payload,sound:'default'}),
        signal:AbortSignal.timeout(15000),
      });
      const result=await response.json();
      if(!response.ok || result.data?.status!=='ok') throw new Error('Expo rejected the notification');
      const {error:saveError}=await db.from('notification_outbox').update({sent_at:new Date().toISOString(),locked_until:null,last_error:null}).eq('id',job.id);
      if(saveError) throw new Error('Expo accepted the notification but its acknowledgement could not be stored');
      sent++;
    } catch(error) {
      failed++;
      // Keep the lease to avoid immediate duplicate retries after network uncertainty.
      const {error:saveError}=await db.from('notification_outbox').update({last_error:error.message}).eq('id',job.id);
      if(saveError) throw new Error('Unable to store notification failure');
    }
  }
  console.log(JSON.stringify({project:'Prueba',claimed:jobs?.length??0,acceptedByExpo:sent,failed}));
}
