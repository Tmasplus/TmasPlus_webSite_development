import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Pencil, X } from 'lucide-react';
import { PROFILE_PHOTO_TYPES, validateProfilePhoto } from '@/services/profilePhoto.service';

function Avatar({ src, name, size }: { src?: string | null; name: string; size: string }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => setBroken(false), [src]);
    if (src && !broken) {
        return <img src={src} alt={name} onError={() => setBroken(true)} className={`${size} rounded-full object-cover border-4 border-white shadow-md bg-slate-100`} />;
    }
    return (
        <span className={`${size} grid place-items-center rounded-full border-4 border-white bg-slate-100 text-3xl font-black text-slate-400 shadow-md`}>
            {(name || '?').trim().charAt(0).toUpperCase()}
        </span>
    );
}

/**
 * Foto de perfil del expediente. En edición muestra un lápiz que abre un modal
 * para elegir la foto; "Preseleccionar" solo la deja pendiente y se sube al
 * pulsar "Guardar Cambios" del expediente.
 */
export const ProfilePhotoEditor: React.FC<{
    photoUrl?: string | null;
    pendingFile: File | null;
    name: string;
    roleLabel: string;
    editing: boolean;
    onPreselect: (file: File | null) => void;
}> = ({ photoUrl, pendingFile, name, roleLabel, editing, onPreselect }) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [draftPreview, setDraftPreview] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!pendingFile) { setPendingPreview(null); return; }
        const url = URL.createObjectURL(pendingFile);
        setPendingPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [pendingFile]);

    useEffect(() => {
        if (!draft) { setDraftPreview(null); return; }
        const url = URL.createObjectURL(draft);
        setDraftPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [draft]);

    const openPicker = () => {
        setDraft(pendingFile);
        setError(null);
        setOpen(true);
    };

    const handleFile = (file?: File | null) => {
        if (!file) return;
        const invalid = validateProfilePhoto(file);
        setError(invalid);
        if (!invalid) setDraft(file);
        if (inputRef.current) inputRef.current.value = '';
    };

    const shown = pendingPreview || photoUrl;

    return (
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="relative shrink-0">
                <Avatar src={shown} name={name} size="h-24 w-24" />
                {editing && (
                    <button
                        type="button"
                        onClick={openPicker}
                        className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-amber-100 text-amber-800 shadow-md transition-colors hover:bg-amber-200"
                        title="Cambiar foto de perfil"
                        aria-label="Cambiar foto de perfil"
                    >
                        <Pencil size={15} />
                    </button>
                )}
            </div>
            <div className="min-w-0">
                <p className="break-words text-lg font-bold text-slate-800">{name || '—'}</p>
                <span className="mt-1 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">{roleLabel}</span>
                {pendingFile ? (
                    <p className="mt-2 flex items-center gap-2 text-xs font-medium text-amber-700">
                        Foto nueva preseleccionada: se guardará con “Guardar Cambios”.
                        <button type="button" onClick={() => onPreselect(null)} className="underline hover:text-amber-900">Quitar</button>
                    </p>
                ) : (
                    !photoUrl && <p className="mt-2 text-xs text-slate-400">Sin foto de perfil</p>
                )}
            </div>

            {open && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                            <h4 className="font-bold text-slate-800">Foto de perfil</h4>
                            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex flex-col items-center gap-4 p-5">
                            <Avatar src={draftPreview || shown} name={name} size="h-32 w-32" />
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100"
                            >
                                <ImagePlus size={16} />
                                Seleccionar foto
                            </button>
                            <p className="text-center text-[11px] text-slate-400">JPG, PNG o WEBP · máximo 5 MB</p>
                            {error && <p className="text-center text-xs font-medium text-rose-600">{error}</p>}
                            <input ref={inputRef} type="file" accept={PROFILE_PHOTO_TYPES.join(',')} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
                            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={!draft}
                                onClick={() => { onPreselect(draft); setOpen(false); }}
                                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                            >
                                Preseleccionar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
