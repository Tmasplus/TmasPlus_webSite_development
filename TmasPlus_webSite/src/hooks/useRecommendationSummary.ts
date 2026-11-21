import { useEffect, useState } from "react";
import { RecommendationsService, type RecommendationSummary } from "@/services/recommendations.service";

const REFRESH_MS = 60_000;

/** Resumen de liquidaciones de reservas recomendadas (solo admin). Se refresca cada minuto. */
export function useRecommendationSummary(enabled: boolean): RecommendationSummary | null {
  const [summary, setSummary] = useState<RecommendationSummary | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      return;
    }
    let alive = true;
    const load = () =>
      RecommendationsService.getSummary()
        .then((s) => alive && setSummary(s))
        .catch(() => {
          /* sin el parche SQL o sin permisos: el contador no se muestra */
        });
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return summary;
}
