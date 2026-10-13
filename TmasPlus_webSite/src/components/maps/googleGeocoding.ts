/**
 * Geocodificación con Google (Geocoding de Maps JavaScript API). Solo se usa
 * para convertir direcciones en coordenadas y viceversa; el mapa sigue siendo
 * OpenStreetMap. Requiere VITE_GOOGLE_MAPS_API_KEY con "Maps JavaScript API" y
 * "Geocoding API" habilitadas y el dominio autorizado en la restricción de referer.
 */
import type { OsmPlace } from "./osmGeocoding";

export const GOOGLE_GEOCODING_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || "";

const CALLBACK = "__tplusGoogleMapsReady";

let loader: Promise<google.maps.Geocoder> | null = null;
let authFailed = false;

export function googleGeocodingAvailable() {
  return !!GOOGLE_GEOCODING_KEY && !authFailed;
}

function loadGeocoder(): Promise<google.maps.Geocoder> {
  if (loader) return loader;
  loader = new Promise<google.maps.Geocoder>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    // Google llama a gm_authFailure si la key no es válida o el dominio no está autorizado.
    w.gm_authFailure = () => {
      authFailed = true;
      console.warn("[geocoding] Google rechazó la API key; se usa OpenStreetMap.");
    };
    const finish = async () => {
      try {
        const { Geocoder } = (await google.maps.importLibrary("geocoding")) as google.maps.GeocodingLibrary;
        resolve(new Geocoder());
      } catch (e) {
        reject(e);
      }
    };
    if (typeof google !== "undefined" && typeof google.maps?.importLibrary === "function") {
      void finish();
      return;
    }
    w[CALLBACK] = () => void finish();
    const params = new URLSearchParams({
      key: GOOGLE_GEOCODING_KEY,
      v: "weekly",
      language: "es",
      region: "CO",
      loading: "async",
      callback: CALLBACK,
    });
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  }).catch((e) => {
    loader = null;
    throw e;
  });
  return loader;
}

/** "Calle 174 con 8-20" → "Calle 174 # 8-20" (formato que Google entiende mejor en Colombia). */
function normalizeColombianAddress(text: string) {
  return text
    .replace(/\s+(con|no\.?|n°|nº|numero|número)\s+/i, " # ")
    .replace(/\s*#\s*/g, " # ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanParts(formatted: string) {
  return formatted
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p.toLowerCase() !== "colombia" && !/^\d{5,6}$/.test(p));
}

function toPlace(r: google.maps.GeocoderResult): OsmPlace & { approximate: boolean } {
  const parts = cleanParts(r.formatted_address);
  const main = parts[0] || r.formatted_address;
  const rest = parts.slice(1);
  return {
    id: r.place_id,
    lat: r.geometry.location.lat(),
    lng: r.geometry.location.lng(),
    mainText: main,
    secondaryText: rest.join(", "),
    fullText: parts.join(", "),
    approximate: !!r.partial_match || r.geometry.location_type === google.maps.GeocoderLocationType.APPROXIMATE,
  };
}

function isDenied(e: unknown) {
  const code = (e as { code?: string })?.code ?? String(e);
  return /REQUEST_DENIED|OVER_QUERY_LIMIT/.test(code);
}

export async function googleSearchPlaces(
  text: string,
  near?: { lat: number; lng: number } | null
): Promise<(OsmPlace & { approximate: boolean })[]> {
  const geocoder = await loadGeocoder();
  const d = 0.35;
  try {
    const { results } = await geocoder.geocode({
      address: normalizeColombianAddress(text),
      componentRestrictions: { country: "CO" },
      region: "co",
      language: "es",
      ...(near
        ? { bounds: { south: near.lat - d, west: near.lng - d, north: near.lat + d, east: near.lng + d } }
        : {}),
    });
    const seen = new Set<string>();
    return results
      .map(toPlace)
      .filter((p) => (seen.has(p.fullText) ? false : (seen.add(p.fullText), true)))
      .slice(0, 6);
  } catch (e) {
    if ((e as { code?: string })?.code === "ZERO_RESULTS") return [];
    if (isDenied(e)) authFailed = true;
    throw e;
  }
}

export async function googleReverseGeocode(lat: number, lng: number): Promise<string | null> {
  const geocoder = await loadGeocoder();
  try {
    const { results } = await geocoder.geocode({ location: { lat, lng }, language: "es" });
    // Preferimos una dirección exacta (calle + número) sobre barrios o ciudades.
    const best = results.find((r) => r.types.includes("street_address") || r.types.includes("premise")) ?? results[0];
    return best ? cleanParts(best.formatted_address).slice(0, 4).join(", ") : null;
  } catch (e) {
    if (isDenied(e)) authFailed = true;
    return null;
  }
}
