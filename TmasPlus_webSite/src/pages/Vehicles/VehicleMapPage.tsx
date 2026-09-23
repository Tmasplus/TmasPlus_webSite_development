import {useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {supabase} from '@/config/supabase';
type Position={vehicle_id:string;driver_id:string;plate_number:string;driver_name:string;booking_status:string;driver_lat:number;driver_lng:number;recorded_at:string;is_stale:boolean};
const labels:Record<string,string>={AVAILABLE:'Disponible',ACCEPTED:'Aceptado',ARRIVED:'En recogida',STARTED:'En servicio',REACHED:'En destino'};
export default function VehicleMapPage(){
  const root=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.LayerGroup|null>(null),fitted=useRef(false);
  const [rows,setRows]=useState<Position[]>([]),[plate,setPlate]=useState(''),[status,setStatus]=useState('ALL'),[error,setError]=useState(''),[updated,setUpdated]=useState('');
  useEffect(()=>{
    if(!root.current)return;
    map.current=L.map(root.current).setView([4.65,-74.08],11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map.current);
    layer.current=L.layerGroup().addTo(map.current);
    return()=>{map.current?.remove();map.current=null;layer.current=null;};
  },[]);
  useEffect(()=>{
    let disposed=false,inFlight=false;
    const refresh=async()=>{if(inFlight)return;inFlight=true;try{
      const {data,error}=await (supabase as any).from('web_vehicle_locations').select('*').ilike('plate_number', '%'+plate.trim().replace(/[%_]/g,'')+'%').not('driver_lat','is',null).not('driver_lng','is',null);
      if(disposed)return;if(error)throw error;setRows(data??[]);setError('');setUpdated(new Date().toLocaleTimeString());
    }catch(e:any){if(!disposed)setError(e.message);}finally{inFlight=false;}};
    fitted.current=false;void refresh();const timer=setInterval(refresh,5000);
    return()=>{disposed=true;clearInterval(timer);};
  },[plate]);
  const filtered=rows.filter(r=>status==='ALL'||r.booking_status===status);
  useEffect(()=>{
    if(!map.current||!layer.current)return;layer.current.clearLayers();const points:L.LatLngTuple[]=[];
    for(const r of filtered){
      if(!Number.isFinite(Number(r.driver_lat))||!Number.isFinite(Number(r.driver_lng)))continue;
      const point:L.LatLngTuple=[Number(r.driver_lat),Number(r.driver_lng)];points.push(point);
      const stale=!!error||r.is_stale||Date.now()-new Date(r.recorded_at).getTime()>60000;
      const popup=document.createElement('div');popup.textContent=`${r.plate_number} · ${r.driver_name} · ${labels[r.booking_status]??r.booking_status} · ${stale?'Sin señal reciente':'Señal reciente'} · ${new Date(r.recorded_at).toLocaleString()}`;
      L.circleMarker(point,{radius:10,color:stale?'#64748b':r.booking_status==='STARTED'?'#15803d':'#0284c7',fillOpacity:.8}).bindPopup(popup).addTo(layer.current);
    }
    if(points.length&&!fitted.current){map.current.fitBounds(L.latLngBounds(points),{padding:[40,40],maxZoom:15});fitted.current=true;}
  },[rows,status,plate,error]);
  return <div className="p-6 space-y-4"><h1 className="text-2xl font-semibold">Ubicación de vehículos — Prueba</h1>
    <div className="flex flex-wrap gap-4"><label>Placa <input className="border rounded p-2" value={plate} onChange={e=>setPlate(e.target.value.toUpperCase())} placeholder="Todas / ABC123" maxLength={20}/></label>
    <label>Estado <select className="border rounded p-2" value={status} onChange={e=>{fitted.current=false;setStatus(e.target.value);}}><option value="ALL">Todos</option>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></div>
    <p>{filtered.length} vehículos · Actualización cada 5 segundos · Última consulta: {updated||'pendiente'}. Gris: sin señal reciente.</p>
    {error&&<p role="alert" className="text-red-700">Sin actualización: {error}. Las posiciones pueden estar desactualizadas.</p>}
    <div ref={root} style={{height:'60vh',minHeight:350}} className="rounded-xl border z-0" aria-label="Mapa de vehículos"/>
    {!filtered.length&&<p>No hay posiciones para este filtro. El conductor debe conectarse y permitir ubicación en la app conectada a core.</p>}
    <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Placa</th><th>Conductor</th><th>Estado</th><th>Última posición GPS</th></tr></thead><tbody>{filtered.map(r=><tr key={r.vehicle_id}><td><button className="underline" onClick={()=>map.current?.setView([r.driver_lat,r.driver_lng],16)}>{r.plate_number}</button></td><td>{r.driver_name}</td><td>{labels[r.booking_status]??r.booking_status}</td><td>{new Date(r.recorded_at).toLocaleString()}</td></tr>)}</tbody></table></div>
  </div>;
}
