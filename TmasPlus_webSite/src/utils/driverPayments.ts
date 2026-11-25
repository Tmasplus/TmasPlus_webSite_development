import type { DriverPaymentMethods } from '@/services/usersSecondary.service';

const DASH = '-';

const yesNo = (m: DriverPaymentMethods | undefined, v: boolean | undefined): string =>
  m ? (v ? 'Sí' : 'No') : DASH;

const text = (v: string | null | undefined): string => {
  const t = (v ?? '').trim();
  return t || DASH;
};

/**
 * Columnas de métodos de pago para el CSV de conductores. Sin registro (el
 * conductor nunca los configuró) o sin dato en un campo, se escribe un guion.
 */
export function paymentCsvColumns<T>(
  methodsFor: (row: T) => DriverPaymentMethods | undefined
): Array<{ header: string; value: (row: T) => string }> {
  return [
    { header: 'Pago: Efectivo', value: (r) => { const m = methodsFor(r); return yesNo(m, m?.efectivo); } },
    { header: 'Pago: DaviPlata', value: (r) => { const m = methodsFor(r); return yesNo(m, m?.daviplata); } },
    { header: 'Número DaviPlata', value: (r) => text(methodsFor(r)?.daviplata_numero) },
    { header: 'Pago: Nequi', value: (r) => { const m = methodsFor(r); return yesNo(m, m?.nequi); } },
    { header: 'Número Nequi', value: (r) => text(methodsFor(r)?.nequi_numero) },
    { header: 'Pago: Bre-b', value: (r) => { const m = methodsFor(r); return yesNo(m, m?.breb_activo); } },
    { header: 'Llave Bre-b', value: (r) => text(methodsFor(r)?.nequi_breb) },
  ];
}
