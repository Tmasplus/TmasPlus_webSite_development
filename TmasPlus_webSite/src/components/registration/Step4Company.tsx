import React from 'react';
import { FloatingInput } from '@/components/ui/FloatingField';
import type { CompanyData } from '@/config/database.types';

interface Step4Props {
    data: CompanyData;
    onChange: (data: CompanyData) => void;
    onSubmit: () => void;
    onBack: () => void;
    loading?: boolean;
}

export const Step4Company: React.FC<Step4Props> = ({ data, onChange, onSubmit, onBack, loading = false }) => {
    const update = (key: keyof CompanyData, value: string) => onChange({ ...data, [key]: value });

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-lg font-semibold text-[#002f45]">Datos de la Empresa</h2>
                <p className="text-sm text-slate-500 mt-0.5">Para servicio especial y taxi plus (opcional)</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-amber-700">Este paso es opcional. Si no tienes empresa, puedes hacer clic en "Finalizar" directamente.</p>
            </div>

            <div className="space-y-4">
                <FloatingInput id="razonSocial" label="Razón social / Nombre empresa" value={data.razonSocial ?? ''} onChange={(e) => update('razonSocial', e.target.value)} disabled={loading} />
                <div className="grid grid-cols-2 gap-3">
                    <FloatingInput id="nit" label="NIT" value={data.nit ?? ''} onChange={(e) => update('nit', e.target.value)} disabled={loading} />
                    <FloatingInput id="ciudad" label="Ciudad" value={data.ciudad ?? ''} onChange={(e) => update('ciudad', e.target.value)} disabled={loading} />
                </div>
                <FloatingInput id="direccion" label="Dirección" value={data.direccion ?? ''} onChange={(e) => update('direccion', e.target.value)} disabled={loading} />

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide pt-1">Representante Legal</p>
                <FloatingInput id="nombreRepresentante" label="Nombre del representante legal" value={data.nombreRepresentante ?? ''} onChange={(e) => update('nombreRepresentante', e.target.value)} disabled={loading} />
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de documento</label>
                        <select value={data.tipoDocumentoRepresentante ?? ''} onChange={(e) => update('tipoDocumentoRepresentante', e.target.value)} disabled={loading} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white">
                            <option value="">Seleccionar</option>
                            <option value="CC">Cédula de Ciudadanía</option>
                            <option value="CE">Cédula de Extranjería</option>
                            <option value="PA">Pasaporte</option>
                            <option value="NIT">NIT</option>
                        </select>
                    </div>
                    <FloatingInput id="numeroDocumentoRepresentante" label="Número de documento" value={data.numeroDocumentoRepresentante ?? ''} onChange={(e) => update('numeroDocumentoRepresentante', e.target.value)} disabled={loading} />
                </div>
            </div>

            <div className="flex gap-3">
                <button type="button" onClick={onBack} disabled={loading} className="flex-1 py-3 px-4 border border-slate-300 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors disabled:opacity-50">← Atrás</button>
                <button type="button" onClick={onSubmit} disabled={loading} className="flex-1 py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? (
                        <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Registrando...</>
                    ) : '✓ Finalizar registro'}
                </button>
            </div>
        </div>
    );
};

export default Step4Company;
