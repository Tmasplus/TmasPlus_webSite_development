import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { classNames } from '@/utils/classNames';
import { formatDate } from '@/utils/formatDate';
import { supabase } from '@/config/supabase';
import { toast } from '@/utils/toast';
import type { DriverProfile } from '@/config/database.types';

// 1. SOLUCIÓN TS: Exportamos el tipo extendido para unificar el modelo
export type EnrichedDriverProfile = DriverProfile & { referrerName?: string };

interface DriverReviewModalProps {
    open: boolean;
    driver: EnrichedDriverProfile | null;
    onClose: () => void;
    onApprove: (id: string) => Promise<void>;
    onReject: (id: string) => Promise<void>;
    onRefresh: () => void;
}

const SecureDocumentLink = ({ label, url }: { label: string; url?: string | null }) => {
    const [secureUrl, setSecureUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!url) return;
        let isMounted = true;
        const fetchSecureUrl = async () => {
            if (url.includes('/object/public/')) {
                const parts = url.split('/object/public/');
                const pathParts = parts[1].split('/');
                const bucket = pathParts[0];
                const filePath = pathParts.slice(1).join('/');

                const { data } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
                if (isMounted) setSecureUrl(data?.signedUrl || url);
            } else {
                if (isMounted) setSecureUrl(url);
            }
        };
        fetchSecureUrl();
        return () => {
            isMounted = false;
        };
    }, [url]);

    return (
        <div className="flex justify-between items-center p-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-sm font-medium text-slate-700">{label}</span>
            {secureUrl ? (
                <a href={secureUrl} target="_blank" rel="noreferrer" className="text-sm text-sky-600 hover:text-sky-800 font-semibold">
                    Ver Documento ↗
                </a>
            ) : (
                <span className="text-sm text-red-500 font-medium">Falta o Cargando...</span>
            )}
        </div>
    );
};

