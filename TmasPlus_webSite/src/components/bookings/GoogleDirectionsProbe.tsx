// ============================================================================
// GOOGLE MAPS DESACTIVADO por decisión del cliente: la web usa solo
// OpenStreetMap (Leaflet + Nominatim + OSRM). Se conserva comentado como
// referencia. Reemplazo: ver components/maps/Osm* y bookings/BookingRouteMap.
// ============================================================================
export {};

// import { useEffect } from "react";
// import { APIProvider, useMapsLibrary } from "@vis.gl/react-google-maps";
// import type { LatLng } from "@/utils/tripTracking";
// import type { SuggestedRoute } from "@/hooks/useSuggestedRoute";
//
// // Mismas opciones que GoogleMapsAddressPicker: el loader de Google es único y
// // falla si se inicializa con librerías distintas.
// const GOOGLE_MAPS_LIBRARIES: ("places" | "routes" | "geocoding")[] = ["places", "routes", "geocoding"];
//
// type Props = {
//   apiKey: string;
//   pickup: LatLng;
//   drop: LatLng;
//   onResult: (route: SuggestedRoute | null) => void;
// };
//
// function Directions({ pickup, drop, onResult }: Omit<Props, "apiKey">) {
//   const routes = useMapsLibrary("routes");
//   useEffect(() => {
//     if (!routes) return;
//     let cancelled = false;
//     // Forma con callback: al reabrir el modal `route()` puede devolver
//     // undefined en vez de una promesa.
//     try {
//       const pending: Promise<unknown> | undefined = new routes.DirectionsService().route(
//         { origin: pickup, destination: drop, travelMode: google.maps.TravelMode.DRIVING },
//         (res, status) => {
//           if (cancelled) return;
//           const route = status === google.maps.DirectionsStatus.OK ? res?.routes?.[0] : undefined;
//           const leg = route?.legs?.[0];
//           const path = (route?.overview_path || []).map((p) => ({ lat: p.lat(), lng: p.lng() }));
//           onResult(
//             path.length > 1
//               ? {
//                   path,
//                   source: "google",
//                   distanceKm: leg?.distance ? leg.distance.value / 1000 : null,
//                   durationMin: leg?.duration ? Math.round(leg.duration.value / 60) : null,
//                 }
//               : null
//           );
//         }
//       );
//       pending?.catch?.(() => undefined);
//     } catch {
//       onResult(null);
//     }
//     return () => {
//       cancelled = true;
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [routes, pickup.lat, pickup.lng, drop.lat, drop.lng]);
//   return null;
// }
//
// /** Consulta Google Directions sin pintar mapa; el resultado se dibuja en Leaflet. */
// export function GoogleDirectionsProbe({ apiKey, ...props }: Props) {
//   return (
//     <APIProvider apiKey={apiKey} libraries={GOOGLE_MAPS_LIBRARIES} language="es" region="CO">
//       <Directions {...props} />
//     </APIProvider>
//   );
// }
