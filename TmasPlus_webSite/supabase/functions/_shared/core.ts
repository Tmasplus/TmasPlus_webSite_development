import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
const headers = {'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-app-platform,x-app-environment',
  'Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json'};
export const json = (body:unknown,status=200) => new Response(JSON.stringify(body),{status,headers});
export function coreHandler(action:(input:any,viewer:any,url:string)=>Promise<Response>) {
  return async (req:Request) => {
    if(req.method==='OPTIONS') return new Response('ok',{headers});
    if(req.method!=='POST') return json({error:'POST requerido'},405);
    const url=Deno.env.get('SUPABASE_URL');
    if(url!=='https://zvplcamcyldcquxqnftb.supabase.co') return json({error:'Destino distinto de core'},403);
    const authorization=req.headers.get('Authorization') ?? '';
    if(!authorization.startsWith('Bearer ')) return json({error:'Se requiere sesion'},401);
    const viewer=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{
      global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await viewer.auth.getUser(authorization.slice(7));
    if(error || !data.user) return json({error:'Sesion invalida'},401);
    const permission=await viewer.rpc('web_require_admin');
    if(permission.error) return json({error:'Administrador autorizado requerido'},403);
    try { return await action(await req.json(),viewer,url); }
    catch { return json({error:'No se pudo confirmar la operacion. Revise el estado antes de reintentar.'},503); }
  };
}
export function coreAdmin(url:string) {
  return createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
}
