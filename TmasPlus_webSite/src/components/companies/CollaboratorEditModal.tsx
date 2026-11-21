import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FloatingInput } from "@/components/ui/FloatingField";
import { SectionTitle } from "@/components/companies/CompanyUi";
import { errorMessage } from "@/components/companies/format";
import {
  CompaniesService,
  collaboratorFullName,
  type Collaborator,
} from "@/services/companies.service";
import { toast } from "@/utils/toast";

const normCentroCostos = (v: string) => v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 15);

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  collaborator: Collaborator | null;
  onSaved: () => void;
};

/** Edita cargo, área y centro de costos del vínculo colaborador-empresa. */
export const CollaboratorEditModal: React.FC<Props> = ({
  open,
  onClose,
  companyId,
  collaborator,
  onSaved,
}) => {
  const [cargo, setCargo] = useState("");
  const [area, setArea] = useState("");
  const [centro, setCentro] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !collaborator) return;
    setCargo(collaborator.cargo ?? "");
    setArea(collaborator.area ?? "");
    setCentro(normCentroCostos(collaborator.centro_costos ?? ""));
    setShowErrors(false);
    setSaving(false);
    setError(null);
  }, [open, collaborator]);

  const centroError = useMemo(() => {
    if (!centro.trim()) return "Campo obligatorio";
    if (!/^[A-Z0-9]{1,15}$/.test(centro)) return "Solo letras/números, máx. 15";
    return undefined;
  }, [centro]);

  async function save() {
    setShowErrors(true);
    setError(null);
    if (centroError || !collaborator) {
      setError("Revisa el centro de costos.");
      return;
    }
    setSaving(true);
    try {
      await CompaniesService.updateCollaborator(companyId, collaborator.id, {
        cargo,
        area,
        centro_costos: centro,
      });
      toast.success("Datos del colaborador actualizados.");
      onSaved();
      onClose();
    } catch (ex) {
      const msg = errorMessage(ex, "No se pudo actualizar");
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={collaborator ? `Editar · ${collaboratorFullName(collaborator)}` : "Editar colaborador"}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
        )}
        <SectionTitle>Datos en la empresa</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FloatingInput id="edit_cargo" label="Cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} />
          <FloatingInput
            id="edit_area"
            label="Área"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            helpText="Ej. Comercial, Operaciones"
          />
          <FloatingInput
            id="edit_centro"
            label="Centro de costos"
            required
            value={centro}
            onChange={(e) => setCentro(normCentroCostos(e.target.value))}
            error={showErrors ? centroError : undefined}
            helpText="Código interno (ej. G2105). Máx. 15 caracteres."
          />
        </div>
      </div>
    </Modal>
  );
};

export default CollaboratorEditModal;
