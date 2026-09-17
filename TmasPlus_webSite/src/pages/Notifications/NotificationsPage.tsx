import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/config/supabase';
import {Button} from '@/components/ui/Button';
const db=supabase.schema('booking_v2') as any;
export default function NotificationsPage(){
  const [rows,setRows]=useState<any[]>([]),[counts,setCounts]=useState<Record<string,any>>({});
  const [title,setTitle]=useState(''),[body,setBody]=useState(''),[audience,setAudience]=useState('driver'),[platform,setPlatform]=useState('ALL');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const requestId=useRef(crypto.randomUUID());
  const refresh=async()=>{
    const [campaigns,summary]=await Promise.all([db.from('push_campaigns').select('*').order('created_at',{ascending:false}).limit(100),db.rpc('push_campaign_counts')]);
    if(campaigns.error||summary.error)throw new Error(campaigns.error?.message||summary.error?.message);
    setRows(campaigns.data??[]);setCounts(Object.fromEntries((summary.data??[]).map((r:any)=>[r.campaign_id,r])));
  };
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  const dispatch=async(id:string)=>{
    let accepted=0,failed=0;
    for(let batch=0;batch<20;batch++){
      const {data,error}=await supabase.functions.invoke('booking-v2-mass-push',{body:{campaignId:id}});
      if(error||data?.error)throw new Error(data?.error||error?.message||'No se pudo enviar');
      accepted+=data.accepted;failed+=data.failed;
      setNotice(`${accepted} aceptadas por Expo, ${failed} fallidas. Si quedan pendientes, pulsa Continuar envío.`);
      if(data.processed<100)break;
    }
  };
  const send=async()=>{
    if(busy||!title.trim()||!body.trim()||!window.confirm(`¿Enviar «${title.trim()}» a ${audience==='driver'?'conductores':'clientes'} (${platform}) de Prueba?`))return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data:id,error}=await db.rpc('create_push_campaign',{p_id:requestId.current,p_title:title,p_body:body,p_audience:audience,p_platform:platform});
      if(error)throw new Error(error.message);
      setTitle('');setBody('');requestId.current=crypto.randomUUID();await refresh();await dispatch(id);await refresh();
    }catch(e:any){setError(e.message);await refresh().catch(()=>{});}finally{setBusy(false);}
  };
  const resume=async(id:string)=>{setBusy(true);setError('');try{await dispatch(id);await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  const changed=()=>{requestId.current=crypto.randomUUID();};
  return <div className="p-6 max-w-6xl mx-auto space-y-5">
    <h1 className="text-2xl font-semibold">Notificaciones masivas — Prueba</h1>
    <p>Android e iOS. Solo dispositivos registrados en esta versión. Aceptada por Expo no confirma recepción en el teléfono.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <fieldset disabled={busy} className="bg-white border rounded-xl p-5 space-y-3">
      <label className="block">Título<input className="block border rounded p-2 w-full" value={title} maxLength={100} onChange={e=>{changed();setTitle(e.target.value);}}/></label>
      <label className="block">Mensaje<textarea className="block border rounded p-2 w-full" value={body} maxLength={1000} onChange={e=>{changed();setBody(e.target.value);}}/></label>
      <label>Destinatarios <select value={audience} onChange={e=>{changed();setAudience(e.target.value);}}><option value="driver">Conductores</option><option value="customer">Clientes</option></select></label>{' '}
      <label>Plataforma <select value={platform} onChange={e=>{changed();setPlatform(e.target.value);}}><option value="ALL">Android e iOS</option><option value="ANDROID">Android</option><option value="IOS">iOS</option></select></label>
      <div><Button disabled={busy||!title.trim()||!body.trim()} onClick={send}>{busy?'Procesando…':'Confirmar y enviar'}</Button></div>
    </fieldset>
    <Button disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}>Actualizar historial</Button>
    {!rows.length&&<p>No hay campañas registradas.</p>}
    {rows.map(c=><article key={c.id} className="bg-white border rounded-xl p-4 space-y-2"><h2 className="font-semibold">{c.title}</h2><p className="whitespace-pre-wrap">{c.body}</p>
      <p>{c.audience==='driver'?'Conductores':'Clientes'} · {c.platform} · {new Date(c.created_at).toLocaleString()}</p>
      <p>{c.recipients} dispositivos · {counts[c.id]?.accepted??0} aceptadas · {counts[c.id]?.failed??0} fallidas · {counts[c.id]?.pending??0} pendientes</p>
      {(counts[c.id]?.pending??0)>0&&<Button disabled={busy} onClick={()=>resume(c.id)}>Continuar envío</Button>}
    </article>)}
  </div>;
}
