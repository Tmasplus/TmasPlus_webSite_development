import {coreHandler,coreAdmin,json} from '../_shared/core.ts';
Deno.serve(coreHandler(async(input,viewer,url)=>{
  if(typeof input?.id!=='string' || !/^[0-9a-f-]{36}$/i.test(input.id)) return json({error:'Perfil invalido'},400);
  const {data:user,error}=await viewer.from('web_users').select('*').eq('id',input.id).single();
  if(error || !user) return json({error:'Perfil no encontrado'},404);
  if(user.auth_id) return json({user,authCreated:false});
  if(!user.email) return json({error:'El perfil requiere un correo'},400);
  const redirectTo=Deno.env.get('CORE_WEB_URL');
  if(!redirectTo || !redirectTo.startsWith('https://')) return json({error:'Configurar CORE_WEB_URL HTTPS y su redirect permitido en Auth'},503);
  const {data:invitation,error:inviteError}=await coreAdmin(url).auth.admin.inviteUserByEmail(user.email,{redirectTo});
  if(inviteError || !invitation.user) return json({error:'No se pudo invitar. Verifique si el correo ya tiene una cuenta Auth.'},409);
  const linked=await viewer.rpc('web_bind_auth',{p_id:user.id,p_auth_id:invitation.user.id});
  if(linked.error) return json({error:'Invitacion enviada, pero falta vincular el perfil. No repita la invitacion; requiere revision administrativa.'},409);
  return json({user:linked.data,authCreated:true,authWarning:'Invitacion enviada por correo para configurar el acceso.'});
}));
