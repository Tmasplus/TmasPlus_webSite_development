// Etiquetas legibles para la categoría (service_type) del vehículo activo.
// El valor crudo proviene de cars.service_type tanto en la BD primaria
// (registro por la web) como en la secundaria (App).
const CATEGORY_LABELS: Record<string, string> = {
  particular: 'Particular',
  servicio_especial: 'Servicio Especial',
  taxi_plus: 'Taxi Plus',
};

export function vehicleCategoryLabel(serviceType?: string | null): string {
  if (!serviceType) return '—';
  return CATEGORY_LABELS[serviceType] ?? serviceType;
}
