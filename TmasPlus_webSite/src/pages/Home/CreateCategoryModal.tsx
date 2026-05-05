import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { FloatingInput, FloatingSelect } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import { CarTypesService } from "@/services/carTypes.service";
import type { CarTypeRow } from "@/config/database.types";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editData?: CarTypeRow | null;
};

const INITIAL_FORM = {
  name: "",
  description: "",
  capacity: "4",
  base_price: "",
  base_price_inter: "",
  price_per_km: "",
  price_per_km_inter: "",
  rate_per_hour: "",
  rate_per_hour_inter: "",
  valor_hora: "",
  min_fare: "",
  min_fare_inter: "",
  delta_aeropuerto: "",
  delta_aeropuerto_prog: "",
  convenience_fee: "",
  convenience_fee_type: "percentage",
  is_active: "true",
};

export const CreateCategoryModal: React.FC<Props> = ({
  open,
  onClose,
  onSaved,
  editData,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!editData;

  // Pre-fill form when editing
  useEffect(() => {
    if (editData) {
      setForm({
        name: editData.name,
        description: editData.description ?? "",
        capacity: String(editData.capacity),
        base_price: String(editData.base_price),
        base_price_inter: String(editData.base_price_inter),
        price_per_km: String(editData.price_per_km),
        price_per_km_inter: String(editData.price_per_km_inter),
        rate_per_hour: String(editData.rate_per_hour),
        rate_per_hour_inter: String(editData.rate_per_hour_inter),
        valor_hora: String(editData.valor_hora),
        min_fare: String(editData.min_fare),
        min_fare_inter: String(editData.min_fare_inter),
        delta_aeropuerto: String(editData.delta_aeropuerto),
        delta_aeropuerto_prog: String(editData.delta_aeropuerto_prog),
        convenience_fee: String(editData.convenience_fee),
        convenience_fee_type: editData.convenience_fee_type,
        is_active: String(editData.is_active),
      });
      setPreview(editData.image);
      setImageFile(null);
    } else {
      setForm(INITIAL_FORM);
      setPreview(null);
      setImageFile(null);
    }
    setError("");
  }, [editData, open]);

  function update<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es obligatorio"); return; }

    setSaving(true);
    setError("");

    try {
      let imageUrl: string | null = editData?.image ?? null;

      if (imageFile) {
        imageUrl = await CarTypesService.uploadImage(imageFile, form.name);
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        capacity: Number(form.capacity) || 4,
        image: imageUrl,
        base_price: Number(form.base_price) || 0,
        base_price_inter: Number(form.base_price_inter) || 0,
        price_per_km: Number(form.price_per_km) || 0,
        price_per_km_inter: Number(form.price_per_km_inter) || 0,
        rate_per_hour: Number(form.rate_per_hour) || 0,
        rate_per_hour_inter: Number(form.rate_per_hour_inter) || 0,
        valor_hora: Number(form.valor_hora) || 0,
        min_fare: Number(form.min_fare) || 0,
        min_fare_inter: Number(form.min_fare_inter) || 0,
        delta_aeropuerto: Number(form.delta_aeropuerto) || 0,
        delta_aeropuerto_prog: Number(form.delta_aeropuerto_prog) || 0,
        convenience_fee: Number(form.convenience_fee) || 0,
        convenience_fee_type: form.convenience_fee_type,
        is_active: form.is_active === "true",
      };

      if (isEditing && editData) {
        await CarTypesService.update(editData.id, payload);
      } else {
        await CarTypesService.create(payload);
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Editar Categoría de Servicio" : "Crear Nueva Categoría de Servicio"}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando..." : isEditing ? "Actualizar" : "Guardar Categoría"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-6 max-h-[80vh] overflow-y-auto pr-2"
      >
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Imagen */}
        <div className="flex flex-col items-center text-center space-y-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="w-28 h-28 rounded-full bg-slate-100 border-2 border-slate-300 grid place-items-center overflow-hidden"
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-slate-500 text-sm">Sin imagen</span>
            )}
          </motion.div>
          <label className="text-sm text-slate-600 font-medium">
            Imagen del tipo de vehículo
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImage}
            className="block w-full max-w-xs text-sm text-slate-600
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-primary/10 file:text-primary-dark
                       hover:file:bg-primary/20"
          />
        </div>

        {/* Info general */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FloatingInput
            id="name"
            label="Nombre"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
          />
          <FloatingInput
            id="description"
            label="Descripción"
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
          />
          <FloatingSelect
            id="is_active"
            label="Estado"
            value={form.is_active}
            onChange={(e) => update("is_active", e.target.value)}
          >
            <option value="true">Activa</option>
            <option value="false">Inactiva</option>
          </FloatingSelect>
          <FloatingInput
            id="capacity"
            label="Capacidad"
            type="number"
            value={form.capacity}
            onChange={(e) => update("capacity", e.target.value)}
          />
        </div>

        {/* Sección: Tarifas Base */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase px-2">Tarifas Base</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="base_price"
              label="Base Fare (Local)"
              type="number"
              value={form.base_price}
              onChange={(e) => update("base_price", e.target.value)}
            />
            <FloatingInput
              id="base_price_inter"
              label="Base Fare (Intermunicipal)"
              type="number"
              value={form.base_price_inter}
              onChange={(e) => update("base_price_inter", e.target.value)}
            />
          </div>
        </fieldset>

        {/* Sección: Distancia */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase px-2">Valor por Distancia</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="price_per_km"
              label="Valor Distancia (Local)"
              type="number"
              value={form.price_per_km}
              onChange={(e) => update("price_per_km", e.target.value)}
            />
            <FloatingInput
              id="price_per_km_inter"
              label="Valor Distancia (Intermunicipal)"
              type="number"
              value={form.price_per_km_inter}
              onChange={(e) => update("price_per_km_inter", e.target.value)}
            />
          </div>
        </fieldset>

        {/* Sección: Hora */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase px-2">Tarifas por Hora</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="rate_per_hour"
              label="Rate per Hour (Local)"
              type="number"
              value={form.rate_per_hour}
              onChange={(e) => update("rate_per_hour", e.target.value)}
            />
            <FloatingInput
              id="rate_per_hour_inter"
              label="Rate per Hour (Intermunicipal)"
              type="number"
              value={form.rate_per_hour_inter}
              onChange={(e) => update("rate_per_hour_inter", e.target.value)}
            />
            <FloatingInput
              id="valor_hora"
              label="Valor Hora"
              type="number"
              value={form.valor_hora}
              onChange={(e) => update("valor_hora", e.target.value)}
            />
          </div>
        </fieldset>

        {/* Sección: Tarifas Mínimas */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase px-2">Tarifas Mínimas</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="min_fare"
              label="Min Fare (Local)"
              type="number"
              value={form.min_fare}
              onChange={(e) => update("min_fare", e.target.value)}
            />
            <FloatingInput
              id="min_fare_inter"
              label="Min Fare (Intermunicipal)"
              type="number"
              value={form.min_fare_inter}
              onChange={(e) => update("min_fare_inter", e.target.value)}
            />
          </div>
        </fieldset>

        {/* Sección: Aeropuerto */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase px-2">Delta Aeropuerto</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="delta_aeropuerto"
              label="Delta Aeropuerto"
              type="number"
              value={form.delta_aeropuerto}
              onChange={(e) => update("delta_aeropuerto", e.target.value)}
            />
            <FloatingInput
              id="delta_aeropuerto_prog"
              label="Delta Aeropuerto Programado"
              type="number"
              value={form.delta_aeropuerto_prog}
              onChange={(e) => update("delta_aeropuerto_prog", e.target.value)}
            />
          </div>
        </fieldset>

        {/* Sección: Comisión */}
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-4">
          <legend className="text-xs font-semibold text-slate-500 uppercase px-2">Comisión por Conveniencia</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="convenience_fee"
              label="Comisión por Conveniencia"
              type="number"
              value={form.convenience_fee}
              onChange={(e) => update("convenience_fee", e.target.value)}
            />
            <FloatingSelect
              id="convenience_fee_type"
              label="Tipo de Comisión"
              value={form.convenience_fee_type}
              onChange={(e) => update("convenience_fee_type", e.target.value)}
            >
              <option value="percentage">Porcentaje</option>
              <option value="fixed">Fija</option>
            </FloatingSelect>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
};
