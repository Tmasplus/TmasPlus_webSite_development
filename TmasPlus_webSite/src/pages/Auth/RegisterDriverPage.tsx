import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { StepIndicator } from '@/components/registration/StepIndicator';
import { Step1PersonalData } from '@/components/registration/Step1PersonalData';
import { Step2Documents } from '@/components/registration/Step2Documents';
import { Step3Vehicle } from '@/components/registration/Step3Vehicle';
import { Step4Company } from '@/components/registration/Step4Company';
import { DriversService } from '@/services/drivers.service';
import { toast } from '@/utils/toast';
import logo from '@/assets/Logo-v3.png';
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

// ==================== PANTALLA DE ÉXITO ====================
const SuccessScreen: React.FC<{ onGoLogin: () => void }> = ({ onGoLogin }) => (
    <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center text-center gap-5 py-4"
    >
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </div>
        <div>
            <h2 className="text-xl font-bold text-[#002f45]">¡Registro exitoso!</h2>
            <p className="text-sm text-slate-500 mt-2 max-w-xs">
                Tu solicitud fue enviada. Un administrador revisará tu información y aprobará tu cuenta pronto.
            </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 w-full text-left">
            <p className="text-xs text-blue-800 font-semibold mb-1">¿Qué sigue?</p>
            <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
                <li>El equipo T+Plus verificará tus documentos</li>
                <li>Recibirás notificación cuando tu cuenta sea aprobada</li>
                <li>Podrás usar la app móvil una vez aprobado</li>
            </ul>
        </div>
        <button
            onClick={onGoLogin}
            className="w-full py-3 px-4 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors"
        >
            Ir al inicio de sesión
        </button>
    </motion.div>
);

// ==================== PÁGINA PRINCIPAL ====================
export const RegisterDriverPage: React.FC = () => {
    const navigate = useNavigate();

    const [currentStep, setCurrentStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const [step1, setStep1] = useState<Step1Data>({});
    const [step2, setStep2] = useState<Step2Data>({});
    const [step3, setStep3] = useState<Step3Data>({});
    const [step4, setStep4] = useState<CompanyData>({});

    const showStep4 = needsStep4(step3);
    const visibleSteps = showStep4 ? ALL_STEPS : ALL_STEPS.filter((s) => s.number !== 4);
    const totalSteps = visibleSteps.length;

    const goNext = () => setCurrentStep((s) => s + 1);
    const goBack = () => setCurrentStep((s) => s - 1);

    const handleSubmit = async (companyData?: CompanyData) => {
        try {
            setLoading(true);

            const result = await DriversService.registerDriver({
                // Paso 1
                email: step1.email!.trim().toLowerCase(),
                password: step1.password!,
                first_name: step1.first_name!.trim(),
                last_name: step1.last_name!.trim(),
                mobile: step1.mobile!.trim(),
                city: step1.city!,
                referral_code: step1.referral_code?.trim() || undefined,
                // Paso 2
                license_number: step2.license_number!.trim(),
                cedula_frente: step2.cedula_frente!,
                cedula_posterior: step2.cedula_posterior!,
                licencia_frente: step2.licencia_frente!,
                licencia_posterior: step2.licencia_posterior!,
                // Paso 3
                serviceType: step3.serviceType!,
                vehicle: step3.vehicle!,
                tarjeta_propiedad: step3.tarjeta_propiedad!,
                soat: step3.soat!,
                soat_expiry_date: step3.soat_expiry_date!,
                tecnomecanica: step3.tecnomecanica,
                tecnomecanica_expiry_date: step3.tecnomecanica_expiry_date,
                camara_comercio: step3.camara_comercio,
                // Paso 4
                companyData: companyData ?? (Object.keys(step4).some((k) => step4[k as keyof CompanyData]) ? step4 : undefined),
            });

            if (result.success) {
                toast.success('¡Conductor registrado exitosamente!');
                setSuccess(true);
            } else {
                toast.error(result.message || 'Error al registrar conductor');
            }
        } catch (error) {
            console.error('Registration error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Paso 3 finaliza: si necesita empresa, va al paso 4; si no, registra directo
    const handleStep3Next = () => {
        if (showStep4) goNext();
        else handleSubmit();
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#002f45] to-[#00a7f5] px-4 py-8">
            <div className="absolute inset-0 bg-[url('/bg-pattern.svg')] bg-cover opacity-10" />

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative z-10 w-full max-w-xl bg-white rounded-2xl shadow-xl p-7"
            >
                {/* Header */}
                <div className="flex flex-col items-center mb-6">
                    <img src={logo} alt="T+ Logo" className="w-14 h-14 mb-2" />
                    <h1 className="text-xl font-bold text-[#002f45]">Registro de Conductor</h1>
                    <p className="text-xs text-slate-500 mt-1">Completa los pasos para unirte a T+Plus</p>
                </div>

                {/* Indicador de pasos */}
                {!success && (
                    <StepIndicator steps={visibleSteps} currentStep={currentStep} />
                )}

                {/* Contenido animado */}
                <AnimatePresence mode="wait">
                    {success ? (
                        <motion.div key="success" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}>
                            <SuccessScreen onGoLogin={() => navigate('/login')} />
                        </motion.div>
                    ) : (
                        <motion.div key={currentStep} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
                            {currentStep === 1 && (
                                <Step1PersonalData data={step1} onChange={setStep1} onNext={goNext} loading={loading} />
                            )}
                            {currentStep === 2 && (
                                <Step2Documents data={step2} onChange={setStep2} onNext={goNext} onBack={goBack} loading={loading} />
                            )}
                            {currentStep === 3 && (
                                <Step3Vehicle data={step3} onChange={setStep3} onNext={handleStep3Next} onBack={goBack} loading={loading} />
                            )}
                            {currentStep === 4 && (
                                <Step4Company data={step4} onChange={setStep4} onSubmit={() => handleSubmit(step4)} onBack={goBack} loading={loading} />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Footer links */}
                {!success && (
                    <p className="mt-6 text-center text-xs text-slate-400">
                        ¿Ya tienes cuenta?{' '}
                        <button type="button" onClick={() => navigate('/login')} disabled={loading} className="text-sky-600 hover:underline font-medium">
                            Inicia sesión
                        </button>
                    </p>
                )}
                <p className="mt-2 text-center text-xs text-slate-400">
                    © {new Date().getFullYear()} T+PLUS. Todos los derechos reservados.
                </p>
            </motion.div>

            {!success && (
                <p className="relative z-10 mt-4 text-xs text-white/60">Paso {currentStep} de {totalSteps}</p>
            )}
        </div>
    );
};

export default RegisterDriverPage;
