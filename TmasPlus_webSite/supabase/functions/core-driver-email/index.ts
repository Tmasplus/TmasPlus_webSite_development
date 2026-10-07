import {coreHandler,coreAdmin,json} from '../_shared/core.ts';
// Acciones (solo admin): status | resend | update_email.
// Permite reenviar la confirmación de correo a un conductor sin confirmar y,
// si se equivocó al registrarlo, corregir el correo (Auth + perfil) y reenviar.
Deno.serve(coreHandler(async(input,viewer,url)=>{
  if(typeof input?.id!=='string' || !/^[0-9a-f-]{36}$/i.test(input.id)) return json({error:'Perfil invalido'},400);
  const action=input.action;
  if(!['status','resend','update_email'].includes(action)) return json({error:'Accion invalida'},400);
  const {data:user,error}=await viewer.from('web_users').select('id,email,auth_id').eq('id',input.id).single();
  if(error || !user) return json({error:'Perfil no encontrado'},404);
  if(!user.auth_id) return json({error:'El perfil no tiene cuenta Auth; use la invitacion de acceso.'},409);
  const admin=coreAdmin(url);
  const {data:found,error:getError}=await admin.auth.admin.getUserById(user.auth_id);
  if(getError || !found?.user) return json({error:'No se encontro la cuenta Auth'},404);
  const confirmed=!!found.user.email_confirmed_at;
  if(action==='status') return json({confirmed,email:found.user.email});
  if(confirmed && action==='resend') return json({error:'El correo ya esta confirmado',confirmed:true},409);

  let email=found.user.email as string;
  if(action==='update_email'){
    const next=typeof input.email==='string'?input.email.trim().toLowerCase():'';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return json({error:'Correo invalido'},400);
    if(next!==email){
      // Si ya estaba confirmado se conserva la confirmacion (correccion del admin, sin reenvio).
      const {error:updError}=await admin.auth.admin.updateUserById(user.auth_id,{email:next,email_confirm:confirmed});
      if(updError) return json({error:'No se pudo cambiar el correo (puede estar en uso): '+updError.message},409);
      email=next;
      const synced=await viewer.from('web_users').update({email}).eq('id',user.id);
      if(synced.error) return json({error:'Correo cambiado en Auth pero no en el perfil. Reintente.',reconciliationRequired:true},503);
    }
    if(confirmed) return json({confirmed:true,email,sent:false});
  }
  const base=Deno.env.get('CORE_WEB_URL');
  const {error:resendError}=await admin.auth.resend({
    type:'signup',email,
    options:base?.startsWith('https://')?{emailRedirectTo:`${base.replace(/\/$/,'')}/register-driver`}:undefined,
  });
  if(resendError) return json({error:'No se pudo reenviar: '+resendError.message},429);
  return json({confirmed:false,email,sent:true});
}));
