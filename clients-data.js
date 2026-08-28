import { supabase } from './supabase.js';

const CLIENT_SELECT = [
  'id',
  'company_name',
  'contact_name',
  'category',
  'whatsapp_e164',
  'phone',
  'email',
  'logo_path',
  'whatsapp_opt_in',
  'whatsapp_opt_in_at',
  'email_opt_in',
  'email_opt_in_at',
  'preferred_channel',
  'notes',
  'is_active',
  'created_at',
  'updated_at'
].join(',');

function normalizeWhatsapp(value = '') {
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
}

export function clientRowToState(row) {
  return {
    id: row.id,
    name: row.company_name || '',
    company: row.category || '',
    contact: row.contact_name || '',
    whatsapp: row.whatsapp_e164 || row.phone || '',
    email: row.email || '',
    notes: row.notes || '',
    logo: row.logo_path || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active !== false,
    whatsappOptIn: Boolean(row.whatsapp_opt_in),
    whatsappOptInAt: row.whatsapp_opt_in_at || null,
    emailOptIn: Boolean(row.email_opt_in),
    emailOptInAt: row.email_opt_in_at || null,
    preferredChannel: row.preferred_channel || 'both'
  };
}

function stateClientToRow(client, { creating = false, userId = null } = {}) {
  const now = new Date().toISOString();
  const whatsapp = normalizeWhatsapp(client.whatsapp);
  const payload = {
    company_name: String(client.name || '').trim(),
    category: String(client.company || '').trim() || null,
    contact_name: String(client.contact || '').trim() || null,
    whatsapp_e164: whatsapp,
    phone: String(client.whatsapp || '').trim() || null,
    email: String(client.email || '').trim() || null,
    logo_path: client.logo || null,
    notes: String(client.notes || '').trim() || null,
    whatsapp_opt_in: Boolean(client.whatsappOptIn),
    email_opt_in: Boolean(client.emailOptIn),
    preferred_channel: client.preferredChannel || 'both',
    updated_at: now
  };

  if (payload.whatsapp_opt_in && !client.whatsappOptInAt) payload.whatsapp_opt_in_at = now;
  if (!payload.whatsapp_opt_in) payload.whatsapp_opt_in_at = null;
  if (payload.email_opt_in && !client.emailOptInAt) payload.email_opt_in_at = now;
  if (!payload.email_opt_in) payload.email_opt_in_at = null;

  if (creating) {
    payload.is_active = true;
    payload.created_by = userId || null;
  }

  return payload;
}

export async function loadClients() {
  const { data, error } = await supabase
    .from('clients')
    .select(CLIENT_SELECT)
    .eq('is_active', true)
    .order('company_name', { ascending: true });

  if (error) throw error;
  return (data || []).map(clientRowToState);
}

export async function createClient(client, userId = null) {
  const payload = stateClientToRow(client, { creating: true, userId });
  const { data, error } = await supabase
    .from('clients')
    .insert(payload)
    .select(CLIENT_SELECT)
    .single();

  if (error) throw error;
  return clientRowToState(data);
}

export async function updateClient(id, client) {
  const payload = stateClientToRow(client);
  const { data, error } = await supabase
    .from('clients')
    .update(payload)
    .eq('id', id)
    .select(CLIENT_SELECT)
    .single();

  if (error) throw error;
  return clientRowToState(data);
}

export async function archiveClient(id) {
  const { error } = await supabase
    .from('clients')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}
