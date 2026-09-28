import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/config/supabase';
import { Button } from '@/components/ui/Button';
const db = supabase as any;
export default function NotificationsPage() {
  const [rows,setRows] = useState<any[]>([]);
  const [title,setTitle] = useState(''), [body,setBody] = useState('');
  const [audience,setAudience] = useState('driver'), [platform,setPlatform] = useState('ALL');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const requestId = useRef(crypto.randomUUID()), inFlight = useRef(false);
  const refresh = async () => {
    const {data,error} = await db.from('web_push_history').select('*').order('created_at',{ascending:false}).limit(100);
    if(error) throw new Error(error.message); setRows(data ?? []);
  };
  useEffect(() => { void refresh().catch(e=>setError(e.message)); },[]);
  const changed = () => { requestId.current=crypto.randomUUID(); };
  const send = async () => {
    if(inFlight.current || !title.trim() || !body.trim()) return;
    if(!window.confirm('¿Enviar a los dispositivos de CORE? Puede notificar a usuarios reales.')) return;
    inFlight.current=true; setBusy(true); setError(''); setNotice('');
    try {
      const {data,error} = await db.rpc('web_send_mass_push',{p_request_id:requestId.current,
        p_title:title,p_body:body,p_audience:audience,p_platform:platform});
      if(error) throw new Error(error.message);
      setNotice(data+' dispositivos puestos en cola. Esto no confirma entrega ni aceptación por Expo.');
      changed(); setTitle(''); setBody(''); await refresh();
    } catch(e:any) {
      setError(e.message+'. Si el resultado es incierto, consulta el historial antes de editar o reenviar.');
    } finally { inFlight.current=false; setBusy(false); }
  };
  return <div className="p-6 max-w-6xl mx-auto space-y-5">
    <h1 className="text-2xl font-semibold">Notificaciones masivas — Core</h1>
    <p>Android e iOS registrados en core. El historial muestra puesta en cola, no entrega.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy} className="bg-white border rounded-xl p-5 space-y-3">
      <label className="block">Título<input className="block border rounded p-2 w-full" value={title} maxLength={100} onChange={e=>{changed();setTitle(e.target.value);}}/></label>
      <label className="block">Mensaje<textarea className="block border rounded p-2 w-full" value={body} maxLength={1000} onChange={e=>{changed();setBody(e.target.value);}}/></label>
      <label>Destinatarios <select value={audience} onChange={e=>{changed();setAudience(e.target.value);}}><option value="driver">Conductores</option><option value="customer">Clientes</option></select></label>{' '}
      <label>Plataforma <select value={platform} onChange={e=>{changed();setPlatform(e.target.value);}}><option value="ALL">Android e iOS</option><option value="ANDROID">Android</option><option value="IOS">iOS</option></select></label>
      <div><Button disabled={busy || !title.trim() || !body.trim()} onClick={send}>{busy?'Procesando…':'Confirmar y enviar'}</Button></div>
    </fieldset>
    <Button disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}>Actualizar historial</Button>
    {!rows.length && <p>No hay envíos web registrados.</p>}
    {rows.map(r=><article key={r.request_id+'-'+r.status} className="bg-white border rounded-xl p-4"><h2>{r.title}</h2><p>{r.body}</p><p>{r.recipients} dispositivos · {r.status} · {new Date(r.created_at).toLocaleString()}</p></article>)}
  </div>;
}
