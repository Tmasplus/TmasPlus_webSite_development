// ============================================================================
// GOOGLE MAPS DESACTIVADO por decisión del cliente: la web usa solo
// OpenStreetMap (Leaflet + Nominatim + OSRM). Se conserva comentado como
// referencia. Reemplazo: ver components/maps/Osm* y bookings/BookingRouteMap.
// ============================================================================
export {};

// import { useEffect } from "react";
// import { APIProvider, APILoadingStatus, Map, useApiLoadingStatus, useMap } from "@vis.gl/react-google-maps";
// import { ROUTE_COLORS, type RouteMapProps } from "./routeMapShared";
//
// // Mismas opciones que GoogleMapsAddressPicker: el loader de Google es único y
// // falla si se inicializa con librerías distintas.
// const GOOGLE_MAPS_LIBRARIES: ("places" | "routes" | "geocoding")[] = ["places", "routes", "geocoding"];
// const DEFAULT_CENTER = { lat: 4.65, lng: -74.08 };
//
// function circleIcon(color: string, scale: number): google.maps.Symbol {
//   return {
//     path: google.maps.SymbolPath.CIRCLE,
//     scale,
//     fillColor: color,
//     fillOpacity: 1,
//     strokeColor: "#ffffff",
//     strokeWeight: 3,
//   };
// }
//
// function StatusWatcher({ onUnavailable }: { onUnavailable: () => void }) {
//   const status = useApiLoadingStatus();
//   useEffect(() => {
//     if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) onUnavailable();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [status]);
//   return null;
// }
//
// function RouteOverlay({ mode, pickup, drop, suggestedPath, actualPath }: RouteMapProps) {
//   const map = useMap();
//
//   useEffect(() => {
//     if (!map) return;
//     const overlays: Array<google.maps.Polyline | google.maps.Marker> = [];
//     const bounds = new google.maps.LatLngBounds();
//     const path = mode === "suggested" ? suggestedPath : actualPath;
//     const color = mode === "suggested" ? ROUTE_COLORS.suggested : ROUTE_COLORS.actual;
//
//     if (path.length > 1) {
//       overlays.push(
//         new google.maps.Polyline({ path, map, strokeColor: "#ffffff", strokeOpacity: 0.9, strokeWeight: 9 }),
//         new google.maps.Polyline({ path, map, strokeColor: color, strokeOpacity: 0.95, strokeWeight: 5 })
//       );
//       path.forEach((p) => bounds.extend(p));
//     }
//
//     if (mode === "actual" && path.length > 0) {
//       overlays.push(
//         new google.maps.Marker({ map, position: path[0], icon: circleIcon(ROUTE_COLORS.actual, 6), title: "Inicio del viaje (GPS)" }),
//         new google.maps.Marker({ map, position: path[path.length - 1], icon: circleIcon(ROUTE_COLORS.end, 6), title: "Fin del viaje (GPS)" })
//       );
//     }
//
//     const labelStyle = { color: "#ffffff", fontSize: "11px", fontWeight: "800" };
//     if (pickup) {
//       overlays.push(
//         new google.maps.Marker({ map, position: pickup, icon: circleIcon(ROUTE_COLORS.pickup, 11), label: { text: "A", ...labelStyle }, title: "Origen" })
//       );
//       bounds.extend(pickup);
//     }
//     if (drop) {
//       overlays.push(
//         new google.maps.Marker({ map, position: drop, icon: circleIcon(ROUTE_COLORS.drop, 11), label: { text: "B", ...labelStyle }, title: "Destino" })
//       );
//       bounds.extend(drop);
//     }
//
//     if (!bounds.isEmpty()) {
//       map.fitBounds(bounds, 36);
//       google.maps.event.addListenerOnce(map, "idle", () => {
//         if ((map.getZoom() ?? 0) > 16) map.setZoom(16);
//       });
//     }
//
//     return () => overlays.forEach((o) => o.setMap(null));
//   }, [map, mode, pickup, drop, suggestedPath, actualPath]);
//
//   return null;
// }
//
// /** Mapa del recorrido con Google Maps; avisa con `onUnavailable` si la key no carga. */
// export function GoogleRouteMap({ apiKey, onUnavailable, ...props }: RouteMapProps & { apiKey: string; onUnavailable: () => void }) {
//   return (
//     <APIProvider apiKey={apiKey} libraries={GOOGLE_MAPS_LIBRARIES} language="es" region="CO">
//       <StatusWatcher onUnavailable={onUnavailable} />
//       <Map
//         defaultCenter={DEFAULT_CENTER}
//         defaultZoom={12}
//         gestureHandling="cooperative"
//         clickableIcons={false}
//         streetViewControl={false}
//         mapTypeControl={false}
//         fullscreenControl
//         style={{ width: "100%", height: "100%" }}
//       />
//       <RouteOverlay {...props} />
//     </APIProvider>
//   );
// }
