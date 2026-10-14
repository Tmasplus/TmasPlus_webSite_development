import React, { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';

interface ReferredRow {
    id: string;
    status: string | null;
    referred_at: string | null;
    referred_driver: {
        first_name?: string | null;
        last_name?: string | null;
        mobile?: string | null;
        approved?: boolean | null;
    } | null;
}

interface Props {
    open: boolean;
    /** users.id del dueño del código (referrer_id). */
    ownerId: string | null;
    ownerName: string;
    onClose: () => void;
}

/** Lista de personas que se registraron con el código de referido de un usuario. */
export const ReferredListModal: React.FC<Props> = ({ open, ownerId, ownerName, onClose }) => {
    const [rows, setRows] = useState<ReferredRow[] | null>(null);

    useEffect(() => {
        if (!open || !ownerId) return;
        let cancelled = false;
        setRows(null);
        (supabase as any)
            .from('web_referrals')
            .select('id, status, referred_at, referred_driver')
            .eq('referrer_id', ownerId)
            .order('referred_at', { ascending: false })
            .then(({ data, error }: { data: ReferredRow[] | null; error: unknown }) => {
                if (!cancelled) setRows(error ? [] : (data ?? []));
            });
        return () => { cancelled = true; };
    }, [open, ownerId]);

    if (!open || !ownerId) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between p-4 border-b">
                    <div>
                        <h3 className="text-base font-bold text-[#002f45]">Personas referidas</h3>
                        <p className="text-xs text-slate-500">Registradas con el código de {ownerName}</p>
                    </div>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="Cerrar">×</button>
                </div>
                <div className="p-4 overflow-y-auto">
                    {rows === null ? (
                        <p className="text-sm text-slate-400">Cargando…</p>
                    ) : rows.length === 0 ? (
                        <p className="text-sm text-slate-400">Nadie se ha registrado con este código todavía.</p>
                    ) : (
                        <ul className="divide-y">
                            {rows.map(r => {
                                const p = r.referred_driver;
                                const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') : '';
                                return (
                                    <li key={r.id} className="py-2 flex justify-between gap-3 text-sm">
                                        <div>
                                            <p className="font-medium text-slate-800">{name || 'Usuario sin nombre'}</p>
                                            {p?.mobile && <p className="text-xs text-slate-500">{p.mobile}</p>}
                                        </div>
                                        <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                            {r.referred_at ? new Date(r.referred_at).toLocaleDateString('es') : ''}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReferredListModal;
