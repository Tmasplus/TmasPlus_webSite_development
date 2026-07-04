import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { classNames } from "@/utils/classNames";
import { formatDate } from "@/utils/formatDate";
import { toast } from "@/utils/toast";
import {
  CarBrandsService,
  type CarBrandRow,
} from "@/services/carBrands.service";

const StatusBadge = ({ active }: { active: boolean }) => (
  <span
    className={classNames(
      "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
      active
        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200"
    )}
  >
    {active ? "ACTIVA" : "INACTIVA"}
  </span>
);

export default function CarBrandsPage() {
  const [brands, setBrands] = useState<CarBrandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CarBrandRow | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CarBrandsService.getAll();
      setBrands(data);
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar las marcas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, search]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setModalOpen(true);
  };

  const openEdit = (brand: CarBrandRow) => {
    setEditing(brand);
    setName(brand.name);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Escribe el nombre de la marca");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await CarBrandsService.update(editing.id, { name: trimmed });
        toast.success("Marca actualizada");
      } else {
        await CarBrandsService.create({ name: trimmed });
        toast.success("Marca creada");
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar la marca");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (brand: CarBrandRow) => {
    try {
      await CarBrandsService.setActive(brand.id, !brand.is_active);
      toast.success(brand.is_active ? "Marca desactivada" : "Marca activada");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error al cambiar el estado");
    }
  };

  const handleDelete = async (brand: CarBrandRow) => {
    const confirmed = window.confirm(
      `¿Eliminar la marca "${brand.name}"? Esta acción no se puede deshacer. ` +
        `Los vehículos que ya la tengan guardada no se modifican. ` +
        `Si solo quieres ocultarla en la App, mejor desactívala.`
    );
    if (!confirmed) return;
    try {
      await CarBrandsService.remove(brand.id);
      toast.success("Marca eliminada");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar la marca");
    }
  };

  const activeCount = brands.filter((b) => b.is_active).length;

  return (
    <Page
      title="Marcas de Vehículos"
      actions={<Button onClick={openCreate}>+ Nueva Marca</Button>}
    >
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-500">
              {brands.length} marcas · {activeCount} activas
            </div>
            <div className="w-full sm:w-72">
              <Input
                placeholder="Buscar marca..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-500">
              Cargando marcas...
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={search ? "Sin resultados" : "Sin marcas"}
              subtitle={
                search
                  ? "Ninguna marca coincide con tu búsqueda"
                  : "Crea la primera marca para que aparezca en la App"
              }
              action={
                !search ? (
                  <Button onClick={openCreate}>+ Nueva Marca</Button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">#</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Marca
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Estado
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Creada
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, idx) => (
                    <tr
                      key={b.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-3 text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-3 font-medium text-slate-800">
                        {b.name}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge active={b.is_active} />
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {formatDate(b.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            onClick={() => openEdit(b)}
                            className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-3 py-1 text-xs"
                          >
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleToggle(b)}
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 px-3 py-1 text-xs"
                          >
                            {b.is_active ? "Desactivar" : "Activar"}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => handleDelete(b)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 text-xs"
                          >
                            Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar Marca" : "Nueva Marca"}
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting
                ? "Guardando..."
                : editing
                ? "Guardar cambios"
                : "Crear Marca"}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Nombre de la marca
          </label>
          <Input
            autoFocus
            placeholder="Ej. Toyota, Kia, Mazda…"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !submitting) handleSubmit();
            }}
          />
          <p className="text-xs text-slate-500">
            Este es el texto que verá el conductor en la App y que se guarda en
            el vehículo.
          </p>
        </div>
      </Modal>
    </Page>
  );
}
