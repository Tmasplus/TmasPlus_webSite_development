import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { FloatingInput, FloatingSelect } from "@/components/ui/FloatingField";
import { CompanyLogo, SectionTitle } from "@/components/companies/CompanyUi";
import { CompanyDocumentField } from "@/components/companies/CompanyDocumentField";
import { errorMessage, isValidEmail } from "@/components/companies/format";
import { CITIES, DOCUMENT_TYPE_OPTIONS } from "@/config/constants";
import { COUNTRIES, DEPARTMENTS } from "@/config/colombia";
import {
  COMPANY_DOCUMENTS,
  COMPANY_TYPE_OPTIONS,
  CompaniesService,
  documentAgeDays,
  type Company,
  type CompanyDocType,
  type CompanyDocument,
  type CompanyDocumentInput,
  type CompanyInput,
  type CompanyType,
} from "@/services/companies.service";
import { nitCheckDigit, onlyDigits } from "@/utils/nit";
import { toast } from "@/utils/toast";

const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const REP_DOCUMENT_OPTIONS = DOCUMENT_TYPE_OPTIONS.filter((o) => o.value !== "NIT");

type FormState = Omit<CompanyInput, "logo_file" | "tipo_empresa"> & { tipo_empresa: CompanyType | "" };

const emptyForm: FormState = {
  razon_social: "",
  nombre_comercial: "",
  nit: "",
  dv: "",
  tipo_empresa: "",
  tipo_empresa_otra: "",
  ciiu: "",
  correo_corporativo: "",
  telefono: "",
  pais: "Colombia",
  departamento: "",
  ciudad: "",
  direccion: "",
  sitio_web: "",
  rep_nombre: "",
  rep_tipo_documento: "CC",
  rep_numero_documento: "",
  rep_email: "",
  rep_telefono: "",
  acceso_email: "",
  password: "",
  documentos: {
    camara_comercio: { file: null, fecha_expedicion: "" },
    rut: { file: null, fecha_expedicion: "" },
  },
};

const DOC_HINTS: Record<CompanyDocType, string> = {
  camara_comercio: "Certificado de existencia y representación legal, expedido hace máximo 30 días. PDF, JPG o PNG, hasta 5 MB.",
  rut: "RUT actualizado, generado en el último año. PDF, JPG o PNG, hasta 5 MB.",
};

function formFromCompany(c: Company): FormState {
  const fecha = (tipo: CompanyDocType) => c.documentos.find((d) => d.tipo === tipo)?.fecha_expedicion ?? "";
  return {
    razon_social: c.razon_social,
    nombre_comercial: c.nombre_comercial ?? "",
    nit: c.nit,
    dv: c.dv,
    tipo_empresa: c.tipo_empresa,
    tipo_empresa_otra: c.tipo_empresa_otra ?? "",
    ciiu: c.ciiu ?? "",
    correo_corporativo: c.correo_corporativo,
    telefono: c.telefono,
    pais: c.pais,
    departamento: c.departamento,
    ciudad: c.ciudad,
    direccion: c.direccion,
    sitio_web: c.sitio_web ?? "",
    rep_nombre: c.rep_nombre,
    rep_tipo_documento: c.rep_tipo_documento,
    rep_numero_documento: c.rep_numero_documento,
    rep_email: c.rep_email,
    rep_telefono: c.rep_telefono ?? "",
    acceso_email: c.acceso_email,
    password: "",
    documentos: {
      camara_comercio: { file: null, fecha_expedicion: fecha("camara_comercio") },
      rut: { file: null, fecha_expedicion: fecha("rut") },
    },
  };
}

type DocKey = `doc_${CompanyDocType}`;
type Errors = Partial<Record<keyof FormState | DocKey, string>>;

