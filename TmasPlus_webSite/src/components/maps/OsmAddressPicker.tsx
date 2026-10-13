import { memo, useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import OsmPlacesSearchInput from "./OsmPlacesSearchInput";
import { reverseGeocode } from "./geocoding";

const MAPBOX_ACCESS_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined;

// Colombia: la vista no puede salir de este recuadro.
const COLOMBIA_BOUNDS = L.latLngBounds([-4.3, -82.0], [13.5, -66.8]);
const DEFAULT_CENTER: L.LatLngTuple = [4.6097, -74.0817];
const DEFAULT_ZOOM = 13;

export interface Location {
  latitude: number;
  longitude: number;
  title: string;
}

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  geometry: GeoJSON.Geometry;
}

interface BookingMapViewProps {
  origin: Location | null;
  destination: Location | null;
  onOriginChange: (loc: Location | null) => void;
  onDestinationChange: (loc: Location | null) => void;
  onRouteInfo?: (info: RouteInfo | null) => void;
}

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [24, 34],
    iconAnchor: [12, 32],
    popupAnchor: [0, -30],
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:20px;height:20px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 4px 12px rgba(15,23,42,.35)"></div>
      <div style="width:2px;height:12px;background:${color}"></div>
    </div>`,
  });
}

const USER_ICON = L.divIcon({
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 6px rgba(59,130,246,.25)"></div>`,
});

/**
 * Ruta: Mapbox Directions si hay token (misma fuente que la app, para que
 * distancia/tiempo y tarifa coincidan); si no, OSRM (OpenStreetMap, gratuito).
 */
