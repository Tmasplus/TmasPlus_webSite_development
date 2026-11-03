import React, { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Checkbox, FloatingInput, FloatingSelect } from "@/components/ui/FloatingField";
import { SectionTitle } from "@/components/companies/CompanyUi";
import { ExistingAppUserNotice } from "@/components/companies/ExistingAppUserNotice";
import { errorMessage, isValidEmail } from "@/components/companies/format";
import { CITIES, DOCUMENT_TYPE_OPTIONS } from "@/config/constants";
import {
  CompaniesService,
  type Collaborator,
  type CollaboratorInput,
  type ExistingAppUser,
} from "@/services/companies.service";
import { onlyDigits } from "@/utils/nit";
import { toast } from "@/utils/toast";

const PERSON_DOCUMENT_OPTIONS = DOCUMENT_TYPE_OPTIONS.filter((o) => o.value !== "NIT");

const emptyForm: CollaboratorInput = {
  first_name: "",
  last_name: "",
  email: "",
  mobile: "",
  document_type: "CC",
  document_number: "",
  city: "",
  cargo: "",
  area: "",
  password: "",
};

type Errors = Partial<Record<keyof CollaboratorInput, string>>;

function validate(f: CollaboratorInput): Errors {
  const e: Errors = {};
  const required: (keyof CollaboratorInput)[] = [
    "first_name", "last_name", "email", "mobile", "document_type", "document_number", "city", "password",
  ];
  for (const k of required) if (!String(f[k] ?? "").trim()) e[k] = "Campo obligatorio";
  if (f.email && !isValidEmail(f.email)) e.email = "Correo no válido";
  if (f.mobile && (onlyDigits(f.mobile).length < 7 || f.mobile.trim().length > 20)) e.mobile = "Teléfono no válido";
  if (f.password && f.password.length < 8) e.password = "Mínimo 8 caracteres";
  return e;
}

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSaved: (collaborator: Collaborator) => void;
};

