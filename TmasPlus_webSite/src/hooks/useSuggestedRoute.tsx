import { useEffect, useState } from "react";
// Google Maps desactivado por decisión del cliente: solo OpenStreetMap.
// import { GoogleDirectionsProbe } from "@/components/bookings/GoogleDirectionsProbe";
// import { isGoogleMapsBlocked, onGoogleMapsBlocked } from "@/utils/googleMapsAuth";
import type { LatLng } from "@/utils/tripTracking";

export type SuggestedRoute = {
  path: LatLng[];
  source: "google" | "osrm" | "straight";
  distanceKm: number | null;
  durationMin: number | null;
};

async function fetchOsrmRoute(pickup: LatLng, drop: LatLng, signal: AbortSignal): Promise<SuggestedRoute | null> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${drop.lng},${drop.lat}` +
    `?overview=full&geometries=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const json = await res.json();
  const route = json?.routes?.[0];
  const coords: [number, number][] = route?.geometry?.coordinates || [];
  if (coords.length < 2) return null;
  return {
    path: coords.map(([lng, lat]) => ({ lat, lng })),
    source: "osrm",
    distanceKm: route.distance ? route.distance / 1000 : null,
    durationMin: route.duration ? Math.round(route.duration / 60) : null,
  };
}

/**
 * Ruta por calles entre origen y destino con OSRM (OpenStreetMap). Si OSRM no
 * responde se usa la línea recta.
 */
export function useSuggestedRoute(pickup: LatLng | null, drop: LatLng | null) {
  const [route, setRoute] = useState<SuggestedRoute | null>(null);
  const key = pickup && drop ? `${pickup.lat},${pickup.lng}|${drop.lat},${drop.lng}` : "";

  useEffect(() => {
    setRoute(null);
    if (!pickup || !drop) return;
    const controller = new AbortController();
    fetchOsrmRoute(pickup, drop, controller.signal)
      .catch(() => null)
      .then((osrm) => {
        if (controller.signal.aborted) return;
        setRoute(osrm ?? { path: [pickup, drop], source: "straight", distanceKm: null, durationMin: null });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { route, loading: !!key && !route };
}
