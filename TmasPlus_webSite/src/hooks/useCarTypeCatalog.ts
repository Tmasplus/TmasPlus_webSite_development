import { useEffect, useMemo, useState } from "react";
import type { CarTypeRow } from "@/config/database.types";
import { CarTypesService } from "@/services/carTypes.service";

export function useCarTypeCatalog() {
  const [categories, setCategories] = useState<CarTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    CarTypesService.getAll()
      .then((rows) => {
        if (active) setCategories(rows);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "No se pudo cargar el catálogo");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories]
  );

  return { categories, activeCategories, loading, error };
}
