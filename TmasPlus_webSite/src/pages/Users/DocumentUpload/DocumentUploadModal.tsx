import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import DocumentUploadForm from "./DocumentUploadForm";

type UploadedDocs = Record<string, File[]>;

type DocumentUploadModalProps = {
  open: boolean;
  profile: ProfileType;
  requiredCount: number;
  onClose: () => void;
  onComplete: (files: UploadedDocs) => void;
};

const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  open,
  profile,
  requiredCount,
  onClose,
  onComplete,
}) => {
  const [files, setFiles] = useState<UploadedDocs>({});
  const [error, setError] = useState<string | null>(null);

  const totalUploaded = Object.values(files).reduce(
    (acc, curr) => acc + curr.length,
    0
  );

  const handleFinish = () => {
    // if (totalUploaded < requiredCount) {
    //   setError(
    //     `Debes subir ${requiredCount} documentos obligatorios (actualmente ${totalUploaded}).`
    //   );
    //   return;
    // }

    setError(null);
    onComplete(files);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Carga de documentos">
      <div className="space-y-6">
        <header>
          <p className="text-sm text-slate-600">
            Sube los documentos requeridos para el perfil{" "}
            <span className="font-medium">{profile}</span>.
          </p>
          {/* <p className="text-xs text-slate-500">
            Documentos obligatorios: {requiredCount}
          </p> */}
        </header>

        <DocumentUploadForm
          profile={profile}
          files={files}
          onChange={setFiles}
        />

        {error && (
          <p className="text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleFinish}>
            Confirmar documentos
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DocumentUploadModal;
