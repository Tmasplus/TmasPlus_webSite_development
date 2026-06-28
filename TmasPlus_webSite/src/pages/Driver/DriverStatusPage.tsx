import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { DriversService } from '@/services/drivers.service';
import { CarsService } from '@/services/cars.service';
import { supabase, supabaseSecondary } from '@/config/supabase';
import { toast } from '@/utils/toast';
import logo from '@/assets/Logo-v3.png';
import type { CarRow } from '@/config/database.types';

type StatusKind =
  | 'LOADING'
  | 'IN_REVIEW'
  | 'DOCS_MISSING'
  | 'PENDING_DOCS'
  | 'APPROVED'
  | 'BLOCKED';

const SECONDARY_DOC_BUCKET = 'driver-documents';

type UserDocField =
  | 'verify_id_image'
  | 'verify_id_image_bk'
  | 'license_image'
  | 'license_image_back';
type CarDocField = 'card_prop_image' | 'soat_image';

interface DocItem {
  label: string;
  ok: boolean;
  target: 'user' | 'car' | 'car-missing';
  field?: UserDocField | CarDocField;
}

const StatusBadge: React.FC<{ kind: StatusKind }> = ({ kind }) => {
  const styles: Record<StatusKind, { bg: string; text: string; label: string }> = {
    LOADING: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Cargando…' },
    IN_REVIEW: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'En revisión' },
    DOCS_MISSING: { bg: 'bg-red-100', text: 'text-red-700', label: 'Documentos pendientes' },
    PENDING_DOCS: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Documentos pendientes' },
    APPROVED: { bg: 'bg-green-100', text: 'text-green-700', label: 'Aprobado' },
    BLOCKED: { bg: 'bg-slate-200', text: 'text-slate-700', label: 'Cuenta suspendida' },
  };
  const s = styles[kind];
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
      <span className={`w-2 h-2 rounded-full ${s.text.replace('text-', 'bg-')}`} />
      {s.label}
    </span>
  );
};

