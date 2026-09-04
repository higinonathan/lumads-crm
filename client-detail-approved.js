const detailContactIcons = {
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5A14 14 0 0 0 14 16l1.5-2.5 5 2V19a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-1Z"/></svg>',
  email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>'
};

const detailMetricIcons = {
  active: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="m8.5 12 2.2 2.2 4.9-5.2"/></svg>',
  complete: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
  contacts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></svg>'
};

function detailCount(text) {
  const match = String(text || '').match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function detailStatusClass(label) {
  const normalized = String(label || '').toLowerCase();
  if (normalized.includes('publicado')) return 'published';
  if (normalized.includes('aprovado')) return 'approved';
  if (normalized.includes('lembrete 2')) return 'reminder2';
  if (normalized.includes('lembrete 1')) return 'reminder1';
  if (normalized.includes('ajuste')) return 'changes';
  if (normalized.includes('encerrado')) return 'closed';
  return 'waiting';
}

function buildDetailSummary(activeCount, completeCount) {
  const summary = document.createElement('section');
  summary.className = 'client-detail-summary-approved';
  summary.innerHTML = `
    <article class="client-detail-mini-approved">
      <div><div class="client-detail-mini-label">Aprovações ativas</div><div class="client-detail-mini-value" data-detail-count="active">${activeCount}</div><div class="client-detail-mini-sub">Em acompanhamento</div></div>
      <span class="client-detail-mini-icon blue">${detailMetricIcons.active}</span>
    </article>
    <article class="client-detail-mini-approved">
      <div><div class="client-detail-mini-label">Histórico concluído</div><div class="client-detail-mini-value" data-detail-count="complete">${completeCount}</div><div class="client-detail-mini-sub">Aprovações finalizadas</div></div>
      <span class="client-detail-mini-icon green">${detailMetricIcons.complete}</span>
    </article>
    <article class="client-detail-mini-approved">
      <div><div class="client-detail-mini-label">Últimos contatos</div><div class="client-detail-mini-value" data-detail-count="contacts">…</div><div class="client-detail-mini-sub">WhatsApp e e-mail</div></div>
      <span class="client-detail-mini-icon purple">${detailMetricIcons.contacts}</span>
    </article>`;
  return summary;
}

function transformHistoryPanel(panel) {
  if (!panel || panel.dataset.detailHistoryEnhanced === '1') return;
  const timeline = panel.querySelector('.timeline');
  if (!timeline) return;
  const items = [...timeline.querySelectorAll('.timeline-item')];
  const meaningful = items.filter(item => !/carregando|indisponível|sem histórico/i.test(item.textContent || ''));
  if (!meaningful.length) {
    timeline.classList.add('client-detail-empty-approved');
    panel.dataset.detailHistoryEnhanced = '1';
    return;
  }

  const rows = meaningful.map(item => {
    const strong = item.querySelector('b')?.textContent.trim() || '';
    const separator = strong.lastIndexOf(' · ');
    const content = separator >= 0 ? strong.slice(0, separator) : strong;
    const status = separator >= 0 ? strong.slice(separator + 3) : '';
    const body = (item.textContent || '').replace(strong, '').trim();
    const match = body.match(/Finalizado em\s+(.+?)\s+após\s+(\d+)\s+lembrete/i);
    const finalDate = match?.[1] || '—';
    const reminders = match?.[2] || '0';
    return `<tr><td><span class="strong">${content}</span><span class="sub">Conteúdo finalizado</span></td><td>${finalDate}</td><td>${reminders}</td><td><span class="badge ${detailStatusClass(status)}">${status || 'Concluído'}</span></td></tr>`;
  }).join('');

  const table = document.createElement('div');
  table.className = 'table-wrap client-detail-history-table-approved';
  table.innerHTML = `<table class="page-table"><thead><tr><th>Conteúdo</th><th>Data final</th><th>Lembretes</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`;
  timeline.replaceWith(table);
  panel.dataset.detailHistoryEnhanced = '1';
}

function enhanceContactHistory(container) {
  if (!container) return;
  container.classList.add('client-detail-contacts-approved');
  [...container.querySelectorAll('.timeline-item')].forEach(item => {
    const raw = item.textContent || '';
    if (/carregando|nenhum contato|não foi possível/i.test(raw)) {
      item.classList.add('client-detail-empty-approved');
      return;
    }
    const lines = (item.innerText || raw).split('\n').map(line => line.trim()).filter(Boolean);
    const title = lines[0] || 'Comunicação';
    const date = lines[1] || 'Data indisponível';
    const status = lines[2] || 'Registrado';
    const channel = /^whatsapp/i.test(title) ? 'whatsapp' : 'email';
    item.className = 'client-contact-row';
    item.innerHTML = `<span class="client-contact-icon ${channel}">${detailContactIcons[channel]}</span><span><span class="client-contact-title">${title}</span><span class="client-contact-sub">${date}</span></span><span class="client-contact-status">${status}</span>`;
  });

  const dynamic = document.getElementById('dynamicContent');
  const counter = dynamic?.querySelector('[data-detail-count="contacts"]');
  if (counter) {
    const count = container.querySelectorAll('.client-contact-row').length;
    const loading = container.querySelector('.timeline-item:not(.client-contact-row):not(.client-detail-empty-approved)');
    counter.textContent = loading ? '…' : String(count);
  }
}

function alignDetailHeader(clientId) {
  const title = document.getElementById('pageTitle');
  const eyebrow = document.getElementById('pageEyebrow');
  if (title) title.textContent = 'Detalhe do cliente';
  if (eyebrow) eyebrow.textContent = 'Base de clientes';
  const action = document.querySelector('#headerActions .primary');
  if (action) {
    action.dataset.action = 'new-approval';
    action.dataset.client = clientId || '';
    action.textContent = '+ Nova aprovação';
  }
}

function enhanceClientDetail() {
  const app = document.getElementById('crmApp');
  const dynamic = document.getElementById('dynamicContent');
  if (!app || app.dataset.page !== 'Clientes' || !dynamic) return;

  const layout = dynamic.querySelector('.detail-layout');
  if (!layout) {
    dynamic.classList.remove('client-detail-approved');
    dynamic.removeAttribute('data-detail-approved');
    return;
  }

  const profile = layout.querySelector(':scope > .detail-card');
  const content = layout.querySelector(':scope > div');
  if (!profile || !content) return;
  const clientId = profile.querySelector('[data-client]')?.dataset.client || '';
  alignDetailHeader(clientId);

  if (dynamic.dataset.detailApproved !== '1') {
    dynamic.dataset.detailApproved = '1';
    dynamic.classList.add('client-detail-approved');

    const back = dynamic.querySelector(':scope > .back-link[data-action="back-clients"]');
    if (back) back.classList.add('client-detail-back-approved');

    layout.classList.add('client-detail-layout-approved');
    profile.classList.add('client-detail-profile-approved');
    profile.querySelector('.company-dot')?.classList.add('client-detail-logo-approved');
    profile.querySelector('.modal-foot')?.classList.add('client-detail-profile-actions-approved');
    content.classList.add('client-detail-content-approved');

    const panels = [...content.querySelectorAll(':scope > .sub-card')];
    panels.forEach(panel => panel.classList.add('client-detail-panel-approved'));
    const currentPanel = panels[0];
    const historyPanel = panels[1];
    const contactsPanel = panels[2];
    const activeCount = detailCount(currentPanel?.querySelector('.detail-heading .next-action')?.textContent);
    const completeCount = detailCount(historyPanel?.querySelector('.detail-heading .next-action')?.textContent);
    content.prepend(buildDetailSummary(activeCount, completeCount));
    transformHistoryPanel(historyPanel);
    const contactContainer = contactsPanel?.querySelector('#clientContactHistory');
    enhanceContactHistory(contactContainer);
  } else {
    const contacts = dynamic.querySelector('#clientContactHistory');
    enhanceContactHistory(contacts);
  }
}

let detailEnhancementQueued = false;
function queueClientDetailEnhancement() {
  if (detailEnhancementQueued) return;
  detailEnhancementQueued = true;
  queueMicrotask(() => {
    detailEnhancementQueued = false;
    enhanceClientDetail();
  });
}

const detailObserver = new MutationObserver(queueClientDetailEnhancement);
detailObserver.observe(document.documentElement, { childList:true, subtree:true });
window.addEventListener('hashchange', queueClientDetailEnhancement);
queueClientDetailEnhancement();
