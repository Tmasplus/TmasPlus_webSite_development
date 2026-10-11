import { supabase } from '@/config/supabase';

/**
 * Foto de perfil igual que la app (DocumentsScreen.uploadProfileImage):
 * bucket `user-profiles`, ruta `{auth_id}/profile_image.jpg` con upsert y la
 * URL pública con `?v=timestamp` guardada en users.profile_image.
 */
const BUCKET = 'user-profiles';
const MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateProfilePhoto(file: File): string | null {
  if (!PROFILE_PHOTO_TYPES.includes(file.type)) return 'Formato no permitido. Usa JPG, PNG o WEBP.';
  if (file.size > MAX_BYTES) return 'La imagen supera 5 MB.';
  return null;
}

export async function uploadProfilePhoto(user: { id: string; auth_id?: string | null }, file: File): Promise<string> {
  const invalid = validateProfilePhoto(file);
  if (invalid) throw new Error(invalid);

  const path = `${user.auth_id || user.id}/profile_image.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '0' });
  if (uploadError) throw new Error(`No se pudo subir la foto: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  const { error } = await (supabase as any)
    .from('web_users')
    .update({ profile_image: url })
    .eq('id', user.id)
    .select('id')
    .single();
  if (error) throw new Error(`Foto subida; no se pudo asociar al perfil: ${error.message}`);
  return url;
}