export const DriverReviewModal: React.FC<DriverReviewModalProps> = ({
    open, driver, onClose, onApprove, onReject, onRefresh
}) => {
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<EnrichedDriverProfile>>({});
    const [ownReferral, setOwnReferral] = useState({ code: 'Generando...', total: 0 });

    useEffect(() => {
        if (driver) {
            setEditForm(driver);
            setIsEditing(false);

            supabase.from('referral_codes').select('referral_code, total_referrals').eq('driver_id', driver.id).single()
                .then(({ data }: { data: { referral_code: string; total_referrals: number } | null }) => {
                    if (data) setOwnReferral({ code: data.referral_code, total: data.total_referrals });
                    else setOwnReferral({ code: 'No asignado (Pendiente)', total: 0 });
                });
        }
    }, [driver]);

    if (!open || !driver) return null;

    const handleAction = async (action: 'approve' | 'reject') => {
        setLoading(true);
        try {
            if (action === 'approve') await onApprove(driver.id);
            if (action === 'reject') await onReject(driver.id);
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        setLoading(true);
        try {
            const { error: userError } = await supabase.from('users').update({
                first_name: editForm.first_name,
                last_name: editForm.last_name,
                mobile: editForm.mobile,
                city: editForm.city
            }).eq('id', driver.id);
            if (userError) throw userError;

            if (driver.vehicle && editForm.vehicle) {
                const { error: carError } = await supabase.from('cars').update({
                    make: editForm.vehicle.make,
                    model: editForm.vehicle.model,
                    plate: editForm.vehicle.plate,
                    color: editForm.vehicle.color
                }).eq('id', driver.vehicle.id);
                if (carError) throw carError;
            }

            toast.success('Datos actualizados correctamente');
            setIsEditing(false);
            onRefresh();
        } catch (error) {
            toast.error('Error al guardar: ' + (error instanceof Error ? error.message : 'Error desconocido'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

                <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Expediente del Conductor</h2>
                        <p className="text-sm text-slate-500">ID: {driver.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" onClick={() => setIsEditing(!isEditing)}>
                            {isEditing ? 'Cancelar Edición' : 'Editar Datos (Admin)'}
                        </Button>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-2xl">&times;</button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">

                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-sky-50 to-indigo-50 p-4 rounded-xl border border-sky-100">
                            <h3 className="text-sm font-bold text-sky-900 mb-2 uppercase tracking-wide">Programa de Referidos</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-xs text-sky-700">Su Código para invitar:</p>
                                    <p className="text-lg font-bold text-sky-900">{ownReferral.code}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-sky-700">Usuarios Invitados:</p>
                                    <p className="text-2xl font-black text-indigo-600">{ownReferral.total}</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Datos Personales</h3>
                            <div className="space-y-3 text-sm">
                                <div>
                                    <span className="font-semibold text-slate-500 block">Nombre Completo:</span>
                                    {isEditing ? (
                                        <div className="flex gap-2 mt-1">
                                            <input className="border p-1 rounded w-full" value={editForm.first_name || ''} onChange={e => setEditForm({ ...editForm, first_name: e.target.value })} />
                                            <input className="border p-1 rounded w-full" value={editForm.last_name || ''} onChange={e => setEditForm({ ...editForm, last_name: e.target.value })} />
                                        </div>
                                    ) : <p>{driver.first_name} {driver.last_name}</p>}
                                </div>

                                <div>
                                    <span className="font-semibold text-slate-500 block">Teléfono:</span>
                                    {isEditing ? <input className="border p-1 rounded w-full mt-1" value={editForm.mobile || ''} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} /> : <p>{driver.mobile}</p>}
                                </div>

                                <div>
                                    <span className="font-semibold text-slate-500 block">Ciudad:</span>
                                    {isEditing ? <input className="border p-1 rounded w-full mt-1" value={editForm.city || ''} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /> : <p>{driver.city}</p>}
                                </div>

                                {driver.referrerName && (
                                    <p className="mt-4 p-2 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 text-xs">
                                        <span className="font-bold">Este conductor fue referido por:</span><br />
                                        {driver.referrerName} (Código: {driver.referral_id})
                                    </p>
                                )}
                            </div>
                        </div>

                        {driver.vehicle && (
                            <div>
                                <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Datos del Vehículo</h3>
                                <div className="space-y-3 text-sm">
                                    <div>
                                        <span className="font-semibold text-slate-500 block">Marca / Modelo:</span>
                                        {isEditing ? (
                                            <div className="flex gap-2 mt-1">
                                                {/* 2. SOLUCIÓN TS: Evitamos el ! usando ternarios seguros o un cast robusto */}
                                                <input className="border p-1 rounded w-full" value={editForm.vehicle?.make || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, make: e.target.value } : { make: e.target.value } as any })} />
                                                <input className="border p-1 rounded w-full" value={editForm.vehicle?.model || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, model: e.target.value } : { model: e.target.value } as any })} />
                                            </div>
                                        ) : <p>{driver.vehicle.make} {driver.vehicle.model}</p>}
                                    </div>

                                    <div>
                                        <span className="font-semibold text-slate-500 block">Placa:</span>
                                        {isEditing ? <input className="border p-1 rounded w-full mt-1 uppercase" value={editForm.vehicle?.plate || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, plate: e.target.value.toUpperCase() } : { plate: e.target.value.toUpperCase() } as any })} /> : <p className="uppercase font-bold">{driver.vehicle.plate}</p>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Documentos de Verificación</h3>
                        <div className="space-y-3">
                            <SecureDocumentLink label="Cédula (Frente)" url={driver.verify_id_image} />
                            <SecureDocumentLink label="Cédula (Reverso)" url={driver.verify_id_image_bk} />
                            <SecureDocumentLink label="Licencia (Frente)" url={driver.license_image} />
                            <SecureDocumentLink label="Licencia (Reverso)" url={driver.license_image_back} />
                            <SecureDocumentLink label="Tarjeta de Propiedad" url={driver.vehicle?.card_prop_image} />
                            <SecureDocumentLink label="SOAT" url={driver.vehicle?.soat_image} />
                            {driver.vehicle?.tecnomecanica_image && (
                                <SecureDocumentLink label="Tecnomecánica" url={driver.vehicle.tecnomecanica_image} />
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    {isEditing ? (
                        <Button onClick={handleSaveEdit} disabled={loading}>Guardar Cambios</Button>
                    ) : (
                        <>
                            <Button variant="secondary" onClick={onClose} disabled={loading}>Cerrar</Button>
                            {!driver.approved && !driver.blocked && (
                                <>
                                    <button onClick={() => handleAction('reject')} disabled={loading} className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 transition-colors">Rechazar Conductor</button>
                                    <button onClick={() => handleAction('approve')} disabled={loading} className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors shadow-sm">Aprobar Conductor</button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DriverReviewModal;