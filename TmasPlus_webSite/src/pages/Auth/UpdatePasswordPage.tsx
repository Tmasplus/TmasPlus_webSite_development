import React, { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { toast } from '@/utils/toast';
import { useNavigate } from 'react-router-dom';

export const UpdatePasswordPage: React.FC = () => {
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 6) return toast.error('La contraseña debe tener al menos 6 caracteres');

        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;

            toast.success('¡Contraseña actualizada exitosamente!');
            navigate('/login'); // Lo enviamos a iniciar sesión
        } catch (error: any) {
            toast.error('Error al actualizar: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
                <h2 className="text-2xl font-bold text-[#002f45] mb-2">Nueva Contraseña</h2>
                <p className="text-sm text-slate-500 mb-6">Por favor, ingresa tu nueva contraseña segura.</p>

                <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nueva Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2"
                            required
                        />
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3 bg-[#002f45] text-white rounded-xl font-bold">
                        {loading ? 'Guardando...' : 'Guardar Contraseña'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default UpdatePasswordPage;