export const CollaboratorFormModal: React.FC<Props> = ({ open, onClose, companyId, onSaved }) => {
  const [form, setForm] = useState<CollaboratorInput>(emptyForm);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingAppUser[]>([]);
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const lookupSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setAcceptTerms(false);
    setShowErrors(false);
    setSubmitting(false);
    setSubmitError(null);
    setExisting([]);
    setRejectedIds(new Set());
    setLinkingId(null);
  }, [open]);

  const identity = (f: CollaboratorInput) => ({
    email: f.email.trim(),
    mobile: f.mobile.trim(),
    document_number: f.document_number.trim(),
    first_name: f.first_name.trim(),
    last_name: f.last_name.trim(),
  });

  /** Busca si ya hay un Usuario App con la cédula, el correo o el teléfono escritos. */
  async function lookup(f: CollaboratorInput = form): Promise<ExistingAppUser[]> {
    const id = identity(f);
    if (!id.email && onlyDigits(id.mobile).length < 7 && !id.document_number) {
      setExisting([]);
      return [];
    }
    const seq = ++lookupSeq.current;
    setChecking(true);
    try {
      const found = await CompaniesService.findExistingAppUsers(companyId, id);
      if (seq === lookupSeq.current) setExisting(found);
      return found;
    } catch {
      return [];
    } finally {
      if (seq === lookupSeq.current) setChecking(false);
    }
  }

  async function linkExisting(user: ExistingAppUser) {
    setLinkingId(user.id);
    setSubmitError(null);
    try {
      const { collaborator } = await CompaniesService.linkExistingAppUser(companyId, user.id, {
        ...identity(form),
        cargo: form.cargo,
        area: form.area,
      });
      toast.success(`${collaborator.first_name} ${collaborator.last_name} quedó vinculado como colaborador.`);
      onSaved(collaborator);
      onClose();
    } catch (ex) {
      const msg = errorMessage(ex, "No se pudo vincular el usuario");
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setLinkingId(null);
    }
  }

  const errors = useMemo(() => validate(form), [form]);
  const err = (k: keyof CollaboratorInput) => (showErrors ? errors[k] : undefined);

  function update<K extends keyof CollaboratorInput>(k: K, v: CollaboratorInput[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitError(null);
    // Antes de exigir la contraseña: si la persona ya existe, se vincula en vez de crear otra cuenta.
    const found = await lookup();
    if (found.length > 0) {
      setSubmitError("Ya existe una cuenta con estos datos. Agrégala como colaborador o corrige los datos que coinciden.");
      return;
    }
    setShowErrors(true);
    if (Object.keys(errors).length > 0) {
      setSubmitError("Revisa los campos marcados.");
      return;
    }
    if (!acceptTerms) {
      setSubmitError("Debes aceptar los términos y condiciones.");
      return;
    }
    setSubmitting(true);
    try {
      const { collaborator, linkedExisting } = await CompaniesService.createCollaborator(companyId, form);
      toast.success(
        linkedExisting
          ? `${collaborator.first_name} ya tenía cuenta en T+Plus: quedó vinculado a la empresa.`
          : `Colaborador ${collaborator.first_name} ${collaborator.last_name} creado correctamente.`
      );
      onSaved(collaborator);
      onClose();
    } catch (ex) {
      const msg = errorMessage(ex, "No se pudo crear el colaborador");
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Añadir colaborador"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={() => handleSubmit()} disabled={submitting || checking || !!linkingId}>
            {submitting ? "Guardando..." : checking ? "Verificando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2.5 text-xs text-sky-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <span>
            El colaborador queda como Usuario App de T+Plus vinculado a la empresa y podrá usar la app móvil con
            este correo y contraseña. Si la cédula, el correo o el teléfono ya pertenecen a un Usuario App, te
            preguntaremos si quieres agregarlo con sus datos actuales.
          </span>
        </div>

        {submitError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{submitError}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionTitle>Datos personales</SectionTitle>
          <FloatingInput id="col_first_name" label="Nombre" required value={form.first_name}
            onChange={(e) => update("first_name", e.target.value)} error={err("first_name")} />
          <FloatingInput id="col_last_name" label="Apellido" required value={form.last_name}
            onChange={(e) => update("last_name", e.target.value)} error={err("last_name")} />
          <FloatingInput id="col_email" label="Email" type="email" required value={form.email}
            onChange={(e) => update("email", e.target.value)} onBlur={() => void lookup()} error={err("email")} />
          <FloatingSelect id="col_city" label="Ciudad" required value={form.city}
            onChange={(e) => update("city", e.target.value)} error={err("city")}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </FloatingSelect>
          <FloatingSelect id="col_document_type" label="Tipo de documento" required value={form.document_type}
            onChange={(e) => update("document_type", e.target.value)} error={err("document_type")}>
            {PERSON_DOCUMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FloatingSelect>
          <FloatingInput id="col_document_number" label="Número de documento" required value={form.document_number}
            onChange={(e) => update("document_number", e.target.value)} onBlur={() => void lookup()}
            error={err("document_number")} />
          <FloatingInput id="col_mobile" label="Teléfono" required inputMode="tel" value={form.mobile}
            onChange={(e) => update("mobile", e.target.value)} onBlur={() => void lookup()} error={err("mobile")} />

          {(checking || existing.length > 0) && (
            <div className="md:col-span-2">
              {checking && existing.length === 0 ? (
                <p className="text-xs text-slate-500">Verificando si ya existe en T+Plus…</p>
              ) : (
                <ExistingAppUserNotice
                  users={existing}
                  rejectedIds={rejectedIds}
                  linkingId={linkingId}
                  onLink={linkExisting}
                  onReject={(u) => setRejectedIds((prev) => new Set(prev).add(u.id))}
                />
              )}
            </div>
          )}

          <SectionTitle>Datos en la empresa</SectionTitle>
          <FloatingInput id="col_cargo" label="Cargo" value={form.cargo ?? ""}
            onChange={(e) => update("cargo", e.target.value)} />
          <FloatingInput id="col_area" label="Área" value={form.area ?? ""}
            onChange={(e) => update("area", e.target.value)} helpText="Ej. Comercial, Operaciones" />

          <SectionTitle>Acceso a la app</SectionTitle>
          <FloatingInput id="col_password" label="Contraseña" type="password" required autoComplete="new-password"
            value={form.password} onChange={(e) => update("password", e.target.value)} error={err("password")}
            helpText="Mínimo 8 caracteres" />
        </div>

        <Checkbox
          required
          checked={acceptTerms}
          onChange={(e) => setAcceptTerms(e.target.checked)}
          label={
            <span className="text-xs text-slate-600">
              El colaborador acepta los{" "}
              <a
                href="https://tmasplus.com/terminos-y-condiciones"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                Términos y Condiciones - Tratamiento de Datos y Política de Privacidad
              </a>{" "}
              de T+Plus SAS.
            </span>
          }
        />
      </form>
    </Modal>
  );
};

export default CollaboratorFormModal;
