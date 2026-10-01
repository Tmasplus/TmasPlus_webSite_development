import { useEffect, useState } from "react";
import { CarBrandsService, type CarBrandRow } from "@/services/carBrands.service";

export function useCarBrands() {
  const [brands, setBrands] = useState<CarBrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    CarBrandsService.getActive()
      .then((rows) => {
        if (active) setBrands(rows);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "No se pudo cargar las marcas");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { brands, loading, error };
}
