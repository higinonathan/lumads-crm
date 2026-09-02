import { supabase } from './supabase.js';

const MESSAGE_SELECT = [
  'id',
  'approval_id',
  'client_id',
  'template_id',
  'channel',
  'delivery_mode',
  'scheduled_at',
  'status',
  'prepared_text',
  'provider_message_id',
  'sent_at',
  'delivered_at',
  'read_at',
  'failed_at',
  'error_message',
  'created_at',
  'updated_at',
  'provider',
  'recipient',
  'subject',
  'created_by',
  'message_templates(template_key,label,channel,subject)',
  'approvals(title,approval_url,status,followup_stage)'
].join(',');

const TEMPLATE_SELECT = [
  'id',
  'template_key',
  'label',
  'channel',
  'subject',
  'body',
  'meta_template_name',
  'meta_language_code',
  'is_active',
  'created_at',
  'updated_at'
].join(',');

const SETTINGS_SELECT = [
  'id',
  'agency_name',
  'reminder_1_hours',
  'reminder_2_hours',
  'final_notice_enabled',
  'whatsapp_mode',
  'whatsapp_phone_number_id',
  'whatsapp_business_account_id',
  'default_country_code',
  'email_mode',
  'email_provider',
  'email_from_name',
  'email_from_address',
  'email_reply_to',
  'updated_at'
].join(',');

const SENT_STATUSES = new Set(['sent', 'delivered', 'read']);

function relationObject(value) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function communicationRowToState(row) {
  const template = relationObject(row.message_templates);
  const approval = relationObject(row.approvals);
  return {
    id: row.id,
    approvalId: row.approval_id,
    clientId: row.client_id,
    templateId: row.template_id,
    templateKey: template?.template_key || '',
    templateLabel: template?.label || '',
    channel: row.channel,
    deliveryMode: row.delivery_mode,
    scheduledAt: row.scheduled_at,
    status: row.status,
    preparedText: row.prepared_text || '',
    recipient: row.recipient || '',
    subject: row.subject || '',
    provider: row.provider || '',
    providerMessageId: row.provider_message_id || '',
    sentAt: row.sent_at || null,
    deliveredAt: row.delivered_at || null,
    readAt: row.read_at || null,
    failedAt: row.failed_at || null,
    errorMessage: row.error_message || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    approvalTitle: approval?.title || '',
    approvalUrl: approval?.approval_url || '',
    approvalStatus: approval?.status || '',
    followupStage: approval?.followup_stage ?? 0
  };
}

export async function loadCommunicationSettings() {
  const { data, error } = await supabase
    .from('agency_settings')
    .select(SETTINGS_SELECT)
    .eq('id', 1)
    .single();

  if (error) throw error;
  return data;
}

export async function loadMessageTemplates(channel = null) {
  let query = supabase
    .from('message_templates')
    .select(TEMPLATE_SELECT)
    .eq('is_active', true)
    .order('channel', { ascending: true })
    .order('template_key', { ascending: true });

  if (channel) query = query.eq('channel', channel);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadCommunications({ clientId = null, approvalId = null, limit = 50 } = {}) {
  let query = supabase
    .from('message_queue')
    .select(MESSAGE_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq('client_id', clientId);
  if (approvalId) query = query.eq('approval_id', approvalId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(communicationRowToState);
}

export async function loadClientContactHistory(clientId, limit = 20) {
  const { data, error } = await supabase
    .from('message_queue')
    .select(MESSAGE_SELECT)
    .eq('client_id', clientId)
    .in('status', ['sent', 'delivered', 'read'])
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).map(communicationRowToState);
}

export async function prepareManualCommunication({ approvalId, channel, templateKey }) {
  if (!approvalId) throw new Error('A aprovação é obrigatória.');
  if (!['whatsapp', 'email'].includes(channel)) throw new Error('Canal de comunicação inválido.');
  if (!templateKey) throw new Error('O modelo de mensagem é obrigatório.');

  const { data, error } = await supabase.rpc('prepare_manual_communication', {
    p_approval_id: approvalId,
    p_channel: channel,
    p_template_key: templateKey
  });

  if (error) throw error;
  return communicationRowToState(data);
}

export async function confirmManualCommunicationSent(messageId) {
  if (!messageId) throw new Error('A comunicação é obrigatória.');

  const { data, error } = await supabase.rpc('confirm_manual_communication_sent', {
    p_message_id: messageId
  });

  if (error) throw error;

  const enriched = await loadCommunications({ approvalId: data.approval_id, limit: 20 });
  return enriched.find(message => message.id === data.id) || communicationRowToState(data);
}

export async function cancelManualCommunication(messageId) {
  if (!messageId) throw new Error('A comunicação é obrigatória.');

  const { data, error } = await supabase.rpc('cancel_manual_communication', {
    p_message_id: messageId
  });

  if (error) throw error;
  return communicationRowToState(data);
}

export function isRecordedContact(message) {
  return SENT_STATUSES.has(message?.status);
}

export function availableClientChannels(client) {
  const channels = [];
  if (String(client?.whatsapp || '').trim()) channels.push('whatsapp');
  if (String(client?.email || '').trim()) channels.push('email');
  return channels;
}

export function nextFollowupTemplateKey(followupStage = 0) {
  const stage = Number(followupStage) || 0;
  if (stage <= 0) return 'reminder_1';
  if (stage === 1) return 'reminder_2';
  return 'final_notice';
}

export function manualCommunicationUrl(message) {
  if (!message) return '';

  if (message.channel === 'whatsapp') {
    const digits = String(message.recipient || '').replace(/\D/g, '');
    if (!digits) return '';
    const query = new URLSearchParams({ text: message.preparedText || '' });
    return `https://wa.me/${digits}?${query.toString()}`;
  }

  if (message.channel === 'email') {
    const recipient = String(message.recipient || '').trim();
    if (!recipient) return '';
    const query = new URLSearchParams();
    if (message.subject) query.set('subject', message.subject);
    if (message.preparedText) query.set('body', message.preparedText);
    const suffix = query.toString();
    return `mailto:${recipient}${suffix ? `?${suffix}` : ''}`;
  }

  return '';
}
