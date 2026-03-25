import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/config/supabase';
import { StepIndicator } from '@/components/registration/StepIndicator';
import { Step1PersonalData } from '@/components/registration/Step1PersonalData';
import { Step2Documents } from '@/components/registration/Step2Documents';
import { Step3Vehicle } from '@/components/registration/Step3Vehicle';
import { Step4Company } from '@/components/registration/Step4Company';
import { DriversService } from '@/services/drivers.service';
import { UsersService } from '@/services/users.service';
import { toast } from '@/utils/toast';
import logo from '@/assets/Logo-v3.png';
import { useAuth } from '@/hooks/useAuth';
import type {
    DriverRegistrationStep1,
    DriverRegistrationStep2,
    DriverRegistrationStep3,
    CompanyData,
} from '@/config/database.types';

type Step1Data = Partial<DriverRegistrationStep1> & { confirmPassword?: string };
type Step2Data = Partial<DriverRegistrationStep2>;
type Step3Data = Partial<DriverRegistrationStep3>;

const ALL_STEPS = [
    { number: 1, label: 'Personal' },
    { number: 2, label: 'Documentos' },
    { number: 3, label: 'Vehículo' },
    { number: 4, label: 'Empresa' },
];

const needsStep4 = (s3: Step3Data) =>
    s3.serviceType === 'servicio_especial' || s3.serviceType === 'taxi_plus';

type PageState =
    | 'LOADING'
    | 'STEP_1'
    | 'VERIFY_WAIT'
    | 'RESUME_REGISTRATION'
    | 'ALREADY_REGISTERED'
    | 'SUCCESS_APP_ONLY'
    | 'LINK_EXPIRED';

