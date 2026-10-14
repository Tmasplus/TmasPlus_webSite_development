import type { LatLng } from "@/utils/tripTracking";

export type RouteMode = "suggested" | "actual";

export type RouteMapProps = {
  mode: RouteMode;
  pickup: LatLng | null;
  drop: LatLng | null;
  suggestedPath: LatLng[];
  actualPath: LatLng[];
  /** Última posición conocida del vehículo mientras el servicio está activo (null si no hay servicio en curso). */
  vehicle?: LatLng | null;
};

export const ROUTE_COLORS = {
  suggested: "#2563eb",
  actual: "#059669",
  pickup: "#0284c7",
  drop: "#e11d48",
  end: "#0f172a",
};
