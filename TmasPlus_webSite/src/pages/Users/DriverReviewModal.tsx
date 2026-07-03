import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
//import { classNames } from '@/utils/classNames';
//import { formatDate } from '@/utils/formatDate';
import { supabase, supabaseSecondary } from '@/config/supabase';
import { toast } from '@/utils/toast';
import type { DriverProfile } from '@/config/database.types';
import { DriverDocumentsService, DOC_DEFS, type DocDef } from '@/services/driverDocuments.service';
import { UsersSecondaryService } from '@/services/usersSecondary.service';
import { DOCUMENT_TYPE_OPTIONS, getDocumentTypeLabel } from '@/config/constants';
import {
    vehicleCategoryLabel,
    VEHICLE_CATEGORY_OPTIONS,
    carTypeLabelForServiceType,
} from '@/utils/vehicleCategory';

// 1. SOLUCIÓN TS: Exportamos el tipo extendido para unificar el modelo
export type EnrichedDriverProfile = DriverProfile & { referrerName?: string };

export type DriverSource = 'primary' | 'secondary';

interface DriverReviewModalProps {
    open: boolean;
    driver: EnrichedDriverProfile | null;
    source?: DriverSource;
    onClose: () => void;
    onApprove: (id: string) => Promise<void>;
    onReject: (id: string) => Promise<void>;
    onRefresh: () => void;
}

// Enlace compacto que resuelve/firma la URL (primaria o secundaria, según el
// host) mediante el resolvedor centralizado de DriverDocumentsService.
const SignedLink: React.FC<{ url?: string | null; label?: string; missingText?: string }> = ({
    url,
    label = 'Ver Documento ↗',
    missingText = 'Falta',
}) => {
    const [secureUrl, setSecureUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!url) { setSecureUrl(null); return; }
        let isMounted = true;
        (async () => {
            const resolved = await DriverDocumentsService.resolveViewUrl(url);
            if (isMounted) setSecureUrl(resolved || url);
        })();
        return () => { isMounted = false; };
    }, [url]);

    if (!url) return <span className="text-sm text-red-500 font-medium">{missingText}</span>;
    if (!secureUrl) return <span className="text-xs text-slate-400">Cargando...</span>;
    return (
        <a href={secureUrl} target="_blank" rel="noopener noreferrer"
            className="text-sm text-sky-600 hover:text-sky-800 font-semibold"
            onClick={(e) => e.stopPropagation()}>
            {label}
        </a>
    );
};

// Vista previa de imagen firmada. Igual que SignedLink resuelve la URL (firma
// las públicas, usa tal cual las ya firmadas), pero renderiza la imagen en
// línea. Para PDFs cae a un enlace, ya que <img> no los muestra.
const SignedImage: React.FC<{ url?: string | null; alt?: string; missingText?: string }> = ({
    url,
    alt = 'Documento',
    missingText = 'Sin imagen',
}) => {
    const [secureUrl, setSecureUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!url) { setSecureUrl(null); return; }
        let isMounted = true;
        (async () => {
            const resolved = await DriverDocumentsService.resolveViewUrl(url);
            if (isMounted) setSecureUrl(resolved || url);
        })();
        return () => { isMounted = false; };
    }, [url]);

    if (!url) return <span className="text-sm text-red-500 font-medium">{missingText}</span>;
    if (!secureUrl) return <span className="text-xs text-slate-400">Cargando...</span>;

    const isPdf = /\.pdf(\?|$)/i.test(url);
    if (isPdf) {
        return (
            <a href={secureUrl} target="_blank" rel="noopener noreferrer"
                className="text-sm text-sky-600 hover:text-sky-800 font-semibold"
                onClick={(e) => e.stopPropagation()}>
                Ver PDF ↗
            </a>
        );
    }

    return (
        <a href={secureUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <img
                src={secureUrl}
                alt={alt}
                className="w-full max-h-72 object-contain rounded-lg border border-slate-200 bg-slate-50"
            />
        </a>
    );
};

