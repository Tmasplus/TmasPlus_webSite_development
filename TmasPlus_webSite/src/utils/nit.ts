// Pesos oficiales DIAN para el dígito de verificación del NIT (de derecha a izquierda).
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Dígito de verificación esperado para un NIT colombiano, o null si el NIT no es válido. */
export function nitCheckDigit(nit: string): string | null {
  const digits = onlyDigits(nit);
  if (!digits || digits.length > WEIGHTS.length) return null;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * WEIGHTS[i];
  }
  const r = sum % 11;
  return String(r > 1 ? 11 - r : r);
}

export function formatNit(nit: string, dv?: string | null): string {
  const digits = onlyDigits(nit);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dv ? `${grouped}-${dv}` : grouped;
}
