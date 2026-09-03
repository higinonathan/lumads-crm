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
  'agency_display_name',
  'agency_phone',
  'agency_email',
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
const TEMPLATE_LABELS = {
  approval_initial: 'Mensagem inicial',
  reminder_1: 'Lembrete 1',
  reminder_2: 'Lembrete 2',
  final_notice: 'Aviso final'
};

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

export async function updateCommunicationSettings(values) {
  const payload = {
    reminder_1_hours: values.reminder_1_hours,
    reminder_2_hours: values.reminder_2_hours,
    final_notice_enabled: values.final_notice_enabled
  };

  const { data, error } = await supabase
    .from('agency_settings')
    .update(payload)
    .eq('id', 1)
    .select(SETTINGS_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function updateAgencySettings(values) {
  const payload = {
    agency_name: values.agency_name,
    agency_display_name: values.agency_display_name,
    agency_phone: values.agency_phone,
    agency_email: values.agency_email
  };

  const { data, error } = await supabase
    .from('agency_settings')
    .update(payload)
    .eq('id', 1)
    .select(SETTINGS_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMessageTemplate(templateId, values) {
  const payload = {};
  if (Object.hasOwn(values, 'subject')) payload.subject = values.subject;
  if (Object.hasOwn(values, 'body')) payload.body = values.body;

  const { data, error } = await supabase
    .from('message_templates')
    .update(payload)
    .eq('id', templateId)
    .select(TEMPLATE_SELECT)
    .single();

  if (error) throw error;
  return data;
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

  const enriched = await loadCommunications({ approvalId: data.approval_id, limit: 30 });
  return enriched.find(message => message.id === data.id) || communicationRowToState(data);
}

export async function confirmManualCommunicationSent(messageId) {
  if (!messageId) throw new Error('A comunicação é obrigatória.');

  const { data, error } = await supabase.rpc('confirm_manual_communication_sent', {
    p_message_id: messageId
  });

  if (error) throw error;

  const enriched = await loadCommunications({ approvalId: data.approval_id, limit: 30 });
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

async function loadApprovalCommunicationContext(approvalId) {
  const { data, error } = await supabase
    .from('approvals')
    .select('id,client_id,title,status,followup_stage')
    .eq('id', approvalId)
    .single();

  if (error) throw error;
  return data;
}

async function resolveManualTemplateKey(approvalId, channel) {
  const [approval, communications] = await Promise.all([
    loadApprovalCommunicationContext(approvalId),
    loadCommunications({ approvalId, limit: 50 })
  ]);

  if (approval.status !== 'awaiting_approval') {
    throw new Error('Esta aprovação já foi finalizada e não aceita novos lembretes.');
  }

  const sentForChannel = communications.filter(message =>
    message.channel === channel && SENT_STATUSES.has(message.status)
  );

  const followupStage = Number(approval.followup_stage) || 0;
  let templateKey;
  if (followupStage <= 0) templateKey = sentForChannel.some(message => message.templateKey === 'approval_initial') ? 'reminder_1' : 'approval_initial';
  else if (followupStage === 1) templateKey = sentForChannel.some(message => message.templateKey === 'reminder_1') ? 'reminder_2' : 'reminder_1';
  else if (followupStage === 2) templateKey = sentForChannel.some(message => message.templateKey === 'reminder_2') ? 'final_notice' : 'reminder_2';
  else templateKey = 'final_notice';

  if (templateKey === 'final_notice' && sentForChannel.some(message => message.templateKey === 'final_notice')) {
    throw new Error('O aviso final deste canal já foi registrado como enviado.');
  }

  return { approval, templateKey };
}

function uiText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function uiDateTime(value) {
  if (!value) return 'Data de envio indisponível';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(new Date(value));
  } catch (_) {
    return String(value);
  }
}

function uiChannelLabel(channel) {
  return channel === 'email' ? 'E-mail' : 'WhatsApp';
}

function uiStatusLabel(status) {
  return ({ sent: 'Enviado', delivered: 'Entregue', read: 'Lido' })[status] || 'Registrado';
}

function showCommunicationToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(showCommunicationToast.timer);
  showCommunicationToast.timer = setTimeout(() => toast.classList.remove('show'), 3200);
}

function communicationErrorMessage(error) {
  const message = String(error?.message || '');
  if (/WhatsApp/i.test(message)) return 'Este cliente não possui WhatsApp cadastrado.';
  if (/e-mail|email/i.test(message)) return 'Este cliente não possui e-mail cadastrado.';
  if (/aviso final.*já foi registrad[oa] como enviad[oa]/i.test(message)) return 'O aviso final deste canal já foi enviado.';
  if (/já foi registrada como enviada/i.test(message)) return 'Esta mensagem já foi registrada como enviada.';
  if (/finalizada|não está mais aguardando/i.test(message)) return 'Esta aprovação já foi finalizada.';
  if (/dispon[ií]vel|prazo|configuraç/i.test(message)) return message;
  return 'Não foi possível preparar esta comunicação. Tente novamente.';
}

function currentModalElements() {
  return {
    backdrop: document.getElementById('modalBackdrop'),
    content: document.getElementById('modalContent')
  };
}

let pendingManualCommunication = null;

function closeCommunicationModal() {
  const { backdrop, content } = currentModalElements();
  if (backdrop) backdrop.classList.remove('open');
  if (content) content.innerHTML = '';
  pendingManualCommunication = null;
}

function showPreparedCommunication(message) {
  const { backdrop, content } = currentModalElements();
  if (!backdrop || !content) {
    throw new Error('Não foi possível abrir a confirmação de comunicação.');
  }

  pendingManualCommunication = message;
  const channelLabel = uiChannelLabel(message.channel);
  const templateLabel = message.templateLabel || TEMPLATE_LABELS[message.templateKey] || 'Comunicação';
  const subjectField = message.channel === 'email' && message.subject
    ? `<div class="field"><label>Assunto</label><input value="${uiText(message.subject)}" readonly></div>`
    : '';

  content.className = 'modal';
  content.innerHTML = `
    <div class="modal-head">
      <div>
        <h2>Enviar por ${channelLabel}?</h2>
        <p>${uiText(templateLabel)} · ${uiText(message.approvalTitle || 'Aprovação')}</p>
      </div>
      <button class="close" type="button" data-communication-action="close" aria-label="Fechar">×</button>
    </div>
    <div class="form">
      <div class="modal-info">
        <b>${uiText(templateLabel)}</b>
        <p>Confira a mensagem, abra o ${channelLabel} e confirme o envio somente depois de realmente enviar.</p>
      </div>
      <div class="field" style="margin-top:14px">
        <label>Destinatário</label>
        <input value="${uiText(message.recipient)}" readonly>
      </div>
      ${subjectField}
      <div class="field" style="margin-top:14px">
        <label>Mensagem preparada</label>
        <textarea rows="8" readonly>${uiText(message.preparedText)}</textarea>
      </div>
      <p class="form-error" id="communicationModalError" hidden></p>
      <div class="modal-foot">
        <button class="secondary" type="button" data-communication-action="cancel">Cancelar</button>
        <button class="secondary" type="button" data-communication-action="open">Abrir ${channelLabel}</button>
        <button class="primary" type="button" data-communication-action="confirm">Confirmar envio</button>
      </div>
    </div>`;

  backdrop.classList.add('open');
}

function setCommunicationModalBusy(busy) {
  const { content } = currentModalElements();
  if (!content) return;
  content.querySelectorAll('[data-communication-action]').forEach(button => {
    button.disabled = busy;
  });
}

function communicationModalError(message) {
  const target = document.getElementById('communicationModalError');
  if (!target) return;
  target.textContent = message;
  target.hidden = !message;
}

async function startManualCommunication(approvalId, channel) {
  if (!approvalId) return;
  try {
    const { templateKey } = await resolveManualTemplateKey(approvalId, channel);
    const message = await prepareManualCommunication({ approvalId, channel, templateKey });
    showPreparedCommunication(message);
  } catch (error) {
    console.error('Não foi possível preparar a comunicação manual.', error);
    showCommunicationToast(communicationErrorMessage(error), 'error');
  }
}

function openPreparedCommunication() {
  const message = pendingManualCommunication;
  if (!message) return;

  const url = manualCommunicationUrl(message);
  if (!url) {
    communicationModalError('Não foi possível montar o link desta comunicação.');
    return;
  }

  if (message.channel === 'email') {
    window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

async function refreshVisibleClientContacts(clientId) {
  const container = document.getElementById('clientContactHistory');
  if (!container || container.dataset.clientId !== clientId) return;

  try {
    const contacts = await loadClientContactHistory(clientId, 20);
    if (!container.isConnected || container.dataset.clientId !== clientId) return;
    container.innerHTML = contacts.map(contact => `
      <div class="timeline-item">
        <b>${uiText(uiChannelLabel(contact.channel))} · ${uiText(contact.templateLabel || contact.templateKey || 'Comunicação')}</b>
        ${uiDateTime(contact.sentAt)}<br>${uiText(uiStatusLabel(contact.status))}
      </div>`).join('') || '<div class="timeline-item"><b>Nenhum contato registrado</b>Os envios de WhatsApp e e-mail aparecerão aqui quando forem registrados.</div>';
  } catch (error) {
    console.error('Não foi possível atualizar os últimos contatos.', error);
  }
}

async function confirmPreparedCommunication() {
  const message = pendingManualCommunication;
  if (!message) return;

  setCommunicationModalBusy(true);
  communicationModalError('');

  try {
    const sent = await confirmManualCommunicationSent(message.id);
    closeCommunicationModal();
    showCommunicationToast(`${uiChannelLabel(sent.channel)} registrado como enviado.`);

    await refreshVisibleClientContacts(sent.clientId);

    if (['reminder_1', 'reminder_2', 'final_notice'].includes(sent.templateKey)) {
      window.setTimeout(() => window.location.reload(), 650);
    }
  } catch (error) {
    console.error('Não foi possível confirmar o envio da comunicação.', error);
    communicationModalError(communicationErrorMessage(error));
    setCommunicationModalBusy(false);
  }
}

async function cancelPreparedCommunication() {
  const message = pendingManualCommunication;
  if (!message) {
    closeCommunicationModal();
    return;
  }

  setCommunicationModalBusy(true);
  try {
    if (!SENT_STATUSES.has(message.status)) {
      await cancelManualCommunication(message.id);
    }
  } catch (error) {
    console.error('Não foi possível cancelar a comunicação preparada.', error);
  } finally {
    closeCommunicationModal();
  }
}

function emailCompanionFor(button) {
  const approvalId = button.dataset.id;
  if (!approvalId || button.dataset.communicationEnhanced === 'true') return null;
  button.dataset.communicationEnhanced = 'true';

  const clone = button.cloneNode(true);
  clone.removeAttribute('data-action');
  clone.removeAttribute('disabled');
  clone.removeAttribute('aria-disabled');
  clone.classList.remove('whatsapp-action');
  clone.dataset.communicationChannel = 'email';
  clone.dataset.id = approvalId;
  clone.dataset.communicationEmailCompanion = 'true';
  clone.setAttribute('aria-label', 'Preparar e-mail');

  if (button.closest('.row-actions')) {
    clone.textContent = '✉';
    clone.setAttribute('aria-label', 'Preparar e-mail');
  } else if (button.closest('.action-list')) {
    clone.textContent = 'Preparar e-mail';
  } else {
    clone.textContent = 'E-mail';
  }

  return clone;
}

function enhanceCommunicationActions(root = document) {
  root.querySelectorAll?.('.whatsapp-action[data-action="whatsapp"][data-id]').forEach(button => {
    const parent = button.parentElement;
    if (!parent) return;

    const approvalId = button.dataset.id;
    const existing = Array.from(parent.children).find(element =>
      element?.dataset?.communicationEmailCompanion === 'true' &&
      element?.dataset?.id === approvalId
    );
    if (existing) {
      button.dataset.communicationEnhanced = 'true';
      return;
    }

    const companion = emailCompanionFor(button);
    if (companion) button.insertAdjacentElement('afterend', companion);
  });
}

function setupManualCommunicationUi() {
  if (typeof document === 'undefined') return;

  const start = () => {
    enhanceCommunicationActions(document);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches?.('.whatsapp-action[data-action="whatsapp"][data-id]')) {
            enhanceCommunicationActions(node.parentElement || node);
          } else {
            enhanceCommunicationActions(node);
          }
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  document.addEventListener('click', event => {
    const emailButton = event.target.closest?.('[data-communication-channel="email"][data-id]');
    const whatsappButton = event.target.closest?.('.whatsapp-action[data-action="whatsapp"][data-id]');

    if (emailButton || whatsappButton) {
      const trigger = emailButton || whatsappButton;
      if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void startManualCommunication(trigger.dataset.id, emailButton ? 'email' : 'whatsapp');
      return;
    }

    const actionButton = event.target.closest?.('[data-communication-action]');
    if (!actionButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const action = actionButton.dataset.communicationAction;
    if (action === 'open') {
      openPreparedCommunication();
      return;
    }
    if (action === 'confirm') {
      void confirmPreparedCommunication();
      return;
    }
    if (action === 'cancel') {
      void cancelPreparedCommunication();
      return;
    }
    if (action === 'close') {
      closeCommunicationModal();
    }
  }, true);
}

setupManualCommunicationUi();
