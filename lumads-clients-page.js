import './lumads-clients-page.css';

const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5A14 14 0 0 0 14 16l1.5-2.5 5 2V19a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-1Z"/></svg>';
const emailIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>';
const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.2"/><path d="m15.6 15.6 4.1 4.1"/></svg>';
const arrowIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';
const topbarSearchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="11" cy="11" r="6.25"/><path d="m16 16 4.25 4.25"/></svg>';

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalized(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function sharedDateLabel(date = new Date()) {
  const value = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function syncClientsTopbar() {
  const app = document.getElementById('crmApp');
  if (!app || app.dataset.page !== 'Clientes') return;
  const actions = document.getElementById('headerActions');
  if (!actions) return;

  let globalSearch = actions.querySelector('[data-action="clients-global-search"]');
  if (!globalSearch) {
    globalSearch = document.createElement('button');
    globalSearch.className = 'icon-btn';
    globalSearch.type = 'button';
    globalSearch.dataset.action = 'clients-global-search';
    globalSearch.setAttribute('aria-label', 'Pesquisar clientes');
    globalSearch.innerHTML = topbarSearchIcon;
    globalSearch.addEventListener('click', () => {
      document.querySelector('[data-clients-search]')?.focus();
    });
  }

  const notifications = actions.querySelector('[data-action="notifications"]');
  const theme = actions.querySelector('#themeButton');
  const date = actions.querySelector('#currentDate');
  const primary = actions.querySelector('[data-action="new-client"]');
  if (date) date.textContent = sharedDateLabel();

  [globalSearch, notifications, theme, date, primary].forEach(item => {
    if (item) actions.appendChild(item);
  });
}

function buildCard(source, index) {
  const clientId = source.dataset.client || '';
  const name = source.querySelector('h3')?.textContent?.trim() || 'Cliente';
  const company = source.querySelector('.company')?.textContent?.trim() || '';
  const meta = [...source.querySelectorAll('.client-meta span')].map(item => item.textContent.trim());
  const whatsapp = meta[0] || '';
  const email = meta[1] || '';
  const pending = source.querySelector('.pending-count')?.textContent?.trim() || '0';
  const badge = source.querySelector('.client-card-foot .badge');
  const nextAction = source.querySelector('.client-card-foot .next-action');
  const statusHtml = badge
    ? badge.outerHTML
    : `<span class="lumads-client-status-muted">${escapeHtml(nextAction?.textContent?.trim() || 'Sem aprovações')}</span>`;
  const mark = source.querySelector('.client-card-mark');
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const markHtml = mark
    ? mark.outerHTML
    : `<span class="client-card-mark">${escapeHtml(initials || 'CL')}</span>`;
  const searchValue = normalized([name, company, whatsapp, email].join(' '));

  return `
    <article class="lumads-client-card" data-action="client-detail" data-client="${escapeHtml(clientId)}" data-client-index="${index}" data-client-name="${escapeHtml(normalized(name))}" data-client-search="${escapeHtml(searchValue)}" tabindex="0">
      <div class="lumads-client-card-top">
        <div class="lumads-client-brand">
          <div class="lumads-client-logo">${markHtml}</div>
          <div class="lumads-client-identity">
            <div class="lumads-client-name">${escapeHtml(name)}</div>
            <div class="lumads-client-type">${escapeHtml(company)}</div>
          </div>
        </div>
        <div class="lumads-client-menu-wrap">
          <button class="lumads-client-more" type="button" aria-label="Mais ações" aria-expanded="false">•••</button>
          <div class="lumads-client-menu" hidden>
            <button type="button" data-action="edit-client" data-client="${escapeHtml(clientId)}">Editar cliente</button>
            <button type="button" class="danger" data-action="delete-client" data-client="${escapeHtml(clientId)}">Arquivar cliente</button>
          </div>
        </div>
      </div>

      <div class="lumads-client-contact-list">
        <div class="lumads-client-contact">${phoneIcon}<span>${escapeHtml(whatsapp || 'WhatsApp não informado')}</span></div>
        <div class="lumads-client-contact">${emailIcon}<span>${escapeHtml(email || 'E-mail não informado')}</span></div>
      </div>

      <div class="lumads-client-divider"></div>

      <div class="lumads-client-footer">
        <div class="lumads-client-pending"><strong>${escapeHtml(pending)}</strong> pendente${pending === '1' ? '' : 's'}</div>
        <div class="lumads-client-status">${statusHtml}</div>
      </div>

      <span class="lumads-client-open" aria-hidden="true">${arrowIcon}</span>
    </article>`;
}

function bindClientsUI(root) {
  const input = root.querySelector('[data-clients-search]');
  const sortButton = root.querySelector('[data-clients-sort]');
  const grid = root.querySelector('[data-clients-grid]');
  if (!grid) return;

  const cards = () => [...grid.querySelectorAll('.lumads-client-card')];

  const apply = () => {
    const query = normalized(input?.value || '');
    cards().forEach(card => {
      card.hidden = Boolean(query) && !card.dataset.clientSearch.includes(query);
    });
  };

  input?.addEventListener('input', apply);

  sortButton?.addEventListener('click', event => {
    event.stopPropagation();
    const nextMode = sortButton.dataset.mode === 'recent' ? 'az' : 'recent';
    sortButton.dataset.mode = nextMode;
    sortButton.textContent = nextMode === 'az' ? 'A–Z' : 'Mais recentes';
    const ordered = cards().sort((a, b) => nextMode === 'az'
      ? a.dataset.clientName.localeCompare(b.dataset.clientName, 'pt-BR')
      : Number(a.dataset.clientIndex) - Number(b.dataset.clientIndex));
    ordered.forEach(card => grid.appendChild(card));
    apply();
  });

  root.addEventListener('click', event => {
    const more = event.target.closest('.lumads-client-more');
    if (more) {
      event.preventDefault();
      event.stopPropagation();
      const menu = more.parentElement.querySelector('.lumads-client-menu');
      const willOpen = menu.hidden;
      root.querySelectorAll('.lumads-client-menu').forEach(item => { item.hidden = true; });
      root.querySelectorAll('.lumads-client-more').forEach(item => item.setAttribute('aria-expanded', 'false'));
      menu.hidden = !willOpen;
      more.setAttribute('aria-expanded', String(willOpen));
      return;
    }

    if (event.target.closest('.lumads-client-menu button')) return;
    root.querySelectorAll('.lumads-client-menu').forEach(item => { item.hidden = true; });
    root.querySelectorAll('.lumads-client-more').forEach(item => item.setAttribute('aria-expanded', 'false'));
  });

  root.addEventListener('keydown', event => {
    const card = event.target.closest('.lumads-client-card');
    if (!card || !['Enter', ' '].includes(event.key)) return;
    if (event.target.closest('button')) return;
    event.preventDefault();
    card.click();
  });
}

function enhanceClients() {
  const app = document.getElementById('crmApp');
  const dynamic = document.getElementById('dynamicContent');
  if (!app || !dynamic || app.dataset.page !== 'Clientes') return;

  syncClientsTopbar();
  if (dynamic.querySelector('.lumads-clients-shell')) return;

  const sourceGrid = [...dynamic.children].find(child => child.classList?.contains('client-grid'));
  if (!sourceGrid) return;

  const sourceCards = [...sourceGrid.querySelectorAll('.client-card[data-client]')];
  const stateContent = !sourceCards.length ? sourceGrid.innerHTML : '';
  const cardsHtml = sourceCards.map(buildCard).join('');
  const controlsDisabled = sourceCards.length ? '' : ' disabled';

  dynamic.innerHTML = `
    <section class="lumads-clients-shell" aria-label="Base de clientes">
      <div class="lumads-clients-head">
        <div class="lumads-clients-heading">
          <h2>Base de clientes</h2>
          <p>Clientes cadastrados e situação atual das aprovações.</p>
        </div>
        <div class="lumads-clients-tools">
          <label class="lumads-clients-search">
            ${searchIcon}
            <input type="search" placeholder="Buscar cliente" data-clients-search${controlsDisabled}>
          </label>
          <button class="lumads-clients-sort" type="button" data-clients-sort data-mode="recent"${controlsDisabled}>Mais recentes</button>
        </div>
      </div>

      <div class="lumads-clients-grid" data-clients-grid>
        ${cardsHtml || `<div class="lumads-clients-state">${stateContent}</div>`}
      </div>

      <div class="lumads-clients-empty-space">
        <div class="lumads-clients-tip">
          <div><strong>Sua base crescerá aqui</strong><span>Novos clientes aparecem automaticamente neste espaço.</span></div>
        </div>
      </div>
    </section>`;

  bindClientsUI(dynamic.querySelector('.lumads-clients-shell'));
  syncClientsTopbar();
}

function scheduleEnhancement() {
  queueMicrotask(enhanceClients);
}

const observer = new MutationObserver(scheduleEnhancement);

function start() {
  const app = document.getElementById('crmApp');
  const dynamic = document.getElementById('dynamicContent');
  if (!app || !dynamic) return;
  observer.observe(dynamic, { childList: true, subtree: false });
  observer.observe(app, { attributes: true, attributeFilter: ['data-page'] });
  scheduleEnhancement();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
