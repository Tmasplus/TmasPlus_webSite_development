import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-app-platform, x-app-environment','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json = (data: unknown,status=200) => new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return json({error:'POST required'},405);
  try {
    const url=Deno.env.get('SUPABASE_URL')!;
    if(new URL(url).hostname!=='lhqhdnjmewyipuwifzsl.supabase.co') return json({error:'Test project only'},403);
    const authorization=req.headers.get('Authorization')??'';
    if(!authorization.startsWith('Bearer '))return json({error:'Session required'},401);
    const viewer=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:auth,error:authError}=await viewer.auth.getUser(authorization.slice(7));
    if(authError||!auth.user) return json({error:'Invalid session'},401);
    const {data:admin,error:adminError}=await viewer.schema('booking_v2').rpc('is_admin');
    if(adminError||admin!==true) return json({error:'Approved administrator required'},403);
    const {campaignId}=await req.json();
    if(typeof campaignId!=='string'||!/^[0-9a-f-]{36}$/i.test(campaignId)) return json({error:'Invalid campaign'},400);
    const client=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const db=client.schema('booking_v2');
    const {data:campaign,error:campaignError}=await db.from('push_campaigns').select('*').eq('id',campaignId).single();
    if(campaignError||!campaign) return json({error:'Campaign not found'},404);
    const {data:jobs,error}=await db.rpc('claim_push_deliveries',{p_campaign_id:campaignId});
    if(error) throw error;
    if(!jobs?.length)return json({processed:0,accepted:0,failed:0});
    const [deviceRows,userRows]=await Promise.all([
      db.from('push_devices').select('id,token,user_id,enabled').in('id',jobs.map(j=>j.device_id)),
      client.from('users').select('id,blocked').in('id',jobs.map(j=>j.recipient_id)),
    ]);
    if(deviceRows.error||userRows.error)throw new Error('Unable to validate recipients');
    const devices=new Map((deviceRows.data??[]).map(d=>[d.id,d]));
    const users=new Map((userRows.data??[]).map(u=>[u.id,u]));
    const eligible=jobs.filter(j=>{const d=devices.get(j.device_id),u=users.get(j.recipient_id);return d?.enabled&&d.user_id===j.recipient_id&&u&&u.blocked!==true;});
    const tickets=new Map<string,any>();
    if(eligible.length){
      try{
        const response=await fetch('https://exp.host/--/api/v2/push/send',{
          method:'POST',headers:{'Content-Type':'application/json',...(Deno.env.get('EXPO_ACCESS_TOKEN')?{Authorization:`Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}`}:{})},
          body:JSON.stringify(eligible.map(j=>({to:devices.get(j.device_id)!.token,title:campaign.title,body:campaign.body,sound:'default',
            data:{type:'announcement',campaignId:campaign.id},channelId:'messages'}))),signal:AbortSignal.timeout(15000),
        });
        const result=await response.json();
        if(!response.ok||!Array.isArray(result.data)||result.data.length!==eligible.length)throw new Error('Invalid Expo response');
        eligible.forEach((j,i)=>tickets.set(j.id,result.data[i]));
      }catch{eligible.forEach(j=>tickets.set(j.id,{status:'error',details:{error:'Delivery uncertain; no automatic retry'}}));}
    }
    let accepted=0,failed=0;
    await Promise.all(jobs.map(async job=>{
      const ticket=tickets.get(job.id),ok=ticket?.status==='ok';
      const lastError=ok?null:String(ticket?.details?.error??'Device disabled, reassigned or recipient blocked');
      if(lastError==='DeviceNotRegistered')await db.from('push_devices').update({enabled:false}).eq('id',job.device_id);
      const {error:saveError}=await db.from('push_deliveries').update({status:ok?'accepted':'failed',ticket_id:ok?ticket.id:null,last_error:lastError,locked_until:null}).eq('id',job.id);
      if(saveError)throw saveError;
      if(ok)accepted++;else failed++;
    }));
    return json({processed:jobs?.length??0,accepted,failed});
  } catch { return json({error:'Unable to process notifications. Check campaign history before retrying.'},500); }
});
