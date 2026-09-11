(() => {
  'use strict';

  function preparedMessage(content) {
    return content?.querySelector('textarea[readonly]')?.value || '';
  }

  function recipientField(content) {
    return [...content.querySelectorAll('.field')].find(item =>
      /Destinatário/i.test(item.querySelector('label')?.textContent || '')
    ) || null;
  }

  function groupUrlFromModal(content) {
    const field = recipientField(content);
    const recipient = field?.querySelector('input[readonly]')?.value.trim() || '';
    return /^https:\/\/chat\.whatsapp\.com\//i.test(recipient) ? recipient : '';
  }

  function isGroupModal(content) {
    if (!content?.isConnected) return false;
    const title = content.querySelector('.modal-head h2')?.textContent || '';
    if (!/Enviar por WhatsApp/i.test(title)) return false;
    return Boolean(groupUrlFromModal(content));
  }

  function whatsappShareUrl(message) {
    if (!message) return '';
    const query = new URLSearchParams({ text: message });
    return `https://wa.me/?${query.toString()}`;
  }

  function updateInfo(content, text) {
    const info = content?.querySelector('.modal-info p');
    if (info) info.textContent = text;
  }

  function ensureGroupUi(content) {
    if (!isGroupModal(content)) return;

    const field = recipientField(content);
    const groupUrl = groupUrlFromModal(content);
    const label = field?.querySelector('label');
    if (label) label.textContent = 'Destinatário (grupo)';

    const regularOpen = content.querySelector('[data-communication-action="open"]');
    if (regularOpen) regularOpen.hidden = true;

    const copyButton = content.querySelector('[data-group-copy]');
    if (copyButton) copyButton.hidden = true;

    const confirmButton = content.querySelector('[data-communication-action="confirm"]');
    if (!confirmButton) return;

    const groupButtons = [...content.querySelectorAll('[data-group-open]')];
    let openGroupButton = groupButtons[0] || null;
    groupButtons.slice(1).forEach(button => button.remove());

    if (!openGroupButton) {
      openGroupButton = document.createElement('button');
      openGroupButton.type = 'button';
      openGroupButton.className = 'secondary';
      openGroupButton.dataset.groupOpen = 'true';
      confirmButton.insertAdjacentElement('beforebegin', openGroupButton);
    }

    openGroupButton.dataset.groupUrl = groupUrl;
    openGroupButton.textContent = 'Abrir grupo';
    openGroupButton.hidden = false;

    let shareButton = content.querySelector('[data-group-share]');
    if (!shareButton) {
      shareButton = document.createElement('button');
      shareButton.type = 'button';
      shareButton.className = 'secondary';
      shareButton.dataset.groupShare = 'true';
      shareButton.textContent = 'Compartilhar mensagem';
    }

    if (shareButton.nextElementSibling !== openGroupButton) {
      openGroupButton.insertAdjacentElement('beforebegin', shareButton);
    }

    updateInfo(content, 'Você pode compartilhar a mensagem pelo WhatsApp e escolher o grupo, ou abrir diretamente o grupo cadastrado.');
  }

  function start() {
    const sync = () => {
      const content = document.getElementById('modalContent');
      ensureGroupUi(content);
    };

    sync();

    const observer = new MutationObserver(() => sync());
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', event => {
      const shareButton = event.target.closest?.('[data-group-share]');
      if (!shareButton) return;

      event.preventDefault();
      event.stopPropagation();

      const content = document.getElementById('modalContent');
      const message = preparedMessage(content);
      const url = whatsappShareUrl(message);
      if (!url) {
        updateInfo(content, 'Não foi possível preparar o compartilhamento desta mensagem.');
        return;
      }

      window.open(url, '_blank', 'noopener');
      updateInfo(content, 'O WhatsApp foi aberto com a mensagem preparada. Escolha o grupo desejado e confirme o envio.');
    }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
