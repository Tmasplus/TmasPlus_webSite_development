// Formato único de los códigos de referido: AAA-XXXXX (3 letras, guion, 5 letras/dígitos), en mayúsculas.
// Es el mismo formato con el que se generan en codigo_referido.
export const REFERRAL_CODE_REGEX = /^[A-Z]{3}-[A-Z0-9]{5}$/;

// Sirve para el input mientras se escribe y para normalizar lo ya guardado:
// quita espacios y símbolos, pasa a mayúsculas e inserta el guion tras la 3.ª letra.
export function formatReferralCode(raw: string | null | undefined): string {
  const clean = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

// Texto cuando el conductor se registró con un código que no existe.
export const REFERRAL_OWNER_NOT_FOUND = 'No se encontró el dueño del código';

// El dueño de un código puede ser conductor o cliente (web_users.user_type).
export function referralOwnerTypeLabel(userType: string | null | undefined): string {
  switch ((userType ?? '').toLowerCase()) {
    case 'driver': return 'Conductor';
    case 'customer': return 'Cliente';
    case 'company': return 'Empresa';
    case 'admin': return 'Administrador';
    default: return '';
  }
}

export function isValidReferralCodeFormat(raw: string | null | undefined): boolean {
  return REFERRAL_CODE_REGEX.test(formatReferralCode(raw));
}
