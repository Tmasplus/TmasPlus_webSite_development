import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";

type ProfileType =
  | "cliente"
  | "x_plus"
  | "taxi_plus"
  | "comfort_plus"
  | "van_plus";

type DocumentDef = {
  id: string;
  label: string;
  required: boolean;
  multiple?: boolean;
};

type UploadedDocs = Record<string, File[]>;

const DOCUMENTS_BY_PROFILE: Record<ProfileType, DocumentDef[]> = {
  cliente: [
    { id: "cedula", label: "Cédula", required: true, multiple: true },
  ],
  x_plus: [
    { id: "cedula", label: "Cédula", required: true, multiple: true },
    { id: "licencia", label: "Licencia de conducción", required: true, multiple: true },
    { id: "tarjeta", label: "Tarjeta de propiedad", required: true, multiple: true },
    { id: "soat", label: "SOAT vigente", required: true },
    { id: "tecnomecanica", label: "Revisión tecnicomecánica", required: false },
  ],
  taxi_plus: [
    { id: "cedula", label: "Cédula", required: true, multiple: true },
    { id: "licencia", label: "Licencia de conducción", required: true, multiple: true },
    { id: "tarjeta", label: "Tarjeta de propiedad", required: true, multiple: true },
    { id: "soat", label: "SOAT vigente", required: true },
    { id: "tecnomecanica", label: "Revisión tecnicomecánica", required: false },
  ],
  comfort_plus: [
    { id: "cedula", label: "Cédula", required: true, multiple: true },
    { id: "licencia", label: "Licencia de conducción", required: true, multiple: true },
    { id: "tarjeta", label: "Tarjeta de propiedad", required: true, multiple: true },
    { id: "soat", label: "SOAT vigente", required: true },
    { id: "tecnomecanica", label: "Revisión tecnicomecánica", required: false },
    { id: "camara_comercio", label: "Cámara de Comercio", required: true },
    { id: "rut", label: "RUT", required: true },
    { id: "cedula_representante", label: "Cédula representante legal", required: true },
    { id: "habilitacion", label: "Habilitación", required: true },
  ],
  van_plus: [
    { id: "cedula", label: "Cédula", required: true, multiple: true },
    { id: "licencia", label: "Licencia de conducción", required: true, multiple: true },
    { id: "tarjeta", label: "Tarjeta de propiedad", required: true, multiple: true },
    { id: "soat", label: "SOAT vigente", required: true },
    { id: "tecnomecanica", label: "Revisión tecnicomecánica", required: false },
    { id: "camara_comercio", label: "Cámara de Comercio", required: true },
    { id: "rut", label: "RUT", required: true },
    { id: "cedula_representante", label: "Cédula representante legal", required: true },
    { id: "habilitacion", label: "Habilitación", required: true },
  ],
};

const DocumentUploadForm: React.FC<{
  profile: ProfileType;
  files: UploadedDocs;
  onChange: (files: UploadedDocs) => void;
}> = ({ profile, files, onChange }) => {
  const documents = useMemo(
    () => DOCUMENTS_BY_PROFILE[profile],
    [profile]
  );

  function handleFiles(docId: string, list: FileList | null) {
    if (!list) return;

    onChange({
      ...files,
      [docId]: Array.from(list),
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const formData = new FormData();
    formData.append("profileType", profile);

    Object.entries(files).forEach(([docId, docs]) => {
      docs.forEach((file) =>
        formData.append(`documents[${docId}][]`, file)
      );
    });

    console.log("Formulario listo para enviar:", {
      profile,
      files,
    });
  }

  return (
    <div className="space-y-6">
      {documents.map((doc) => (
        <div key={doc.id} className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium">{doc.label}</p>

          <input
            type="file"
            accept="image/*,application/pdf"
            multiple={doc.multiple}
            required={doc.required}
            onChange={(e) => handleFiles(doc.id, e.target.files)}
          />

          {files[doc.id]?.length > 0 && (
            <p className="text-xs text-slate-500">
              {files[doc.id].length} archivo(s) cargado(s)
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default DocumentUploadForm;
