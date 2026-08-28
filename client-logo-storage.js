import { supabase } from './supabase.js';

const BUCKET = 'client-logos';
const MAX_BYTES = 1.5 * 1024 * 1024;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);

function extensionFor(file) {
  const byName = String(file.name || '').split('.').pop()?.toLowerCase();
  if (byName && ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(byName)) return byName === 'jpeg' ? 'jpg' : byName;
  return ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  })[file.type] || 'bin';
}

export function validateClientLogo(file) {
  if (!file) throw new Error('Selecione uma imagem.');
  if (!ALLOWED.has(file.type)) throw new Error('Formato não suportado. Use PNG, JPG, JPEG, WebP ou SVG.');
  if (file.size > MAX_BYTES) throw new Error('Selecione uma imagem de até 1,5 MB.');
}

export async function uploadClientLogo(file, clientId = 'new') {
  validateClientLogo(file);
  const ext = extensionFor(file);
  const safeClientId = String(clientId || 'new').replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `${safeClientId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

  if (error) throw error;
  return path;
}

export function publicClientLogoUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

export async function deleteClientLogo(path) {
  if (!path || /^https?:\/\//i.test(path) || /^data:/i.test(path)) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}
