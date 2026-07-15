/**
 * Parte un array en bloques de tamaño fijo. Se usa para consultas `.in(...)`
 * de Supabase/PostgREST: una lista de cientos de UUIDs genera una URL GET que
 * supera el límite del gateway (~25KB) y responde 400 Bad Request.
 */
export function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
