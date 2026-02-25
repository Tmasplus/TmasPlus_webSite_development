import React, { useRef, useState } from 'react';

interface FileUploadProps {
    label: string;
    accept?: string;
    value?: File | null;
    onChange: (file: File | null) => void;
    disabled?: boolean;
    required?: boolean;
    hint?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({
    label,
    accept = 'image/*',
    value,
    onChange,
    disabled = false,
    required = false,
    hint,
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);

    const handleFile = (file: File) => {
        if (accept === 'image/*' && !file.type.startsWith('image/')) {
            alert('Solo se permiten archivos de imagen.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo no puede superar los 5MB.');
            return;
        }
        onChange(file);
        const reader = new FileReader();
        reader.onloadend = () => setPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        if (disabled) return;
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const handleRemove = () => {
        onChange(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>

            {!value ? (
                <div
                    onClick={() => !disabled && inputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    className={`
            relative flex flex-col items-center justify-center gap-2
            border-2 border-dashed rounded-xl p-5 cursor-pointer transition-all
            ${dragging ? 'border-sky-500 bg-sky-50' : 'border-slate-300 bg-slate-50 hover:border-sky-400 hover:bg-sky-50'}
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
                >
                    <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center">
                        <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-slate-600">
                            <span className="font-medium text-sky-600">Haz clic</span> o arrastra una imagen aquí
                        </p>
                        {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
                        <p className="text-xs text-slate-400">PNG, JPG, JPEG — máx. 5MB</p>
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept={accept}
                        className="hidden"
                        onChange={handleChange}
                        disabled={disabled}
                    />
                </div>
            ) : (
                <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                    {preview && (
                        <img src={preview} alt="preview" className="w-full h-40 object-cover" />
                    )}
                    <div className="flex items-center justify-between px-3 py-2 bg-white border-t border-slate-100">
                        <div className="flex items-center gap-2 min-w-0">
                            <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs text-slate-600 truncate">{value.name}</span>
                            <span className="text-xs text-slate-400 shrink-0">({(value.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        {!disabled && (
                            <button type="button" onClick={handleRemove} className="ml-2 text-slate-400 hover:text-red-500 transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FileUpload;