function validateDocuments(f: FormState, existing: CompanyDocument[], e: Errors) {
  const today = new Date().toISOString().slice(0, 10);
  for (const { tipo, maxAgeDays } of COMPANY_DOCUMENTS) {
    const doc = f.documentos[tipo];
    const key: DocKey = `doc_${tipo}`;
    if (!doc.file && !existing.some((d) => d.tipo === tipo)) e[key] = "Sube el documento.";
    else if (!doc.fecha_expedicion) e[key] = "Indica la fecha de expedición.";
    else if (doc.fecha_expedicion > today) e[key] = "La fecha de expedición no puede ser futura.";
    else if (doc.file && documentAgeDays(doc.fecha_expedicion) > maxAgeDays) {
      e[key] = `El documento debe estar actualizado: expedido hace máximo ${maxAgeDays} días.`;
    }
  }
}

function documentWarning(doc: CompanyDocumentInput, maxAgeDays: number): string | undefined {
  if (doc.file || !doc.fecha_expedicion) return undefined;
  const age = documentAgeDays(doc.fecha_expedicion);
  return age > maxAgeDays ? `Tiene ${age} días de expedido: solicita a la empresa uno actualizado.` : undefined;
}

function validate(f: FormState, isEdit: boolean, existingDocs: CompanyDocument[]): Errors {
  const e: Errors = {};
  const required: (keyof FormState)[] = [
    "razon_social", "nit", "dv", "tipo_empresa", "correo_corporativo", "telefono", "pais",
    "departamento", "ciudad", "direccion", "rep_nombre", "rep_tipo_documento",
    "rep_numero_documento", "rep_email", "acceso_email",
  ];
  for (const k of required) if (!String(f[k] ?? "").trim()) e[k] = "Campo obligatorio";

  const nit = onlyDigits(f.nit);
  if (f.nit && (nit.length < 6 || nit.length > 15)) e.nit = "El NIT debe tener entre 6 y 15 dígitos";
  if (f.dv && !/^\d$/.test(f.dv)) e.dv = "Un solo dígito";
  const expected = nitCheckDigit(nit);
  if (!e.nit && !e.dv && f.dv && expected !== null && expected !== f.dv) {
    e.dv = `No corresponde al NIT (debería ser ${expected})`;
  }
  if (f.tipo_empresa === "OTRA" && !f.tipo_empresa_otra?.trim()) e.tipo_empresa_otra = "Indica el tipo de empresa";
  for (const k of ["correo_corporativo", "rep_email", "acceso_email"] as const) {
    if (f[k] && !isValidEmail(f[k])) e[k] = "Correo no válido";
  }
  for (const k of ["telefono", "rep_telefono"] as const) {
    const v = f[k] ?? "";
    if (v && (onlyDigits(v).length < 7 || v.trim().length > 20)) e[k] = "Teléfono no válido";
  }
  if (!isEdit) {
    if (!f.password) e.password = "Campo obligatorio";
    else if (f.password.length < 8) e.password = "Mínimo 8 caracteres";
  }
  validateDocuments(f, existingDocs, e);
  return e;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (company: Company) => void;
  /** Si se pasa, el formulario edita esa empresa. */
  company?: Company | null;
};

