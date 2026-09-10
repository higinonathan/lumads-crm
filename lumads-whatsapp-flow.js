import { supabase } from './supabase.js';

(() => {
  'use strict';

  const GROUP_HOST = 'chat.whatsapp.com';
  const groupCache = new Map();

  function normalizeGroupUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== GROUP_HOST) return null;
      return url.toString();
    } catch (_) {
      return null;
    }
  }

  function showFormError(form, message) {
    const target = form.querySelector('#modalError');
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
  }

  async function groupUrlForClient(clientId, { refresh = false } = {}) {
    if (!clientId) return '';
    if (!refresh && groupCache.has(clientId)) return groupCache.get(clientId);

    const { data, error } = await supabase
      .from('clients')
      .select('whatsapp_group_url')
      .eq('id', clientId)
      .maybeSingle();

    if (error) {
      console.error('Não foi possível carregar o grupo de WhatsApp do cliente.', error);
      return '';
    }

    const value = normalizeGroupUrl(data?.whatsapp_group_url) || '';
    groupCache.set(clientId, value);
    return value;
  }

  async function persistGroupUrl({ clientId, companyName, email, submittedAt, groupUrl }) {
    let resolvedId = clientId;

    if (!resolvedId) {
      const { data: authData } = await supabase.auth.getUser();
      let query = supabase
        .from('clients')
        .select('id')
        .eq('company_name', companyName)
        .gte('created_at', submittedAt)
        .order('created_at', { ascending: false })
        .limit(1);

      if (authData?.user?.id) query = query.eq('created_by', authData.user.id);
      if (email) query = query.eq('email', email);

      const { data, error } = await query.maybeSingle();
      if (error) {
        console.error('Não foi possível localizar o cliente recém-criado para salvar o grupo.', error);
        return;
      }
      resolvedId = data?.id || '';
    }

    if (!resolvedId) return;

    const { error } = await supabase
      .from('clients')
      .update({
        whatsapp_group_url: groupUrl || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', resolvedId);

    if (error) {
      console.error('Não foi possível salvar o grupo de WhatsApp do cliente.', error);
      return;
    }

    groupCache.set(resolvedId, groupUrl || '');
    window.setTimeout(() => enhanceVisibleClients(true), 0);
  }

  function waitForSuccessfulClientSave(form, payload) {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (!form.isConnected) {
        window.clearInterval(timer);
        void persistGroupUrl(payload);
        return;
      }

      if (Date.now() - startedAt > 15000) {
        window.clearInterval(timer);
      }
    }, 120);
  }

  async function enhanceClientForm(form) {
    if (!form || form.dataset.whatsappGroupEnhanced === 'true') return;
    form.dataset.whatsappGroupEnhanced = 'true';

    const phoneField = form.querySelector('#clientPhone')?.closest('.field');
    if (!phoneField) return;

    const field = document.createElement('div');
    field.className = 'field full';
    field.dataset.whatsappGroupField = 'true';
    field.innerHTML = `
      <label for="clientWhatsappGroup">Grupo do WhatsApp</label>
      <input id="clientWhatsappGroup" type="url" placeholder="https://chat.whatsapp.com/...">
      <small>Link de convite do grupo principal do cliente. Uso interno da LUMADS.</small>`;
    phoneField.insertAdjacentElement('afterend', field);

    const clientId = form.querySelector('#editClientId')?.value || '';
    if (clientId) {
      const groupUrl = await groupUrlForClient(clientId, { refresh: true });
      const input = form.querySelector('#clientWhatsappGroup');
      if (input && input.isConnected) input.value = groupUrl;
    }

    form.addEventListener('submit', event => {
      const input = form.querySelector('#clientWhatsappGroup');
      const normalized = normalizeGroupUrl(input?.value || '');

      if (normalized === null) {
        event.preventDefault();
        event.stopPropagation();
        showFormError(form, 'Informe um link válido de grupo do WhatsApp, começando por https://chat.whatsapp.com/.');
        input?.focus();
        return;
      }

      showFormError(form, '');
      const payload = {
        clientId: form.querySelector('#editClientId')?.value || '',
        companyName: form.querySelector('#clientName')?.value.trim() || '',
        email: form.querySelector('#clientEmail')?.value.trim() || '',
        submittedAt: new Date(Date.now() - 3000).toISOString(),
        groupUrl: normalized || ''
      };

      waitForSuccessfulClientSave(form, payload);
    });
  }

  const groupIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
      <circle cx="9.5" cy="7" r="4"></circle>
      <path d="M17 11a4 4 0 0 1 4 4v2"></path>
      <path d="M16 3.2a4 4 0 0 1 0 7.6"></path>
    </svg>`;

  function appendClientGroupButton(container, clientId, groupUrl, variant = 'approved') {
    if (!container || !clientId || !groupUrl) return;
    if (container.querySelector(`[data-whatsapp-group-client="${CSS.escape(clientId)}"]`)) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.whatsappGroupClient = clientId;
    button.dataset.whatsappGroupUrl = groupUrl;

    if (variant === 'approved') {
      button.className = 'clients-ag-secondary';
      button.innerHTML = `${groupIcon}<span>Grupo WhatsApp</span>`;
    } else {
      button.className = 'secondary';
      button.textContent = 'Grupo WhatsApp';
    }

    const primary = container.querySelector('.clients-ag-primary');
    if (primary) primary.insertAdjacentElement('beforebegin', button);
    else container.appendChild(button);
  }

  function appendCardGroupAction(card, clientId, groupUrl) {
    if (!card || !groupUrl) return;

    const menu = card.querySelector('.clients-ag-menu, .lumads-client-menu');
    if (menu && !menu.querySelector('[data-whatsapp-group-client]')) {
      const action = document.createElement('button');
      action.type = 'button';
      action.dataset.whatsappGroupClient = clientId;
      action.dataset.whatsappGroupUrl = groupUrl;
      action.textContent = 'Abrir grupo do WhatsApp';
      menu.prepend(action);
    }

    const actions = card.querySelector('.clients-ag-actions');
    if (actions && !actions.querySelector('[data-whatsapp-group-client]')) {
      const round = document.createElement('button');
      round.type = 'button';
      round.className = 'clients-ag-round';
      round.dataset.whatsappGroupClient = clientId;
      round.dataset.whatsappGroupUrl = groupUrl;
      round.setAttribute('aria-label', 'Abrir grupo do WhatsApp');
      round.title = 'Grupo do WhatsApp';
      round.innerHTML = groupIcon;
      actions.prepend(round);
    }
  }

  async function enhanceVisibleClients(forceRefresh = false) {
    const clientIds = new Set();

    document.querySelectorAll('[data-client-card][data-client], .lumads-client-card[data-client]').forEach(card => {
      if (card.dataset.client) clientIds.add(card.dataset.client);
    });

    document.querySelectorAll('.clients-ag-detail-actions [data-client], .client-detail-profile-actions-approved [data-client]').forEach(button => {
      if (button.dataset.client) clientIds.add(button.dataset.client);
    });

    await Promise.all([...clientIds].map(async clientId => {
      const groupUrl = await groupUrlForClient(clientId, { refresh: forceRefresh });
      if (!groupUrl) return;

      document.querySelectorAll(`[data-client-card][data-client="${CSS.escape(clientId)}"], .lumads-client-card[data-client="${CSS.escape(clientId)}"]`).forEach(card => {
        appendCardGroupAction(card, clientId, groupUrl);
      });

      document.querySelectorAll('.clients-ag-detail-actions').forEach(container => {
        if (container.querySelector(`[data-client="${CSS.escape(clientId)}"]`)) {
          appendClientGroupButton(container, clientId, groupUrl, 'approved');
        }
      });

      document.querySelectorAll('.client-detail-profile-actions-approved').forEach(container => {
        if (container.querySelector(`[data-client="${CSS.escape(clientId)}"]`)) {
          appendClientGroupButton(container, clientId, groupUrl, 'legacy');
        }
      });
    }));
  }

  function recipientField(content) {
    return [...content.querySelectorAll('.field')].find(field =>
      /Destinatário/i.test(field.querySelector('label')?.textContent || '')
    ) || null;
  }

  function preparedMessage(content) {
    return content.querySelector('textarea[readonly]')?.value || '';
  }

  function fallbackCopy(text) {
    if (!text) return false;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    textarea.style.pointerEvents = 'none';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (_) {
      copied = false;
    }
    textarea.remove();
    return copied;
  }

  async function copyText(text) {
    if (!text) return false;
    if (fallbackCopy(text)) return true;
    if (!navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  function updateModalInfo(content, text) {
    const info = content?.querySelector('.modal-info p');
    if (info) info.textContent = text;
  }

  function enhanceWhatsAppModal(content) {
    if (!content?.isConnected || content.dataset.groupFlowEnhanced === 'true') return;
    const title = content.querySelector('.modal-head h2')?.textContent || '';
    if (!/Enviar por WhatsApp/i.test(title)) return;

    const field = recipientField(content);
    const input = field?.querySelector('input[readonly]');
    const groupUrl = normalizeGroupUrl(input?.value || '');
    if (!groupUrl) return;

    content.dataset.groupFlowEnhanced = 'true';
    const label = field.querySelector('label');
    if (label) label.textContent = 'Destinatário (grupo)';

    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen) regularOpen.hidden = true;

    content.querySelectorAll('[data-whatsapp-group-open], [data-manual-group-open]').forEach(button => button.remove());

    const confirmButton = content.querySelector('[data-communication-action="confirm"]');
    if (confirmButton) {
      const copyButton = document.createElement('button');
      copyButton.type = 'button';
      copyButton.className = 'secondary';
      copyButton.dataset.groupCopy = 'true';
      copyButton.textContent = 'Copiar mensagem';

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'secondary';
      openButton.dataset.groupOpen = 'true';
      openButton.dataset.groupUrl = groupUrl;
      openButton.textContent = 'Abrir grupo';

      confirmButton.insertAdjacentElement('beforebegin', copyButton);
      confirmButton.insertAdjacentElement('beforebegin', openButton);
    }

    updateModalInfo(content, 'A mensagem será copiada para você colar no grupo. Confirme o envio somente depois de realmente enviar.');
  }

  function gmailComposeUrl(content) {
    const field = recipientField(content);
    const subjectField = [...content.querySelectorAll('.field')].find(item =>
      /^Assunto$/i.test(item.querySelector('label')?.textContent || '')
    );
    const recipient = field?.querySelector('input[readonly]')?.value.trim() || '';
    const subject = subjectField?.querySelector('input[readonly]')?.value || '';
    const body = preparedMessage(content);
    if (!recipient) return '';

    const query = new URLSearchParams({ view: 'cm', fs: '1', to: recipient });
    if (subject) query.set('su', subject);
    if (body) query.set('body', body);
    return `https://mail.google.com/mail/?${query.toString()}`;
  }

  function enhanceEmailModal(content) {
    if (!content?.isConnected || content.dataset.emailFlowEnhanced === 'true') return;
    const title = content.querySelector('.modal-head h2')?.textContent || '';
    if (!/Enviar por E-mail/i.test(title)) return;

    content.dataset.emailFlowEnhanced = 'true';
    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen) regularOpen.textContent = 'Abrir app de e-mail';

    const gmailButton = document.createElement('button');
    gmailButton.type = 'button';
    gmailButton.className = 'secondary';
    gmailButton.dataset.gmailOpen = 'true';
    gmailButton.textContent = 'Abrir Gmail';
    regularOpen?.insertAdjacentElement('beforebegin', gmailButton);

    updateModalInfo(content, 'Confira a mensagem, abra no Gmail ou no aplicativo de e-mail e confirme o envio somente depois de realmente enviar.');
  }

  function enhanceCurrentModal() {
    const content = document.getElementById('modalContent');
    if (!content?.classList.contains('modal')) return;
    enhanceWhatsAppModal(content);
    enhanceEmailModal(content);
  }

  function start() {
    document.querySelectorAll('#clientForm').forEach(form => void enhanceClientForm(form));
    void enhanceVisibleClients();
    enhanceCurrentModal();

    const observer = new MutationObserver(mutations => {
      let refreshClients = false;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches?.('#clientForm')) void enhanceClientForm(node);
          node.querySelectorAll?.('#clientForm').forEach(form => void enhanceClientForm(form));
          if (
            node.matches?.('[data-client-card], .clients-ag-detail, .client-detail-layout-approved') ||
            node.querySelector?.('[data-client-card], .clients-ag-detail, .client-detail-layout-approved')
          ) refreshClients = true;
        });
      }
      if (refreshClients) void enhanceVisibleClients();
      enhanceCurrentModal();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', event => {
      const clientButton = event.target.closest?.('[data-whatsapp-group-client]');
      if (clientButton) {
        event.preventDefault();
        event.stopPropagation();
        const url = normalizeGroupUrl(clientButton.dataset.whatsappGroupUrl || '');
        if (url) window.open(url, '_blank', 'noopener');
        return;
      }

      const copyButton = event.target.closest?.('[data-group-copy]');
      if (copyButton) {
        event.preventDefault();
        event.stopPropagation();
        const content = document.getElementById('modalContent');
        void copyText(preparedMessage(content)).then(copied => {
          updateModalInfo(content, copied
            ? 'Mensagem copiada. Cole no grupo do WhatsApp e depois confirme o envio no CRM.'
            : 'Não foi possível copiar automaticamente. Selecione a mensagem manualmente antes de abrir o grupo.');
        });
        return;
      }

      const groupButton = event.target.closest?.('[data-group-open]');
      if (groupButton) {
        event.preventDefault();
        event.stopPropagation();
        const content = document.getElementById('modalContent');
        const groupUrl = normalizeGroupUrl(groupButton.dataset.groupUrl || '');
        if (!groupUrl) return;

        const message = preparedMessage(content);
        const copiedSync = fallbackCopy(message);
        window.open(groupUrl, '_blank', 'noopener');

        if (copiedSync) {
          updateModalInfo(content, 'Mensagem copiada. Cole no grupo do WhatsApp e depois confirme o envio no CRM.');
        } else {
          void copyText(message).then(copied => {
            updateModalInfo(content, copied
              ? 'Mensagem copiada. Cole no grupo do WhatsApp e depois confirme o envio no CRM.'
              : 'O grupo foi aberto, mas o navegador bloqueou a cópia. Use o botão Copiar mensagem e tente novamente.');
          });
        }
        return;
      }

      const gmailButton = event.target.closest?.('[data-gmail-open]');
      if (gmailButton) {
        event.preventDefault();
        event.stopPropagation();
        const content = document.getElementById('modalContent');
        const url = gmailComposeUrl(content);
        if (url) window.open(url, '_blank', 'noopener');
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
