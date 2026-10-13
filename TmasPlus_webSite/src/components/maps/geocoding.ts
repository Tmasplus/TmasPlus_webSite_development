/**
 * Proveedor de geocodificación para los buscadores de dirección:
 * Google si hay VITE_GOOGLE_MAPS_API_KEY y responde; si no, OpenStreetMap (Nominatim).
 */
import { googleGeocodingAvailable, googleReverseGeocode, googleSearchPlaces } from "./googleGeocoding";
import { reverseGeocode as osmReverseGeocode, searchPlaces as osmSearchPlaces, type OsmPlace } from "./osmGeocoding";

export type GeocodedPlace = OsmPlace & { approximate?: boolean };

export function geocodingProvider(): "google" | "osm" {
  return googleGeocodingAvailable() ? "google" : "osm";
}

/** Nominatim exige ~1 petición/segundo; Google admite búsquedas más ágiles. */
export function searchDebounceMs() {
  return geocodingProvider() === "google" ? 450 : 700;
}

export async function searchPlaces(
  text: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal
): Promise<GeocodedPlace[]> {
  if (googleGeocodingAvailable()) {
    try {
      const results = await googleSearchPlaces(text, near);
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      return results;
    } catch (e) {
      if ((e as Error)?.name === "AbortError") throw e;
      console.warn("[geocoding] Google falló, se usa OpenStreetMap:", e);
    }
  }
  return osmSearchPlaces(text, near, signal);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  if (googleGeocodingAvailable()) {
    try {
      const address = await googleReverseGeocode(lat, lng);
      if (address) return address;
    } catch (e) {
      console.warn("[geocoding] Google falló, se usa OpenStreetMap:", e);
    }
  }
  return osmReverseGeocode(lat, lng);
}
