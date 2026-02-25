import React, { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FloatingInput, FloatingSelect, Checkbox } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { RegistrationService } from "@/services/registration.service";
import DocumentUploadModal from "./DocumentUpload/DocumentUploadModal";

type UserType = "cliente" | "conductor" | "empresa";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: any) => void; // ajusta al tipo real
};

const USER_TABS = [
  { value: "cliente", label: "Cliente" },
  { value: "conductor", label: "Conductor" },
  { value: "empresa", label: "Empresa" },
] as const;

type FieldKind = "input" | "select" | "checkbox";

type FieldDef = {
  id: keyof FormState;
  label: string;
  kind: FieldKind;
  colSpan?: 1 | 2;
  options?: { value: string; label: string }[]; // para selects
  type?: React.InputHTMLAttributes<HTMLInputElement>["type"]; // para input
  required?: boolean;
  // Control de visibilidad por tipo:
  showWhen?: (type: UserType, form: FormState) => boolean;
};

type FormState = {
  // comunes
  antecedentes: boolean;
  nombre: string;
  apellido: string;
  email: string;
  ciudad: string;
  tipoDocumento: string;
  nroDocumento: string;
  referralId: string;
  telefono: string;
  password: string;
  // conductor
  daviplata: string;
  tipoVehiculo: string;
  placa: string;
  anioVehiculo: string;
  // empresa
  razonSocial: string;
  nit: string;
  nombreContacto: string;
};

const initialForm: FormState = {
  antecedentes: false,
  nombre: "",
  apellido: "",
  email: "",
  ciudad: "",
  tipoDocumento: "",
  nroDocumento: "",
  referralId: "",
  telefono: "",
  password: "",
  daviplata: "",
  tipoVehiculo: "",
  placa: "",
  anioVehiculo: "",
  razonSocial: "",
  nit: "",
  nombreContacto: "",
};

// Config declarativa de campos
const FIELD_DEFS: FieldDef[] = [
  // -------- Toggle antecedentes (cliente y conductor)
  {
    id: "antecedentes",
    label: "Usar verificación de antecedentes",
    kind: "checkbox",
    colSpan: 2,
    showWhen: (t) => t === "cliente" || t === "conductor",
  },

  // -------- Comunes
  { id: "nombre", label: "Nombre", kind: "input", required: true },
  { id: "apellido", label: "Apellido", kind: "input", required: true },
  { id: "email", label: "Email", kind: "input", type: "email", required: true },
  {
    id: "ciudad",
    label: "Ciudad",
    kind: "select",
    options: [
      { value: "BOG", label: "Bogotá" }
    ],
    required: true
  },
  {
    id: "tipoDocumento",
    label: "Tipo de Documento",
    kind: "select",
    options: [
      { value: "ced", label: "Cédula" },
      { value: "pasaporte", label: "Pasaporte" },
      { value: "licencia", label: "Licencia" },
      { value: "nit", label: "NIT / RIF" },
    ],
    required: true
  },
  { id: "nroDocumento", label: "Número de Documento", kind: "input", required: true },
  { id: "referralId", label: "Referral ID", kind: "input" },
  { id: "telefono", label: "Teléfono", kind: "input", required: true },

  // -------- Conductor
  {
    id: "daviplata",
    label: "N° Daviplata",
    kind: "input",
    showWhen: (t) => t === "conductor",
    required: true
  },
  {
    id: "tipoVehiculo",
    label: "Tipo de Vehículo",
    kind: "select",
    options: [
      { value: "x_plus", label: "Automóvil" },
      { value: "taxi_plus", label: "Taxi" },
      { value: "comfort_plus", label: "Comfort" },
      { value: "van_plus", label: "Van" }
    ],
    showWhen: (t) => t === "conductor",
    required: true
  },
  {
    id: "placa",
    label: "Placa",
    kind: "input",
    showWhen: (t) => t === "conductor",
    required: true
  },
  {
    id: "anioVehiculo",
    label: "Año de Vehículo",
    kind: "input",
    type: "number",
    showWhen: (t) => t === "conductor",
    required: true
  },

  // -------- Empresa
  {
    id: "razonSocial",
    label: "Razón Social",
    kind: "input",
    colSpan: 2,
    showWhen: (t) => t === "empresa",
    required: true
  },
  // {
  //   id: "nit",
  //   label: "NIT / RIF",
  //   kind: "input",
  //   showWhen: (t) => t === "empresa",
  // },
  {
    id: "nombreContacto",
    label: "Nombre del Contacto",
    kind: "input",
    showWhen: (t) => t === "empresa",
  },

  // -------- Seguridad
  { id: "password", label: "Contraseña", kind: "input", type: "password", required: true },
];

const USER_TYPE_MAP: Record<UserType, 'customer' | 'driver' | 'company'> = {
  cliente: 'customer',
  conductor: 'driver',
  empresa: 'company',
};

type UploadedDocs = Record<string, File[]>;