async function fetchRoute(origin: Location, destination: Location, signal: AbortSignal): Promise<RouteInfo | null> {
  const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const url = MAPBOX_ACCESS_TOKEN
    ? `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_ACCESS_TOKEN}`
    : `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  const route = data?.routes?.[0];
  const coordinates: [number, number][] = route?.geometry?.coordinates ?? [];
  if (!route || coordinates.length < 2) return null;
  return {
    distanceKm: +(route.distance / 1000).toFixed(1),
    durationMin: route.duration / 60,
    geometry: { type: "LineString", coordinates },
  };
}

function shortName(title: string) {
  const parts = title.split(",");
  return parts.length > 1 ? parts.slice(0, 2).join(",") : title;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function BookingMapView({ origin, destination, onOriginChange, onDestinationChange, onRouteInfo }: BookingMapViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const [selectMode, setSelectMode] = useState<"origin" | "destination">("destination");
  const selectModeRef = useRef(selectMode);
  selectModeRef.current = selectMode;
  const [locating, setLocating] = useState(true);
  const [userPos, setUserPos] = useState<{ lng: number; lat: number } | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const initialFlyDoneRef = useRef(false);
  const callbacksRef = useRef({ onOriginChange, onDestinationChange });
  callbacksRef.current = { onOriginChange, onDestinationChange };

  const flyTo = useCallback((lat: number, lng: number, z = 16) => {
    mapRef.current?.setView([lat, lng], z);
    initialFlyDoneRef.current = true;
  }, []);

  // ── Mapa (una sola vez) ──
  useEffect(() => {
    if (!rootRef.current) return;
    const map = L.map(rootRef.current, {
      maxBounds: COLOMBIA_BOUNDS.pad(0.1),
      minZoom: 5,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    map.getContainer().style.cursor = "crosshair";

    map.on("click", async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const title = await reverseGeocode(lat, lng);
      const loc: Location = { latitude: lat, longitude: lng, title };
      if (selectModeRef.current === "origin") {
        callbacksRef.current.onOriginChange(loc);
        setSelectMode("destination");
      } else {
        callbacksRef.current.onDestinationChange(loc);
        setSelectMode("origin");
      }
    });

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(rootRef.current);
    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── GPS → origen automático ──
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lng, lat });
        if (!initialFlyDoneRef.current) flyTo(lat, lng, 15);
        const title = await reverseGeocode(lat, lng);
        callbacksRef.current.onOriginChange({ latitude: lat, longitude: lng, title });
        setSelectMode("destination");
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [flyTo]);

  // ── Marcadores ──
  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (userPos) L.marker([userPos.lat, userPos.lng], { icon: USER_ICON, interactive: false }).addTo(layer);
    if (origin) {
      L.marker([origin.latitude, origin.longitude], { icon: pinIcon("#22c55e") })
        .bindPopup(`<p style="font-size:11px;font-weight:700;color:#15803d;margin:0">ORIGEN</p><p style="font-size:12px;margin:2px 0 0">${escapeHtml(shortName(origin.title))}</p>`)
        .addTo(layer);
    }
    if (destination) {
      L.marker([destination.latitude, destination.longitude], { icon: pinIcon("#ef4444") })
        .bindPopup(`<p style="font-size:11px;font-weight:700;color:#b91c1c;margin:0">DESTINO</p><p style="font-size:12px;margin:2px 0 0">${escapeHtml(shortName(destination.title))}</p>`)
        .addTo(layer);
    }
  }, [origin, destination, userPos]);

  // ── Ruta ──
  useEffect(() => {
    const layer = routeLayerRef.current;
    layer?.clearLayers();
    if (!origin || !destination) {
      setRouteInfo(null);
      onRouteInfo?.(null);
      if (!origin && !destination) initialFlyDoneRef.current = false;
      return;
    }
    const controller = new AbortController();
    fetchRoute(origin, destination, controller.signal)
      .then((info) => {
        if (controller.signal.aborted) return;
        setRouteInfo(info);
        onRouteInfo?.(info);
        const map = mapRef.current;
        if (!info || !map || !layer) return;
        const latlngs = (info.geometry as GeoJSON.LineString).coordinates.map(([lng, lat]) => [lat, lng] as L.LatLngTuple);
        L.polyline(latlngs, { color: "#ffffff", weight: 9, opacity: 0.9 }).addTo(layer);
        L.polyline(latlngs, { color: "#00204a", weight: 5, opacity: 0.85 }).addTo(layer);
        map.fitBounds(L.latLngBounds(latlngs), { padding: [60, 60] });
      })
      .catch((e) => {
        if ((e as Error)?.name === "AbortError") return;
        console.error("Error calculando la ruta:", e);
        setRouteInfo(null);
        onRouteInfo?.(null);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <OsmPlacesSearchInput
          label="Dirección de origen"
          placeholder="Ej: Calle 174 con 8, edificio..."
          value={origin?.title || ""}
          onSelect={(loc) => {
            onOriginChange(loc);
            setSelectMode("destination");
            flyTo(loc.latitude, loc.longitude, 16);
          }}
          onClear={() => onOriginChange(null)}
          icon="origin"
          proximity={userPos ?? (destination ? { lng: destination.longitude, lat: destination.latitude } : null)}
        />
        <OsmPlacesSearchInput
          label="Dirección de destino"
          placeholder="¿A dónde vamos?"
          value={destination?.title || ""}
          onSelect={(loc) => {
            onDestinationChange(loc);
            setSelectMode("origin");
            flyTo(loc.latitude, loc.longitude, 16);
          }}
          onClear={() => onDestinationChange(null)}
          icon="destination"
          proximity={origin ? { lng: origin.longitude, lat: origin.latitude } : userPos}
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500 hidden sm:inline">También puedes hacer clic en el mapa:</span>
        <button
          type="button"
          onClick={() => setSelectMode("origin")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selectMode === "origin" ? "bg-green-100 text-green-700 ring-2 ring-green-400 shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          Seleccionar origen
        </button>
        <button
          type="button"
          onClick={() => setSelectMode("destination")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selectMode === "destination" ? "bg-red-100 text-red-700 ring-2 ring-red-400 shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Seleccionar destino
        </button>
        {locating && (
          <span className="text-xs text-blue-500 animate-pulse ml-auto flex items-center gap-1">
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Obteniendo ubicación GPS...
          </span>
        )}
      </div>

      <div className="relative z-0 rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: 420 }}>
        <div ref={rootRef} className="h-full w-full" aria-label="Mapa para seleccionar origen y destino" />
      </div>

      {routeInfo && (
        <div className="flex items-center justify-between bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-xl px-5 py-3.5 shadow-sm">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-slate-400">Distancia</p>
                <p className="text-sm font-bold text-slate-800">{routeInfo.distanceKm} km</p>
              </div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-xs text-slate-400">Tiempo estimado</p>
                <p className="text-sm font-bold text-slate-800">~{routeInfo.durationMin.toFixed(2)} min</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span>→</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          </div>
        </div>
      )}
    </div>
  );
}

// AddBookingPage se re-renderiza en cada tecla del formulario; el mapa solo
// cambia cuando cambian origen/destino.
export default memo(BookingMapView);
