import { supabase } from './supabase.js';

(() => {
  'use strict';

  const GROUP_HOST = 'chat.whatsapp.com';
  const groupCache = new Map();
  let lastApprovalId = '';

  const groupIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"></path>
      <circle cx="9.5" cy="7" r="4"></circle>
      <path d="M17 11a4 4 0 0 1 4 4v2"></path>
      <path d="M16 3.2a4 4 0 0 1 0 7.6"></path>
    </svg>`;

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

  async function groupUrlForApproval(approvalId) {
    if (!approvalId) return '';
    const { data, error } = await supabase
      .from('approvals')
      .select('client_id')
      .eq('id', approvalId)
      .maybeSingle();

    if (error || !data?.client_id) {
      if (error) console.error('Não foi possível localizar o cliente da aprovação.', error);
      return '';
    }

    return groupUrlForClient(data.client_id);
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
      const submittedAt = new Date(Date.now() - 3000).toISOString();
      const payload = {
        clientId: form.querySelector('#editClientId')?.value || '',
        companyName: form.querySelector('#clientName')?.value.trim() || '',
        email: form.querySelector('#clientEmail')?.value.trim() || '',
        submittedAt,
        groupUrl: normalized || ''
      };

      waitForSuccessfulClientSave(form, payload);
    });
  }

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

  async function enhancePreparedWhatsAppModal() {
    const content = document.querySelector('#modalContent');
    if (!content || content.querySelector('[data-whatsapp-group-open]')) return;

    const openButton = content.querySelector('[data-communication-action="open"]');
    const messageTextarea = content.querySelector('textarea[readonly]');
    if (!openButton || !messageTextarea || !/WhatsApp/i.test(openButton.textContent || '')) return;
    if (!lastApprovalId) return;

    const groupUrl = await groupUrlForApproval(lastApprovalId);
    if (!groupUrl || !openButton.isConnected || content.querySelector('[data-whatsapp-group-open]')) return;

    const groupButton = document.createElement('button');
    groupButton.type = 'button';
    groupButton.className = 'secondary';
    groupButton.dataset.whatsappGroupOpen = 'true';
    groupButton.dataset.whatsappGroupUrl = groupUrl;
    groupButton.textContent = 'Abrir grupo';
    openButton.insertAdjacentElement('afterend', groupButton);
  }

  async function openGroup(url, message = '') {
    const normalized = normalizeGroupUrl(url);
    if (!normalized) return;

    if (message && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(message);
      } catch (_) {
        // O grupo ainda é aberto mesmo se o navegador bloquear a área de transferência.
      }
    }

    window.open(normalized, '_blank', 'noopener');
  }

  function start() {
    document.querySelectorAll('#clientForm').forEach(form => void enhanceClientForm(form));
    void enhanceVisibleClients();
    void enhancePreparedWhatsAppModal();

    const observer = new MutationObserver(mutations => {
      let shouldRefreshClients = false;
      let shouldRefreshModal = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;

          if (node.matches?.('#clientForm')) void enhanceClientForm(node);
          node.querySelectorAll?.('#clientForm').forEach(form => void enhanceClientForm(form));

          if (
            node.matches?.('[data-client-card], .clients-ag-detail, .client-detail-layout-approved') ||
            node.querySelector?.('[data-client-card], .clients-ag-detail, .client-detail-layout-approved')
          ) {
            shouldRefreshClients = true;
          }

          if (
            node.matches?.('#modalContent, [data-communication-action="open"]') ||
            node.querySelector?.('[data-communication-action="open"]')
          ) {
            shouldRefreshModal = true;
          }
        }
      }

      if (shouldRefreshClients) void enhanceVisibleClients();
      if (shouldRefreshModal) void enhancePreparedWhatsAppModal();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('pointerdown', event => {
      const trigger = event.target.closest?.('.whatsapp-action[data-action="whatsapp"][data-id]');
      if (trigger?.dataset?.id) lastApprovalId = trigger.dataset.id;
    }, true);

    document.addEventListener('click', event => {
      const clientButton = event.target.closest?.('[data-whatsapp-group-client]');
      if (clientButton) {
        event.preventDefault();
        event.stopPropagation();
        void openGroup(clientButton.dataset.whatsappGroupUrl || '');
        return;
      }

      const groupButton = event.target.closest?.('[data-whatsapp-group-open]');
      if (groupButton) {
        event.preventDefault();
        event.stopPropagation();
        const textarea = document.querySelector('#modalContent textarea[readonly]');
        const message = textarea?.value || '';
        void openGroup(groupButton.dataset.whatsappGroupUrl || '', message);

        const info = document.querySelector('#modalContent .modal-info p');
        if (info && message) {
          info.textContent = 'Mensagem copiada. Cole no grupo do WhatsApp e depois confirme o envio no CRM.';
        }
      }
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
