(() => {
  'use strict';

  const THEME_KEY = 'lumads-theme-preference';

  const app = () => document.querySelector('#crmApp');
  const dynamicContent = () => document.querySelector('#dynamicContent');
  const currentTheme = () => localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  const themeLabel = value => value === 'dark' ? 'Escuro' : 'Claro';

  const appearanceIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M5.6 5.6 7 7m10 10 1.4 1.4M3 12h2m14 0h2M5.6 18.4 7 17m10-10 1.4-1.4"/></svg>';
  const infoIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 10v6M12 7.5h.01"/></svg>';

  function themeCard(value, title, description, selected) {
    return `<button type="button" class="settings-theme-card${selected === value ? ' is-selected' : ''}" data-settings-theme="${value}" aria-pressed="${selected === value}">
      <span class="settings-theme-preview ${value}"><i></i><b></b><em class="a"></em><em class="b"></em><em class="c"></em></span>
      <span class="settings-theme-meta"><span><strong>${title}</strong><small>${description}</small></span><i class="settings-theme-radio" aria-hidden="true"></i></span>
    </button>`;
  }

  function renderAppearance() {
    const crm = app();
    const content = dynamicContent();
    if (!crm || !content || crm.dataset.page !== 'Configurações') return;

    const selected = currentTheme();
    crm.dataset.settingsView = 'appearance';

    const eyebrow = document.querySelector('#pageEyebrow');
    const title = document.querySelector('#pageTitle');
    if (eyebrow) eyebrow.textContent = 'Configurações';
    if (title) title.textContent = 'Aparência';

    content.innerHTML = `<button type="button" class="settings-appearance-back" data-settings-appearance-back>← Voltar para configurações</button>
      <section class="settings-appearance-panel">
        <header class="settings-appearance-head">
          <div class="settings-appearance-title-wrap">
            <span class="settings-appearance-icon">${appearanceIcon}</span>
            <div><h2>Preferência visual</h2><p>Escolha como o LUMADS CRM deve aparecer para você.</p></div>
          </div>
          <span class="settings-appearance-status">${themeLabel(selected)}</span>
        </header>
        <div class="settings-appearance-body">
          <h3 class="settings-appearance-section-title">Tema do sistema</h3>
          <p class="settings-appearance-section-sub">A escolha é aplicada em todo o CRM e permanece após atualizar a página.</p>
          <div class="settings-theme-grid">
            ${themeCard('light', 'Claro', 'Interface clara, limpa e objetiva.', selected)}
            ${themeCard('dark', 'Escuro', 'Interface escura com contraste confortável.', selected)}
          </div>
          <div class="settings-appearance-note"><span>${infoIcon}</span><div><strong>Preferência salva neste navegador</strong><p>Você pode alternar entre claro e escuro sempre que quiser.</p></div></div>
        </div>
      </section>`;
  }

  function returnToSettings() {
    const crm = app();
    if (crm) delete crm.dataset.settingsView;
    const settingsNav = document.querySelector('.nav-item[data-page="Configurações"]');
    if (settingsNav) settingsNav.click();
    else window.location.hash = '#settings';
  }

  function applyTheme(value) {
    const desired = value === 'dark' ? 'dark' : 'light';
    if (desired === currentTheme()) {
      renderAppearance();
      return;
    }

    const themeButton = document.querySelector('#themeButton');
    if (themeButton) {
      themeButton.click();
      requestAnimationFrame(renderAppearance);
      return;
    }

    localStorage.setItem(THEME_KEY, desired);
    document.documentElement.dataset.theme = desired;
    renderAppearance();
  }

  function isSettingsAppearanceTrigger(target) {
    const crm = app();
    if (!crm || crm.dataset.page !== 'Configurações') return false;
    return Boolean(target.closest?.('[data-action="settings-appearance"]'));
  }

  // Intercepta antes do click legado do app-core, que ainda alterna o tema diretamente.
  // O pointerdown remove esse conflito e abre a subtela aprovada primeiro.
  window.addEventListener('pointerdown', event => {
    if (!isSettingsAppearanceTrigger(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    renderAppearance();
  }, true);

  window.addEventListener('click', event => {
    const crm = app();
    if (!crm) return;

    if (isSettingsAppearanceTrigger(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      renderAppearance();
      return;
    }

    const back = event.target.closest?.('[data-settings-appearance-back]');
    if (back && crm.dataset.page === 'Configurações') {
      event.preventDefault();
      event.stopImmediatePropagation();
      returnToSettings();
      return;
    }

    const themeChoice = event.target.closest?.('[data-settings-theme]');
    if (themeChoice && crm.dataset.page === 'Configurações' && crm.dataset.settingsView === 'appearance') {
      event.preventDefault();
      event.stopImmediatePropagation();
      applyTheme(themeChoice.dataset.settingsTheme);
      return;
    }

    if (crm.dataset.page === 'Configurações' && crm.dataset.settingsView === 'appearance' && event.target.closest?.('#themeButton')) {
      setTimeout(renderAppearance, 0);
      return;
    }

    if (event.target.closest?.('.nav-item')) delete crm.dataset.settingsView;
  }, true);
})();
