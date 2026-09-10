(() => {
  'use strict';

  const COPY = new Map([
    ['settings-user', 'Gerencie pessoas da equipe, permissões, status e foto de perfil.'],
    ['settings-messages', 'Biblioteca dos modelos usados em WhatsApp e e-mail.'],
    ['settings-deadlines', 'Defina a cadência de lembretes e o aviso final do acompanhamento.'],
    ['settings-whatsapp-info', 'Modo assistido: o CRM prepara, abre o canal e registra após sua confirmação.'],
    ['settings-email-info', 'Modo assistido: assunto e mensagem prontos, com envio confirmado por você.'],
  ]);

  function approvedDate() {
    const value = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function syncApprovedDate() {
    const target = document.getElementById('currentDate');
    if (!target) return;
    const value = approvedDate();
    if (target.textContent !== value) target.textContent = value;
  }

  function syncLanding() {
    syncApprovedDate();
    const crm = document.querySelector('#crmApp');
    if (!crm || crm.dataset.page !== 'Configurações' || crm.dataset.settingsView) return;
    COPY.forEach((description, action) => {
      const card = document.querySelector(`.setting-card[data-action="${action}"]`);
      const paragraph = card?.querySelector('p');
      if (paragraph && paragraph.textContent !== description) paragraph.textContent = description;
    });
  }

  const dynamic = document.querySelector('#dynamicContent');
  if (dynamic) {
    new MutationObserver(syncLanding).observe(dynamic, { childList: true, subtree: true });
  }

  const headerActions = document.querySelector('#headerActions');
  if (headerActions) {
    new MutationObserver(syncApprovedDate).observe(headerActions, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('hashchange', () => requestAnimationFrame(syncLanding));
  document.addEventListener('click', event => {
    if (event.target.closest('.nav-item[data-page="Configurações"], [data-settings-subview-back]')) {
      requestAnimationFrame(() => requestAnimationFrame(syncLanding));
    }
  }, true);

  requestAnimationFrame(syncLanding);
})();
