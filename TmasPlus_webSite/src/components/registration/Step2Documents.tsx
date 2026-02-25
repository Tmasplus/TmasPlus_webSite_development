import React, { useState } from 'react';
import { FloatingInput } from '@/components/ui/FloatingField';
import { FileUpload } from '@/components/ui/FileUpload';
import type { DriverRegistrationStep2 } from '@/config/database.types';

interface Step2Props {
    data: Partial<DriverRegistrationStep2>;
    onChange: (data: Partial<DriverRegistrationStep2>) => void;
    onNext: () => void;
    onBack: () => void;
    loading?: boolean;
}

export const Step2Documents: React.FC<Step2Props> = ({ data, onChange, onNext, onBack, loading = false }) => {
    const [errors, setErrors] = useState<Record<string, string>>({});

    const update = (key: keyof DriverRegistrationStep2, value: string | File | null) => {
        onChange({ ...data, [key]: value });
        if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!data.license_number?.trim()) newErrors.license_number = 'El número de licencia es requerido';
        if (!data.cedula_frente) newErrors.cedula_frente = 'Requerida';
        if (!data.cedula_posterior) newErrors.cedula_posterior = 'Requerida';
        if (!data.licencia_frente) newErrors.licencia_frente = 'Requerida';
        if (!data.licencia_posterior) newErrors.licencia_posterior = 'Requerida';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-[#002f45]">Documentos del Conductor</h2>
                <p className="text-sm text-slate-500 mt-0.5">Sube fotos claras de tus documentos</p>
            </div>

            <div>
                <FloatingInput id="license_number" label="Número de licencia de conducción" value={data.license_number ?? ''} onChange={(e) => update('license_number', e.target.value)} disabled={loading} required />
                {errors.license_number && <p className="mt-1 text-xs text-red-500">{errors.license_number}</p>}
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cédula de Ciudadanía</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <FileUpload label="Cédula — Frente" value={data.cedula_frente ?? null} onChange={(f) => update('cedula_frente', f as File)} disabled={loading} required hint="Foto nítida del frente de tu cédula" />
                        {errors.cedula_frente && <p className="mt-1 text-xs text-red-500">{errors.cedula_frente}</p>}
                    </div>
                    <div>
                        <FileUpload label="Cédula — Posterior" value={data.cedula_posterior ?? null} onChange={(f) => update('cedula_posterior', f as File)} disabled={loading} required hint="Foto nítida del reverso de tu cédula" />
                        {errors.cedula_posterior && <p className="mt-1 text-xs text-red-500">{errors.cedula_posterior}</p>}
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Licencia de Conducción</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <FileUpload label="Licencia — Frente" value={data.licencia_frente ?? null} onChange={(f) => update('licencia_frente', f as File)} disabled={loading} required hint="Foto nítida del frente de tu licencia" />
                        {errors.licencia_frente && <p className="mt-1 text-xs text-red-500">{errors.licencia_frente}</p>}
                    </div>
                    <div>
                        <FileUpload label="Licencia — Posterior" value={data.licencia_posterior ?? null} onChange={(f) => update('licencia_posterior', f as File)} disabled={loading} required hint="Foto nítida del reverso de tu licencia" />
                        {errors.licencia_posterior && <p className="mt-1 text-xs text-red-500">{errors.licencia_posterior}</p>}
                    </div>
                </div>
            </div>

            <div className="flex gap-3">
                <button type="button" onClick={onBack} disabled={loading} className="flex-1 py-3 px-4 border border-slate-300 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50">← Atrás</button>
                <button type="button" onClick={() => { if (validate()) onNext(); }} disabled={loading} className="flex-1 py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors disabled:opacity-50">Continuar →</button>
            </div>
        </div>
    );
};

export default Step2Documents;
