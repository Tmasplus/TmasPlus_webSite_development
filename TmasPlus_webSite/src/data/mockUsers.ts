export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "activo" | "inactivo" | "pendiente";
  joinedAt: string;
};

export const USERS_MOCK: User[] = Array.from({ length: 47 }).map((_, i) => {
  const id = `${i + 1}`.padStart(3, "0");
  const statusOptions: User["status"][] = ["activo", "inactivo", "pendiente"];
  const status = statusOptions[i % statusOptions.length];
  return {
    id,
    name: `Cliente ${id}`,
    email: `cliente${id}@correo.com`,
    phone: `+58 412-555-0${id}`,
    status,
    joinedAt: new Date(2024, (i % 12), (i % 28) + 1).toISOString(),
  };
});
