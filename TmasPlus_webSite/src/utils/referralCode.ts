// Formato único de los códigos de referido: AAA-XXXXX (3 letras, guion, 5 letras/dígitos), en mayúsculas.
// Es el mismo formato con el que se generan en codigo_referido.
export const REFERRAL_CODE_REGEX = /^[A-Z]{3}-[A-Z0-9]{5}$/;

// Sirve para el input mientras se escribe y para normalizar lo ya guardado:
// quita espacios y símbolos, pasa a mayúsculas e inserta el guion tras la 3.ª letra.
export function formatReferralCode(raw: string | null | undefined): string {
  const clean = (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

export function isValidReferralCodeFormat(raw: string | null | undefined): boolean {
  return REFERRAL_CODE_REGEX.test(formatReferralCode(raw));
}