export const AddUserModal: React.FC<Props> = ({ open, onClose, onSubmit }) => {
  const [type, setType] = useState<UserType>("cliente");
  const [form, setForm] = useState<FormState>(initialForm);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [showDocsModal, setShowDocsModal] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocs | null>(null);

  // Filtrar los campos a mostrar según el tipo seleccionado
  const visibleFields = useMemo(
    () => FIELD_DEFS.filter((f) => (f.showWhen ? f.showWhen(type, form) : true)),
    [type, form]
  );

  function update<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((s) => ({ ...s, [k]: v })); }

  function areVisibleRequiredFieldsFilled(
    form: FormState,
    visibleFields: FieldDef[]
  ) {
    return visibleFields.every((field) => {
      if (!field.required) return true;

      const value = form[field.id as keyof FormState];

      // Checkbox obligatorio
      if (field.kind === "checkbox") { return value === true; }

      // Input / select obligatorio
      return value !== undefined && value !== null && value !== "";
    });
  }

  const allRequiredFilled = useMemo(
    () => areVisibleRequiredFieldsFilled(form, visibleFields),
    [form, visibleFields]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("DOCUMENTOS CARGADOS: ", uploadedDocs);

    await RegistrationService.register({
      user_type: type,
      first_name: form.nombre,
      last_name: form.apellido,
      email: form.email,
      city: form.ciudad,
      document_type: form.tipoDocumento,
      document_number: form.nroDocumento,
      referral_id: form.referralId,
      mobile: form.telefono,
      bank_number: form.daviplata,
      vehicle_type: form.tipoVehiculo,
      vehicle_placa: form.placa,
      vehicle_model: form.anioVehiculo,
      password: form.password,

      documents: uploadedDocs
    });

    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Añadir Usuario"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={!acceptTerms || !allRequiredFilled || !uploadedDocs}
          >
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de Usuario */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Tipo de Usuario</p>
          <Tabs
            tabs={USER_TABS as any}
            value={type}
            onChange={(v) => setType(v as UserType)}
          />
        </div>

        {/* Campos principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleFields.map((f) => {
            const col = f.colSpan === 2 ? "md:col-span-2" : undefined;

            if (f.kind === "checkbox") {
              return (
                <div key={f.id} className={col}>
                  <Checkbox
                    checked={Boolean(form[f.id])}
                    onChange={(e) => update(f.id, e.target.checked as any)}
                    label={f.label}
                  />
                </div>
              );
            }

            if (f.kind === "select") {
              return (
                <FloatingSelect
                  key={f.id}
                  id={String(f.id)}
                  label={f.label}
                  className={col}
                  value={(form[f.id] as string) ?? ""}
                  onChange={(e) => update(f.id, e.target.value as any)}
                  required={f.required}
                >
                  {(f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </FloatingSelect>
              );
            }

            return (
              <FloatingInput
                key={f.id}
                id={String(f.id)}
                label={f.label}
                type={f.type}
                className={col}
                value={(form[f.id] as string) ?? ""}
                onChange={(e) => update(f.id, e.target.value as any)}
                required={f.required}
              />
            );
          })}
        </div>

        {/* ================= DOCUMENTOS ================= */}
        {(type === "cliente" || type === "conductor") && (
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-700">
              Documentos requeridos
            </h3>

            <p className="text-xs text-slate-500">
              Podrás subir los documentos desde este dispositivo o escanearlos
              con tu celular.
            </p>

            {type !== "cliente" && form.tipoVehiculo == "" && (
              <p className="text-xs text-red-600 mt-1">
                Debe seleccionar primero un Tipo de Vehículo
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                disabled={type !== "cliente" ? form.tipoVehiculo == "" : false}
                variant="secondary"
                type="button"
                onClick={() => setShowDocsModal(true)}
              >
                Subir documentos
              </Button>
              {!uploadedDocs && (
                <p className="text-xs text-red-600 mt-1">
                  No se han subido los documentos necesarios
                </p>
              )}
            </div>

            <p className="text-xs text-slate-400">
              * Los documentos serán revisados posteriormente por nuestro equipo.
            </p>
          </div>
        )}

        {/* ================= TÉRMINOS ================= */}
        <div className="pt-2">
          <Checkbox
            required
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            label={
              <span className="text-xs text-slate-600">
                Al registrarte con T+Plus SAS y/o al hacer uso de nuestra
                tecnología y crear tu cuenta, aceptas irrevocablemente todos
                nuestros{" "}
                <a
                  href="https://tmasplus.com/terminos-y-condiciones"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Términos y Condiciones - Tratamiento de Datos y Política de
                  Privacidad
                </a>
                .
              </span>
            }
          />
        </div>
      </form>
      <DocumentUploadModal
        open={showDocsModal}
        profile={type === "cliente" ? "cliente" : form.tipoVehiculo}
        // requiredCount={3}
        onClose={() => setShowDocsModal(false)}
        onComplete={(files) => setUploadedDocs(files)}
      />
    </Modal>
  );
};

export default AddUserModal;
