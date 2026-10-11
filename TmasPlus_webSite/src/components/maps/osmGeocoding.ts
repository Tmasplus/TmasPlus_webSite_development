/**
 * Geocodificación con OpenStreetMap (Nominatim). Gratuito, sin API key.
 * Política de uso: máx. ~1 petición/segundo, por eso los buscadores
 * aplican debounce antes de llamar.
 */
const NOMINATIM = "https://nominatim.openstreetmap.org";

export type OsmPlace = {
  id: string;
  lat: number;
  lng: number;
  mainText: string;
  secondaryText: string;
  fullText: string;
};

type NominatimItem = {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
};

function cleanParts(displayName: string) {
  return displayName
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p && p.toLowerCase() !== "colombia" && !/^\d{5,6}$/.test(p));
}

function toPlace(item: NominatimItem): OsmPlace {
  const parts = cleanParts(item.display_name);
  const main = item.name?.trim() || parts[0] || item.display_name;
  const rest = parts.filter((p) => p !== main);
  return {
    id: String(item.place_id),
    lat: Number(item.lat),
    lng: Number(item.lon),
    mainText: main,
    secondaryText: rest.slice(0, 3).join(", "),
    fullText: [main, ...rest].join(", "),
  };
}

export async function searchPlaces(
  text: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal
): Promise<OsmPlace[]> {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: text,
    countrycodes: "co",
    "accept-language": "es",
    limit: "6",
  });
  if (near) {
    const d = 0.5;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
  }
  const res = await fetch(`${NOMINATIM}/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data: NominatimItem[] = await res.json();
  return data.map(toPlace);
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(lat),
      lon: String(lng),
      "accept-language": "es",
      zoom: "18",
    });
    const res = await fetch(`${NOMINATIM}/reverse?${params}`);
    if (!res.ok) return fallback;
    const data: NominatimItem = await res.json();
    return data?.display_name ? cleanParts(data.display_name).slice(0, 4).join(", ") : fallback;
  } catch {
    return fallback;
  }
}