// Fila de documento con estado en panel + App y subida/reemplazo (admin).
const DocumentManager: React.FC<{
    def: DocDef;
    primaryUrl?: string | null;
    secondaryUrl?: string | null;
    driverId: string;
    driverEmail?: string | null;
    carId?: string | null;
    onUploaded: () => void;
}> = ({ def, primaryUrl, secondaryUrl, driverId, driverEmail, carId, onUploaded }) => {
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const needsCar = def.scope === 'car';
    const canUpload = !needsCar || !!carId;

    const handleFile = async (file?: File | null) => {
        if (!file) return;
        setUploading(true);
        try {
            const res = await DriverDocumentsService.uploadBoth(def.field, file, driverId, carId, driverEmail);
            if (res.secondaryWarning) {
                toast.warning(`${def.label}: guardado en el panel. App: ${res.secondaryWarning}`);
            } else {
                toast.success(`${def.label} actualizado (panel y App).`);
            }
            onUploaded();
        } catch (e: any) {
            toast.error(`Error al subir ${def.label}: ${e?.message || 'desconocido'}`);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex justify-between items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{def.label}</span>
                <div className="flex items-center gap-3">
                    <SignedLink url={primaryUrl} />
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={uploading || !canUpload}
                        className="text-xs font-semibold px-2 py-1 rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:opacity-40"
                        title={canUpload ? 'Subir o reemplazar (panel + App)' : 'Requiere vehículo registrado'}
                    >
                        {uploading ? 'Subiendo...' : (primaryUrl ? 'Reemplazar' : 'Subir')}
                    </button>
                </div>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                {secondaryUrl ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 border border-emerald-200 bg-emerald-50 font-medium">En App ✓</span>
                        <SignedLink url={secondaryUrl} label="ver en App ↗" />
                    </span>
                ) : (
                    <span className="text-slate-400">No está en la App</span>
                )}
            </div>
            <input ref={inputRef} type="file" accept={def.accept} className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])} />
        </div>
    );
};

