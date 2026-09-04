(() => {
  'use strict';

  const THEME_KEY = 'lumads-theme-preference';
  const app = () => document.querySelector('#crmApp');
  const dynamicContent = () => document.querySelector('#dynamicContent');
  const currentTheme = () => localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  const themeLabel = value => value === 'dark' ? 'Escuro' : 'Claro';

  const appearanceIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2.2M12 19.8V22M4.93 4.93l1.55 1.55M17.52 17.52l1.55 1.55M2 12h2.2M19.8 12H22M4.93 19.07l1.55-1.55M17.52 6.48l1.55-1.55"/></svg>';
  const infoIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 10v6M12 7.5h.01"/></svg>';

  function preview(value) {
    return `<div class="settings-theme-preview ${value}">
      <div class="settings-preview-sidebar"></div>
      <div class="settings-preview-top"></div>
      <div class="settings-preview-card a"></div>
      <div class="settings-preview-card b"></div>
      <div class="settings-preview-card c"></div>
      <div class="settings-preview-accent"></div>
      <div class="settings-preview-line l1"></div>
      <div class="settings-preview-line l2"></div>
      <div class="settings-preview-line l3"></div>
      <div class="settings-preview-dot"></div>
    </div>`;
  }

  function themeCard(value, title, description, selected) {
    return `<button type="button" class="settings-theme-card${selected === value ? ' is-selected' : ''}" data-settings-theme="${value}" aria-pressed="${selected === value}">
      ${preview(value)}
      <div class="settings-theme-meta">
        <div><div class="settings-theme-name">${title}</div><div class="settings-theme-desc">${description}</div></div>
        <div class="settings-theme-radio" aria-hidden="true"></div>
      </div>
    </button>`;
  }

  function removeAppearanceBack() {
    document.querySelector('#settingsAppearanceHeaderBack')?.remove();
  }

  function renderAppearance() {
    const crm = app();
    const content = dynamicContent();
    if (!crm || !content || crm.dataset.page !== 'Configurações') return;

    const selected = currentTheme();
    crm.dataset.settingsView = 'appearance';

    const eyebrow = document.querySelector('#pageEyebrow');
    const title = document.querySelector('#pageTitle');
    removeAppearanceBack();
    if (eyebrow) {
      eyebrow.insertAdjacentHTML('beforebegin', '<button type="button" id="settingsAppearanceHeaderBack" data-settings-appearance-back>← Voltar para configurações</button>');
      eyebrow.textContent = 'APARÊNCIA';
    }
    if (title) title.textContent = 'Preferências visuais';

    content.innerHTML = `<div class="settings-appearance-content">
      <section class="settings-appearance-panel">
        <div class="settings-appearance-panel-head">
          <div class="settings-appearance-panel-title-wrap">
            <div class="settings-appearance-head-icon">${appearanceIcon}</div>
            <div><h2>Aparência do CRM</h2><p>Escolha entre o modo claro e o modo escuro.</p></div>
          </div>
          <span class="settings-appearance-status">Tema atual: ${themeLabel(selected)}</span>
        </div>

        <div class="settings-appearance-panel-body">
          <div class="settings-appearance-section-title">Tema</div>
          <div class="settings-appearance-section-sub">A alteração é aplicada imediatamente em todo o sistema.</div>

          <div class="settings-theme-grid">
            ${themeCard('light', 'Claro', 'Interface clara e limpa.', selected)}
            ${themeCard('dark', 'Escuro', 'Interface escura em azul profundo.', selected)}
          </div>

          <div class="settings-appearance-note">
            <div class="settings-appearance-note-icon">${infoIcon}</div>
            <div><strong>Preferência salva automaticamente</strong><span>Não é necessário clicar em salvar. O CRM mantém a última opção escolhida.</span></div>
          </div>
        </div>
      </section>
    </div>`;
  }

  function returnToSettings() {
    const crm = app();
    removeAppearanceBack();
    if (crm) delete crm.dataset.settingsView;
    const settingsNav = document.querySelector('.nav-item[data-page="Configurações"]');
    if (settingsNav) settingsNav.click();
    else window.location.hash = '#settings';
  }

  function applyTheme(value) {
    const desired = value === 'dark' ? 'dark' : 'light';
    if (desired === currentTheme()) return renderAppearance();
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
    return Boolean(crm && crm.dataset.page === 'Configurações' && target.closest?.('[data-action="settings-appearance"]'));
  }

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

    if (event.target.closest?.('.nav-item')) {
      removeAppearanceBack();
      delete crm.dataset.settingsView;
    }
  }, true);
})();
