import { useEffect, useRef, useState, useCallback } from "react";
import Map, {
  Marker,
  Source,
  Layer,
  NavigationControl,
  Popup,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import AddressSearchInput from "./AddressSearchInput";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string;

// Colombia bounding box — limita el mapa solo a Colombia
const COLOMBIA_BOUNDS: [number, number, number, number] = [-82.0, -4.3, -66.8, 13.5];

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

async function reverseGeocode(lng: number, lat: number): Promise<string> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=es&country=co`
  );
  const data = await res.json();
  return data.features?.[0]?.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export default function BookingMapView({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onRouteInfo,
}: BookingMapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState({
    latitude: 4.6097,
    longitude: -74.0817,
    zoom: 13,
  });
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.Feature | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [selectMode, setSelectMode] = useState<"origin" | "destination">("destination");
  const [locating, setLocating] = useState(true);
  const [userPos, setUserPos] = useState<{ lng: number; lat: number } | null>(null);
  const [showOriginPopup, setShowOriginPopup] = useState(false);
  const [showDestPopup, setShowDestPopup] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  // ── Validate token on mount ──
  useEffect(() => {
    if (!MAPBOX_TOKEN) { setTokenError(true); return; }
    fetch(`https://api.mapbox.com/tokens/v2?access_token=${MAPBOX_TOKEN}`)
      .then((r) => r.json())
      .then((d) => { if (d.code === "TokenInvalid") setTokenError(true); })
      .catch(() => {});
  }, []);

  // ── GPS geolocation → auto-set origin ──
  useEffect(() => {
    if (!navigator.geolocation) { setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lng, lat });
        setViewState({ latitude: lat, longitude: lng, zoom: 15 });
        const address = await reverseGeocode(lng, lat);
        onOriginChange({ latitude: lat, longitude: lng, title: address });
        setSelectMode("destination");
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch route when both points set ──
  useEffect(() => {
    if (!origin || !destination) {
      setRouteGeoJSON(null);
      setRouteInfo(null);
      onRouteInfo?.(null);
      return;
    }
    const fetchRoute = async () => {
      try {
        const coords = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
        const res = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`
        );
        const data = await res.json();
        const route = data.routes?.[0];
        if (route?.geometry?.coordinates?.length) {
          const info: RouteInfo = {
            distanceKm: +(route.distance / 1000).toFixed(1),
            durationMin: Math.ceil(route.duration / 60),
            geometry: route.geometry,
          };
          setRouteInfo(info);
          onRouteInfo?.(info);
          setRouteGeoJSON({ type: "Feature", properties: {}, geometry: route.geometry });
          const coordinates = route.geometry.coordinates as [number, number][];
          const bounds = new mapboxgl.LngLatBounds();
          coordinates.forEach((c) => bounds.extend(c));
          mapRef.current?.fitBounds(bounds, { padding: 80, duration: 1200 });
        }
      } catch {
        setRouteGeoJSON(null); setRouteInfo(null); onRouteInfo?.(null);
      }
    };
    fetchRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude]);

  // ── Map click → reverse geocode → set origin/dest ──
  const handleMapClick = useCallback(
    async (e: mapboxgl.MapLayerMouseEvent) => {
      const { lng, lat } = e.lngLat;
      const address = await reverseGeocode(lng, lat);
      const loc: Location = { latitude: lat, longitude: lng, title: address };
      if (selectMode === "origin") {
        onOriginChange(loc);
        setShowOriginPopup(true);
        setSelectMode("destination");
      } else {
        onDestinationChange(loc);
        setShowDestPopup(true);
        setSelectMode("origin");
      }
    },
    [selectMode, onOriginChange, onDestinationChange]
  );

  // ── Fly to selected search result ──
  const flyTo = (loc: Location) => {
    mapRef.current?.flyTo({ center: [loc.longitude, loc.latitude], zoom: 16, duration: 1200 });
  };

  // Route layer
  const routeLayer: mapboxgl.LayerSpecification = {
    id: "route-line", type: "line", source: "route",
    paint: { "line-color": "#00204a", "line-width": 5, "line-opacity": 0.85 },
    layout: { "line-join": "round", "line-cap": "round" },
  };
  // route outline for 3D effect
  const routeOutline: mapboxgl.LayerSpecification = {
    id: "route-outline", type: "line", source: "route",
    paint: { "line-color": "#00f4f5", "line-width": 8, "line-opacity": 0.25 },
    layout: { "line-join": "round", "line-cap": "round" },
  };

  const shortName = (title: string) => {
    const parts = title.split(",");
    return parts.length > 1 ? parts.slice(0, 2).join(",") : title;
  };

  return (
    <div className="space-y-4">
      {/* ── Search inputs ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AddressSearchInput
          label="Dirección de origen"
          placeholder="Ej: Calle 174 con 8, edificio..."
          value={origin?.title || ""}
          onSelect={(loc) => {
            onOriginChange(loc);
            setSelectMode("destination");
            setShowOriginPopup(true);
            flyTo(loc);
          }}
          onClear={() => { onOriginChange(null); setShowOriginPopup(false); }}
          icon="origin"
        />
        <AddressSearchInput
          label="Dirección de destino"
          placeholder="¿A dónde vamos?"
          value={destination?.title || ""}
          onSelect={(loc) => {
            onDestinationChange(loc);
            setSelectMode("origin");
            setShowDestPopup(true);
            flyTo(loc);
          }}
          onClear={() => { onDestinationChange(null); setShowDestPopup(false); }}
          icon="destination"
        />
      </div>

      {/* ── Click mode toggle ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-slate-500 hidden sm:inline">También puedes hacer clic en el mapa:</span>
        <button
          type="button"
          onClick={() => setSelectMode("origin")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selectMode === "origin"
              ? "bg-green-100 text-green-700 ring-2 ring-green-400 shadow-sm"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
          Seleccionar origen
        </button>
        <button
          type="button"
          onClick={() => setSelectMode("destination")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selectMode === "destination"
              ? "bg-red-100 text-red-700 ring-2 ring-red-400 shadow-sm"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
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

      {/* ── MAP ── */}
      {tokenError ? (
        <div className="rounded-2xl border-2 border-dashed border-red-300 bg-red-50 flex flex-col items-center justify-center text-center p-8" style={{ height: 420 }}>
          <svg className="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-red-700 font-semibold text-lg mb-1">Token de Mapbox inválido</p>
          <p className="text-red-500 text-sm max-w-md">
            El token configurado en <code className="bg-red-100 px-1 rounded">.env</code> no es válido o fue revocado.
            Genera uno nuevo en{" "}
            <a href="https://account.mapbox.com/" target="_blank" rel="noreferrer" className="underline font-medium">
              account.mapbox.com
            </a>{" "}
            y actualiza <code className="bg-red-100 px-1 rounded">VITE_MAPBOX_ACCESS_TOKEN</code>. Luego reinicia el servidor.
          </p>
        </div>
      ) : (
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: 420 }}>
        <Map
          ref={mapRef}
          {...viewState}
          onMove={(evt: ViewStateChangeEvent) => setViewState(evt.viewState)}
          onClick={handleMapClick}
          mapboxAccessToken={MAPBOX_TOKEN}
          mapStyle="mapbox://styles/mapbox/streets-v12"
          style={{ width: "100%", height: "100%" }}
          cursor={selectMode === "origin" ? "crosshair" : "crosshair"}
          maxBounds={COLOMBIA_BOUNDS}
          minZoom={5}
        >
          <NavigationControl position="top-right" showCompass showZoom />

          {/* ── User GPS dot (blue pulse) ── */}
          {userPos && (
            <Marker latitude={userPos.lat} longitude={userPos.lng}>
              <div className="relative w-6 h-6 cursor-default">
                <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
                <div className="absolute inset-1.5 bg-blue-500 border-2 border-white rounded-full shadow-lg" />
              </div>
            </Marker>
          )}

          {/* ── Origin Marker ── */}
          {origin && (
            <Marker
              latitude={origin.latitude}
              longitude={origin.longitude}
              onClick={(e) => { e.originalEvent.stopPropagation(); setShowOriginPopup(!showOriginPopup); }}
            >
              <div className="flex flex-col items-center cursor-pointer group">
                <div className="relative">
                  <div className="absolute -inset-2 bg-green-400/20 rounded-full animate-pulse group-hover:bg-green-400/30" />
                  <div className="relative w-5 h-5 bg-green-500 border-[3px] border-white rounded-full shadow-xl" />
                </div>
                <div className="w-0.5 h-3 bg-green-500" />
                <div className="w-2 h-2 bg-green-500/30 rounded-full" />
              </div>
            </Marker>
          )}
          {origin && showOriginPopup && (
            <Popup
              latitude={origin.latitude}
              longitude={origin.longitude}
              onClose={() => setShowOriginPopup(false)}
              closeButton={false}
              offset={25}
              className="!p-0"
            >
              <div className="px-3 py-2 max-w-[220px]">
                <p className="text-xs font-bold text-green-700 mb-0.5">ORIGEN</p>
                <p className="text-xs text-slate-600 leading-snug">{shortName(origin.title)}</p>
              </div>
            </Popup>
          )}

          {/* ── Destination Marker ── */}
          {destination && (
            <Marker
              latitude={destination.latitude}
              longitude={destination.longitude}
              onClick={(e) => { e.originalEvent.stopPropagation(); setShowDestPopup(!showDestPopup); }}
            >
              <div className="flex flex-col items-center cursor-pointer group">
                <div className="relative">
                  <div className="absolute -inset-2 bg-red-400/20 rounded-full animate-pulse group-hover:bg-red-400/30" />
                  <div className="relative w-5 h-5 bg-red-500 border-[3px] border-white rounded-full shadow-xl" />
                </div>
                <div className="w-0.5 h-3 bg-red-500" />
                <div className="w-2 h-2 bg-red-500/30 rounded-full" />
              </div>
            </Marker>
          )}
          {destination && showDestPopup && (
            <Popup
              latitude={destination.latitude}
              longitude={destination.longitude}
              onClose={() => setShowDestPopup(false)}
              closeButton={false}
              offset={25}
              className="!p-0"
            >
              <div className="px-3 py-2 max-w-[220px]">
                <p className="text-xs font-bold text-red-700 mb-0.5">DESTINO</p>
                <p className="text-xs text-slate-600 leading-snug">{shortName(destination.title)}</p>
              </div>
            </Popup>
          )}

          {/* ── Route line ── */}
          {routeGeoJSON && (
            <Source id="route" type="geojson" data={routeGeoJSON}>
              <Layer {...routeOutline} />
              <Layer {...routeLayer} />
            </Source>
          )}
        </Map>
      </div>
      )}

      {/* ── Route info summary ── */}
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
                <p className="text-sm font-bold text-slate-800">~{routeInfo.durationMin} min</p>
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