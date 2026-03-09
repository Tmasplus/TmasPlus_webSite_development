import React, { useState } from 'react';
import { FloatingInput } from '@/components/ui/FloatingField';
import type { DriverRegistrationStep1 } from '@/config/database.types';
import { UsersService } from '@/services/users.service';

interface Step1Props {
    data: Partial<DriverRegistrationStep1> & { confirmPassword?: string };
    onChange: (data: Partial<DriverRegistrationStep1> & { confirmPassword?: string }) => void;
    onNext: () => void;
    loading?: boolean;
}

const CITIES = [
    'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Cartagena',
    'Cúcuta', 'Bucaramanga', 'Pereira', 'Santa Marta', 'Ibagué',
    'Manizales', 'Pasto', 'Neiva', 'Villavicencio', 'Armenia',
    'Valledupar', 'Montería', 'Sincelejo', 'Popayán', 'Tunja',
];

export const Step1PersonalData: React.FC<Step1Props> = ({ data, onChange, onNext, loading = false }) => {
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [validating, setValidating] = useState({ email: false, mobile: false });

    const update = (key: string, value: string) => {
        onChange({ ...data, [key]: value });
        if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
    };

    // Validación en tiempo real para el Correo
    const handleEmailBlur = async () => {
        if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return;
        setValidating(v => ({ ...v, email: true }));
        try {
            const exists = await UsersService.emailExists(data.email.trim().toLowerCase());
            if (exists) setErrors(e => ({ ...e, email: 'Este correo ya está registrado en T+Plus' }));
        } finally {
            setValidating(v => ({ ...v, email: false }));
        }
    };

    // Validación en tiempo real para el Teléfono
    const handleMobileBlur = async () => {
        if (!data.mobile || !/^\d{7,15}$/.test(data.mobile.replace(/\s/g, ''))) return;
        setValidating(v => ({ ...v, mobile: true }));
        try {
            const exists = await UsersService.phoneExists(data.mobile.trim());
            if (exists) setErrors(e => ({ ...e, mobile: 'Este número de teléfono ya está registrado' }));
        } finally {
            setValidating(v => ({ ...v, mobile: false }));
        }
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = { ...errors }; // Mantener errores de duplicidad si existen
        if (!data.first_name?.trim()) newErrors.first_name = 'El nombre es requerido';
        if (!data.last_name?.trim()) newErrors.last_name = 'El apellido es requerido';
        if (!data.email?.trim()) newErrors.email = newErrors.email || 'El email es requerido';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) newErrors.email = 'Formato de email inválido';
        if (!data.mobile?.trim()) newErrors.mobile = newErrors.mobile || 'El teléfono es requerido';
        else if (!/^\d{7,15}$/.test(data.mobile.replace(/\s/g, ''))) newErrors.mobile = 'Número de teléfono inválido';
        if (!data.password) newErrors.password = 'La contraseña es requerida';
        else if (data.password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
        if (!data.confirmPassword) newErrors.confirmPassword = 'Confirma tu contraseña';
        else if (data.password !== data.confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';
        if (!data.city) newErrors.city = 'Selecciona una ciudad';

        setErrors(newErrors);
        // Retorna verdadero solo si no hay ningún error (incluyendo los de duplicidad)
        return Object.keys(newErrors).length === 0;
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-[#002f45]">Datos Personales</h2>
                <p className="text-sm text-slate-500 mt-0.5">Información básica del conductor</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <FloatingInput id="first_name" label="Nombre" value={data.first_name ?? ''} onChange={(e) => update('first_name', e.target.value)} disabled={loading} required />
                    {errors.first_name && <p className="mt-1 text-xs text-red-500">{errors.first_name}</p>}
                </div>
                <div>
                    <FloatingInput id="last_name" label="Apellido" value={data.last_name ?? ''} onChange={(e) => update('last_name', e.target.value)} disabled={loading} required />
                    {errors.last_name && <p className="mt-1 text-xs text-red-500">{errors.last_name}</p>}
                </div>
            </div>

            <div>
                <div onBlur={handleEmailBlur}>
                    <FloatingInput id="email" label="Correo electrónico" type="email" value={data.email ?? ''} onChange={(e) => update('email', e.target.value)} disabled={loading || validating.email} required autoComplete="email" />
                </div>
                {validating.email && <p className="mt-1 text-xs text-blue-500">Verificando disponibilidad...</p>}
                {errors.email && <p className="mt-1 text-xs text-red-500 font-semibold">{errors.email}</p>}
            </div>

            <div>
                <div onBlur={handleMobileBlur}>
                    <FloatingInput id="mobile" label="Teléfono móvil" type="tel" value={data.mobile ?? ''} onChange={(e) => update('mobile', e.target.value)} disabled={loading || validating.mobile} required />
                </div>
                {validating.mobile && <p className="mt-1 text-xs text-blue-500">Verificando disponibilidad...</p>}
                {errors.mobile && <p className="mt-1 text-xs text-red-500 font-semibold">{errors.mobile}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <FloatingInput id="password" label="Contraseña" type="password" value={data.password ?? ''} onChange={(e) => update('password', e.target.value)} disabled={loading} required autoComplete="new-password" />
                    {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                </div>
                <div>
                    <FloatingInput id="confirmPassword" label="Confirmar contraseña" type="password" value={data.confirmPassword ?? ''} onChange={(e) => update('confirmPassword', e.target.value)} disabled={loading} required autoComplete="new-password" />
                    {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad <span className="text-red-500">*</span></label>
                <select value={data.city ?? ''} onChange={(e) => update('city', e.target.value)} disabled={loading} className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-400 bg-white text-slate-700">
                    <option value="">Selecciona tu ciudad</option>
                    {CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
            </div>

            <div>
                <FloatingInput id="referral_code" label="Código de referido (opcional)" value={data.referral_code ?? ''} onChange={(e) => update('referral_code', e.target.value.toUpperCase())} disabled={loading} />
                <p className="mt-1 text-xs text-slate-400">Si un conductor te recomendó, ingresa su código aquí</p>
            </div>

            <button type="button" onClick={() => { if (validate()) onNext(); }} disabled={loading || validating.email || validating.mobile} className="w-full py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors disabled:opacity-50">
                Continuar →
            </button>
        </div>
    );
};

export default Step1PersonalData;