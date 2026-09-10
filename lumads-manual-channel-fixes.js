import { supabase } from './supabase.js';

(() => {
  'use strict';

  const GROUP_HOST = 'chat.whatsapp.com';
  let lastApprovalId = '';

  function normalizeGroupUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return url.protocol === 'https:' && url.hostname.toLowerCase() === GROUP_HOST ? url.toString() : '';
    } catch (_) {
      return '';
    }
  }

  async function groupUrlForApproval(approvalId) {
    if (!approvalId) return '';

    const { data: approval, error: approvalError } = await supabase
      .from('approvals')
      .select('client_id')
      .eq('id', approvalId)
      .maybeSingle();

    if (approvalError || !approval?.client_id) return '';

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('whatsapp_group_url')
      .eq('id', approval.client_id)
      .maybeSingle();

    if (clientError) return '';
    return normalizeGroupUrl(client?.whatsapp_group_url);
  }

  async function copyPreparedMessage(content) {
    const message = content?.querySelector('textarea[readonly]')?.value || '';
    if (!message || !navigator.clipboard?.writeText) return false;
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch (_) {
      return false;
    }
  }

  async function enhanceWhatsAppModal(content) {
    if (!content?.isConnected) return;
    const title = content.querySelector('.modal-head h2')?.textContent || '';
    if (!/Enviar por WhatsApp/i.test(title) || !lastApprovalId) return;

    if (content.querySelector('[data-manual-group-open]')) {
      content.querySelectorAll('[data-whatsapp-group-open]').forEach(button => {
        button.hidden = true;
      });
      return;
    }

    if (content.dataset.manualGroupLoading === 'true') return;
    content.dataset.manualGroupLoading = 'true';

    const groupUrl = await groupUrlForApproval(lastApprovalId);
    delete content.dataset.manualGroupLoading;
    if (!groupUrl || !content.isConnected) return;

    const recipientField = [...content.querySelectorAll('.field')].find(field =>
      /Destinatário/i.test(field.querySelector('label')?.textContent || '')
    );
    const recipientInput = recipientField?.querySelector('input[readonly]');
    const recipientLabel = recipientField?.querySelector('label');
    if (recipientInput) recipientInput.value = groupUrl;
    if (recipientLabel) recipientLabel.textContent = 'Destinatário (grupo)';

    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen) regularOpen.hidden = true;

    content.querySelectorAll('[data-whatsapp-group-open]').forEach(button => {
      button.hidden = true;
    });

    const groupButton = document.createElement('button');
    groupButton.type = 'button';
    groupButton.className = 'secondary';
    groupButton.dataset.manualGroupOpen = 'true';
    groupButton.dataset.groupUrl = groupUrl;
    groupButton.textContent = 'Abrir grupo';
    const confirmButton = content.querySelector('[data-communication-action="confirm"]');
    confirmButton?.insertAdjacentElement('beforebegin', groupButton);

    const info = content.querySelector('.modal-info p');
    if (info) {
      info.textContent = 'Confira a mensagem, abra o grupo do WhatsApp e confirme o envio somente depois de realmente enviar.';
    }
  }

  function gmailComposeUrl(content) {
    const recipientField = [...content.querySelectorAll('.field')].find(field =>
      /Destinatário/i.test(field.querySelector('label')?.textContent || '')
    );
    const subjectField = [...content.querySelectorAll('.field')].find(field =>
      /^Assunto$/i.test(field.querySelector('label')?.textContent || '')
    );
    const recipient = recipientField?.querySelector('input[readonly]')?.value.trim() || '';
    const subject = subjectField?.querySelector('input[readonly]')?.value || '';
    const body = content.querySelector('textarea[readonly]')?.value || '';
    if (!recipient) return '';

    const query = new URLSearchParams({ view: 'cm', fs: '1', to: recipient });
    if (subject) query.set('su', subject);
    if (body) query.set('body', body);
    return `https://mail.google.com/mail/?${query.toString()}`;
  }

  function enhanceEmailModal(content) {
    if (!content?.isConnected) return;
    const title = content.querySelector('.modal-head h2')?.textContent || '';
    if (!/Enviar por E-mail/i.test(title)) return;
    if (content.querySelector('[data-manual-gmail-open]')) return;

    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen) regularOpen.textContent = 'Abrir app de e-mail';

    const gmailButton = document.createElement('button');
    gmailButton.type = 'button';
    gmailButton.className = 'secondary';
    gmailButton.dataset.manualGmailOpen = 'true';
    gmailButton.textContent = 'Abrir Gmail';
    regularOpen?.insertAdjacentElement('beforebegin', gmailButton);

    const info = content.querySelector('.modal-info p');
    if (info) {
      info.textContent = 'Confira a mensagem, abra no Gmail ou no aplicativo de e-mail e confirme o envio somente depois de realmente enviar.';
    }
  }

  function enhanceCurrentModal() {
    const content = document.getElementById('modalContent');
    if (!content?.classList.contains('modal')) return;
    void enhanceWhatsAppModal(content);
    enhanceEmailModal(content);
  }

  function start() {
    document.addEventListener('pointerdown', event => {
      const trigger = event.target.closest?.(
        '.whatsapp-action[data-action="whatsapp"][data-id], [data-communication-channel="email"][data-id]'
      );
      if (trigger?.dataset?.id) lastApprovalId = trigger.dataset.id;
    }, true);

    document.addEventListener('click', event => {
      const groupButton = event.target.closest?.('[data-manual-group-open]');
      if (groupButton) {
        event.preventDefault();
        event.stopPropagation();
        const content = document.getElementById('modalContent');
        const groupUrl = normalizeGroupUrl(groupButton.dataset.groupUrl);
        if (!groupUrl) return;
        void copyPreparedMessage(content).finally(() => {
          window.open(groupUrl, '_blank', 'noopener');
          const info = content?.querySelector('.modal-info p');
          if (info) info.textContent = 'Mensagem copiada. Cole no grupo do WhatsApp e depois confirme o envio no CRM.';
        });
        return;
      }

      const gmailButton = event.target.closest?.('[data-manual-gmail-open]');
      if (gmailButton) {
        event.preventDefault();
        event.stopPropagation();
        const content = document.getElementById('modalContent');
        const url = gmailComposeUrl(content);
        if (url) window.open(url, '_blank', 'noopener');
      }
    }, true);

    const observer = new MutationObserver(() => enhanceCurrentModal());
    observer.observe(document.body, { childList: true, subtree: true });
    enhanceCurrentModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
