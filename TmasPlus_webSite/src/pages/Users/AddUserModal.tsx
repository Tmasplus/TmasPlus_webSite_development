import React, { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FloatingInput, FloatingSelect, Checkbox } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { RegistrationService } from "@/services/registration.service";
import { UsersSecondaryService } from "@/services/usersSecondary.service";
import { supabaseSecondary } from "@/config/supabase";
import { toast } from "@/utils/toast";
import DocumentUploadModal from "./DocumentUpload/DocumentUploadModal";
import { DOCUMENT_TYPE_OPTIONS, DOCUMENT_TYPE_LABELS } from "@/config/constants";

const SECONDARY_DOC_BUCKET = "driver-documents";

async function uploadFileToSecondary(
  ownerId: string,
  field: string,
  file: File
): Promise<string> {
  if (!supabaseSecondary) throw new Error("Cliente secundario no configurado");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${ownerId}/${field}_${Date.now()}.${ext}`;
  const { error: upErr } = await supabaseSecondary.storage
    .from(SECONDARY_DOC_BUCKET)
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upErr) throw upErr;
  const { data } = supabaseSecondary.storage
    .from(SECONDARY_DOC_BUCKET)
    .getPublicUrl(path);
  return data.publicUrl;
}

async function uploadAndPersistCustomerCedula(
  userId: string,
  authId: string | null,
  files: File[]
): Promise<void> {
  if (!supabaseSecondary || !files || files.length === 0) return;
  const ownerId = authId || userId;
  const fields: Array<"verify_id_image" | "verify_id_image_bk"> = [
    "verify_id_image",
    "verify_id_image_bk",
  ];
  const updates: Record<string, string> = {};
  for (let i = 0; i < Math.min(files.length, 2); i++) {
    updates[fields[i]] = await uploadFileToSecondary(ownerId, fields[i], files[i]);
  }
  if (Object.keys(updates).length === 0) return;
  const { error: updateErr } = await supabaseSecondary
    .from("users")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateErr) throw updateErr;
}

async function uploadAndPersistDriverDocs(
  userId: string,
  authId: string | null,
  carId: string,
  docs: Record<string, File[]>
): Promise<void> {
  if (!supabaseSecondary) return;
  const ownerId = authId || userId;
  const userUpdates: Record<string, string> = {};
  const carUpdates: Record<string, string> = {};

  // Cédula → users.verify_id_image / verify_id_image_bk
  const cedulas = docs?.cedula ?? [];
  const cedulaFields = ["verify_id_image", "verify_id_image_bk"] as const;
  for (let i = 0; i < Math.min(cedulas.length, 2); i++) {
    userUpdates[cedulaFields[i]] = await uploadFileToSecondary(ownerId, cedulaFields[i], cedulas[i]);
  }

  // Licencia → users.license_image / license_image_back
  const licencias = docs?.licencia ?? [];
  const licenciaFields = ["license_image", "license_image_back"] as const;
  for (let i = 0; i < Math.min(licencias.length, 2); i++) {
    userUpdates[licenciaFields[i]] = await uploadFileToSecondary(ownerId, licenciaFields[i], licencias[i]);
  }

  // Tarjeta de propiedad → cars.card_prop_image / card_prop_image_back
  const tarjetas = docs?.tarjeta ?? [];
  const tarjetaFields = ["card_prop_image", "card_prop_image_back"] as const;
  for (let i = 0; i < Math.min(tarjetas.length, 2); i++) {
    carUpdates[tarjetaFields[i]] = await uploadFileToSecondary(ownerId, tarjetaFields[i], tarjetas[i]);
  }

  // Foto Vehículo Exterior → cars.car_image_1
  const fotoExt = docs?.foto_exterior?.[0];
  if (fotoExt) {
    carUpdates["car_image_1"] = await uploadFileToSecondary(ownerId, "car_image_1", fotoExt);
  }

  // Foto Vehículo Interior → cars.car_image_2
  const fotoInt = docs?.foto_interior?.[0];
  if (fotoInt) {
    carUpdates["car_image_2"] = await uploadFileToSecondary(ownerId, "car_image_2", fotoInt);
  }

  // SOAT → cars.soat_image
  const soat = docs?.soat?.[0];
  if (soat) {
    carUpdates["soat_image"] = await uploadFileToSecondary(ownerId, "soat_image", soat);
  }

  // Tecnomecánica → cars.tecnomecanica_image
  const tecno = docs?.tecnomecanica?.[0];
  if (tecno) {
    carUpdates["tecnomecanica_image"] = await uploadFileToSecondary(ownerId, "tecnomecanica_image", tecno);
  }

  const now = new Date().toISOString();
  if (Object.keys(userUpdates).length > 0) {
    const { error } = await supabaseSecondary
      .from("users")
      .update({ ...userUpdates, updated_at: now })
      .eq("id", userId);
    if (error) throw error;
  }
  if (Object.keys(carUpdates).length > 0) {
    const { error } = await supabaseSecondary
      .from("cars")
      .update({ ...carUpdates, updated_at: now })
      .eq("id", carId);
    if (error) throw error;
  }
}

// Ciudades disponibles para el registro (misma lista que el flujo de registro público)
const CITIES = [
  "Bogotá", "Medellín", "Cali", "Barranquilla", "Cartagena",
  "Cúcuta", "Bucaramanga", "Pereira", "Santa Marta", "Ibagué",
  "Manizales", "Pasto", "Neiva", "Villavicencio", "Armenia",
  "Valledupar", "Montería", "Sincelejo", "Popayán", "Tunja",
] as const;

const CITY_OPTIONS = CITIES.map((c) => ({ value: c, label: c }));

// Opciones del "Tipo de Documento" (fuente única en @/config/constants). La
// etiqueta se reutiliza para nombrar el documento que se debe subir, de forma
// que coincida con lo seleccionado.

type UserType = "cliente" | "conductor" | "empresa";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: any) => void; // ajusta al tipo real
  /** Bloquea el tipo de usuario y oculta el selector de tabs. */
  lockedType?: UserType;
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
  marcaVehiculo: string;
  modeloVehiculo: string;
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
  marcaVehiculo: "",
  modeloVehiculo: "",
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
    options: CITY_OPTIONS,
    required: true
  },
  {
    id: "tipoDocumento",
    label: "Tipo de Documento",
    kind: "select",
    options: DOCUMENT_TYPE_OPTIONS.map((o) => ({ ...o })),
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
    id: "marcaVehiculo",
    label: "Marca",
    kind: "input",
    showWhen: (t) => t === "conductor",
    required: true
  },
  {
    id: "modeloVehiculo",
    label: "Modelo",
    kind: "input",
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

export const AddUserModal: React.FC<Props> = ({ open, onClose, onSubmit, lockedType }) => {
  const [type, setType] = useState<UserType>(lockedType ?? "cliente");
  const [form, setForm] = useState<FormState>(initialForm);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [showDocsModal, setShowDocsModal] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocs | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setType(lockedType ?? "cliente");
      setForm(initialForm);
      setAcceptTerms(false);
      setUploadedDocs(null);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, lockedType]);

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
    setSubmitting(true);
    setSubmitError(null);
    const mappedType = USER_TYPE_MAP[type];
    try {
      if (mappedType === 'customer') {
        const created = await UsersSecondaryService.createCustomerWithAuth({
          email: form.email,
          password: form.password,
          first_name: form.nombre,
          last_name: form.apellido,
          mobile: form.telefono || null,
          city: form.ciudad || null,
          document_type: form.tipoDocumento || null,
          document_number: form.nroDocumento || null,
          referral_id: form.referralId || null,
        });

        const cedulaFiles = uploadedDocs?.cedula ?? [];
        if (cedulaFiles.length > 0) {
          try {
            await uploadAndPersistCustomerCedula(
              created.id,
              created.auth_id ?? null,
              cedulaFiles
            );
          } catch (docErr: any) {
            const msg = docErr?.message || "error desconocido";
            setSubmitError(`Cliente creado, pero falló la subida de documentos: ${msg}`);
            toast.warning(`Cliente creado. Documentos no se subieron: ${msg}`);
            onSubmit(created);
            return;
          }
        }

        toast.success(`Cliente ${form.nombre} ${form.apellido} creado correctamente.`);
        onSubmit(created);
        onClose();
        return;
      }

      if (mappedType === 'driver') {
        const { user: created, car } = await UsersSecondaryService.createDriverWithAuth({
          email: form.email,
          password: form.password,
          first_name: form.nombre,
          last_name: form.apellido,
          mobile: form.telefono || null,
          city: form.ciudad || null,
          document_type: form.tipoDocumento || null,
          document_number: form.nroDocumento || null,
          referral_id: form.referralId || null,
          bank_number: form.daviplata || null,
          vehicle_type: form.tipoVehiculo || null,
          make: form.marcaVehiculo || null,
          model: form.modeloVehiculo || null,
          plate: form.placa || null,
          vehicle_year: form.anioVehiculo || null,
        });

        if (uploadedDocs && Object.keys(uploadedDocs).length > 0) {
          try {
            await uploadAndPersistDriverDocs(
              created.id,
              created.auth_id ?? null,
              car?.id,
              uploadedDocs
            );
          } catch (docErr: any) {
            const msg = docErr?.message || "error desconocido";
            setSubmitError(`Conductor creado, pero falló la subida de documentos: ${msg}`);
            toast.warning(`Conductor creado. Documentos no se subieron: ${msg}`);
            onSubmit(created);
            return;
          }
        }

        toast.success(`Conductor ${form.nombre} ${form.apellido} creado correctamente.`);
        onSubmit(created);
        onClose();
        return;
      }

      const created = await RegistrationService.register({
        user_type: mappedType,
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

        documents: uploadedDocs,
      } as any);

      // Replicar en la BD secundaria reutilizando el id del registro principal.
      try {
        await UsersSecondaryService.create({
          id: created.id,
          auth_id: created.auth_id ?? null,
          first_name: created.first_name ?? form.nombre,
          last_name: created.last_name ?? form.apellido,
          email: created.email ?? form.email,
          mobile: created.mobile ?? form.telefono,
          user_type: created.user_type ?? mappedType,
          city: created.city ?? form.ciudad,
          referral_id: created.referral_id ?? form.referralId ?? null,
          document_type: form.tipoDocumento || null,
          document_number: form.nroDocumento || null,
        });
      } catch (secondaryErr: any) {
        setSubmitError(
          `Usuario creado en BD principal, pero falló la réplica en BD secundaria: ${
            secondaryErr?.message || "error desconocido"
          }`
        );
        onSubmit(created);
        return;
      }

      onSubmit(created);
      onClose();
    } catch (err: any) {
      const msg = err?.message || "Error al crear el usuario";
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
            disabled={submitting || !acceptTerms || !allRequiredFilled || !uploadedDocs}
          >
            {submitting ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo de Usuario */}
        {!lockedType && (
          <div>
            <p className="text-xs text-slate-500 mb-2">Tipo de Usuario</p>
            <Tabs
              tabs={USER_TABS as any}
              value={type}
              onChange={(v) => setType(v as UserType)}
            />
          </div>
        )}

        {submitError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {submitError}
          </div>
        )}

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
        documentLabel={DOCUMENT_TYPE_LABELS[form.tipoDocumento]}
        // requiredCount={3}
        onClose={() => setShowDocsModal(false)}
        onComplete={(files) => setUploadedDocs(files)}
      />
    </Modal>
  );
};

export default AddUserModal;
