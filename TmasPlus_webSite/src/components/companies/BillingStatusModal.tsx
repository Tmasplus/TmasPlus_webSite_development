import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  DRIVER_PAYMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type BillingField,
  type DriverPaymentStatus,
  type InvoiceStatus,
} from "@/services/companies.service";

export type BillingChange = {
  field: BillingField;
  value: InvoiceStatus | DriverPaymentStatus;
  bookingIds: string[];
};

type Props = {
  change: BillingChange | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: (referencia: string, nota: string) => void;
};

export const BillingStatusModal: React.FC<Props> = ({ change, saving, onClose, onConfirm }) => {
  const [referencia, setReferencia] = useState("");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (change) {
      setReferencia("");
      setNota("");
    }
  }, [change]);

  if (!change) return null;

  const isInvoice = change.field === "facturacion";
  const label = isInvoice
    ? INVOICE_STATUS_LABELS[change.value as InvoiceStatus]
    : DRIVER_PAYMENT_STATUS_LABELS[change.value as DriverPaymentStatus];
  const asksReference = change.value === "facturado" || change.value === "pagado";
  const count = change.bookingIds.length;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`${isInvoice ? "Factura" : "Pago al conductor"}: ${label}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onConfirm(referencia, nota)} disabled={saving}>
            {saving ? "Guardando..." : "Confirmar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Se marcará{count === 1 ? "" : "n"} <strong>{count}</strong> servicio{count === 1 ? "" : "s"} como{" "}
          <strong>{label.toLowerCase()}</strong>
          {isInvoice ? "" : " al conductor"}. El cambio queda registrado en el historial.
        </p>
        {asksReference && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              {isInvoice ? "N.° de factura (Dataico / SIIGO)" : "Comprobante o referencia del pago"}
            </label>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder={isInvoice ? "Ej. FE-1234" : "Ej. Transferencia 000123"}
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Nota (opcional)</label>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-slate-300 p-2 text-sm"
          />
        </div>
      </div>
    </Modal>
  );
};

export default BillingStatusModal;
