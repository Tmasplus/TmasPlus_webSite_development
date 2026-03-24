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
    const [validating, setValidating] = useState({ email: false, mobile: false, referral: false });
    const [phonePrefix, setPhonePrefix] = useState('+57');

    const update = (key: string, value: string) => {
        onChange({ ...data, [key]: value });
        if (errors[key]) setErrors((e) => ({ ...e, [key]: '' }));
    };

    const validateEmailStrict = (email: string) => {
        if (!email) return 'El email es requerido';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Formato inválido (ej: usuario@correo.com)';
        const domain = email.split('@')[1]?.toLowerCase();
        if (DISPOSABLE_DOMAINS.includes(domain)) return 'No se permiten correos temporales';
        return null;
    };

    const validateMobileStrict = (mobile: string, prefix: string) => {
        if (!mobile) return 'El teléfono es requerido';
        if (prefix === '+57') {
            if (!mobile.startsWith('3')) return 'Debe iniciar con 3';
            if (mobile.length !== 10) return `Debe tener 10 dígitos (tiene ${mobile.length})`;
        } else {
            if (mobile.length < 8 || mobile.length > 15) return 'Número inválido';
        }
        return null;
    };

    const handleEmailBlur = async () => {
        const emailErr = validateEmailStrict(data.email ?? '');
        if (emailErr) {
            setErrors(e => ({ ...e, email: emailErr }));
            return;
        }
        setValidating(v => ({ ...v, email: true }));
        try {
            const { data: result } = await supabase.rpc('check_user_availability', {
                p_email: data.email!.trim().toLowerCase()
            });
            if (result?.email_exists) {
                setErrors(e => ({ ...e, email: 'Este correo ya está registrado' }));
            }
        } finally {
            setValidating(v => ({ ...v, email: false }));
        }
    };

    const handleMobileBlur = async () => {
        const mobErr = validateMobileStrict(data.mobile ?? '', phonePrefix);
        if (mobErr) {
            setErrors(e => ({ ...e, mobile: mobErr }));
            return;
        }
        setValidating(v => ({ ...v, mobile: true }));
        try {
            const { data: result } = await supabase.rpc('check_user_availability', {
                p_mobile: data.mobile!.trim()
            });
            if (result?.mobile_exists) {
                setErrors(e => ({ ...e, mobile: 'Este número ya está registrado' }));
            }
        } finally {
            setValidating(v => ({ ...v, mobile: false }));
        }
    };

    const handleReferralBlur = async () => {
        if (!data.referral_code || data.referral_code.trim() === '') return;
        setValidating(v => ({ ...v, referral: true }));
        const isValid = await referralsService.checkCodeValidity(data.referral_code);
        if (!isValid) {
            setErrors(e => ({ ...e, referral_code: 'Código inválido o inactivo' }));
        }
        setValidating(v => ({ ...v, referral: false }));
    };

    const validate = (): boolean => {
        const newErrors: Record<string, string> = { ...errors };
        if (!data.first_name?.trim()) newErrors.first_name = 'El nombre es requerido';
        if (!data.last_name?.trim()) newErrors.last_name = 'El apellido es requerido';
        const emailErr = validateEmailStrict(data.email ?? '');
        if (emailErr) newErrors.email = emailErr;
        const mobErr = validateMobileStrict(data.mobile ?? '', phonePrefix);
        if (mobErr) newErrors.mobile = mobErr;
        if (!data.password) newErrors.password = 'La contraseña es requerida';
        else if (data.password.length < 6) newErrors.password = 'Mínimo 6 caracteres';
        if (!data.confirmPassword) newErrors.confirmPassword = 'Confirma tu contraseña';
        else if (data.password !== data.confirmPassword) newErrors.confirmPassword = 'Las contraseñas no coinciden';
        if (!data.city) newErrors.city = 'Selecciona una ciudad';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // NUEVO: Interceptor inteligente de envío
    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Si el usuario da clic mientras se valida el onBlur, lo ignoramos un milisegundo en vez de desactivar el botón.
        if (validating.email || validating.mobile || validating.referral) {
            return;
        }

        if (validate()) {
            onNext();
        }
    };

    return (
        <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
                <h2 className="text-lg font-semibold text-[#002f45]">Datos Personales</h2>
                <p className="text-sm text-slate-500 mt-0.5">Información básica del conductor</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FloatingInput id="first_name" label="Nombre" value={data.first_name ?? ''} onChange={(e) => update('first_name', e.target.value)} disabled={loading} required error={errors.first_name} />
                <FloatingInput id="last_name" label="Apellido" value={data.last_name ?? ''} onChange={(e) => update('last_name', e.target.value)} disabled={loading} required error={errors.last_name} />
            </div>

            <div onBlur={handleEmailBlur}>
                <FloatingInput id="email" label="Correo electrónico" type="email" value={data.email ?? ''} onChange={(e) => update('email', e.target.value)} disabled={loading} required autoComplete="email" error={errors.email} helpText={validating.email ? "Verificando..." : ""} />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Teléfono móvil <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2" onBlur={handleMobileBlur}>
                    <div className="w-28 shrink-0">
                        <select
                            value={phonePrefix}
                            onChange={(e) => setPhonePrefix(e.target.value)}
                            disabled={loading}
                            className={`w-full h-[46px] rounded-xl border px-2 text-sm outline-none transition bg-white text-slate-700 ${errors.mobile ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-2 focus:ring-sky-400'}`}
                        >
                            {COUNTRY_CODES.map(c => (
                                <option key={c.code} value={c.code}>{c.country} {c.code}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1">
                        <FloatingInput
                            id="mobile"
                            label="Número (sin prefijo)"
                            type="tel"
                            value={data.mobile ?? ''}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                const finalVal = phonePrefix === '+57' ? val.slice(0, 10) : val.slice(0, 15);
                                update('mobile', finalVal);
                            }}
                            disabled={loading}
                            required
                            error={errors.mobile}
                            helpText={validating.mobile ? "Verificando..." : ""}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <FloatingInput id="password" label="Contraseña" type="password" value={data.password ?? ''} onChange={(e) => update('password', e.target.value)} disabled={loading} required autoComplete="new-password" error={errors.password} />
                <FloatingInput id="confirmPassword" label="Confirmar" type="password" value={data.confirmPassword ?? ''} onChange={(e) => update('confirmPassword', e.target.value)} disabled={loading} required autoComplete="new-password" error={errors.confirmPassword} />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                    Ciudad <span className="text-red-500">*</span>
                </label>
                <select
                    value={data.city ?? ''}
                    onChange={(e) => update('city', e.target.value)}
                    disabled={loading}
                    className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition bg-white text-slate-700 ${errors.city ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-2 focus:ring-sky-400'}`}
                >
                    <option value="">Selecciona tu ciudad</option>
                    {CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
                {errors.city && <p className="mt-1 text-xs text-red-600 font-semibold">{errors.city}</p>}
            </div>

            <div onBlur={handleReferralBlur}>
                <FloatingInput
                    id="referral_code"
                    label="Código de referido (opcional)"
                    value={data.referral_code ?? ''}
                    onChange={(e) => update('referral_code', e.target.value.toUpperCase())}
                    disabled={loading}
                    error={errors.referral_code}
                    helpText={validating.referral ? "Verificando..." : (errors.referral_code ? "" : "Si un conductor te recomendó, ingresa su código aquí")}
                />
            </div>

            <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors disabled:opacity-50"
            >
                {loading ? 'Procesando...' : 'Continuar →'}
            </button>
        </form>
    );
};

export default Step1PersonalData;