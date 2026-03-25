import React, { useState } from 'react';
import { FloatingInput } from '@/components/ui/FloatingField';
import type { DriverRegistrationStep1 } from '@/config/database.types';
import { referralsService } from '@/services/referrals.service'; 
import { supabase } from '@/config/supabase';

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

const DISPOSABLE_DOMAINS = [
    'yopmail.com', 'mailinator.com', 'tempmail.com', '10minutemail.com',
    'guerrillamail.com', 'sharklasers.com', 'trashmail.com', 'throwawaymail.com',
    'temp-mail.org', 'fakeinbox.com', 'nada.ltd', 'getnada.com', 'mohmal.com'
];

const COUNTRY_CODES = [
    { code: '+57', country: 'CO' },
    { code: '+51', country: 'PE' },
    { code: '+52', country: 'MX' },
    { code: '+54', country: 'AR' },
    { code: '+56', country: 'CL' },
    { code: '+593', country: 'EC' },
    { code: '+58', country: 'VE' },
    { code: '+1', country: 'US' },
];

export const Step1PersonalData: React.FC<Step1Props> = ({ data, onChange, onNext, loading = false }) => {
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isValidating, setIsValidating] = useState(false);
    const [phonePrefix, setPhonePrefix] = useState('+57');

    const update = (key: string, value: string) => {
        onChange({ ...data, [key]: value });
        if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
    };

    // Computa si todos los campos requeridos tienen al menos 1 caracter
    const isFormFilled = !!(
        data.first_name?.trim() && 
        data.last_name?.trim() && 
        data.email?.trim() && 
        data.mobile?.trim() && 
        data.password && 
        data.confirmPassword && 
        data.city
    );

    const validateFormat = (): boolean => {
        const newErrors: Record<string, string> = {}; 
        
        // Email
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email!)) newErrors.email = 'Formato inválido';
        const domain = data.email!.split('@')[1]?.toLowerCase();
        if (DISPOSABLE_DOMAINS.includes(domain)) newErrors.email = 'No se permiten correos temporales';

        // Móvil
        if (phonePrefix === '+57') {
            if (!data.mobile!.startsWith('3')) newErrors.mobile = 'Debe iniciar con 3';
            if (data.mobile!.length !== 10) newErrors.mobile = 'Debe tener 10 dígitos';
        } else if (data.mobile!.length < 8) {
            newErrors.mobile = 'Número muy corto';
        }

        // Passwords
        if (data.password!.length < 6) newErrors.password = 'Mínimo 6 caracteres';
        if (data.password !== data.confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Bloqueo de seguridad
        if (!isFormFilled || loading || isValidating) return;
        if (!validateFormat()) return;

        setIsValidating(true);
        try {
            // 1. Verificar Email en BD
            const { data: emailData } = await supabase.rpc('check_user_availability', { p_email: data.email!.trim().toLowerCase() });
            if (emailData?.email_exists) {
                setErrors(e => ({ ...e, email: 'Este correo ya está registrado' }));
                setIsValidating(false);
                return;
            }

            // 2. Verificar Teléfono en BD
            const mobileVal = phonePrefix === '+57' ? data.mobile!.slice(0, 10) : data.mobile!;
            const { data: phoneData } = await supabase.rpc('check_user_availability', { p_mobile: mobileVal });
            if (phoneData?.mobile_exists) {
                setErrors(e => ({ ...e, mobile: 'Este número ya está registrado' }));
                setIsValidating(false);
                return;
            }

            // 3. Verificar Referido
            if (data.referral_code?.trim()) {
                const isValid = await referralsService.checkCodeValidity(data.referral_code);
                if (!isValid) {
                    setErrors(e => ({ ...e, referral_code: 'Código inválido o inactivo' }));
                    setIsValidating(false);
                    return;
                }
            }

            // Si todo pasa, avanzamos al Paso 2
            onNext();
        } catch (error) {
            console.error('Error validando:', error);
        } finally {
            setIsValidating(false); // Solo se apaga si hubo error, si no, el componente se desmonta.
        }
    };

    return (
        <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-[#002f45]">Datos Personales</h2>
                <p className="text-sm text-slate-500 mt-0.5">Información básica del conductor</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FloatingInput id="first_name" label="Nombre" value={data.first_name ?? ''} onChange={(e) => update('first_name', e.target.value)} disabled={loading || isValidating} required error={errors.first_name} />
                <FloatingInput id="last_name" label="Apellido" value={data.last_name ?? ''} onChange={(e) => update('last_name', e.target.value)} disabled={loading || isValidating} required error={errors.last_name} />
            </div>

            <FloatingInput id="email" label="Correo electrónico" type="email" value={data.email ?? ''} onChange={(e) => update('email', e.target.value)} disabled={loading || isValidating} required autoComplete="email" error={errors.email} />

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Teléfono móvil <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                    <div className="w-28 shrink-0">
                        <select value={phonePrefix} onChange={(e) => setPhonePrefix(e.target.value)} disabled={loading || isValidating} className="w-full h-[46px] rounded-xl border px-2 text-sm outline-none transition bg-white text-slate-700 border-slate-300 focus:ring-2 focus:ring-sky-400">
                            {COUNTRY_CODES.map(c => (
                                <option key={c.code} value={c.code}>{c.country} {c.code}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <FloatingInput id="mobile" label="Número (sin prefijo)" type="tel" value={data.mobile ?? ''} onChange={(e) => update('mobile', e.target.value.replace(/\D/g, ''))} disabled={loading || isValidating} required error={errors.mobile} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FloatingInput id="password" label="Contraseña" type="password" value={data.password ?? ''} onChange={(e) => update('password', e.target.value)} disabled={loading || isValidating} required autoComplete="new-password" error={errors.password} />
                <FloatingInput id="confirmPassword" label="Confirmar" type="password" value={data.confirmPassword ?? ''} onChange={(e) => update('confirmPassword', e.target.value)} disabled={loading || isValidating} required autoComplete="new-password" error={errors.confirmPassword} />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad <span className="text-red-500">*</span></label>
                <select value={data.city ?? ''} onChange={(e) => update('city', e.target.value)} disabled={loading || isValidating} className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition bg-white text-slate-700 ${errors.city ? 'border-red-400' : 'border-slate-300 focus:ring-2 focus:ring-sky-400'}`}>
                    <option value="">Selecciona tu ciudad</option>
                    {CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                {errors.city && <p className="mt-1 text-xs text-red-600 font-semibold">{errors.city}</p>}
            </div>

            <FloatingInput id="referral_code" label="Código de referido (opcional)" value={data.referral_code ?? ''} onChange={(e) => update('referral_code', e.target.value.toUpperCase())} disabled={loading || isValidating} error={errors.referral_code} />

            <button 
                type="submit" 
                // El botón solo se enciende si todos los campos están llenos
                disabled={!isFormFilled || loading || isValidating} 
                className="w-full py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isValidating ? 'Verificando datos...' : loading ? 'Procesando...' : 'Continuar →'}
            </button>
        </form>
    );
};

export default Step1PersonalData;