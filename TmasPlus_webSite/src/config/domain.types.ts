/**
 * Tipos de dominio del esquema CONSOLIDADO (aplicacioncore).
 *
 * Se irán completando a medida que se migran los servicios. Reemplazan
 * gradualmente a los tipos generados del esquema viejo (database.types.ts).
 */

/** Rol de una persona (enum rol_persona del esquema). */
export type RolPersona = 'cliente' | 'conductor' | 'empresa' | 'admin' | 'asesor';

/**
 * Perfil del usuario autenticado para el dashboard.
 * Lo devuelve el RPC `get_perfil_dashboard()` (persona + roles + flags).
 */
export interface PerfilDashboard {
  id: string;
  auth_id: string | null;
  nombre: string | null;
  apellido: string | null;
  telefono: string;
  email: string | null;
  imagen_perfil: string | null;
  /** Nombre de la ciudad actual (join a `ciudad`), no el id. */
  ciudad: string | null;
  codigo_referido_usado: string | null;
  bloqueado: boolean;
  verificado: boolean;
  roles: RolPersona[];
  es_admin: boolean;
  es_conductor: boolean;
  es_cliente: boolean;
  aprobado: boolean;
}

/** Fila de la tabla `persona`. */
export interface Persona {
  id: string;
  auth_id: string | null;
  nombre: string | null;
  apellido: string | null;
  telefono: string;
  email: string | null;
  id_tipo_documento: number | null;
  numero_documento: string | null;
  id_ciudad_actual: number | null;
  id_ciudad_origen: number | null;
  imagen_perfil: string | null;
  version_app: string | null;
  codigo_referido_usado: string | null;
  ultima_lat: number | null;
  ultima_lng: number | null;
  ubicacion_actualizada_en: string | null;
  bloqueado: boolean;
  verificado: boolean;
  creado_en: string;
  actualizado_en: string;
}
