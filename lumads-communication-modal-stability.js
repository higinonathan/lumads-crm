(() => {
  'use strict';

  const GROUP_HOST = 'chat.whatsapp.com';
  const GROUP_INFO = 'Você pode compartilhar a mensagem pelo WhatsApp e escolher o grupo, ou abrir diretamente o grupo cadastrado.';
  const EMAIL_INFO = 'Confira a mensagem, abra no Gmail ou no aplicativo de e-mail e confirme o envio somente depois de realmente enviar.';
  let syncQueued = false;

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
  }

  function recipientField(content) {
    return [...content.querySelectorAll('.field')].find(field =>
      /Destinatário/i.test(field.querySelector('label')?.textContent || '')
    ) || null;
  }

  function preparedMessage(content) {
    return content?.querySelector('textarea[readonly]')?.value || '';
  }

  function normalizeGroupUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== GROUP_HOST) return '';
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  function modalTitle(content) {
    return content?.querySelector('.modal-head h2')?.textContent || '';
  }

  function updateInfo(content, text) {
    const info = content?.querySelector('.modal-info p');
    setText(info, text);
  }

  function ensureGroupModal(content) {
    if (!content?.isConnected || !/Enviar por WhatsApp/i.test(modalTitle(content))) return false;

    const field = recipientField(content);
    const input = field?.querySelector('input[readonly]');
    const groupUrl = normalizeGroupUrl(input?.value || '');
    if (!groupUrl) return false;

    setText(field?.querySelector('label'), 'Destinatário (grupo)');

    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen && !regularOpen.hidden) regularOpen.hidden = true;

    content.querySelectorAll('[data-whatsapp-group-open], [data-manual-group-open]').forEach(button => button.remove());
    content.querySelectorAll('[data-group-copy]').forEach(button => {
      if (!button.hidden) button.hidden = true;
    });

    const confirmButton = content.querySelector('[data-communication-action="confirm"]');
    if (!confirmButton) {
      updateInfo(content, GROUP_INFO);
      return true;
    }

    const openButtons = [...content.querySelectorAll('[data-group-open]')];
    let openButton = openButtons.shift() || null;
    openButtons.forEach(button => button.remove());
    if (!openButton) {
      openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'secondary';
      openButton.dataset.groupOpen = 'true';
    }
    if (openButton.dataset.groupUrl !== groupUrl) openButton.dataset.groupUrl = groupUrl;
    setText(openButton, 'Abrir grupo');
    if (openButton.hidden) openButton.hidden = false;

    const shareButtons = [...content.querySelectorAll('[data-group-share]')];
    let shareButton = shareButtons.shift() || null;
    shareButtons.forEach(button => button.remove());
    if (!shareButton) {
      shareButton = document.createElement('button');
      shareButton.type = 'button';
      shareButton.className = 'secondary';
      shareButton.dataset.groupShare = 'true';
    }
    setText(shareButton, 'Compartilhar mensagem');
    if (shareButton.hidden) shareButton.hidden = false;

    if (openButton.nextElementSibling !== confirmButton) confirmButton.insertAdjacentElement('beforebegin', openButton);
    if (shareButton.nextElementSibling !== openButton) openButton.insertAdjacentElement('beforebegin', shareButton);

    updateInfo(content, GROUP_INFO);
    return true;
  }

  function ensureEmailModal(content) {
    if (!content?.isConnected || !/Enviar por E-mail/i.test(modalTitle(content))) return false;

    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen) setText(regularOpen, 'Abrir app de e-mail');

    const gmailButtons = [...content.querySelectorAll('[data-gmail-open]')];
    let gmailButton = gmailButtons.shift() || null;
    gmailButtons.forEach(button => button.remove());

    if (regularOpen && !gmailButton) {
      gmailButton = document.createElement('button');
      gmailButton.type = 'button';
      gmailButton.className = 'secondary';
      gmailButton.dataset.gmailOpen = 'true';
      gmailButton.textContent = 'Abrir Gmail';
      regularOpen.insertAdjacentElement('beforebegin', gmailButton);
    } else if (gmailButton) {
      setText(gmailButton, 'Abrir Gmail');
      if (regularOpen && gmailButton.nextElementSibling !== regularOpen) {
        regularOpen.insertAdjacentElement('beforebegin', gmailButton);
      }
    }

    updateInfo(content, EMAIL_INFO);
    return true;
  }

  function syncModal() {
    syncQueued = false;
    const content = document.getElementById('modalContent');
    if (!content?.isConnected || !content.querySelector('.modal-head')) return;
    if (ensureGroupModal(content)) return;
    ensureEmailModal(content);
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(syncModal);
  }

  function whatsappShareUrl(message) {
    if (!message) return '';
    const query = new URLSearchParams({ text: message });
    return `https://wa.me/?${query.toString()}`;
  }

  function start() {
    const content = document.getElementById('modalContent');
    if (!content) return;

    const observer = new MutationObserver(scheduleSync);
    observer.observe(content, { childList: true, subtree: true });
    scheduleSync();

    document.addEventListener('click', event => {
      const shareButton = event.target.closest?.('[data-group-share]');
      if (!shareButton) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const currentContent = document.getElementById('modalContent');
      const url = whatsappShareUrl(preparedMessage(currentContent));
      if (!url) {
        updateInfo(currentContent, 'Não foi possível preparar o compartilhamento desta mensagem.');
        return;
      }

      window.open(url, '_blank', 'noopener');
      updateInfo(currentContent, 'O WhatsApp foi aberto com a mensagem preparada. Escolha o grupo desejado e confirme o envio.');
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
