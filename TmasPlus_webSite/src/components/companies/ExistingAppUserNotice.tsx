import React from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { AppUserMatch, ExistingAppUser } from "@/services/companies.service";

const MATCH_LABELS: Record<AppUserMatch, string> = {
  documento: "Cédula / documento",
  correo: "Correo",
  telefono: "Teléfono",
  nombre: "Nombre y apellido",
};

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-800">{value || "—"}</dd>
    </div>
  );
}

type Props = {
  users: ExistingAppUser[];
  /** Personas a las que se respondió "No, es otra persona". */
  rejectedIds: Set<string>;
  linkingId: string | null;
  onLink: (user: ExistingAppUser) => void;
  onReject: (user: ExistingAppUser) => void;
};

/** Aviso de Usuario App existente con la pregunta de si se agrega como colaborador. */
export const ExistingAppUserNotice: React.FC<Props> = ({ users, rejectedIds, linkingId, onLink, onReject }) => (
  <div className="space-y-3">
    {users.map((u) => {
      const rejected = rejectedIds.has(u.id);
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Usuario";
      return (
        <div key={u.id} className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
              <UserCheck size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">Este usuario ya existe en T+Plus</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <Detail label="Nombre" value={name} />
                <Detail label="Documento" value={[u.document_type, u.document_number].filter(Boolean).join(" ")} />
                <Detail label="Ciudad" value={u.city} />
                <Detail label="Correo" value={u.email} />
                <Detail label="Teléfono" value={u.mobile} />
              </dl>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-amber-900">
                <span className="font-medium">Coincide por:</span>
                {u.matches.map((m) => (
                  <span key={m} className="rounded-full border border-amber-300 bg-white px-2 py-0.5">
                    {MATCH_LABELS[m]}
                  </span>
                ))}
              </div>

              {u.alreadyLinked ? (
                <p className="mt-3 text-sm font-medium text-amber-900">Ya es colaborador de esta empresa.</p>
              ) : !u.isAppUser ? (
                <p className="mt-3 text-sm text-amber-900">
                  Esa cuenta no es de Usuario App (por ejemplo, es de un conductor) y no puede ser colaboradora.
                  Usa otros datos.
                </p>
              ) : rejected ? (
                <p className="mt-3 text-sm text-amber-900">
                  Si es otra persona, corrige la cédula, el correo o el teléfono: esos datos ya pertenecen a esta cuenta.
                </p>
              ) : (
                <>
                  <p className="mt-3 text-sm text-amber-900">
                    ¿Quieres agregarlo como colaborador? Se usarán sus datos actuales; no se crea otra cuenta ni
                    cambia su contraseña.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="!px-4 !py-2" onClick={() => onLink(u)} disabled={!!linkingId}>
                      {linkingId === u.id ? "Agregando..." : "Sí, agregarlo como colaborador"}
                    </Button>
                    <Button variant="secondary" className="!px-4 !py-2" onClick={() => onReject(u)} disabled={!!linkingId}>
                      No, es otra persona
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

export default ExistingAppUserNotice;
