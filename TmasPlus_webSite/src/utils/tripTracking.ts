import type { TrackingPoint } from "@/services/bookingDetail.service";

export type LatLng = { lat: number; lng: number };

const MAX_GPS_SPEED_KMH = 160;
const MAX_ACCURACY_M = 50;
const MIN_STEP_M = 8;

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function pathDistanceKm(path: LatLng[]) {
  let km = 0;
  for (let i = 1; i < path.length; i++) km += haversineKm(path[i - 1], path[i]);
  return km;
}

export function toEpochMs(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n > 0 ? (n < 1e12 ? n * 1000 : n) : null;
  }
  const t = new Date(s).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

/**
 * Igual que `filterBillableTracking` de la app: solo puntos dentro de la
 * ventana inicio→fin del viaje, sin jitter (< 8 m) ni saltos imposibles
 * (> 160 km/h) ni lecturas imprecisas (> 50 m).
 */
export function filterTripTracking(points: TrackingPoint[], startMs: number | null, endMs: number | null) {
  const kept: TrackingPoint[] = [];
  for (const p of points) {
    if (startMs != null && p.ts < startMs) continue;
    if (endMs != null && p.ts > endMs) continue;
    if (p.accuracy != null && Number.isFinite(p.accuracy) && p.accuracy > MAX_ACCURACY_M) continue;
    const last = kept[kept.length - 1];
    if (last) {
      const stepM = haversineKm(last, p) * 1000;
      if (stepM < MIN_STEP_M) continue;
      const dtSec = Math.max((p.ts - last.ts) / 1000, 1);
      if (stepM > ((MAX_GPS_SPEED_KMH * 1000) / 3600) * dtSec) continue;
    }
    kept.push(p);
  }
  return kept;
}
