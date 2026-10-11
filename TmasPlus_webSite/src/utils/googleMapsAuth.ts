// ============================================================================
// GOOGLE MAPS DESACTIVADO por decisión del cliente: la web usa solo
// OpenStreetMap (Leaflet + Nominatim + OSRM). Se conserva comentado como
// referencia. Reemplazo: ver components/maps/Osm* y bookings/BookingRouteMap.
// ============================================================================
export {};

// /**
//  * Detecta cuando Google rechaza la API key (RefererNotAllowedMapError,
//  * ApiNotActivatedMapError, key inválida…) para caer a OpenStreetMap.
//  *
//  * Google avisa llamando a `window.gm_authFailure`, pero @vis.gl/react-google-maps
//  * reasigna ese callback en cada APIProvider; por eso se envuelve con un
//  * getter/setter que conserva el handler ajeno y siempre marca el bloqueo.
//  */
// const STORAGE_KEY = "tplus_gmaps_auth_failed";
//
// let blocked = readStored();
// const listeners = new Set<() => void>();
//
// function readStored() {
//   try {
//     return sessionStorage.getItem(STORAGE_KEY) === "1";
//   } catch {
//     return false;
//   }
// }
//
// export function isGoogleMapsBlocked() {
//   return blocked;
// }
//
// export function markGoogleMapsBlocked() {
//   if (blocked) return;
//   blocked = true;
//   try {
//     sessionStorage.setItem(STORAGE_KEY, "1");
//   } catch {
//     /* sin sessionStorage: solo en memoria */
//   }
//   listeners.forEach((fn) => fn());
// }
//
// export function onGoogleMapsBlocked(fn: () => void) {
//   listeners.add(fn);
//   return () => {
//     listeners.delete(fn);
//   };
// }
//
// type AuthWindow = Window & { gm_authFailure?: () => void; __tplusGmAuthHook?: boolean };
//
// function installAuthFailureHook() {
//   if (typeof window === "undefined") return;
//   const w = window as AuthWindow;
//   if (w.__tplusGmAuthHook) return;
//   w.__tplusGmAuthHook = true;
//   let inner = w.gm_authFailure;
//   const wrapped = () => {
//     markGoogleMapsBlocked();
//     inner?.();
//   };
//   Object.defineProperty(w, "gm_authFailure", {
//     configurable: true,
//     get: () => wrapped,
//     set: (fn: (() => void) | undefined) => {
//       inner = fn;
//     },
//   });
// }
//
// installAuthFailureHook();
