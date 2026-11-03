import React, { useRef } from "react";
import { FileCheck2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { classNames } from "@/utils/classNames";
import type { CompanyDocument, CompanyDocumentInput } from "@/services/companies.service";
import { formatFileSize } from "./format";

const COMPANY_DOC_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_COMPANY_DOC_BYTES = 5 * 1024 * 1024;

type Props = {
  id: string;
  label: string;
  hint: string;
  value: CompanyDocumentInput;
  existing?: CompanyDocument;
  error?: string;
  warning?: string;
  onChange: (value: CompanyDocumentInput) => void;
  onInvalidFile: (message: string) => void;
};

export const CompanyDocumentField: React.FC<Props> = ({
  id,
  label,
  hint,
  value,
  existing,
  error,
  warning,
  onChange,
  onInvalidFile,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const fileName = value.file?.name ?? existing?.nombre_archivo;
  const fileSize = value.file?.size ?? existing?.tamano_bytes;

  function pick(file: File | undefined) {
    if (!file) return;
    if (!COMPANY_DOC_TYPES.includes(file.type)) {
      onInvalidFile("Formato no permitido. Usa PDF, JPG o PNG.");
      return;
    }
    if (file.size > MAX_COMPANY_DOC_BYTES) {
      onInvalidFile("El documento no puede superar 5 MB.");
      return;
    }
    onChange({ ...value, file });
  }

  return (
    <div
      className={classNames(
        "rounded-xl border p-3",
        error ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-slate-50/50"
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span
          className={classNames(
            "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
            fileName ? "bg-green-50 text-green-600" : "bg-white text-slate-400 border border-slate-200"
          )}
        >
          {fileName ? <FileCheck2 size={20} /> : <FileUp size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700">
            {label} <span className="text-red-500">*</span>
          </p>
          <p className="text-xs text-slate-500">{hint}</p>
          {fileName && (
            <p className="mt-1 truncate text-xs text-slate-700" title={fileName}>
              {fileName}
              {fileSize ? ` · ${formatFileSize(fileSize)}` : ""}
              {!value.file && existing ? " · cargado" : ""}
            </p>
          )}
        </div>
        <input
          ref={fileRef}
          id={id}
          type="file"
          accept={COMPANY_DOC_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" className="!px-3 !py-2 !text-xs" onClick={() => fileRef.current?.click()}>
          {fileName ? "Reemplazar" : "Subir documento"}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-fecha`} className="text-xs font-medium text-slate-600">
          Fecha de expedición <span className="text-red-500">*</span>
        </label>
        <input
          id={`${id}-fecha`}
          type="date"
          max={today}
          value={value.fecha_expedicion}
          onChange={(e) => onChange({ ...value, fecha_expedicion: e.target.value })}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
        />
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {!error && warning && <p className="mt-2 text-xs text-amber-700">{warning}</p>}
    </div>
  );
};

export default CompanyDocumentField;
