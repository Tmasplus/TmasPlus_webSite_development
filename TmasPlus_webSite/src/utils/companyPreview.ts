// Empresa cuyo portal está viendo un administrador ("Ver portal de la empresa").
// Vive en sessionStorage: se pierde al cerrar la pestaña.
const STORAGE_KEY = "tplus_company_preview";
const listeners = new Set<() => void>();

export type CompanyPreview = { id: string; name: string };

export function readCompanyPreviewRaw(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseCompanyPreview(raw: string | null): CompanyPreview | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CompanyPreview;
    return value?.id ? value : null;
  } catch {
    return null;
  }
}

export function startCompanyPreview(preview: CompanyPreview) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(preview));
  } catch {
    /* sin sessionStorage */
  }
  listeners.forEach((l) => l());
}

export function stopCompanyPreview() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sin sessionStorage */
  }
  listeners.forEach((l) => l());
}

export function subscribeCompanyPreview(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
