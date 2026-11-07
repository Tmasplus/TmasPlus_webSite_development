import React from "react";
import { Card } from "@/components/ui/Card";
import { FileText } from "lucide-react";
import { ActiveBadge, CompanyLogo } from "@/components/companies/CompanyUi";
import { errorMessage, formatDate, formatFileSize } from "@/components/companies/format";
import { getDocumentTypeLabel } from "@/config/constants";
import {
  COMPANY_DOCUMENTS,
  CompaniesService,
  companyTypeLabel,
  documentAgeDays,
  type Company,
  type CompanyDocument,
} from "@/services/companies.service";
import { classNames } from "@/utils/classNames";
import { toast } from "@/utils/toast";

async function openDocument(doc: CompanyDocument) {
  // La pestaña se abre antes de esperar la URL para que el navegador no la bloquee como ventana emergente.
  const tab = window.open("", "_blank");
  try {
    const url = await CompaniesService.documentUrl(doc);
    if (!url) throw new Error("El documento no está disponible");
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    toast.error(errorMessage(e, "No se pudo abrir el documento"));
  }
}
import { formatNit } from "@/utils/nit";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800 break-words">{children || "—"}</dd>
    </div>
  );
}

export const CompanyInfoCard: React.FC<{ company: Company }> = ({ company: c }) => (
  <div className="space-y-4">
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <CompanyLogo src={c.logo_url} name={c.razon_social} size={72} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-slate-800">{c.razon_social}</h2>
          {c.nombre_comercial && <p className="text-sm text-slate-500">{c.nombre_comercial}</p>}
          <p className="mt-1 text-xs text-slate-500">
            NIT {formatNit(c.nit, c.dv)} · {companyTypeLabel(c)} · Cliente desde {formatDate(c.creado_en)}
          </p>
        </div>
        <ActiveBadge active={c.activo} />
      </div>
    </Card>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card title="Información de la empresa">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Razón social">{c.razon_social}</Field>
          <Field label="Nombre comercial">{c.nombre_comercial}</Field>
          <Field label="NIT">{formatNit(c.nit, c.dv)}</Field>
          <Field label="Tipo de empresa">{companyTypeLabel(c)}</Field>
          <Field label="Actividad económica (CIIU)">{c.ciiu}</Field>
        </dl>
      </Card>

      <Card title="Contacto y ubicación">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Correo corporativo">{c.correo_corporativo}</Field>
          <Field label="Correo de facturación">{c.correo_facturacion}</Field>
          <Field label="Teléfono empresarial">{c.telefono}</Field>
          <Field label="País">{c.pais}</Field>
          <Field label="Departamento y ciudad">{[c.departamento, c.ciudad].filter(Boolean).join(" · ")}</Field>
          <Field label="Dirección">{c.direccion}</Field>
          <Field label="Sitio web">{c.sitio_web}</Field>
        </dl>
      </Card>

      <Card title="Representante legal">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre">{c.rep_nombre}</Field>
          <Field label="Documento">
            {getDocumentTypeLabel(c.rep_tipo_documento)} {c.rep_numero_documento}
          </Field>
          <Field label="Correo">{c.rep_email}</Field>
          <Field label="Teléfono">{c.rep_telefono}</Field>
        </dl>
      </Card>

      <Card title="Documentos" className="lg:col-span-2">
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {COMPANY_DOCUMENTS.map(({ tipo, label, maxAgeDays }) => {
            const doc = c.documentos.find((d) => d.tipo === tipo);
            const age = doc ? documentAgeDays(doc.fecha_expedicion) : null;
            const status = age === null ? "Falta" : age > maxAgeDays ? "Por actualizar" : "Vigente";
            return (
              <li key={tipo} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600">
                  <FileText size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  {doc ? (
                    <>
                      <p className="truncate text-xs text-slate-500" title={doc.nombre_archivo}>
                        {doc.nombre_archivo} · {formatFileSize(doc.tamano_bytes)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Expedido el {formatDate(`${doc.fecha_expedicion}T00:00:00`)} (hace {age} días)
                      </p>
                      {doc.url || doc.storage_path ? (
                        <button
                          type="button"
                          onClick={() => openDocument(doc)}
                          className="text-xs font-semibold text-sky-600 underline"
                        >
                          Ver documento
                        </button>
                      ) : (
                        <p className="text-[11px] text-slate-400">El archivo se podrá abrir cuando se conecte el almacenamiento.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">No se ha cargado.</p>
                  )}
                </div>
                <span
                  className={classNames(
                    "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
                    status === "Vigente" && "bg-green-50 text-green-700 border-green-200",
                    status === "Por actualizar" && "bg-amber-50 text-amber-700 border-amber-200",
                    status === "Falta" && "bg-rose-50 text-rose-700 border-rose-200"
                  )}
                >
                  {status}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Acceso a la plataforma">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Correo de acceso">{c.acceso_email}</Field>
          <Field label="Colaboradores activos">{c.total_colaboradores}</Field>
          <Field label="Viajes solicitados">{c.total_viajes}</Field>
        </dl>
      </Card>
    </div>
  </div>
);

export default CompanyInfoCard;
