import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import logo from '@/assets/Logo-v3.png';

export const WelcomePage: React.FC = () => {
    const navigate = useNavigate();

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
                        className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-4 shadow-inner"
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
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </motion.div>

                    <h1 className="text-2xl md:text-3xl font-extrabold text-[#002f45] text-center">
                        ¡Bienvenido a T+Plus!
                    </h1>
                    <p className="text-sm font-semibold text-green-600 mt-2 text-center">
                        ✓ Tu cuenta ha sido confirmada con éxito
                    </p>
                </div>

                <div className="space-y-4 text-center">
                    <p className="text-base text-slate-700 leading-relaxed">
                        Tu cuenta ya está{' '}
                        <b className="text-[#002f45]">activa y verificada</b>. Estás a
                        un único paso de empezar a generar ingresos con T+Plus.
                    </p>

                    <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-left">
                        <p className="text-sm font-bold text-sky-800 mb-2">
                            📄 Solo te falta un paso
                        </p>
                        <p className="text-sm text-sky-700 leading-relaxed">
                            Sube tus documentos desde la <b>app</b> para poder
                            comenzar a <b>pedir o aceptar servicios</b>. Es rápido y,
                            una vez aprobados, quedarás listo para operar.
                        </p>
                    </div>

                    <p className="text-sm text-slate-500">
                        Abre la app, completa tus documentos y empieza hoy mismo.
                    </p>
                </div>

                <div className="mt-7 flex flex-col gap-3">
                    <button
                        onClick={() => navigate('/login')}
                        className="w-full py-3 bg-[#002f45] text-white rounded-xl font-semibold text-sm hover:bg-[#003d5a] transition-colors shadow-md"
                    >
                        Ingresar ahora
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default WelcomePage;
