import { useEffect, useRef, useState, useCallback } from "react";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useMapsLibrary,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import GooglePlacesSearchInput from "./GooglePlacesSearchInput";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;

// Colombia bounding box — restricts the map view to Colombia
const COLOMBIA_BOUNDS = {
  north: 13.5,
  south: -4.3,
  west: -82.0,
  east: -66.8,
};

// Initial camera (Bogotá). The map camera is left UNCONTROLLED after this —
// programmatic moves go through map.panTo()/setZoom() to avoid a feedback loop.
const DEFAULT_CENTER = { lat: 4.6097, lng: -74.0817 };
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

export default function BookingMapView(props: BookingMapViewProps) {
  if (!GOOGLE_MAPS_API_KEY) {
    return <MissingKeyNotice />;
  }
  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} libraries={["places", "routes", "geocoding"]} language="es" region="CO">
      <BookingMapInner {...props} />
    </APIProvider>
  );
}

function BookingMapInner({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  onRouteInfo,
}: BookingMapViewProps) {
  const map = useMap();
  const [selectMode, setSelectMode] = useState<"origin" | "destination">("destination");
  const [locating, setLocating] = useState(true);
  const [userPos, setUserPos] = useState<{ lng: number; lat: number } | null>(null);
  const [showOriginPopup, setShowOriginPopup] = useState(false);
  const [showDestPopup, setShowDestPopup] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const initialFlyDoneRef = useRef(false);

  const geocodingLib = useMapsLibrary("geocoding");
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  useEffect(() => {
    if (geocodingLib) geocoderRef.current = new geocodingLib.Geocoder();
  }, [geocodingLib]);

  const reverseGeocode = useCallback(async (lng: number, lat: number): Promise<string> => {
    const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    // The geocoding library loads asynchronously, so on first paint (e.g. the GPS
    // auto-origin) geocoderRef may still be null. Wait briefly for it to be ready
    // instead of immediately falling back to raw coordinates.
    let geocoder = geocoderRef.current;
    for (let i = 0; i < 50 && !geocoder; i++) {
      await new Promise((r) => setTimeout(r, 100));
      geocoder = geocoderRef.current;
    }
    if (!geocoder) return fallback;
    try {
      const res = await geocoder.geocode({
        location: { lat, lng },
        language: "es",
        region: "co",
      });
      return res.results?.[0]?.formatted_address || fallback;
    } catch {
      return fallback;
    }
  }, []);

  // Imperative camera move — used for GPS + place selection. The map camera is
  // left UNCONTROLLED to avoid a render→camera feedback loop that made the map
  // drift on its own and re-render the search inputs on every frame.
  const flyTo = useCallback(
    (lat: number, lng: number, z = 16) => {
      if (!map) return;
      map.panTo({ lat, lng });
      map.setZoom(z);
      initialFlyDoneRef.current = true;
    },
    [map]
  );

  // ── GPS geolocation → auto-set origin ──
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserPos({ lng, lat });
        const address = await reverseGeocode(lng, lat);
        onOriginChange({ latitude: lat, longitude: lng, title: address });
        setSelectMode("destination");
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverseGeocode]);

  // Pan to the user's GPS position once the map instance is ready (one-time).
  useEffect(() => {
    if (map && userPos && !initialFlyDoneRef.current) {
      flyTo(userPos.lat, userPos.lng, 15);
    }
  }, [map, userPos, flyTo]);

  const handleMapClick = useCallback(
    async (e: MapMouseEvent) => {
      const latLng = e.detail.latLng;
      if (!latLng) return;
      const { lat, lng } = latLng;
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
    [selectMode, onOriginChange, onDestinationChange, reverseGeocode]
  );

  const handleRouteCalculated = useCallback(
    (info: RouteInfo | null) => {
      setRouteInfo(info);
      onRouteInfo?.(info);
    },
    [onRouteInfo]
  );

  // Reset initial fly flag if both points get cleared
  useEffect(() => {
    if (!origin && !destination) initialFlyDoneRef.current = false;
  }, [origin, destination]);

  return (
    <div className="space-y-4">
      {/* ── Search inputs ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GooglePlacesSearchInput
          label="Dirección de origen"
          placeholder="Ej: Calle 174 con 8, edificio..."
          value={origin?.title || ""}
          onSelect={(loc) => {
            onOriginChange(loc);
            setSelectMode("destination");
            setShowOriginPopup(true);
            flyTo(loc.latitude, loc.longitude, 16);
          }}
          onClear={() => {
            onOriginChange(null);
            setShowOriginPopup(false);
          }}
          icon="origin"
          proximity={userPos ?? (destination ? { lng: destination.longitude, lat: destination.latitude } : null)}
        />
        <GooglePlacesSearchInput
          label="Dirección de destino"
          placeholder="¿A dónde vamos?"
          value={destination?.title || ""}
          onSelect={(loc) => {
            onDestinationChange(loc);
            setSelectMode("origin");
            setShowDestPopup(true);
            flyTo(loc.latitude, loc.longitude, 16);
          }}
          onClear={() => {
            onDestinationChange(null);
            setShowDestPopup(false);
          }}
          icon="destination"
          proximity={origin ? { lng: origin.longitude, lat: origin.latitude } : userPos}
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
      <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: 420 }}>
        <Map
          mapId="tplus-booking-map"
          defaultCenter={DEFAULT_CENTER}
          defaultZoom={DEFAULT_ZOOM}
          onClick={handleMapClick}
          gestureHandling="greedy"
          disableDefaultUI={false}
          clickableIcons={false}
          restriction={{ latLngBounds: COLOMBIA_BOUNDS, strictBounds: false }}
          minZoom={5}
          style={{ width: "100%", height: "100%", cursor: "crosshair" }}
        >
          {/* ── User GPS dot (blue pulse) ── */}
          {userPos && (
            <AdvancedMarker position={{ lat: userPos.lat, lng: userPos.lng }}>
              <div className="relative w-6 h-6 cursor-default">
                <div className="absolute inset-0 bg-blue-400/30 rounded-full animate-ping" />
                <div className="absolute inset-1.5 bg-blue-500 border-2 border-white rounded-full shadow-lg" />
              </div>
            </AdvancedMarker>
          )}

          {/* ── Origin Marker ── */}
          {origin && (
            <AdvancedMarker
              position={{ lat: origin.latitude, lng: origin.longitude }}
              onClick={() => setShowOriginPopup((v) => !v)}
            >
              <div className="flex flex-col items-center cursor-pointer group">
                <div className="relative">
                  <div className="absolute -inset-2 bg-green-400/20 rounded-full animate-pulse group-hover:bg-green-400/30" />
                  <div className="relative w-5 h-5 bg-green-500 border-[3px] border-white rounded-full shadow-xl" />
                </div>
                <div className="w-0.5 h-3 bg-green-500" />
                <div className="w-2 h-2 bg-green-500/30 rounded-full" />
              </div>
            </AdvancedMarker>
          )}
          {origin && showOriginPopup && (
            <InfoWindow
              position={{ lat: origin.latitude, lng: origin.longitude }}
              onCloseClick={() => setShowOriginPopup(false)}
              pixelOffset={[0, -25]}
            >
              <div className="px-1 py-1 max-w-[220px]">
                <p className="text-xs font-bold text-green-700 mb-0.5">ORIGEN</p>
                <p className="text-xs text-slate-600 leading-snug">{shortName(origin.title)}</p>
              </div>
            </InfoWindow>
          )}

          {/* ── Destination Marker ── */}
          {destination && (
            <AdvancedMarker
              position={{ lat: destination.latitude, lng: destination.longitude }}
              onClick={() => setShowDestPopup((v) => !v)}
            >
              <div className="flex flex-col items-center cursor-pointer group">
                <div className="relative">
                  <div className="absolute -inset-2 bg-red-400/20 rounded-full animate-pulse group-hover:bg-red-400/30" />
                  <div className="relative w-5 h-5 bg-red-500 border-[3px] border-white rounded-full shadow-xl" />
                </div>
                <div className="w-0.5 h-3 bg-red-500" />
                <div className="w-2 h-2 bg-red-500/30 rounded-full" />
              </div>
            </AdvancedMarker>
          )}
          {destination && showDestPopup && (
            <InfoWindow
              position={{ lat: destination.latitude, lng: destination.longitude }}
              onCloseClick={() => setShowDestPopup(false)}
              pixelOffset={[0, -25]}
            >
              <div className="px-1 py-1 max-w-[220px]">
                <p className="text-xs font-bold text-red-700 mb-0.5">DESTINO</p>
                <p className="text-xs text-slate-600 leading-snug">{shortName(destination.title)}</p>
              </div>
            </InfoWindow>
          )}

          {/* ── Route directions ── */}
          <Directions
            origin={origin}
            destination={destination}
            onRouteInfo={handleRouteCalculated}
          />
        </Map>
      </div>

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

// ── Directions sub-component: draws the route and reports back distance/time ──
function Directions({
  origin,
  destination,
  onRouteInfo,
}: {
  origin: Location | null;
  destination: Location | null;
  onRouteInfo: (info: RouteInfo | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary("routes");
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);

  useEffect(() => {
    if (!routesLib || !map) return;
    directionsServiceRef.current = new routesLib.DirectionsService();
    directionsRendererRef.current = new routesLib.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#00204a",
        strokeOpacity: 0.85,
        strokeWeight: 5,
      },
    });
    return () => {
      directionsRendererRef.current?.setMap(null);
      directionsRendererRef.current = null;
    };
  }, [routesLib, map]);

  useEffect(() => {
    const svc = directionsServiceRef.current;
    const renderer = directionsRendererRef.current;
    if (!svc || !renderer || !map) return;

    if (!origin || !destination) {
      renderer.set("directions", null);
      onRouteInfo(null);
      return;
    }

    svc
      .route({
        origin: { lat: origin.latitude, lng: origin.longitude },
        destination: { lat: destination.latitude, lng: destination.longitude },
        travelMode: google.maps.TravelMode.DRIVING,
        region: "co",
      })
      .then((res) => {
        renderer.setDirections(res);
        const leg = res.routes[0]?.legs[0];
        if (!leg) {
          onRouteInfo(null);
          return;
        }
        const distMeters = leg.distance?.value ?? 0;
        const durSec = leg.duration?.value ?? 0;
        // Build GeoJSON LineString from the route's overview_path
        const path = res.routes[0].overview_path.map((p) => [p.lng(), p.lat()] as [number, number]);
        const info: RouteInfo = {
          distanceKm: +(distMeters / 1000).toFixed(1),
          durationMin: Math.ceil(durSec / 60),
          geometry: { type: "LineString", coordinates: path },
        };
        onRouteInfo(info);

        // Fit bounds to the route
        const bounds = new google.maps.LatLngBounds();
        res.routes[0].overview_path.forEach((p) => bounds.extend(p));
        map.fitBounds(bounds, 80);
      })
      .catch(() => {
        renderer.set("directions", null);
        onRouteInfo(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude, map]);

  return null;
}

function MissingKeyNotice() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed border-red-300 bg-red-50 flex flex-col items-center justify-center text-center p-8"
      style={{ height: 420 }}
    >
      <svg className="w-12 h-12 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
      <p className="text-red-700 font-semibold text-lg mb-1">Falta la API Key de Google Maps</p>
      <p className="text-red-500 text-sm max-w-md">
        Añade <code className="bg-red-100 px-1 rounded">VITE_GOOGLE_MAPS_API_KEY</code> en el archivo{" "}
        <code className="bg-red-100 px-1 rounded">.env</code> y reinicia el servidor de desarrollo.
      </p>
    </div>
  );
}

function shortName(title: string) {
  const parts = title.split(",");
  return parts.length > 1 ? parts.slice(0, 2).join(",") : title;
}
