import { supabase } from './supabase.js';

(() => {
  'use strict';

  const GROUP_HOST = 'chat.whatsapp.com';
  let lookupTimer = null;

  const normalizeGroupUrl = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== GROUP_HOST) return '';
      return url.toString();
    } catch (_) {
      return '';
    }
  };

  const digits = value => String(value || '').replace(/\D/g, '');
  const normalizeEmail = value => String(value || '').trim().toLowerCase();

  function renderState(form, groupUrl, state = 'ready') {
    const input = form.querySelector('#approvalWhatsappGroup');
    const hint = form.querySelector('#approvalWhatsappGroupHint');
    const openButton = form.querySelector('[data-approval-group-open]');
    if (!input || !hint || !openButton) return;

    input.value = groupUrl || '';
    openButton.hidden = !groupUrl;
    openButton.dataset.approvalGroupUrl = groupUrl || '';

    if (state === 'loading') {
      input.placeholder = 'Buscando grupo cadastrado...';
      hint.textContent = 'Consultando o cadastro do cliente.';
      return;
    }

    if (groupUrl) {
      input.placeholder = '';
      hint.textContent = 'Grupo cadastrado. Após iniciar o acompanhamento, use o botão WhatsApp da aprovação e escolha Abrir grupo para enviar a mensagem preparada.';
    } else {
      input.placeholder = 'Nenhum grupo cadastrado';
      hint.textContent = 'Este cliente não possui grupo cadastrado. O envio continuará disponível pelo WhatsApp individual.';
    }
  }

  async function resolveGroupForApprovalForm(form) {
    if (!form?.isConnected) return;

    const clientName = form.querySelector('#approvalClientName')?.value.trim() || '';
    if (!clientName) {
      renderState(form, '');
      return;
    }

    renderState(form, '', 'loading');

    const { data, error } = await supabase
      .from('clients')
      .select('id,company_name,whatsapp_group_url,whatsapp_e164,phone,email,is_active')
      .eq('company_name', clientName)
      .eq('is_active', true)
      .limit(10);

    if (!form.isConnected) return;

    if (error) {
      console.error('Não foi possível consultar o grupo do WhatsApp na nova aprovação.', error);
      renderState(form, '');
      const hint = form.querySelector('#approvalWhatsappGroupHint');
      if (hint) hint.textContent = 'Não foi possível consultar o grupo agora. O cadastro do cliente não foi alterado.';
      return;
    }

    const phone = digits(form.querySelector('#approvalWhatsApp')?.value);
    const email = normalizeEmail(form.querySelector('#approvalEmail')?.value);
    const rows = data || [];

    let client = rows.find(row => {
      const rowPhones = [digits(row.whatsapp_e164), digits(row.phone)].filter(Boolean);
      return phone && rowPhones.includes(phone);
    });

    if (!client && email) {
      client = rows.find(row => normalizeEmail(row.email) === email);
    }

    if (!client && rows.length === 1) client = rows[0];

    renderState(form, normalizeGroupUrl(client?.whatsapp_group_url));
  }

  function scheduleLookup(form) {
    window.clearTimeout(lookupTimer);
    lookupTimer = window.setTimeout(() => {
      void resolveGroupForApprovalForm(form);
    }, 80);
  }

  function enhanceApprovalForm(form) {
    if (!form || form.dataset.approvalGroupEnhanced === 'true') return;
    form.dataset.approvalGroupEnhanced = 'true';

    const whatsappField = form.querySelector('#approvalWhatsApp')?.closest('.field');
    if (!whatsappField) return;

    const field = document.createElement('div');
    field.className = 'field full';
    field.dataset.approvalWhatsappGroupField = 'true';
    field.innerHTML = `
      <label for="approvalWhatsappGroup">Grupo do WhatsApp</label>
      <input id="approvalWhatsappGroup" type="url" readonly placeholder="Selecione um cliente">
      <small id="approvalWhatsappGroupHint">Selecione um cliente para consultar o grupo cadastrado.</small>
      <div style="margin-top:8px">
        <button type="button" class="secondary" data-approval-group-open hidden>Abrir grupo cadastrado</button>
      </div>`;

    whatsappField.insertAdjacentElement('afterend', field);

    const clientInput = form.querySelector('#approvalClientName');
    clientInput?.addEventListener('input', () => {
      window.setTimeout(() => scheduleLookup(form), 0);
    });
    clientInput?.addEventListener('change', () => scheduleLookup(form));

    scheduleLookup(form);
  }

  function start() {
    document.querySelectorAll('#approvalForm').forEach(enhanceApprovalForm);

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element)) return;
          if (node.matches?.('#approvalForm')) enhanceApprovalForm(node);
          node.querySelectorAll?.('#approvalForm').forEach(enhanceApprovalForm);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-approval-group-open]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const url = normalizeGroupUrl(button.dataset.approvalGroupUrl);
      if (url) window.open(url, '_blank', 'noopener');
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
