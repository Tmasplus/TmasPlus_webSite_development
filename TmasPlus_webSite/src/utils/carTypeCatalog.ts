import type { CarTypeRow } from "@/config/database.types";

// Compatibilidad temporal mientras cars.service_type siga siendo texto.
// La identidad canónica en la web es car_types.id; estos códigos solo se usan
// al escribir/leer los registros heredados que aún consume la App.
const LEGACY_CODE_BY_ID: Record<string, string> = {
  "6975bdc7-e6b0-4002-ba3b-45f2a5d439cc": "particular",
  "2acdb415-df6d-4087-bc54-1c741ea86de6": "servicio_especial",
  "102d2c48-ee88-4652-ae6c-8f2fe3ae2d20": "taxi_plus",
  "a111364a-95d0-4ac8-8305-35c7536dd064": "van_plus",
};

const LEGACY_ALIASES_BY_ID: Record<string, string[]> = {
  "6975bdc7-e6b0-4002-ba3b-45f2a5d439cc": ["T+Plus Particular", "x_plus"],
  "2acdb415-df6d-4087-bc54-1c741ea86de6": ["T+Plus Especial", "comfort_plus"],
  "102d2c48-ee88-4652-ae6c-8f2fe3ae2d20": ["T+Plus Taxi"],
  "a111364a-95d0-4ac8-8305-35c7536dd064": ["T+Plus Van"],
};

const LEGACY_LABEL_BY_CODE: Record<string, string> = {
  particular: "T+Plus Particular",
  servicio_especial: "T+Plus Especial",
  taxi_plus: "T+Plus Taxi",
  van_plus: "T+Plus Van",
};

function normalize(value?: string | null): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function serviceTypeForCategory(category: CarTypeRow): string {
  return LEGACY_CODE_BY_ID[category.id] || normalize(category.name);
}

export function categoryForValue(
  categories: CarTypeRow[],
  value?: string | null
): CarTypeRow | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  return (
    categories.find((category) => {
      const aliases = [
        category.id,
        category.name,
        serviceTypeForCategory(category),
        ...(LEGACY_ALIASES_BY_ID[category.id] || []),
      ];
      return aliases.some((alias) => normalize(alias) === normalized);
    }) || null
  );
}

export function categoryNameForValue(
  categories: CarTypeRow[],
  value?: string | null
): string {
  return categoryForValue(categories, value)?.name || "—";
}

export function activeCategoryOptions(categories: CarTypeRow[]) {
  return categories
    .filter((category) => category.is_active)
    .map((category) => ({
      value: serviceTypeForCategory(category),
      label: category.name,
      categoryId: category.id,
    }));
}

export function legacyCategoryLabel(value?: string | null): string | null {
  return value ? LEGACY_LABEL_BY_CODE[value] || null : null;
}

export type DocumentProfile =
  | "x_plus"
  | "taxi_plus"
  | "comfort_plus"
  | "van_plus";

export function documentProfileForCategoryValue(
  categories: CarTypeRow[],
  value?: string | null
): DocumentProfile {
  const category = categoryForValue(categories, value);
  switch (category?.id) {
    case "2acdb415-df6d-4087-bc54-1c741ea86de6":
      return "comfort_plus";
    case "102d2c48-ee88-4652-ae6c-8f2fe3ae2d20":
      return "taxi_plus";
    case "a111364a-95d0-4ac8-8305-35c7536dd064":
      return "van_plus";
    default:
      return "x_plus";
  }
}