export const CompanyFormModal: React.FC<Props> = ({ open, onClose, onSaved, company }) => {
  const isEdit = !!company;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [logoFile, setLogoFile] = useState<File | null | undefined>(undefined);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setForm(company ? formFromCompany(company) : emptyForm);
    setLogoFile(undefined);
    setLogoPreview(company?.logo_url ?? null);
    setLogoError(null);
    setShowErrors(false);
    setSubmitting(false);
    setSubmitError(null);
  }, [open, company]);

  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const existingDocs = useMemo(() => company?.documentos ?? [], [company]);
  const errors = useMemo(() => validate(form, isEdit, existingDocs), [form, isEdit, existingDocs]);
  const err = (k: keyof Errors) => (showErrors ? errors[k] : undefined);
  const expectedDv = nitCheckDigit(form.nit);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function updateDocument(tipo: CompanyDocType, value: CompanyDocumentInput) {
    setForm((s) => ({ ...s, documentos: { ...s.documentos, [tipo]: value } }));
  }

  function pickLogo(file: File | undefined) {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Formato no permitido. Usa PNG, JPG o WEBP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("El logo no puede superar 1 MB.");
      return;
    }
    setLogoError(null);
    setLogoFile(file);
  }

  function removeLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setShowErrors(true);
    setSubmitError(null);
    if (Object.keys(errors).length > 0) {
      setSubmitError("Revisa los campos marcados.");
      return;
    }
    const input: CompanyInput = {
      ...form,
      tipo_empresa: form.tipo_empresa as CompanyType,
      tipo_empresa_otra: form.tipo_empresa === "OTRA" ? form.tipo_empresa_otra?.trim() || null : null,
      nombre_comercial: form.nombre_comercial?.trim() || null,
      ciiu: form.ciiu?.trim() || null,
      sitio_web: form.sitio_web?.trim() || null,
      rep_telefono: form.rep_telefono?.trim() || null,
      password: isEdit ? undefined : form.password,
      logo_file: logoFile,
    };
    setSubmitting(true);
    try {
      const saved = isEdit
        ? await CompaniesService.update(company!.id, input)
        : await CompaniesService.create(input);
      toast.success(isEdit ? "Empresa actualizada." : `Empresa ${saved.razon_social} creada correctamente.`);
      onSaved(saved);
      onClose();
    } catch (ex) {
      const msg = errorMessage(ex, "No se pudo guardar la empresa");
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
      title={isEdit ? "Editar empresa" : "Añadir empresa"}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear empresa"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {submitError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{submitError}</div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SectionTitle>Información de la empresa</SectionTitle>

          <div className="md:col-span-2 flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-3">
            <CompanyLogo src={logoPreview} name={form.razon_social || "empresa"} size={64} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-700">Logo de la empresa</p>
              <p className="text-xs text-slate-500">PNG, JPG o WEBP, máximo 1 MB.</p>
              {logoError && <p className="mt-1 text-xs text-red-600">{logoError}</p>}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="hidden"
              onChange={(e) => pickLogo(e.target.files?.[0])}
            />
            <Button variant="secondary" className="!px-3 !py-2" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={16} />
              {logoPreview ? "Cambiar" : "Subir logo"}
            </Button>
            {logoPreview && (
              <Button variant="ghost" className="!px-3 !py-2 !text-rose-600" onClick={removeLogo} title="Quitar logo">
                <Trash2 size={16} />
              </Button>
            )}
          </div>

          <FloatingInput id="razon_social" label="Razón social" className="md:col-span-2" required
            value={form.razon_social} helpText="Ej. Empresa ABC S.A.S."
            onChange={(e) => update("razon_social", e.target.value)} error={err("razon_social")} />
          <FloatingInput id="nombre_comercial" label="Nombre comercial" value={form.nombre_comercial ?? ""}
            onChange={(e) => update("nombre_comercial", e.target.value)} />
          <FloatingSelect id="tipo_empresa" label="Tipo de empresa" required value={form.tipo_empresa}
            onChange={(e) => update("tipo_empresa", e.target.value as CompanyType)} error={err("tipo_empresa")}>
            {COMPANY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FloatingSelect>
          {form.tipo_empresa === "OTRA" && (
            <FloatingInput id="tipo_empresa_otra" label="¿Qué tipo de empresa?" className="md:col-span-2" required
              value={form.tipo_empresa_otra ?? ""} onChange={(e) => update("tipo_empresa_otra", e.target.value)}
              error={err("tipo_empresa_otra")} />
          )}
          <div className="grid grid-cols-[1fr_120px] gap-3">
            <FloatingInput id="nit" label="NIT" required inputMode="numeric" value={form.nit}
              onChange={(e) => update("nit", onlyDigits(e.target.value))} error={err("nit")}
              helpText="Sin puntos ni dígito de verificación" />
            <FloatingInput id="dv" label="DV" required inputMode="numeric" maxLength={1} value={form.dv}
              onChange={(e) => update("dv", onlyDigits(e.target.value).slice(0, 1))} error={err("dv")}
              helpText={expectedDv && !form.dv ? `Calculado: ${expectedDv}` : undefined} />
          </div>
          <FloatingInput id="ciiu" label="Actividad económica (CIIU)" value={form.ciiu ?? ""}
            onChange={(e) => update("ciiu", e.target.value)} helpText="Código o actividad" />

          <div className="md:col-span-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
            {COMPANY_DOCUMENTS.map(({ tipo, label, maxAgeDays }) => (
              <CompanyDocumentField
                key={tipo}
                id={`doc-${tipo}`}
                label={label}
                hint={DOC_HINTS[tipo]}
                value={form.documentos[tipo]}
                existing={existingDocs.find((d) => d.tipo === tipo)}
                error={err(`doc_${tipo}`)}
                warning={documentWarning(form.documentos[tipo], maxAgeDays)}
                onChange={(v) => updateDocument(tipo, v)}
                onInvalidFile={(msg) => toast.error(msg)}
              />
            ))}
          </div>

          <SectionTitle>Datos de contacto y ubicación</SectionTitle>
          <FloatingInput id="correo_corporativo" label="Correo corporativo" type="email" required
            value={form.correo_corporativo} onChange={(e) => update("correo_corporativo", e.target.value)}
            error={err("correo_corporativo")} />
          <FloatingInput id="telefono" label="Teléfono empresarial" required inputMode="tel" value={form.telefono}
            onChange={(e) => update("telefono", e.target.value)} error={err("telefono")} />
          <FloatingSelect id="pais" label="País" required value={form.pais}
            onChange={(e) => update("pais", e.target.value)} error={err("pais")}>
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </FloatingSelect>
          <FloatingSelect id="departamento" label="Departamento" required value={form.departamento}
            onChange={(e) => update("departamento", e.target.value)} error={err("departamento")}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </FloatingSelect>
          <FloatingSelect id="ciudad" label="Ciudad" required value={form.ciudad}
            onChange={(e) => update("ciudad", e.target.value)} error={err("ciudad")}>
            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </FloatingSelect>
          <FloatingInput id="direccion" label="Dirección empresarial" required value={form.direccion}
            onChange={(e) => update("direccion", e.target.value)} error={err("direccion")}
            helpText="Dirección de la sede" />
          <FloatingInput id="sitio_web" label="Sitio web" className="md:col-span-2" value={form.sitio_web ?? ""}
            helpText="Ej. www.empresa.com" onChange={(e) => update("sitio_web", e.target.value)} />

          <SectionTitle>Representante legal</SectionTitle>
          <FloatingInput id="rep_nombre" label="Nombres y apellidos" className="md:col-span-2" required
            value={form.rep_nombre} onChange={(e) => update("rep_nombre", e.target.value)} error={err("rep_nombre")} />
          <FloatingSelect id="rep_tipo_documento" label="Tipo de documento" required value={form.rep_tipo_documento}
            onChange={(e) => update("rep_tipo_documento", e.target.value)} error={err("rep_tipo_documento")}>
            {REP_DOCUMENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </FloatingSelect>
          <FloatingInput id="rep_numero_documento" label="Número de documento" required
            value={form.rep_numero_documento} onChange={(e) => update("rep_numero_documento", e.target.value)}
            error={err("rep_numero_documento")} />
          <FloatingInput id="rep_email" label="Correo del representante" type="email" required
            value={form.rep_email} onChange={(e) => update("rep_email", e.target.value)} error={err("rep_email")} />
          <FloatingInput id="rep_telefono" label="Teléfono del representante" inputMode="tel"
            value={form.rep_telefono ?? ""} onChange={(e) => update("rep_telefono", e.target.value)}
            error={err("rep_telefono")} />

          <SectionTitle>Acceso a la plataforma</SectionTitle>
          <FloatingInput id="acceso_email" label="Correo de acceso" type="email" required disabled={isEdit}
            value={form.acceso_email} onChange={(e) => update("acceso_email", e.target.value)}
            error={err("acceso_email")}
            helpText={isEdit ? "El correo de acceso no se cambia desde aquí." : "Correo con el que la empresa iniciará sesión"} />
          {!isEdit && (
            <FloatingInput id="company_password" label="Contraseña" type="password" required autoComplete="new-password"
              value={form.password ?? ""} onChange={(e) => update("password", e.target.value)}
              error={err("password")} helpText="Mínimo 8 caracteres" />
          )}
        </div>
      </form>
    </Modal>
  );
};

export default CompanyFormModal;
