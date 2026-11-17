/** Estados de "Gestión" (seguimiento manual de conductores). El valor es el código guardado en BD. */
export const DRIVER_MANAGEMENT_OPTIONS = [
  { value: "sin_gestion", label: "Sin gestión", style: "bg-slate-50 text-slate-500 border-slate-200" },
  { value: "completo_con_membresia", label: "Completo con Membresía", style: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "completado_sin_membresia", label: "Completado sin Membresía", style: "bg-teal-50 text-teal-700 border-teal-200" },
  { value: "falta_documentos", label: "Falta Documentos", style: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "falta_vehiculo_y_documentos", label: "Falta Vehículo y Documentos", style: "bg-orange-50 text-orange-700 border-orange-200" },
  { value: "no_contesta", label: "No contesta", style: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "no_interesado_por_ahora", label: "No interesado x Ahora", style: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "no_volver_a_llamar", label: "No volver a llamar", style: "bg-rose-50 text-rose-700 border-rose-200" },
  { value: "recarga_incompleto_perfil", label: "Recarga Incompleto el perfil", style: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "verificado_sin_vehiculo_ni_documentos", label: "Verificado Sin Vehículo y Sin Documentos", style: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { value: "bloqueado_por_tmasplus", label: "Bloqueado por Tmasplus", style: "bg-red-50 text-red-700 border-red-200" },
] as const;

export type DriverManagementStatus = (typeof DRIVER_MANAGEMENT_OPTIONS)[number]["value"];

export const DEFAULT_DRIVER_MANAGEMENT: DriverManagementStatus = "sin_gestion";

export function driverManagementOption(value?: string | null) {
  return (
    DRIVER_MANAGEMENT_OPTIONS.find((o) => o.value === value) ?? DRIVER_MANAGEMENT_OPTIONS[0]
  );
}
