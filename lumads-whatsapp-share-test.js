(() => {
  'use strict';

  function preparedMessage(content) {
    return content?.querySelector('textarea[readonly]')?.value || '';
  }

  function isGroupModal(content) {
    if (!content?.isConnected) return false;
    const title = content.querySelector('.modal-head h2')?.textContent || '';
    if (!/Enviar por WhatsApp/i.test(title)) return false;

    const field = [...content.querySelectorAll('.field')].find(item =>
      /Destinatário/i.test(item.querySelector('label')?.textContent || '')
    );
    const recipient = field?.querySelector('input[readonly]')?.value.trim() || '';
    return /^https:\/\/chat\.whatsapp\.com\//i.test(recipient);
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

  function enhanceShareButton() {
    const content = document.getElementById('modalContent');
    if (!isGroupModal(content)) return;
    if (content.querySelector('[data-group-share]')) return;

    const copyButton = content.querySelector('[data-group-copy]');
    if (copyButton) copyButton.hidden = true;

    const openGroupButton = content.querySelector('[data-group-open]');
    const confirmButton = content.querySelector('[data-communication-action="confirm"]');
    if (!openGroupButton && !confirmButton) return;

    const shareButton = document.createElement('button');
    shareButton.type = 'button';
    shareButton.className = 'secondary';
    shareButton.dataset.groupShare = 'true';
    shareButton.textContent = 'Compartilhar mensagem';

    if (openGroupButton) {
      openGroupButton.insertAdjacentElement('beforebegin', shareButton);
    } else {
      confirmButton.insertAdjacentElement('beforebegin', shareButton);
    }

    updateInfo(content, 'Você pode compartilhar a mensagem pelo WhatsApp e escolher o grupo, ou abrir diretamente o grupo cadastrado.');
  }

  function start() {
    enhanceShareButton();

    const observer = new MutationObserver(() => enhanceShareButton());
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
