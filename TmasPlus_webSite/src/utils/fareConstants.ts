/**
 * Constantes oficiales del modelo de tarifas TmasPlus.
 *
 * Alineadas con `Base para Agente T+Plus.xlsm` (Tabla Tarifas) y
 * `Agente/backendRemoto/src/domains/booking/tarifa/`.
 *
 * Cada concepto es un valor independiente. Si dos aplican (ej. aeropuerto +
 * programado), se SUMAN naturalmente en el subtotal. No se usa
 * `delta_aeropuerto_prog` pre-calculado: confunde y obliga a ramas
 * condicionales.
 *
 * Si el admin quiere cambiar estos valores, mover a la tabla `car_types`
 * (columnas dedicadas `delta_aeropuerto`, `delta_programado`, `delta_protocolo`)
 * y leer aquí desde BD. Por ahora se mantienen como constantes únicas para
 * evitar la divergencia actual entre BDs móvil/web/backend.
 */

export const DELTA_AEROPUERTO = 12_000;   // viaje desde/hacia aeropuerto
export const DELTA_PROGRAMADO = 4_800;    // reserva programada (cualquier hora)
export const DELTA_PROTOCOLO = 5_000;     // servicio con protocolo

// Margen Erixon (plataforma) sobre el valor conductor → valor cliente
export const MARGEN_CLIENTE = 0.25;

// Umbral default para clasificar urbano vs intermunicipal cuando la categoría
// no trae `umbral_intermunicipal_km` en BD.
export const DEFAULT_UMBRAL_INTERMUNICIPAL_KM = 29;
