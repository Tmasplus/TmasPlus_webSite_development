import { useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { CompanyViewer } from "@/services/companies.service";
import {
  parseCompanyPreview,
  readCompanyPreviewRaw,
  subscribeCompanyPreview,
} from "@/utils/companyPreview";

export type CompanyScope = {
  /** Empresa sobre la que opera el portal; null si un admin no eligió ninguna. */
  companyId: string | null;
  companyName: string;
  viewer: CompanyViewer;
  /** Un administrador está viendo el portal de una empresa. */
  isPreview: boolean;
};

export function useCompanyPreview() {
  const raw = useSyncExternalStore(subscribeCompanyPreview, readCompanyPreviewRaw, () => null);
  return useMemo(() => parseCompanyPreview(raw), [raw]);
}

export function useCompanyScope(): CompanyScope {
  const { mode, profile } = useAuth();
  const preview = useCompanyPreview();

  if (mode === "company" && profile) {
    return {
      companyId: profile.id,
      companyName: [profile.nombre, profile.apellido].filter(Boolean).join(" "),
      viewer: "empresa",
      isPreview: false,
    };
  }
  return {
    companyId: preview?.id ?? null,
    companyName: preview?.name ?? "",
    viewer: "admin",
    isPreview: !!preview,
  };
}
