import {coreHandler,json} from '../_shared/core.ts';
const escape=(value:unknown)=>String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
Deno.serve(coreHandler(async(input,viewer)=>{
  if(typeof input?.complaintId!=='string') return json({error:'Caso requerido'},400);
  const {data:complaint,error}=await viewer.from('web_complaints').select('*').eq('id',input.complaintId).single();
  if(error || !complaint) return json({error:'Caso no encontrado'},404);
  if(!complaint.admin_response?.trim()) return json({error:'Primero guarde una respuesta'},400);
  const {data:user,error:userError}=await viewer.from('web_users').select('email,first_name,last_name').eq('id',complaint.user_id).single();
  if(userError || !user?.email) return json({error:'El reportante no tiene correo disponible'},400);
  const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('CORE_EMAIL_FROM');
  if(!key || !from) return json({error:'Configurar RESEND_API_KEY y CORE_EMAIL_FROM en core'},503);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
    body:JSON.stringify({from,to:[user.email],subject:'Respuesta a tu caso: '+complaint.subject,
      html:'<h2>'+escape(complaint.subject)+'</h2><p>Hola '+escape(user.first_name)+'</p><p style="white-space:pre-wrap">'+escape(complaint.admin_response)+'</p>'})});
  if(!response.ok) return json({error:'Respuesta guardada, pero el proveedor no confirmo el correo'},502);
  return json({success:true});
}));
