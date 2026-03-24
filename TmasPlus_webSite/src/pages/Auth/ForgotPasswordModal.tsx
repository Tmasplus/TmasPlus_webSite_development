import React, { useState } from 'react';
import { supabase } from '@/config/supabase';
import { toast } from '@/utils/toast';

interface Props {
    open: boolean;
    onClose: () => void;
}

export const ForgotPasswordModal: React.FC<Props> = ({ open, onClose }) => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    if (!open) return null;

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) return toast.error('Ingresa tu correo');

        setLoading(true);
        try {
            // Esta es la función mágica de Supabase
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: `${window.location.origin}/update-password`,
            });

            if (error) throw error;

            toast.success('¡Correo enviado! Revisa tu bandeja de entrada o SPAM.');
            onClose();
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
                <h2 className="text-xl font-bold text-[#002f45] mb-2">Recuperar Contraseña</h2>
                <p className="text-sm text-slate-500 mb-4">Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.</p>

                <form onSubmit={handleReset} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-400"
                            placeholder="tu@correo.com"
                            required
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-semibold bg-[#002f45] text-white rounded-lg hover:bg-[#003d5a] disabled:opacity-50">
                            {loading ? 'Enviando...' : 'Enviar enlace'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ForgotPasswordModal;