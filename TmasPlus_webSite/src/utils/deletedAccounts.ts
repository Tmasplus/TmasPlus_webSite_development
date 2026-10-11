/**
 * Cuentas eliminadas desde la App (Edge Function `delete-account`): se
 * anonimizan en lugar de borrarse, y su correo queda como
 * `eliminado+<id>@invalid.local`. Ya no "existen", así que no deben salir en
 * los listados ni poder reactivarse desde el dashboard.
 */
const DELETED_EMAIL_RE = /^eliminado\+.*@invalid\.local$/i;

export function isDeletedAccount(user: { email?: string | null }): boolean {
  return DELETED_EMAIL_RE.test((user.email ?? '').trim());
}

/**
 * Excluye cuentas eliminadas de una consulta a `web_users`. Conserva las filas
 * sin correo (un simple NOT LIKE las descartaría por ser NULL).
 */
export function excludeDeleted<T>(query: T): T {
  return (query as any).or('email.is.null,email.not.like.eliminado+*@invalid.local') as T;
}