export const RegisterDriverPage: React.FC = () => {
    const navigate = useNavigate();

    // Estado de la Máquina
    const [pageState, setPageState] = useState<PageState>('LOADING');
    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(15);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Datos de los formularios
    const [step1, setStep1] = useState<Step1Data>({});
    const [step2, setStep2] = useState<Step2Data>({});
    const [step3, setStep3] = useState<Step3Data>({});
    const [step4, setStep4] = useState<CompanyData>({});

    const { isAuthenticated, profile } = useAuth(); // Extraemos la sesión actual

    // LA MAGIA: Interceptar conductores a medias
    useEffect(() => {
        // Si el usuario ya está logueado, es un conductor y NO está aprobado...
        if (isAuthenticated && profile && profile.user_type === 'driver' && !profile.approved) {
            
            // 1. Rellenamos el estado del Paso 1 con los datos que ya tenemos en la BD
            setStep1(prev => ({
                ...prev,
                first_name: profile.first_name,
                last_name: profile.last_name,
                email: profile.email,
                mobile: profile.mobile ?? undefined,
                city: profile.city ?? undefined,
                referral_code: profile.referral_id ?? undefined
            }));

            // 2. Forzamos el salto automático al Paso 2 (Documentos)
            setCurrentStep(2);
            
            toast.info('Hemos recuperado tu progreso. Por favor, sube tus documentos.');
        }
    }, [isAuthenticated, profile]);

    // NUEVO: EL DISPARADOR SILENCIOSO DEL SEGUNDO CORREO (INSTRUCCIONES / RESCATE)
    useEffect(() => {
        // Si el usuario acaba de iniciar sesión, es un conductor y aún no está aprobado (Paso 2, 3 o 4)
        if (isAuthenticated && profile && profile.user_type === 'driver' && !profile.approved) {
            
            // Usamos localStorage para asegurar que este correo se envíe UNA SOLA VEZ por dispositivo
            const rescueEmailFlag = `rescue_email_sent_${profile.email}`;
            const hasBeenSent = localStorage.getItem(rescueEmailFlag);

            if (!hasBeenSent) {
                localStorage.setItem(rescueEmailFlag, 'true'); // Lo marcamos como enviado
                
                // Disparamos el envío del "Magic Link" silenciosamente de fondo
                supabase.auth.signInWithOtp({
                    email: profile.email,
                    options: {
                        // Asegura que el botón del correo lo regrese a esta página
                        emailRedirectTo: `${window.location.origin}/register-driver`
                    }
                }).then(({ error }) => {
                    if (error) console.error("Error enviando correo de rescate:", error);
                });
            }
        }
    }, [isAuthenticated, profile]);

    const showStep4 = needsStep4(step3);
    const visibleSteps = showStep4 ? ALL_STEPS : ALL_STEPS.filter((s) => s.number !== 4);

    const goNext = () => setCurrentStep((s) => s + 1);
    const goBack = () => setCurrentStep((s) => s - 1);

    // ==================== LÓGICA DE DETECCIÓN DE SESIÓN ====================
    useEffect(() => {
        checkSessionStatus();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session) {
                checkSessionStatus(session.user.id);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const checkSessionStatus = async (userIdOverride?: string) => {
        try {
            // Verificar si el link de confirmación ya expiró o fue usado
            const hash = window.location.hash || window.location.search;
            if (hash.includes('error_description=')) {
                setPageState('LINK_EXPIRED');
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            const uid = userIdOverride || session?.user?.id;

            if (!uid) {
                setPageState('STEP_1');
                return;
            }

            // 🚨 ARREGLO 406: Buscar al usuario real en la tabla por su auth_id
            const dbUser = await UsersService.getUserByAuthId(uid);

            if (!dbUser) {
                setPageState('STEP_1');
                return;
            }

            setCurrentUserId(dbUser.id); // Guardamos el UUID real de la tabla users

            // Validar si le faltan documentos usando el ID real
            const validation = await DriversService.validateRequiredDocuments(dbUser.id);

            if (!validation.valid) {
                setPageState('RESUME_REGISTRATION');
                setCurrentStep(2);
            } else {
                setPageState('ALREADY_REGISTERED');
                await supabase.auth.signOut();
            }
        } catch (error) {
            console.error('Error checking session:', error);
            setPageState('STEP_1');
        }
    };

    // ==================== TEMPORIZADOR DE REDIRECCIÓN ====================
    useEffect(() => {
        // Usamos ReturnType para que TypeScript infiera dinámicamente el tipo correcto 
        // dependiendo de si está compilando para web o para otro entorno.
        let timer: ReturnType<typeof setTimeout>;

        if (pageState === 'SUCCESS_APP_ONLY' && countdown > 0) {
            timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        } else if (pageState === 'SUCCESS_APP_ONLY' && countdown === 0) {
            supabase.auth.signOut().then(() => navigate('/login'));
        }

        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [pageState, countdown, navigate]);

    // ==================== MANEJADORES DE SUBMIT ====================
    const handleStep1Submit = async () => {
        try {
            setLoading(true);
            await DriversService.registerStep1({
                email: step1.email!.trim().toLowerCase(),
                password: step1.password!,
                first_name: step1.first_name!.trim(),
                last_name: step1.last_name!.trim(),
                mobile: step1.mobile!.trim(),
                city: step1.city!,
                referral_code: step1.referral_code?.trim() || undefined,
            });
            setPageState('VERIFY_WAIT');
        } catch (error: any) {
            // Mostrar la advertencia en la UI si el dato ya existe
            toast.error(error.message || 'Error al validar la información. Verifica tus datos.');
        } finally {
            setLoading(false);
        }
    };

    const handleFinalSubmit = async (companyData?: CompanyData) => {
        if (!currentUserId) return;
        try {
            setLoading(true);
            const result = await DriversService.completeDriverRegistration(currentUserId, {
                // Paso 2
                license_number: step2.license_number!.trim(),
                cedula_frente: step2.cedula_frente!,
                cedula_posterior: step2.cedula_posterior!,
                licencia_frente: step2.licencia_frente!,
                licencia_posterior: step2.licencia_posterior!,
                // Paso 3
                serviceType: step3.serviceType!,
                vehicle: step3.vehicle!,
                car_image_1: step3.car_image_1!,
                car_image_2: step3.car_image_2!,
                tarjeta_propiedad: step3.tarjeta_propiedad!,
                tarjeta_propiedad_back: step3.tarjeta_propiedad_back!,
                soat: step3.soat!,
                soat_expiry_date: step3.soat_expiry_date!,
                tecnomecanica: step3.tecnomecanica,
                tecnomecanica_expiry_date: step3.tecnomecanica_expiry_date,
                camara_comercio: step3.camara_comercio,
                // Paso 4
                companyData: companyData ?? (Object.keys(step4).some((k) => step4[k as keyof CompanyData]) ? step4 : undefined),
            });

            if (result.success) {
                toast.success('¡Documentación subida exitosamente!');
                setPageState('SUCCESS_APP_ONLY');
            } else {
                toast.error(result.message || 'Error al completar el registro');
            }
        } catch (error) {
            console.error('Final Registration error:', error);
        } finally {
            setLoading(false); // ESTO APAGA LA RULETA SIN IMPORTAR QUÉ PASE
        }
    };

    const handleStep3Next = () => {
        if (showStep4) goNext();
        else handleFinalSubmit();
    };

    if (pageState === 'LOADING') return <div className="min-h-screen bg-[#002f45] flex justify-center items-center"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white"></div></div>;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#002f45] to-[#00a7f5] px-4 py-8">
            <div className="absolute inset-0 bg-[url('/bg-pattern.svg')] bg-cover opacity-10" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-xl p-7"
            >
                <div className="flex flex-col items-center mb-6">
                    <img src={logo} alt="T+ Logo" className="w-14 h-14 mb-2" />
                    <h1 className="text-xl font-bold text-[#002f45]">Registro de Conductor</h1>
                </div>

                <AnimatePresence mode="wait">
                    {/* ESTADO: ESPERA DE VERIFICACIÓN DE CORREO */}
                    {pageState === 'VERIFY_WAIT' && (
                        <motion.div key="verify" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                            <div className="w-16 h-16 bg-blue-100 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                            </div>
                            <h2 className="text-lg font-bold text-[#002f45]">Verifica tu Correo</h2>
                            <p className="text-sm text-slate-500 mt-2">Hemos enviado un enlace a <b>{step1.email}</b>. Haz clic en el enlace para validar tu identidad y continuar con el registro.</p>
                            <p className="text-xs text-slate-400 mt-4">Puedes cerrar esta ventana. Cuando verifiques tu correo, retomarás el proceso desde donde lo dejaste.</p>
                        </motion.div>
                    )}

                    {/* ESTADO: YA REGISTRADO Y VERIFICADO (BLOQUEO WEB) */}
                    {pageState === 'ALREADY_REGISTERED' && (
                        <motion.div key="already" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                            <div className="w-16 h-16 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                            </div>
                            <h2 className="text-lg font-bold text-[#002f45]">Cuenta Verificada</h2>
                            <p className="text-sm text-slate-500 mt-2">Tu cuenta ya está registrada y verificada en nuestro sistema.</p>
                            <p className="text-sm font-semibold text-red-500 mt-4">Recuerda: El acceso para conductores es exclusivamente a través de la App Móvil.</p>
                            <button onClick={() => navigate('/login')} className="mt-6 w-full py-3 bg-[#002f45] text-white rounded-xl font-semibold text-sm">Volver al Inicio</button>
                        </motion.div>
                    )}

                    {/* ESTADO: ENLACE USADO O EXPIRADO */}
                    {pageState === 'LINK_EXPIRED' && (
                        <motion.div key="expired" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                            <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            </div>
                            <h2 className="text-lg font-bold text-[#002f45]">Enlace Inválido o Usado</h2>
                            <p className="text-sm text-slate-500 mt-2">Este enlace de verificación ya fue utilizado o ha expirado.</p>
                            <p className="text-xs text-slate-400 mt-4">Si ya verificaste tu cuenta previamente, por favor inicia sesión para continuar con tu registro.</p>
                            <button onClick={() => navigate('/login')} className="mt-6 w-full py-3 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors">
                                Ir al Inicio de Sesión
                            </button>
                        </motion.div>
                    )}

                    {/* ESTADO: ÉXITO TOTAL (APP ONLY REDIRECT) */}
                    {pageState === 'SUCCESS_APP_ONLY' && (
                        <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                            <div className="w-16 h-16 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                            </div>
                            <h2 className="text-lg font-bold text-[#002f45]">¡Documentos Enviados!</h2>
                            <p className="text-sm text-slate-500 mt-2">Tu solicitud está en revisión. Te notificaremos cuando tu perfil sea aprobado.</p>
                            <div className="mt-4 p-4 bg-sky-50 border border-sky-200 rounded-lg">
                                <p className="text-sm font-bold text-sky-800">Uso Exclusivo en App</p>
                                <p className="text-xs text-sky-600 mt-1">Como conductor, toda tu operativa y acceso se realiza desde la App Móvil de T+Plus. El portal web es solo administrativo.</p>
                            </div>
                            <p className="text-xs text-slate-400 mt-6">Redirigiendo al inicio en {countdown} segundos...</p>
                        </motion.div>
                    )}

                    {/* ESTADO: FORMULARIOS (PASO 1 o RETOMAR REGISTRO 2,3,4) */}
                    {(pageState === 'STEP_1' || pageState === 'RESUME_REGISTRATION') && (
                        <motion.div key="forms" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {pageState === 'RESUME_REGISTRATION' && (
                                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-center">
                                    <p className="text-xs text-green-700 font-semibold">✓ Correo verificado. Completa tus documentos.</p>
                                </div>
                            )}
                            <StepIndicator steps={visibleSteps} currentStep={currentStep} />
                            <div className="mt-6">
                                {currentStep === 1 && <Step1PersonalData data={step1} onChange={setStep1} onNext={handleStep1Submit} loading={loading} />}
                                {currentStep === 2 && <Step2Documents data={step2} onChange={setStep2} onNext={goNext} onBack={goBack} loading={loading} />}
                                {currentStep === 3 && <Step3Vehicle data={step3} onChange={setStep3} onNext={handleStep3Next} onBack={goBack} loading={loading} />}
                                {currentStep === 4 && <Step4Company data={step4} onChange={setStep4} onSubmit={() => handleFinalSubmit(step4)} onBack={goBack} loading={loading} />}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {(pageState === 'STEP_1' || pageState === 'RESUME_REGISTRATION') && (
                    <p className="mt-6 text-center text-xs text-slate-400">
                        ¿Ya tienes cuenta activa?{' '}
                        <button type="button" onClick={() => navigate('/login')} className="text-sky-600 hover:underline font-medium">
                            Descarga la App
                        </button>
                    </p>
                )}
            </motion.div>
        </div>
    );
};

export default RegisterDriverPage;