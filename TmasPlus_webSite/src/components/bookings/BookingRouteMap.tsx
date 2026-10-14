import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// Google Maps desactivado por decisión del cliente: solo OpenStreetMap.
// import { GoogleRouteMap } from "./GoogleRouteMap";
import { ROUTE_COLORS, type RouteMapProps } from "./routeMapShared";
// import { isGoogleMapsBlocked, markGoogleMapsBlocked, onGoogleMapsBlocked } from "@/utils/googleMapsAuth";

export type { RouteMode } from "./routeMapShared";

// const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

function pointIcon(color: string, label: string) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div style="width:28px;height:28px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.25);display:grid;place-items:center;color:#fff;font:800 11px/1 system-ui">${label}</div>`,
  });
}

/** Mapa del recorrido con OpenStreetMap (Leaflet). */
export function BookingRouteMap(props: RouteMapProps) {
  /* Google Maps desactivado por decisión del cliente: solo OpenStreetMap.
  const [googleFailed, setGoogleFailed] = useState(isGoogleMapsBlocked);
  const googleRootRef = useRef<HTMLDivElement>(null);
  const useGoogle = !!GOOGLE_MAPS_API_KEY && !googleFailed;

  useEffect(() => onGoogleMapsBlocked(() => setGoogleFailed(true)), []);

  // Respaldo: Google pinta ".gm-err-container" dentro del mapa cuando rechaza la key.
  useEffect(() => {
    const root = googleRootRef.current;
    if (!useGoogle || !root) return;
    const check = () => {
      if (root.querySelector(".gm-err-container, .gm-err-message")) markGoogleMapsBlocked();
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true });
    check();
    return () => observer.disconnect();
  }, [useGoogle]);

  if (useGoogle) {
    return (
      <div ref={googleRootRef} className="z-0 h-full w-full" aria-label="Mapa del recorrido">
        <GoogleRouteMap apiKey={GOOGLE_MAPS_API_KEY} onUnavailable={markGoogleMapsBlocked} {...props} />
      </div>
    );
  }
  */
  return <LeafletRouteMap {...props} />;
}

function LeafletRouteMap({ mode, pickup, drop, suggestedPath, actualPath, vehicle }: RouteMapProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fitSigRef = useRef("");
  const vehicleRef = useRef<L.CircleMarker | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    const map = L.map(rootRef.current).setView([4.65, -74.08], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(rootRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  const path = useMemo(() => (mode === "suggested" ? suggestedPath : actualPath), [mode, suggestedPath, actualPath]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    const bounds: L.LatLngTuple[] = [];
    const color = mode === "suggested" ? ROUTE_COLORS.suggested : ROUTE_COLORS.actual;

    if (path.length > 1) {
      const latlngs = path.map((p) => [p.lat, p.lng] as L.LatLngTuple);
      L.polyline(latlngs, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layer);
      L.polyline(latlngs, { color, weight: 5, opacity: 0.95, lineJoin: "round", lineCap: "round" }).addTo(layer);
      bounds.push(...latlngs);
    }

    if (mode === "actual" && path.length > 0) {
      const first = path[0];
      const last = path[path.length - 1];
      L.circleMarker([first.lat, first.lng], { radius: 6, color: "#fff", weight: 2, fillColor: ROUTE_COLORS.actual, fillOpacity: 1 })
        .bindTooltip("Inicio del viaje (GPS)")
        .addTo(layer);
      L.circleMarker([last.lat, last.lng], { radius: 6, color: "#fff", weight: 2, fillColor: ROUTE_COLORS.end, fillOpacity: 1 })
        .bindTooltip("Fin del viaje (GPS)")
        .addTo(layer);
    }

    if (pickup) {
      L.marker([pickup.lat, pickup.lng], { icon: pointIcon(ROUTE_COLORS.pickup, "A") }).bindTooltip("Origen").addTo(layer);
      bounds.push([pickup.lat, pickup.lng]);
    }
    if (drop) {
      L.marker([drop.lat, drop.lng], { icon: pointIcon(ROUTE_COLORS.drop, "B") }).bindTooltip("Destino").addTo(layer);
      bounds.push([drop.lat, drop.lng]);
    }

    // Con el servicio en vivo la ruta se redibuja en cada refresco: solo se reencuadra
    // cuando cambia lo que se muestra, para no quitarle el zoom al usuario.
    const fitSig = `${mode}|${pickup?.lat},${pickup?.lng}|${drop?.lat},${drop?.lng}|${path.length > 1}`;
    if (bounds.length && fitSig !== fitSigRef.current) {
      fitSigRef.current = fitSig;
      map.fitBounds(L.latLngBounds(bounds), { padding: [36, 36], maxZoom: 16 });
    }
  }, [mode, path, pickup, drop]);

  // Vehículo en vivo: se mueve el marcador sin tocar el resto de capas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!vehicle) {
      vehicleRef.current?.remove();
      vehicleRef.current = null;
      return;
    }
    const pos: L.LatLngTuple = [vehicle.lat, vehicle.lng];
    if (vehicleRef.current) vehicleRef.current.setLatLng(pos);
    else
      vehicleRef.current = L.circleMarker(pos, { radius: 9, color: "#fff", weight: 3, fillColor: "#f59e0b", fillOpacity: 1 })
        .bindTooltip("Vehículo (en vivo)")
        .addTo(map);
  }, [vehicle]);

  return <div ref={rootRef} className="z-0 h-full w-full" aria-label="Mapa del recorrido" />;
}
