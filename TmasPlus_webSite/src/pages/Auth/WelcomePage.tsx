import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { supabase } from '@/config/supabase';
import { toast } from '@/utils/toast';
import logo from '@/assets/Logo-v3.png';

// Resultado real del enlace de verificación del correo.
type LinkOutcome = 'checking' | 'verified' | 'expired' | 'failed' | 'unknown';

// Supabase devuelve el resultado en el hash (flujo implícito) o en la query (PKCE).
const readLinkParams = (): URLSearchParams => {
    const params = new URLSearchParams(window.location.search);
    new URLSearchParams(window.location.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
    return params;
};

const detectOutcome = async (): Promise<LinkOutcome> => {
    const params = readLinkParams();

    if (params.get('error') || params.get('error_code') || params.get('error_description')) {
        const code = params.get('error_code') ?? '';
        const description = params.get('error_description') ?? '';
        return code === 'otp_expired' || /expired|invalid/i.test(description) ? 'expired' : 'failed';
    }

    if (params.get('access_token') || params.get('code')) {
        // getSession espera a que el cliente termine de procesar el enlace.
        const { data: { session } } = await supabase.auth.getSession();
        return session?.user?.email_confirmed_at ? 'verified' : 'failed';
    }

    // Se abrió /welcome sin pasar por un enlace de verificación: no afirmamos nada.
    return 'unknown';
};

const VIEW: Record<Exclude<LinkOutcome, 'checking'>, {
    title: string;
    badge: string;
    badgeClass: string;
    iconBg: string;
    path: string;
}> = {
    verified: {
        title: '¡Bienvenido a T+Plus!',
        badge: '✓ Tu correo fue verificado con éxito',
        badgeClass: 'text-green-600',
        iconBg: 'bg-green-100 text-green-500',
        path: 'M5 13l4 4L19 7',
    },
    expired: {
        title: 'Enlace vencido',
        badge: 'Tu correo NO fue verificado',
        badgeClass: 'text-red-600',
        iconBg: 'bg-red-100 text-red-500',
        path: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    failed: {
        title: 'No pudimos verificar tu correo',
        badge: 'Tu correo NO fue verificado',
        badgeClass: 'text-red-600',
        iconBg: 'bg-red-100 text-red-500',
        path: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    unknown: {
        title: 'Verificación de correo',
        badge: 'No encontramos un enlace de verificación',
        badgeClass: 'text-amber-600',
        iconBg: 'bg-amber-100 text-amber-500',
        path: 'M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z',
    },
};

// Pasos posteriores al registro, en este orden. Las imágenes (public/welcome-steps/)
// ya traen sus instrucciones; el título es el resumen y el alt para accesibilidad.
const NEXT_STEPS = [
    { title: 'Crea tu vehículo', image: '/welcome-steps/paso-1.jpg' },
    { title: 'Sube tus documentos', image: '/welcome-steps/paso-2.jpg' },
    { title: 'Agrega tu foto de perfil', image: '/welcome-steps/paso-3.jpg' },
];

// Carrusel de un paso por vez: se desliza en móvil y tiene flechas en escritorio.
// Las imágenes llevan texto, por eso se muestran grandes en vez de en fila.
const NextSteps: React.FC = () => {
    const [active, setActive] = useState(0);
    const [broken, setBroken] = useState<Record<number, boolean>>({});
    const trackRef = React.useRef<HTMLDivElement>(null);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        setActive(Math.round(el.scrollLeft / el.clientWidth));
    };

    const goTo = (index: number) => {
        const el = trackRef.current;
        if (!el) return;
        setActive(index);
        el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    };

    return (
        <div className="text-left">
            <p className="text-sm font-bold text-sky-800 mb-3 text-center">
                Tus próximos pasos <span className="font-normal text-slate-400">· {active + 1} de {NEXT_STEPS.length}</span>
            </p>
            <div
                ref={trackRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
                {NEXT_STEPS.map((step, i) => (
                    <div key={step.title} className="snap-center shrink-0 w-full px-1">
                        {broken[i] ? (
                            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-center">
                                <p className="text-sm font-bold text-sky-800">
                                    <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 rounded-full bg-[#00a7f5] text-white text-xs">{i + 1}</span>
                                    {step.title}
                                </p>
                            </div>
                        ) : (
                            <img
                                src={step.image}
                                alt={`Paso ${i + 1}: ${step.title}`}
                                loading={i === 0 ? 'eager' : 'lazy'}
                                onError={() => setBroken((b) => ({ ...b, [i]: true }))}
                                className="mx-auto w-full max-h-[70vh] object-contain rounded-xl border border-sky-100"
                            />
                        )}
                    </div>
                ))}
            </div>
            <div className="flex items-center justify-center gap-3 mt-3">
                <button
                    onClick={() => goTo(active - 1)}
                    disabled={active === 0}
                    aria-label="Paso anterior"
                    className="hidden md:block px-2 text-sky-700 disabled:opacity-30"
                >‹</button>
                {NEXT_STEPS.map((step, i) => (
                    <button
                        key={step.title}
                        onClick={() => goTo(i)}
                        aria-label={`Ir al paso ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all ${i === active ? 'w-4 bg-[#00a7f5]' : 'w-1.5 bg-sky-200'}`}
                    />
                ))}
                <button
                    onClick={() => goTo(active + 1)}
                    disabled={active === NEXT_STEPS.length - 1}
                    aria-label="Paso siguiente"
                    className="hidden md:block px-2 text-sky-700 disabled:opacity-30"
                >›</button>
            </div>
        </div>
    );
};

export const WelcomePage: React.FC = () => {
    const navigate = useNavigate();
    const [outcome, setOutcome] = useState<LinkOutcome>('checking');
    const [email, setEmail] = useState('');
    const [resending, setResending] = useState(false);
    const [resent, setResent] = useState(false);

    useEffect(() => {
        let active = true;
        detectOutcome()
            .catch((error) => {
                console.error('Error verificando el enlace de correo:', error);
                return 'failed' as LinkOutcome;
            })
            .then((result) => { if (active) setOutcome(result); });
        return () => { active = false; };
    }, []);

    const handleResend = async () => {
        const target = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
            toast.error('Escribe un correo válido.');
            return;
        }
        try {
            setResending(true);
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email: target,
                options: { emailRedirectTo: `${window.location.origin}/welcome` },
            });
            if (error) throw error;
            setResent(true);
        } catch (error: any) {
            toast.error(error?.message || 'No se pudo enviar el enlace. Intenta de nuevo en unos minutos.');
        } finally {
            setResending(false);
        }
    };

    if (outcome === 'checking') {
        return (
            <div className="min-h-screen bg-[#002f45] flex justify-center items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div>
            </div>
        );
    }

    const view = VIEW[outcome];
    const canRetry = outcome === 'expired' || outcome === 'failed';

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#002f45] to-[#00a7f5] px-4 py-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('/bg-pattern.svg')] bg-cover opacity-10" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-2xl p-8"
            >
                <div className="flex flex-col items-center mb-6">
                    <motion.img
                        src={logo}
                        alt="T+ Logo"
                        className="w-16 h-16 mb-3"
                        initial={{ scale: 0.6, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 180, damping: 12 }}
                    />
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className={`w-20 h-20 ${view.iconBg} rounded-full flex items-center justify-center mb-4 shadow-inner`}
                    >
                        <svg
                            className="w-10 h-10"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2.5"
                                d={view.path}
                            />
                        </svg>
                    </motion.div>

                    <h1 className="text-2xl md:text-3xl font-extrabold text-[#002f45] text-center">
                        {view.title}
                    </h1>
                    <p className={`text-sm font-semibold mt-2 text-center ${view.badgeClass}`}>
                        {view.badge}
                    </p>
                </div>

                <div className="space-y-4 text-center">
                    {outcome === 'verified' && (
                        <>
                            <p className="text-base text-slate-700 leading-relaxed">
                                Tu cuenta ya está{' '}
                                <b className="text-[#002f45]">activa y verificada</b>. Estás a
                                un único paso de empezar a generar ingresos con T+Plus.
                            </p>

                            <NextSteps />
                        </>
                    )}

                    {outcome === 'expired' && (
                        <>
                            <p className="text-base text-slate-700 leading-relaxed">
                                Este enlace <b className="text-[#002f45]">expiró o ya fue usado</b>,
                                por eso no pudimos verificar tu correo con él.
                            </p>
                            <p className="text-sm text-slate-500">
                                Si ya habías verificado tu correo antes, solo inicia sesión. Si no,
                                solicita un enlace nuevo aquí abajo.
                            </p>
                        </>
                    )}

                    {outcome === 'failed' && (
                        <p className="text-base text-slate-700 leading-relaxed">
                            Ocurrió un problema al procesar el enlace y tu correo{' '}
                            <b className="text-[#002f45]">no quedó verificado</b>. Puedes solicitar
                            un enlace nuevo o iniciar sesión si ya lo habías verificado.
                        </p>
                    )}

                    {outcome === 'unknown' && (
                        <p className="text-base text-slate-700 leading-relaxed">
                            Esta página se abre desde el enlace que te enviamos al correo. Si aún
                            no verificaste tu cuenta, revisa tu bandeja de entrada (y el spam).
                        </p>
                    )}

                    {canRetry && (
                        resent ? (
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                                Si ese correo tiene una verificación pendiente, te enviamos un
                                enlace nuevo. Revisa tu bandeja de entrada y el spam.
                            </div>
                        ) : (
                            <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-left space-y-3">
                                <label htmlFor="resend-email" className="text-sm font-bold text-sky-800">
                                    Recibir un enlace nuevo
                                </label>
                                <input
                                    id="resend-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="tu@correo.com"
                                    className="w-full px-3 py-2 border border-sky-200 rounded-lg text-sm"
                                />
                                <button
                                    onClick={handleResend}
                                    disabled={resending || !email.trim()}
                                    className="w-full py-2.5 bg-[#00a7f5] text-white rounded-xl font-semibold text-sm disabled:opacity-50"
                                >
                                    {resending ? 'Enviando…' : 'Enviar enlace nuevo'}
                                </button>
                            </div>
                        )
                    )}
                </div>

                <div className="mt-7 flex flex-col gap-3">
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full py-3 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors shadow-md"
                    >
                        {outcome === 'verified' ? 'Ingresar ahora' : 'Ir al inicio de sesión'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default WelcomePage;