export const DriverReviewModal: React.FC<DriverReviewModalProps> = ({
    open, driver, source = 'primary', onClose, onApprove, onReject, onRefresh
}) => {
    const dbClient: any = source === 'secondary' && supabaseSecondary ? supabaseSecondary : supabase;
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<EnrichedDriverProfile>>({});
    // Copia local que refleja lo realmente guardado. El modo lectura se pinta
    // desde aquí (no desde la prop `driver`, que no se actualiza tras guardar),
    // por eso antes los cambios no se veían reflejados visualmente.
    const [displayDriver, setDisplayDriver] = useState<EnrichedDriverProfile | null>(driver);
    const [ownReferral, setOwnReferral] = useState({ code: 'Generando...', total: 0 });
    const [secondaryDocs, setSecondaryDocs] = useState<Record<string, string | null>>({});
    // Documentos que viven en el proyecto PRIMARIO (panel). Cuando el modal se
    // abre desde la lista de la App, `driver`/`driver.vehicle` son filas
    // secundarias y los documentos subidos por el panel no se veían ("Falta").
    const [primaryDocs, setPrimaryDocs] = useState<Record<string, string | null>>({});

    const loadSecondaryDocs = (id: string, email?: string | null) => {
        DriverDocumentsService.getSecondaryDocs(id, email)
            .then(setSecondaryDocs)
            .catch(() => setSecondaryDocs({}));
    };

    const loadPrimaryDocs = (id: string, email?: string | null) => {
        DriverDocumentsService.getPrimaryDocs(id, email)
            .then(setPrimaryDocs)
            .catch(() => setPrimaryDocs({}));
    };

    useEffect(() => {
        if (!driver) return;
        setEditForm(driver);
        setDisplayDriver(driver);
        setIsEditing(false);
        setSecondaryDocs({});
        setPrimaryDocs({});
        loadSecondaryDocs(driver.id, driver.email);
        if (source === 'secondary') loadPrimaryDocs(driver.id, driver.email);

        // Tanto conductores como clientes tienen su propio código de referido en
        // la tabla referral_codes (driver_id = users.id). Lo cargamos para ambos.
        setOwnReferral({ code: 'Generando...', total: 0 });
        dbClient.from('referral_codes').select('referral_code, total_referrals').eq('driver_id', driver.id).maybeSingle()
            .then(({ data }: { data: { referral_code: string; total_referrals: number } | null }) => {
                if (data) setOwnReferral({ code: data.referral_code, total: data.total_referrals });
                else setOwnReferral({ code: 'No asignado (Pendiente)', total: 0 });
            });
    }, [driver]);

    if (!open || !driver) return null;

    // Fuente de verdad para el modo lectura: la copia local ya guardada.
    const d = displayDriver ?? driver;

    const isCustomer = (d.user_type || '').toLowerCase() === 'customer';
    const carId = d.vehicle?.id ?? null;

    // Cédula a mostrar en modo lectura (desde la copia guardada, no desde el
    // borrador `editForm`, para no enseñar cambios cancelados sin guardar).
    const cedulaShown = (((d as any).document_number ?? (d as any).license_number ?? '') as string);

    // Cédula unificada: en la App (primaria) vive en license_number; en el
    // Dashboard (secundaria) en document_number. Mostramos cualquiera que exista
    // y, al editar, actualizamos ambas claves del formulario para que el guardado
    // escriba en la columna correcta según el origen del registro.
    const cedulaActual = ((editForm as any).document_number ?? (editForm as any).license_number ?? '') as string;
    const setCedula = (value: string) =>
        setEditForm(prev => ({ ...prev, document_number: value, license_number: value } as any));

    const primaryUrlFor = (def: DocDef): string | null =>
        (def.scope === 'car'
            ? ((driver.vehicle as any)?.[def.field] ?? null)
            : ((driver as any)[def.field] ?? null))
        ?? primaryDocs[def.field]
        ?? null;

    const handleDocUploaded = () => {
        loadSecondaryDocs(driver.id, driver.email);
        if (source === 'secondary') loadPrimaryDocs(driver.id, driver.email);
        onRefresh();
    };

    const inspeccionFields = ['car_image_1', 'car_image_2'];
    const verificacionFields = [
        'verify_id_image', 'verify_id_image_bk',
        'license_image', 'license_image_back',
        'card_prop_image', 'card_prop_image_back',
        'soat_image', 'tecnomecanica_image',
    ];

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
            const userPayload: any = {
                first_name: editForm.first_name,
                last_name: editForm.last_name,
                mobile: editForm.mobile,
                city: editForm.city,
            };
            const cedula = cedulaActual.trim() || null;
            const carPayload = driver.vehicle && editForm.vehicle
                ? {
                    id: driver.vehicle.id,
                    make: editForm.vehicle.make,
                    model: editForm.vehicle.model,
                    plate: editForm.vehicle.plate,
                    color: editForm.vehicle.color,
                    fuel_type: editForm.vehicle.fuel_type,
                    transmission: editForm.vehicle.transmission,
                    capacity: editForm.vehicle.capacity,
                    // Categoría corregida por el admin (la elegida en el registro).
                    service_type: editForm.vehicle.service_type,
                }
                : undefined;

            if (source === 'secondary') {
                // BD del Dashboard (proyecto secundario): el dashboard se autentica
                // contra el proyecto PRIMARIO, por lo que un UPDATE directo se trata
                // como anon y no persiste (antes "guardaba" sin escribir nada). Por
                // eso la escritura se hace vía Edge Function con service role.
                // La cédula se guarda en document_number; el tipo solo en clientes.
                userPayload.document_number = cedula;
                if (isCustomer) userPayload.document_type = (editForm as any).document_type ?? null;
                // La App guarda la categoría también denormalizada en users.car_type
                // y la lista la prioriza, así que la mantenemos en sincronía con la
                // nueva categoría del vehículo. (La BD primaria no tiene car_type.)
                if (carPayload?.service_type) {
                    userPayload.car_type = carTypeLabelForServiceType(carPayload.service_type);
                }
                await UsersSecondaryService.updateViaFunction(driver.id, userPayload, carPayload);
            } else {
                // BD de la App (primaria): el dashboard SÍ está autenticado aquí, así
                // que el UPDATE directo funciona. La cédula vive en license_number.
                userPayload.license_number = cedula;
                const { error: userError } = await dbClient.from('users').update(userPayload).eq('id', driver.id);
                if (userError) throw userError;

                if (carPayload) {
                    const { id: carId, ...carFields } = carPayload;
                    const { error: carError } = await dbClient.from('cars').update(carFields).eq('id', carId);
                    if (carError) throw carError;
                }

                // La App móvil lee la categoría de la BD secundaria (utof); el
                // UPDATE anterior solo tocó el primario. Propagamos la categoría
                // a la App para que el conductor la vea reflejada. Best-effort:
                // no aborta el guardado si el conductor no está en la App.
                if (carPayload?.service_type) {
                    try {
                        const res = await UsersSecondaryService.syncCategory({
                            id: driver.id,
                            email: driver.email,
                            authId: (driver as any).auth_id ?? null,
                            serviceType: carPayload.service_type,
                        });
                        if (!res.synced) {
                            toast.warning('Guardado en el panel. El conductor no está en la App: la categoría no se sincronizó allí.');
                        } else if (res.reason === 'sin-vehiculo-en-app') {
                            toast.warning('Categoría guardada. El conductor no tiene vehículo en la App; se actualizó solo la etiqueta.');
                        }
                    } catch (e: any) {
                        toast.warning('Guardado en el panel, pero no se pudo sincronizar la categoría con la App: ' + (e?.message || 'error'));
                    }
                }
            }

            // Reflejamos de inmediato lo guardado en la copia local para que el
            // modo lectura muestre los valores nuevos sin reabrir el expediente.
            const merged = { ...(d as any), ...(editForm as any) } as EnrichedDriverProfile;
            setDisplayDriver(merged);
            setEditForm(merged);

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
                        <h2 className="text-xl font-bold text-slate-800">{isCustomer ? 'Expediente del Cliente' : 'Expediente del Conductor'}</h2>
                        <p className="text-sm text-slate-500">ID: {driver.id}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button variant="secondary" onClick={() => {
                            // Al cancelar, descartamos el borrador volviendo a la copia guardada.
                            if (isEditing) setEditForm(d);
                            setIsEditing(!isEditing);
                        }}>
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
                                    <p className="text-xs text-sky-700">{isCustomer ? 'Personas Referidas:' : 'Usuarios Invitados:'}</p>
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
                                    ) : <p>{d.first_name} {d.last_name}</p>}
                                </div>

                                <div>
                                    <span className="font-semibold text-slate-500 block">Teléfono:</span>
                                    {isEditing ? <input className="border p-1 rounded w-full mt-1" value={editForm.mobile || ''} onChange={e => setEditForm({ ...editForm, mobile: e.target.value })} /> : <p>{d.mobile}</p>}
                                </div>

                                <div>
                                    <span className="font-semibold text-slate-500 block">Ciudad:</span>
                                    {isEditing ? <input className="border p-1 rounded w-full mt-1" value={editForm.city || ''} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /> : <p>{d.city}</p>}
                                </div>

                                {isCustomer && (
                                    <div>
                                        <span className="font-semibold text-slate-500 block">Email:</span>
                                        <p>{(d as any).email || '—'}</p>
                                    </div>
                                )}

                                {isCustomer && (
                                    <div>
                                        <span className="font-semibold text-slate-500 block">Tipo de Documento:</span>
                                        {isEditing ? (
                                            <select
                                                className="border p-1 rounded w-full mt-1"
                                                value={(editForm as any).document_type || ''}
                                                onChange={e => setEditForm({ ...editForm, document_type: e.target.value } as any)}
                                            >
                                                <option value="">Selecciona…</option>
                                                {DOCUMENT_TYPE_OPTIONS.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p>{getDocumentTypeLabel((d as any).document_type) || '—'}</p>
                                        )}
                                    </div>
                                )}

                                {/* Cédula unificada (cliente y conductor). Editable: si no
                                    existe, se puede ingresar manualmente como texto. */}
                                <div>
                                    <span className="font-semibold text-slate-500 block">Cédula:</span>
                                    {isEditing
                                        ? <input
                                            className="border p-1 rounded w-full mt-1"
                                            placeholder="Ingresar cédula manualmente"
                                            value={cedulaActual}
                                            onChange={e => setCedula(e.target.value)}
                                          />
                                        : <p>{cedulaShown || '—'}</p>}
                                </div>

                                {driver.referrerName && (
                                    <p className="mt-4 p-2 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 text-xs">
                                        <span className="font-bold">Este conductor fue referido por:</span><br />
                                        {driver.referrerName} (Código: {driver.referral_id})
                                    </p>
                                )}
                            </div>
                        </div>

                        {d.vehicle && (
                            <div>
                                <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Datos del Vehículo</h3>
                                <div className="space-y-3 text-sm">
                                    {/* Categoría (service_type). El conductor la elige al registrar el
                                        vehículo; aquí el admin puede corregirla si se equivocó. */}
                                    <div>
                                        <span className="font-semibold text-slate-500 block">Categoría:</span>
                                        {isEditing ? (
                                            <select
                                                className="border p-1 rounded w-full mt-1"
                                                value={editForm.vehicle?.service_type || ''}
                                                onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, service_type: e.target.value } : { service_type: e.target.value } as any })}
                                            >
                                                <option value="">Seleccionar</option>
                                                {VEHICLE_CATEGORY_OPTIONS.map((opt) => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span className="inline-flex items-center rounded-full px-2 py-0.5 mt-1 text-xs border bg-indigo-50 text-indigo-700 border-indigo-200 font-medium">
                                                {vehicleCategoryLabel(d.vehicle.service_type)}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <span className="font-semibold text-slate-500 block">Marca / Modelo:</span>
                                        {isEditing ? (
                                            <div className="flex gap-2 mt-1">
                                                {/* 2. SOLUCIÓN TS: Evitamos el ! usando ternarios seguros o un cast robusto */}
                                                <input className="border p-1 rounded w-full" value={editForm.vehicle?.make || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, make: e.target.value } : { make: e.target.value } as any })} />
                                                <input className="border p-1 rounded w-full" value={editForm.vehicle?.model || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, model: e.target.value } : { model: e.target.value } as any })} />
                                            </div>
                                        ) : <p>{d.vehicle.make} {d.vehicle.model}</p>}
                                    </div>

                                    <div>
                                        <span className="font-semibold text-slate-500 block">Placa:</span>
                                        {isEditing ? <input className="border p-1 rounded w-full mt-1 uppercase" value={editForm.vehicle?.plate || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, plate: e.target.value.toUpperCase() } : { plate: e.target.value.toUpperCase() } as any })} /> : <p className="uppercase font-bold">{d.vehicle.plate}</p>}
                                    </div>
                                    <div>
                                        <span className="font-semibold text-slate-500 block">Combustible:</span>
                                        {isEditing ? (
                                            <select className="border p-1 rounded w-full mt-1" value={editForm.vehicle?.fuel_type || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, fuel_type: e.target.value as any } : { fuel_type: e.target.value as any } as any })}>
                                                <option value="">Seleccionar</option>
                                                <option value="gasolina">Gasolina</option>
                                                <option value="diesel">Diesel</option>
                                                <option value="gas">Gas (GNV)</option>
                                                <option value="electrico">Eléctrico</option>
                                                <option value="hibrido">Híbrido</option>
                                            </select>
                                        ) : <p className="capitalize">{d.vehicle.fuel_type}</p>}
                                    </div>

                                    <div>
                                        <span className="font-semibold text-slate-500 block">Transmisión:</span>
                                        {isEditing ? (
                                            <select className="border p-1 rounded w-full mt-1" value={editForm.vehicle?.transmission || ''} onChange={e => setEditForm({ ...editForm, vehicle: editForm.vehicle ? { ...editForm.vehicle, transmission: e.target.value as any } : { transmission: e.target.value as any } as any })}>
                                                <option value="">Seleccionar</option>
                                                <option value="manual">Manual</option>
                                                <option value="automatico">Automática</option>
                                            </select>
                                        ) : <p className="capitalize">{d.vehicle.transmission}</p>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {isCustomer && (
                    <div>
                        <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Documentos del Cliente</h3>
                        <div className="space-y-3">
                            {/* Cédula (frente): la imagen vive en la BD secundaria (App)
                                en users.verify_id_image. La mostramos en línea como la
                                cédula del cliente. */}
                            <div>
                                <span className="text-sm font-medium text-slate-700 block mb-1.5">Cédula (Frente)</span>
                                <SignedImage
                                    url={primaryUrlFor(DOC_DEFS.verify_id_image) ?? secondaryDocs['verify_id_image'] ?? null}
                                    alt="Cédula del cliente (frente)"
                                    missingText="El cliente no tiene cédula registrada."
                                />
                            </div>
                            {/* Solo se solicita una imagen para el cliente. El admin
                                puede subirla/reemplazarla desde el dashboard. */}
                            <DocumentManager
                                def={{ ...DOC_DEFS.verify_id_image, label: 'Documento de Identidad' }}
                                primaryUrl={primaryUrlFor(DOC_DEFS.verify_id_image)}
                                secondaryUrl={secondaryDocs['verify_id_image'] ?? null}
                                driverId={driver.id}
                                driverEmail={driver.email}
                                carId={carId}
                                onUploaded={handleDocUploaded}
                            />
                        </div>
                    </div>
                    )}

                    {!isCustomer && (
                    <div>
                        <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Inspección de Vehículo</h3>
                        {!carId && (
                            <p className="text-xs text-amber-600 mb-2">
                                Sin vehículo registrado: no se pueden subir fotos ni documentos del vehículo.
                            </p>
                        )}
                        <div className="space-y-3 mb-6">
                            {inspeccionFields.map((f) => (
                                <DocumentManager
                                    key={f}
                                    def={DOC_DEFS[f]}
                                    primaryUrl={primaryUrlFor(DOC_DEFS[f])}
                                    secondaryUrl={secondaryDocs[f] ?? null}
                                    driverId={driver.id}
                                    driverEmail={driver.email}
                                    carId={carId}
                                    onUploaded={handleDocUploaded}
                                />
                            ))}
                        </div>

                        <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">Documentos de Verificación</h3>
                        <div className="space-y-3">
                            {verificacionFields.map((f) => (
                                <DocumentManager
                                    key={f}
                                    def={DOC_DEFS[f]}
                                    primaryUrl={primaryUrlFor(DOC_DEFS[f])}
                                    secondaryUrl={secondaryDocs[f] ?? null}
                                    driverId={driver.id}
                                    driverEmail={driver.email}
                                    carId={carId}
                                    onUploaded={handleDocUploaded}
                                />
                            ))}
                        </div>
                    </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                    {isEditing && (
                        <Button onClick={handleSaveEdit} disabled={loading}>Guardar Cambios</Button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DriverReviewModal;