// Etiqueta legible de la categoría del vehículo. Coincide exactamente con el
// valor denormalizado que la App guarda en users.car_type ("T+Plus …"), de modo
// que lo que se ve en el panel es el mismo nombre que en la App.
// El valor crudo (service_type) proviene de cars.service_type tanto en la BD
// primaria (registro por la web) como en la secundaria (App).
const CATEGORY_LABELS: Record<string, string> = {
  particular: 'T+Plus Particular',
  servicio_especial: 'T+Plus Especial',
  taxi_plus: 'T+Plus Taxi',
  van_plus: 'T+Plus Van',
};

export function vehicleCategoryLabel(serviceType?: string | null): string {
  if (!serviceType) return '—';
  return CATEGORY_LABELS[serviceType] ?? serviceType;
}

// Opciones de categoría que un admin puede asignar a un vehículo. El `value` es
// el service_type canónico que la App guarda en cars.service_type, por lo que
// corregir aquí la categoría equivale a corregir el registro original.
export const VEHICLE_CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'particular', label: CATEGORY_LABELS.particular },
  { value: 'servicio_especial', label: CATEGORY_LABELS.servicio_especial },
  { value: 'taxi_plus', label: CATEGORY_LABELS.taxi_plus },
  { value: 'van_plus', label: CATEGORY_LABELS.van_plus },
];

// La App guarda la categoría también denormalizada en users.car_type y la lista
// de usuarios la prioriza al pintar la categoría. Es exactamente la misma
// etiqueta que mostramos, así que al cambiar la categoría la mantenemos en
// sincronía. Devuelve null si el service_type no es conocido.
export function carTypeLabelForServiceType(
  serviceType?: string | null
): string | null {
  if (!serviceType) return null;
  return CATEGORY_LABELS[serviceType] ?? null;
}
