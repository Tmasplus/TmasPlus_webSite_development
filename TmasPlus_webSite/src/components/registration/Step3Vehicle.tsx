import React, { useState } from 'react';
import { FloatingInput } from '@/components/ui/FloatingField';
import { FileUpload } from '@/components/ui/FileUpload';
import type { DriverRegistrationStep3, DriverServiceType, FuelType, TransmissionType } from '@/config/database.types';

interface Step3Props {
    data: Partial<DriverRegistrationStep3>;
    onChange: (data: Partial<DriverRegistrationStep3>) => void;
    onNext: () => void;
    onBack: () => void;
    loading?: boolean;
}

export const Step3Vehicle: React.FC<Step3Props> = ({ data, onChange, onNext, onBack, loading = false }) => {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const update = (key: keyof DriverRegistrationStep3, value: unknown) => {
        onChange({ ...data, [key]: value });
        if (errors[key as string]) setErrors((e) => ({ ...e, [key as string]: '' }));
    };

    const updateVehicle = (key: string, value: unknown) => {
        onChange({ ...data, vehicle: { ...(data.vehicle || {} as DriverRegistrationStep3['vehicle']), [key]: value } as DriverRegistrationStep3['vehicle'] });
        if (errors[`vehicle.${key}`]) setErrors((e) => ({ ...e, [`vehicle.${key}`]: '' }));
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!data.serviceType) newErrors.serviceType = 'Selecciona el tipo de servicio';
        if (!data.vehicle?.make?.trim()) newErrors['vehicle.make'] = 'Requerido';
        if (!data.vehicle?.model?.trim()) newErrors['vehicle.model'] = 'Requerido';
        if (!data.vehicle?.year || data.vehicle.year < 1990 || data.vehicle.year > new Date().getFullYear() + 1)
            newErrors['vehicle.year'] = 'Año inválido';
        if (!data.vehicle?.color?.trim()) newErrors['vehicle.color'] = 'Requerido';
        if (!data.vehicle?.plate?.trim()) newErrors['vehicle.plate'] = 'Requerido';
        if (!data.vehicle?.fuel_type) newErrors['vehicle.fuel_type'] = 'Requerido';
        if (!data.vehicle?.transmission) newErrors['vehicle.transmission'] = 'Requerido';
        if (!data.vehicle?.capacity || data.vehicle.capacity < 1 || data.vehicle.capacity > 20)
            newErrors['vehicle.capacity'] = 'Capacidad inválida (1-20)';
        if (!data.tarjeta_propiedad) newErrors.tarjeta_propiedad = 'Requerida';
        if (!data.soat) newErrors.soat = 'Requerido';
        if (!data.soat_expiry_date) newErrors.soat_expiry_date = 'Requerida';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const showCompany = data.serviceType === 'servicio_especial' || data.serviceType === 'taxi_plus';

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-[#002f45]">Vehículo y Documentos</h2>
                <p className="text-sm text-slate-500 mt-0.5">Información del vehículo con el que trabajarás</p>
            </div>

            {/* Tipo de servicio */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de servicio <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                    {([
                        { value: 'particular', label: '🚗 Particular' },
                        { value: 'servicio_especial', label: '🏢 Servicio Especial' },
                        { value: 'taxi_plus', label: '🚕 Taxi Plus' },
                    ] as { value: DriverServiceType; label: string }[]).map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => update('serviceType', opt.value)}
                            disabled={loading}
                            className={`py-2.5 px-2 rounded-xl border text-xs font-medium transition-all ${data.serviceType === opt.value
                                    ? 'bg-[#002f45] text-white border-[#002f45]'
                                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                {errors.serviceType && <p className="mt-1 text-xs text-red-500">{errors.serviceType}</p>}
            </div>

            {/* Datos del vehículo */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Datos del Vehículo</p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <FloatingInput id="make" label="Marca" value={data.vehicle?.make ?? ''} onChange={(e) => updateVehicle('make', e.target.value)} disabled={loading} required />
                        {errors['vehicle.make'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.make']}</p>}
                    </div>
                    <div>
                        <FloatingInput id="model" label="Modelo" value={data.vehicle?.model ?? ''} onChange={(e) => updateVehicle('model', e.target.value)} disabled={loading} required />
                        {errors['vehicle.model'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.model']}</p>}
                    </div>
                    <div>
                        <FloatingInput id="year" label="Año" type="number" value={data.vehicle?.year?.toString() ?? ''} onChange={(e) => updateVehicle('year', parseInt(e.target.value) || 0)} disabled={loading} required />
                        {errors['vehicle.year'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.year']}</p>}
                    </div>
                    <div>
                        <FloatingInput id="color" label="Color" value={data.vehicle?.color ?? ''} onChange={(e) => updateVehicle('color', e.target.value)} disabled={loading} required />
                        {errors['vehicle.color'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.color']}</p>}
                    </div>
                    <div>
                        <FloatingInput id="plate" label="Placa" value={data.vehicle?.plate ?? ''} onChange={(e) => updateVehicle('plate', e.target.value.toUpperCase())} disabled={loading} required />
                        {errors['vehicle.plate'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.plate']}</p>}
                    </div>
                    <div>
                        <FloatingInput id="capacity" label="Pasajeros" type="number" value={data.vehicle?.capacity?.toString() ?? ''} onChange={(e) => updateVehicle('capacity', parseInt(e.target.value) || 0)} disabled={loading} required />
                        {errors['vehicle.capacity'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.capacity']}</p>}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Combustible <span className="text-red-500">*</span></label>
                        <select value={data.vehicle?.fuel_type ?? ''} onChange={(e) => updateVehicle('fuel_type', e.target.value as FuelType)} disabled={loading} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                            <option value="">Seleccionar</option>
                            <option value="gasolina">Gasolina</option>
                            <option value="diesel">Diesel</option>
                            <option value="electrico">Eléctrico</option>
                            <option value="hibrido">Híbrido</option>
                        </select>
                        {errors['vehicle.fuel_type'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.fuel_type']}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Transmisión <span className="text-red-500">*</span></label>
                        <select value={data.vehicle?.transmission ?? ''} onChange={(e) => updateVehicle('transmission', e.target.value as TransmissionType)} disabled={loading} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                            <option value="">Seleccionar</option>
                            <option value="manual">Manual</option>
                            <option value="automatico">Automática</option>
                        </select>
                        {errors['vehicle.transmission'] && <p className="mt-1 text-xs text-red-500">{errors['vehicle.transmission']}</p>}
                    </div>
                </div>
            </div>

            {/* Documentos del vehículo */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Documentos del Vehículo</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <FileUpload label="Tarjeta de Propiedad" value={(data.tarjeta_propiedad as File | null) ?? null} onChange={(f) => update('tarjeta_propiedad', f as File)} disabled={loading} required />
                        {errors.tarjeta_propiedad && <p className="mt-1 text-xs text-red-500">{errors.tarjeta_propiedad}</p>}
                    </div>
                    <div>
                        <FileUpload label="SOAT" value={(data.soat as File | null) ?? null} onChange={(f) => update('soat', f as File)} disabled={loading} required />
                        {errors.soat && <p className="mt-1 text-xs text-red-500">{errors.soat}</p>}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de vencimiento del SOAT <span className="text-red-500">*</span></label>
                    <input type="date" value={data.soat_expiry_date ?? ''} onChange={(e) => update('soat_expiry_date', e.target.value)} disabled={loading} min={new Date().toISOString().split('T')[0]} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
                    {errors.soat_expiry_date && <p className="mt-1 text-xs text-red-500">{errors.soat_expiry_date}</p>}
                </div>

                {/* Tecnomecánica (opcional) */}
                <div className="space-y-3">
                    <p className="text-xs font-medium text-slate-500">Tecnomecánica (opcional)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FileUpload label="Tecnomecánica" value={(data.tecnomecanica as File | null) ?? null} onChange={(f) => update('tecnomecanica', f)} disabled={loading} hint="Si tu vehículo lo requiere" />
                        {data.tecnomecanica && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de vencimiento</label>
                                <input type="date" value={data.tecnomecanica_expiry_date ?? ''} onChange={(e) => update('tecnomecanica_expiry_date', e.target.value)} disabled={loading} min={new Date().toISOString().split('T')[0]} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white" />
                            </div>
                        )}
                    </div>
                </div>

                {showCompany && (
                    <div>
                        <FileUpload label="Cámara de Comercio" value={(data.camara_comercio as File | null) ?? null} onChange={(f) => update('camara_comercio', f)} disabled={loading} hint="Para servicio especial y taxi plus" />
                    </div>
                )}
            </div>

            <div className="flex gap-3">
                <button type="button" onClick={onBack} disabled={loading} className="flex-1 py-3 px-4 border border-slate-300 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50">← Atrás</button>
                <button type="button" onClick={() => { if (validate()) onNext(); }} disabled={loading} className="flex-1 py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors disabled:opacity-50">
                    {showCompany ? 'Continuar →' : 'Finalizar registro'}
                </button>
            </div>
        </div>
    );
};

export default Step3Vehicle;
