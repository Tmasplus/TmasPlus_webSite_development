/**
 * Detección de proximidad a aeropuertos usando Haversine.
 *
 * Portado de Agente/backendRemoto/src/shared/geo/airports.py.
 * Para añadir/quitar aeropuertos editar solo airports.json — no toca código.
 *
 * Uso:
 *   const airport = isNearAirport(lat, lng);
 *   if (airport) {
 *     // viaje hacia/desde aeropuerto; sumar delta correspondiente
 *   }
 */

import airportsData from "./airports.json";

interface Airport {
  name: string;
  lat: number;
  lng: number;
}

const AIRPORTS: Airport[] = airportsData as Airport[];

/**
 * Punto fijo de destino para El Dorado (salidas / acceso público).
 * Evita que el pin caiga en pista u otras zonas restringidas.
 */
export const EL_DORADO_FIXED_DESTINATION = {
  latitude: 4.698252,
  longitude: -74.141396,
  title: "Aeropuerto El Dorado",
} as const;

const DEFAULT_RADIUS_KM = 1.0;

// 1° de latitud ≈ 111 km. El delta del bounding-box deja ~11 km de holgura
// alrededor de cada aeropuerto. Garantiza cero falsos negativos en el pre-filtro.
const BBOX_DELTA = 0.1;

const EARTH_RADIUS_KM = 6371.0;

/**
 * Distancia great-circle entre dos coordenadas en km (Haversine).
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const rlat1 = toRad(lat1);
  const rlat2 = toRad(lat2);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(a));
}

/**
 * Si (lat, lng) está dentro de radius_km de algún aeropuerto, devuelve el nombre.
 * Si no, devuelve null.
 *
 * Pre-filtro bounding-box (resta absoluta de coords) evita Haversine costoso
 * para aeropuertos claramente lejanos.
 */
export function isNearAirport(
  lat: number,
  lng: number,
  radiusKm: number = DEFAULT_RADIUS_KM,
): string | null {
  for (const airport of AIRPORTS) {
    if (
      Math.abs(lat - airport.lat) > BBOX_DELTA ||
      Math.abs(lng - airport.lng) > BBOX_DELTA
    ) {
      continue;
    }
    if (haversineKm(lat, lng, airport.lat, airport.lng) <= radiusKm) {
      return airport.name;
    }
  }
  return null;
}

/** True si el texto o las coords apuntan al Aeropuerto El Dorado (Bogotá). */
export function isElDoradoDestination(
  lat?: number | null,
  lng?: number | null,
  title?: string | null,
): boolean {
  const name = String(title || "").toLowerCase();
  if (
    (name.includes("aeropuerto") && name.includes("dorado")) ||
    (name.includes("el dorado") && (name.includes("aeropuerto") || name.includes("bogot")))
  ) {
    return true;
  }
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return false;
  const near = isNearAirport(Number(lat), Number(lng), 3);
  return !!near && /dorado/i.test(near);
}

/** Si el destino es El Dorado, fuerza las coordenadas fijas de salidas. */
export function snapElDoradoDestination<T extends { latitude: number; longitude: number; title?: string }>(
  loc: T,
): T {
  if (!isElDoradoDestination(loc.latitude, loc.longitude, loc.title)) return loc;
  return {
    ...loc,
    latitude: EL_DORADO_FIXED_DESTINATION.latitude,
    longitude: EL_DORADO_FIXED_DESTINATION.longitude,
    title: loc.title?.trim() || EL_DORADO_FIXED_DESTINATION.title,
  };
}
