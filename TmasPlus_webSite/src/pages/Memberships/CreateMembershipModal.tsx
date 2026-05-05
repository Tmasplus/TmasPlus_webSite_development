import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useDebounced } from "@/hooks/useDebounced";
import { toast } from "@/utils/toast";
import { classNames } from "@/utils/classNames";
import {
  MembershipsService,
  type MembershipUser,
} from "@/services/memberships.service";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const todayISO = () => new Date().toISOString().split("T")[0];

const addMonthsISO = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
};

const daysBetween = (start: string, end: string) => {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)));
};

export default function CreateMembershipModal({
  open,
  onClose,
  onCreated,
}: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 400);
  const [results, setResults] = useState<MembershipUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MembershipUser | null>(null);

  const [costo, setCosto] = useState<number>(90600);
  const [fechaInicio, setFechaInicio] = useState<string>(todayISO());
  const [fechaFin, setFechaFin] = useState<string>(addMonthsISO(6));
  const [submitting, setSubmitting] = useState(false);

  const periodo = useMemo(
    () => daysBetween(fechaInicio, fechaFin),
    [fechaInicio, fechaFin]
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setCosto(90600);
      setFechaInicio(todayISO());
      setFechaFin(addMonthsISO(6));
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    let active = true;
    if (selected) {
      setResults([]);
      return;
    }
    if (!debouncedQuery.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    MembershipsService.searchUsers(debouncedQuery, 8)
      .then((rows) => {
        if (active) setResults(rows);
      })
      .catch((e) => {
        if (active) toast.error(e?.message || "Error al buscar usuarios");
      })
      .finally(() => {
        if (active) setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, selected]);

  const handleCreate = async () => {
    if (!selected) {
      toast.error("Selecciona un conductor o usuario");
      return;
    }
    if (!selected.auth_id) {
      toast.error("El usuario seleccionado no tiene auth_id válido");
      return;
    }
    if (!fechaInicio || !fechaFin) {
      toast.error("Define las fechas de la membresía");
      return;
    }
    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      toast.error("La fecha de terminación debe ser posterior a la de inicio");
      return;
    }
    if (!costo || costo <= 0) {
      toast.error("El costo debe ser mayor a 0");
      return;
    }

    setSubmitting(true);
    try {
      await MembershipsService.create({
        conductor: selected.auth_id,
        status: "ACTIVA",
        costo,
        fecha_inicio: fechaInicio,
        fecha_terminada: fechaFin,
        periodo,
      });
      toast.success("Membresía creada exitosamente");
      onCreated();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Error al crear la membresía");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva Membresía"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={submitting || !selected}
          >
            {submitting ? "Creando..." : "Crear Membresía"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Buscar conductor o usuario
          </label>
          {selected ? (
            <div className="flex items-center justify-between rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
              <div className="flex items-center gap-3">
                <img
                  src={
                    selected.profile_image ||
                    "https://ui-avatars.com/api/?name=" +
                      encodeURIComponent(
                        `${selected.first_name} ${selected.last_name}`
                      )
                  }
                  alt={selected.first_name}
                  className="w-10 h-10 rounded-full object-cover border border-white shadow-sm"
                />
                <div>
                  <div className="text-sm font-semibold text-slate-800">
                    {selected.first_name} {selected.last_name}
                  </div>
                  <div className="text-xs text-slate-600">
                    {selected.email}
                    {selected.mobile ? ` · ${selected.mobile}` : ""}
                  </div>
                  <div className="text-[10px] uppercase tracking-wide text-sky-700 font-semibold">
                    {selected.user_type}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
              >
                Cambiar
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Nombre, email o teléfono"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {(results.length > 0 || searching) && (
                <div className="absolute z-10 w-full mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                  {searching && (
                    <div className="p-3 text-sm text-slate-500">
                      Buscando...
                    </div>
                  )}
                  {!searching &&
                    results.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => setSelected(u)}
                        className={classNames(
                          "w-full text-left px-3 py-2 hover:bg-sky-50 flex items-center gap-3 border-b border-slate-100 last:border-b-0"
                        )}
                      >
                        <img
                          src={
                            u.profile_image ||
                            "https://ui-avatars.com/api/?name=" +
                              encodeURIComponent(
                                `${u.first_name} ${u.last_name}`
                              )
                          }
                          alt={u.first_name}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">
                            {u.first_name} {u.last_name}
                          </div>
                          <div className="text-xs text-slate-500 truncate">
                            {u.email}
                            {u.mobile ? ` · ${u.mobile}` : ""}
                          </div>
                        </div>
                        <span className="text-[10px] uppercase font-semibold text-slate-500">
                          {u.user_type}
                        </span>
                      </button>
                    ))}
                  {!searching &&
                    results.length === 0 &&
                    debouncedQuery.trim() && (
                      <div className="p-3 text-sm text-slate-500">
                        Sin resultados
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Costo (COP)
            </label>
            <Input
              type="number"
              min={0}
              value={costo}
              onChange={(e) => setCosto(Number(e.target.value))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Periodo (días)
            </label>
            <Input type="number" value={periodo} readOnly />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha de inicio
            </label>
            <Input
              type="date"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Fecha de terminación
            </label>
            <Input
              type="date"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