export const DriverStatusPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile, isAuthenticated, isLoading: authLoading, logout, mode, refreshProfile } = useAuth();

  const [status, setStatus] = useState<StatusKind>('LOADING');
  const [vehicle, setVehicle] = useState<CarRow | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState({ plate: '', make: '', model: '' });
  const [creatingVehicle, setCreatingVehicle] = useState(false);

  const isSecondaryDriver = mode === 'driver' && !!supabaseSecondary;

  const reloadStatus = async () => {
    if (!profile) return;
    if (profile.blocked) {
      setStatus('BLOCKED');
      return;
    }

    let missingCount = 0;
    let car: CarRow | null = null;

    if (isSecondaryDriver) {
      const carsRes = await supabaseSecondary!
        .from('cars')
        .select('*')
        .eq('driver_id', profile.id)
        .limit(1);
      car = carsRes.data && carsRes.data[0] ? (carsRes.data[0] as CarRow) : null;

      const p: any = profile;
      if (!p.verify_id_image) missingCount++;
      if (!p.verify_id_image_bk) missingCount++;
      if (!p.license_image) missingCount++;
      if (!p.license_image_back) missingCount++;
      if (!car) missingCount += 2;
      else {
        if (!car.card_prop_image) missingCount++;
        if (!car.soat_image) missingCount++;
      }
    } else {
      const [validation, cars] = await Promise.all([
        DriversService.validateRequiredDocuments(profile.id),
        CarsService.getCarsByDriver(profile.id),
      ]);
      missingCount = validation.missing.length;
      car = cars && cars.length > 0 ? cars[0] : null;
    }

    setVehicle(car);

    if (profile.approved && missingCount > 0) setStatus('PENDING_DOCS');
    else if (profile.approved) setStatus('APPROVED');
    else if (missingCount > 0) setStatus('DOCS_MISSING');
    else setStatus('IN_REVIEW');
  };

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated || !profile) {
      navigate('/login', { replace: true });
      return;
    }
    if (profile.user_type !== 'driver') {
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await reloadStatus();
      } catch (err) {
        console.error('Error cargando estado del conductor:', err);
        if (!cancelled) setStatus('DOCS_MISSING');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, profile, mode]);

  const initials = useMemo(() => {
    if (!profile) return '?';
    const a = profile.first_name?.[0] ?? '';
    const b = profile.last_name?.[0] ?? '';
    return (a + b).toUpperCase() || '?';
  }, [profile]);

  const docItems: DocItem[] = useMemo(() => {
    if (!profile) return [];
    const p: any = profile;
    return [
      { label: 'Cédula (frente)', ok: !!p.verify_id_image, target: 'user', field: 'verify_id_image' },
      { label: 'Cédula (posterior)', ok: !!p.verify_id_image_bk, target: 'user', field: 'verify_id_image_bk' },
      { label: 'Licencia (frente)', ok: !!p.license_image, target: 'user', field: 'license_image' },
      { label: 'Licencia (posterior)', ok: !!p.license_image_back, target: 'user', field: 'license_image_back' },
      vehicle
        ? { label: 'Tarjeta de propiedad', ok: !!vehicle.card_prop_image, target: 'car', field: 'card_prop_image' }
        : { label: 'Tarjeta de propiedad', ok: false, target: 'car-missing' },
      vehicle
        ? { label: 'SOAT', ok: !!vehicle.soat_image, target: 'car', field: 'soat_image' }
        : { label: 'SOAT', ok: false, target: 'car-missing' },
    ];
  }, [profile, vehicle]);

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return 'Solo se aceptan imágenes (JPG/PNG) o PDF.';
    }
    if (file.size > 5 * 1024 * 1024) {
      return 'El archivo no puede superar los 5MB.';
    }
    return null;
  };

  const uploadToSecondaryStorage = async (path: string, file: File): Promise<string> => {
    if (!supabaseSecondary) throw new Error('Cliente secundario no disponible');
    const { error } = await supabaseSecondary.storage
      .from(SECONDARY_DOC_BUCKET)
      .upload(path, file, { upsert: true, cacheControl: '3600' });
    if (error) throw error;
    const { data } = supabaseSecondary.storage.from(SECONDARY_DOC_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const getAuthUid = async (): Promise<string | null> => {
    if (!supabaseSecondary) return null;
    const { data } = await supabaseSecondary.auth.getSession();
    return data.session?.user?.id ?? null;
  };

  const handleUserDocUpload = async (field: UserDocField, file: File) => {
    if (!profile || !supabaseSecondary) return;
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingField(field);
    try {
      const authUid = (await getAuthUid()) ?? profile.auth_id ?? profile.id;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${authUid}/${field}_${Date.now()}.${ext}`;
      const url = await uploadToSecondaryStorage(path, file);

      const { error: updateErr } = await supabaseSecondary
        .from('users')
        .update({ [field]: url, updated_at: new Date().toISOString() })
        .eq('id', profile.id);
      if (updateErr) throw updateErr;

      toast.success('Documento subido correctamente');
      await refreshProfile();
      await reloadStatus();
    } catch (e: any) {
      console.error('Error subiendo documento:', e);
      toast.error(e?.message || 'No se pudo subir el documento');
    } finally {
      setUploadingField(null);
    }
  };

  const handleCarDocUpload = async (field: CarDocField, file: File) => {
    if (!profile || !supabaseSecondary || !vehicle) return;
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setUploadingField(field);
    try {
      const authUid = (await getAuthUid()) ?? profile.auth_id ?? profile.id;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${authUid}/cars/${vehicle.id}/${field}_${Date.now()}.${ext}`;
      const url = await uploadToSecondaryStorage(path, file);

      const { error: updateErr } = await supabaseSecondary
        .from('cars')
        .update({ [field]: url, updated_at: new Date().toISOString() })
        .eq('id', vehicle.id);
      if (updateErr) throw updateErr;

      toast.success('Documento subido correctamente');
      await reloadStatus();
    } catch (e: any) {
      console.error('Error subiendo documento del vehículo:', e);
      toast.error(e?.message || 'No se pudo subir el documento');
    } finally {
      setUploadingField(null);
    }
  };

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !supabaseSecondary) return;

    const plate = vehicleForm.plate.trim().toUpperCase();
    const make = vehicleForm.make.trim();
    const model = vehicleForm.model.trim();
    if (!plate || !make || !model) {
      toast.error('Completa placa, marca y modelo.');
      return;
    }

    setCreatingVehicle(true);
    try {
      // Validar placa única en la base secundaria (App)
      const { data: existing, error: existErr } = await supabaseSecondary
        .from('cars')
        .select('id')
        .eq('plate', plate)
        .limit(1);
      if (existErr) throw existErr;
      if (existing && existing.length > 0) {
        toast.error('Esa placa ya está registrada.');
        return;
      }

      const { data: created, error: insertErr } = await supabaseSecondary
        .from('cars')
        .insert({
          driver_id: profile.id,
          plate,
          make,
          model,
          capacity: 4,
          fuel_type: 'gasolina',
          transmission: 'manual',
          is_active: true,
        })
        .select()
        .single();
      if (insertErr) throw insertErr;

      toast.success('Vehículo registrado. Ya puedes subir la tarjeta de propiedad y el SOAT.');
      setVehicleForm({ plate: '', make: '', model: '' });
      if (created) setVehicle(created as CarRow);
      await reloadStatus();
    } catch (err: any) {
      console.error('Error registrando vehículo:', err);
      toast.error(err?.message || 'No se pudo registrar el vehículo');
    } finally {
      setCreatingVehicle(false);
    }
  };

  const handleContinueRegistration = () => navigate('/register-driver');

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      // toast lo maneja el servicio
    }
  };

  const handleOpenApp = async () => {
    toast.info('Como conductor, la operativa se realiza desde la App Móvil de T+Plus.');
    await supabase.auth.signOut();
    if (supabaseSecondary) await supabaseSecondary.auth.signOut().catch(() => {});
    navigate('/login', { replace: true });
  };

  if (authLoading || status === 'LOADING') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#002f45] to-[#00a7f5] flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
      </div>
    );
  }

  if (!profile) return null;

  const canUpload = isSecondaryDriver;

  return (
    <div className="min-h-screen flex flex-col items-center bg-gradient-to-br from-[#002f45] to-[#00a7f5] px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/bg-pattern.svg')] bg-cover opacity-10" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <img src={logo} alt="T+ Logo" className="w-12 h-12" />
          <StatusBadge kind={status} />
        </div>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-[#002f45] text-white flex items-center justify-center text-xl font-bold shadow">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-[#002f45] truncate">
              {profile.first_name} {profile.last_name}
            </h1>
            <p className="text-sm text-slate-500 truncate">{profile.email}</p>
          </div>
        </div>

        {status === 'APPROVED' && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800 mb-6">
            <p className="font-semibold mb-1">¡Tu cuenta está aprobada!</p>
            <p>
              Como conductor, debes operar desde la <b>App Móvil de T+Plus</b>. El portal web es solo
              administrativo.
            </p>
          </div>
        )}

        {status === 'PENDING_DOCS' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 mb-6">
            <p className="font-semibold mb-1">Tu cuenta está aprobada</p>
            <p>
              Falta subir tus documentos para empezar a <b>operar</b> y obtener tu <b>membresía</b>.
              Súbelos abajo: nuestro equipo los revisará y te avisaremos cuando estés listo.
            </p>
          </div>
        )}

        {status === 'IN_REVIEW' && (
          <div className="p-4 bg-sky-50 border border-sky-200 rounded-xl text-sm text-sky-800 mb-6">
            <p className="font-semibold mb-1">Tu solicitud está en revisión</p>
            <p>
              Ya subiste todos tus documentos. Nuestro equipo está validando tu información. Te
              notificaremos por correo cuando tu cuenta sea aprobada.
            </p>
          </div>
        )}

        {status === 'DOCS_MISSING' && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 mb-6">
            <p className="font-semibold mb-1">Te faltan documentos por subir</p>
            <p>
              Completa la subida de documentos para que podamos revisar tu cuenta y aprobarla.
            </p>
          </div>
        )}

        {status === 'BLOCKED' && (
          <div className="p-4 bg-slate-100 border border-slate-300 rounded-xl text-sm text-slate-700 mb-6">
            <p className="font-semibold mb-1">Cuenta suspendida</p>
            <p>Contacta a soporte para obtener más información.</p>
          </div>
        )}

        <section className="mb-6">
          <h2 className="text-sm font-bold text-[#002f45] mb-3 uppercase tracking-wider">
            Información personal
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <ProfileRow label="Celular" value={profile.mobile ?? '—'} />
            <ProfileRow label="Ciudad" value={profile.city ?? '—'} />
            <ProfileRow label="Tipo de usuario" value={profile.user_type} />
            <ProfileRow label="Licencia N°" value={profile.license_number ?? '—'} />
            {vehicle && (
              <>
                <ProfileRow label="Vehículo" value={`${vehicle.make} ${vehicle.model}`} />
                <ProfileRow label="Placa" value={vehicle.plate} />
              </>
            )}
          </dl>
        </section>

        <section className="mb-6">
          <h2 className="text-sm font-bold text-[#002f45] mb-3 uppercase tracking-wider">
            Documentos
          </h2>
          <ul className="space-y-2">
            {docItems.map((d) => (
              <DocRow
                key={d.label}
                item={d}
                canUpload={canUpload}
                uploading={uploadingField === d.field}
                onUserUpload={handleUserDocUpload}
                onCarUpload={handleCarDocUpload}
              />
            ))}
          </ul>
          {canUpload && !vehicle && (
            <form
              onSubmit={handleCreateVehicle}
              className="mt-3 p-4 rounded-xl bg-sky-50 border border-sky-200"
            >
              <p className="text-xs text-slate-600 mb-3">
                Registra tu vehículo para poder subir la <b>tarjeta de propiedad</b> y el <b>SOAT</b>.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <input
                  type="text"
                  value={vehicleForm.plate}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, plate: e.target.value }))}
                  placeholder="Placa"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 uppercase placeholder:normal-case focus:outline-none focus:ring-2 focus:ring-sky-400"
                  maxLength={10}
                />
                <input
                  type="text"
                  value={vehicleForm.make}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, make: e.target.value }))}
                  placeholder="Marca"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
                <input
                  type="text"
                  value={vehicleForm.model}
                  onChange={(e) => setVehicleForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="Modelo"
                  className="px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>
              <Button type="submit" disabled={creatingVehicle} className="w-full sm:w-auto">
                {creatingVehicle ? 'Guardando…' : 'Guardar vehículo'}
              </Button>
            </form>
          )}
        </section>

        <div className="flex flex-col sm:flex-row gap-3">
          {status === 'DOCS_MISSING' && !canUpload && (
            <Button onClick={handleContinueRegistration} className="flex-1">
              Continuar registro
            </Button>
          )}
          {status === 'APPROVED' && (
            <Button onClick={handleOpenApp} className="flex-1">
              Entendido
            </Button>
          )}
          <Button variant="secondary" onClick={handleLogout} className="flex-1">
            Cerrar sesión
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} T+PLUS. Todos los derechos reservados.
        </p>
      </motion.div>
    </div>
  );
};

const ProfileRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col">
    <dt className="text-xs text-slate-500">{label}</dt>
    <dd className="text-sm font-medium text-slate-800 break-words">{value}</dd>
  </div>
);

interface DocRowProps {
  item: DocItem;
  canUpload: boolean;
  uploading: boolean;
  onUserUpload: (field: UserDocField, file: File) => void;
  onCarUpload: (field: CarDocField, file: File) => void;
}

const DocRow: React.FC<DocRowProps> = ({ item, canUpload, uploading, onUserUpload, onCarUpload }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !item.field) return;
    if (item.target === 'user') onUserUpload(item.field as UserDocField, file);
    else if (item.target === 'car') onCarUpload(item.field as CarDocField, file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <li className="flex items-center justify-between gap-2 text-sm py-2 px-3 rounded-lg bg-slate-50 border border-slate-200">
      <span className="text-slate-700 flex-1 min-w-0 truncate">{item.label}</span>

      <div className="flex items-center gap-3 shrink-0">
        {item.ok ? (
          <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
            </svg>
            Cargado
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-red-500 text-xs font-semibold">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Pendiente
          </span>
        )}

        {canUpload && item.target !== 'car-missing' && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-xs font-semibold text-sky-600 hover:text-sky-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Subiendo…' : item.ok ? 'Reemplazar' : 'Subir'}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handleChange}
            />
          </>
        )}
      </div>
    </li>
  );
};

export default DriverStatusPage;
