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

type Coord = [number, number];
type WayItem = NominatimItem & {
  category?: string;
  geojson?: { type: string; coordinates: Coord[] | Coord[][] };
};

const CROSS_STREET: Record<string, string> = {
  Carrera: "Calle",
  "Avenida Carrera": "Calle",
  Transversal: "Calle",
  Calle: "Carrera",
  "Avenida Calle": "Carrera",
  Diagonal: "Carrera",
};

const COLOMBIAN_ADDRESS =
  /^(Avenida Carrera|Avenida Calle|Carrera|Calle|Transversal|Diagonal) ([0-9A-Z ]+?) # ([0-9A-Z ]+?)-(\d+)$/;

// Nominatim no entiende la placa ("# 129D-31"). En OSM muchas vías de barrio quedan cortadas antes del cruce,
// por eso se acepta la vía generadora hasta a esta distancia de la principal.
const MAX_CROSS_DISTANCE_M = 250;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

async function searchWays(street: string, near: { lat: number; lng: number } | null | undefined, signal?: AbortSignal) {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: street,
    countrycodes: "co",
    "accept-language": "es",
    limit: "40",
    polygon_geojson: "1",
    polygon_threshold: "0.00002",
  });
  if (near) {
    const d = 0.3;
    params.set("viewbox", `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
    params.set("bounded", "1");
  }
  const res = await fetch(`${NOMINATIM}/search?${params}`, { signal });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const data: WayItem[] = await res.json();
  return data.filter((i) => i.category === "highway" && /LineString/.test(i.geojson?.type ?? ""));
}

const lineStrings = (w: WayItem): Coord[][] =>
  w.geojson!.type === "LineString" ? [w.geojson!.coordinates as Coord[]] : (w.geojson!.coordinates as Coord[][]);

/** Proyección local en metros (suficiente a escala de barrio). */
function toMeters([lng, lat]: Coord, lat0: number): Coord {
  return [lng * 111320 * Math.cos((lat0 * Math.PI) / 180), lat * 110540];
}

function closestOnSegment(p: Coord, a: Coord, b: Coord): Coord {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return [a[0] + t * dx, a[1] + t * dy];
}

/** Punto de la vía principal más cercano a la vía generadora, con la distancia entre ellas en metros. */
function closestCrossing(a: WayItem[], b: WayItem[]) {
  let best = null as { d: number; at: Coord; way: WayItem } | null;
  const lat0 = Number(a[0]?.lat ?? 4.6);
  for (const wa of a) for (const la of lineStrings(wa)) for (const wb of b) for (const lb of lineStrings(wb)) {
    const A = la.map((c) => toMeters(c, lat0));
    const B = lb.map((c) => toMeters(c, lat0));
    const check = (onMain: Coord, onCross: Coord) => {
      const d = Math.hypot(onMain[0] - onCross[0], onMain[1] - onCross[1]);
      if (!best || d < best.d) best = { d, at: onMain, way: wb };
    };
    for (let i = 0; i + 1 < B.length; i++) for (const p of A) check(p, closestOnSegment(p, B[i], B[i + 1]));
    for (let i = 0; i + 1 < A.length; i++) for (const p of B) check(closestOnSegment(p, A[i], A[i + 1]), p);
  }
  if (!best) return null;
  const { d, at, way } = best;
  return { d, lat: at[1] / 110540, lng: at[0] / (111320 * Math.cos((lat0 * Math.PI) / 180)), way };
}

const crossingCache = new Map<string, OsmPlace | null>();

/**
 * Respaldo para nomenclatura colombiana ("Carrera 96A # 129D-31"): ubica el cruce de la vía principal con la vía
 * generadora. El punto es aproximado (esquina de la cuadra); el usuario lo ajusta en el mapa.
 */
export async function searchStreetCrossing(
  normalized: string,
  near?: { lat: number; lng: number } | null,
  signal?: AbortSignal
): Promise<OsmPlace | null> {
  const m = COLOMBIAN_ADDRESS.exec(normalized);
  if (!m) return null;
  const [, type, number, crossNumber] = m;
  const cacheKey = `${normalized}|${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ""}`;
  if (crossingCache.has(cacheKey)) return crossingCache.get(cacheKey)!;

  const main = await searchWays(`${type} ${number}`, near, signal);
  if (main.length === 0) return null;
  await sleep(1100, signal);
  const cross = await searchWays(`${CROSS_STREET[type]} ${crossNumber}`, near, signal);
  const found = cross.length ? closestCrossing(main, cross) : null;

  const place =
    found && found.d <= MAX_CROSS_DISTANCE_M
      ? {
          id: `cruce-${found.way.place_id}-${normalized}`,
          lat: found.lat,
          lng: found.lng,
          mainText: normalized,
          secondaryText: cleanParts(found.way.display_name)
            .slice(1)
            .filter((p) => !/^UPZ|^RAP |Distrito Capital|ciudad$/i.test(p))
            .slice(0, 3)
            .join(", "),
          fullText: "",
        }
      : null;
  if (place) place.fullText = [place.mainText, place.secondaryText].filter(Boolean).join(", ");
  crossingCache.set(cacheKey, place);
  return place;
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
