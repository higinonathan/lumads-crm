import { loadClients } from './clients-data.js';
import { loadApprovals } from './approvals-data.js';
import { loadClientContactHistory } from './communications-data.js';
import { publicClientLogoUrl } from './client-logo-storage.js';

(() => {
  'use strict';

  const dynamic = document.querySelector('#dynamicContent');
  const crm = document.querySelector('#crmApp');
  if (!dynamic || !crm) return;

  const FINAL = new Set(['approved', 'published', 'closed']);
  const STATUS = {
    waiting_approval: ['Aguardando aprovação', 'waiting'],
    reminder_1: ['Lembrete 1 enviado', 'reminder'],
    reminder_2: ['Lembrete 2 enviado', 'reminder'],
    adjustment_requested: ['Ajustes solicitados', 'adjustment'],
    approved: ['Aprovado', 'approved'],
    published: ['Publicado', 'published'],
    closed: ['Encerrado', 'closed']
  };

  const view = {
    filter: 'active',
    query: '',
    descending: false,
    clients: [],
    approvals: [],
    loading: false,
    scheduled: false,
    ownRender: false
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const formatDate = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('pt-BR').format(new Date(value)); }
    catch (_) { return '—'; }
  };

  const formatDateTime = value => {
    if (!value) return '—';
    try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
    catch (_) { return '—'; }
  };

  const initials = value => String(value || 'Cliente').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'CL';
  const logoUrl = client => {
    const logo = client?.logo || '';
    if (!logo) return '';
    return /^data:|^https?:\/\//i.test(logo) ? logo : publicClientLogoUrl(logo);
  };
  const logo = (client, large = false) => {
    const url = logoUrl(client);
    return `<span class="clients-ag-logo${large ? ' is-large' : ''}">${url ? `<img src="${escapeHtml(url)}" alt="Logo de ${escapeHtml(client.name)}">` : escapeHtml(initials(client.name))}</span>`;
  };
  const statusPill = status => {
    const [label, cls] = STATUS[status] || [status || 'Sem status', 'muted'];
    return `<span class="clients-ag-status ${cls}"><span></span>${escapeHtml(label)}</span>`;
  };
  const summaryFor = clientId => {
    const records = view.approvals.filter(item => item.clientId === clientId);
    const pending = records.filter(item => !FINAL.has(item.status)).length;
    const completed = records.filter(item => FINAL.has(item.status)).length;
    const latest = [...records].sort((a, b) => new Date(b.statusChangedAt || b.createdAt) - new Date(a.statusChangedAt || a.createdAt))[0];
    return { records, pending, completed, latestAt: latest ? (latest.statusChangedAt || latest.createdAt) : null, latestStatus: latest?.status || null };
  };
  const dueLabel = approval => {
    if (!approval?.dueAt) return 'Sem prazo';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(approval.dueAt); due.setHours(0, 0, 0, 0);
    const days = Math.round((due - today) / 86400000);
    if (days < 0) return `Venceu há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`;
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Amanhã';
    return formatDate(approval.dueAt);
  };
  const preferredChannel = client => ({ whatsapp: 'WhatsApp', email: 'E-mail', both: 'WhatsApp e E-mail' })[client?.preferredChannel] || 'WhatsApp e E-mail';

  const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8 5.4 4.7c-1 .5-1.5 1.6-1.2 2.7 1.7 6.5 5.9 10.7 12.4 12.4 1.1.3 2.2-.2 2.7-1.2l.9-1.8-4-2.4-1.3 1.3c-2.3-.9-4.3-2.9-5.2-5.2l1.3-1.3-2.4-4z"/></svg>';
  const emailIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 5.5L19.5 7"/></svg>';
  const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"/><path d="m15.2 15.2 4.3 4.3"/></svg>';
  const whatsappIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5A14 14 0 0 0 14 16l1.5-2.5 5 2V19a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-1Z"/></svg>';
  const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>';
  const archiveIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4z"/><path d="M3 4h18v3H3zM9 11h6"/></svg>';

  function clientCard(client) {
    const summary = summaryFor(client.id);
    const active = client.isActive !== false;
    const search = `${client.name} ${client.company} ${client.contact || ''} ${client.whatsapp || ''} ${client.email || ''}`.toLowerCase();
    const contactName = client.contact ? `<div class="clients-ag-contact-name">${escapeHtml(client.contact)}</div>` : '';
    return `<article class="clients-ag-card" data-client-card data-client="${escapeHtml(client.id)}" data-active="${active}" data-search="${escapeHtml(search)}" data-name="${escapeHtml((client.name || '').toLowerCase())}">
      <div class="clients-ag-card-head">
        <div class="clients-ag-identity">${logo(client)}<div><strong title="${escapeHtml(client.name)}">${escapeHtml(client.name)}</strong><span>${escapeHtml(client.company || 'Sem segmento')}</span></div></div>
        <div class="clients-ag-menu-wrap"><button class="clients-ag-more" type="button" data-clients-ag-more aria-label="Ações de ${escapeHtml(client.name)}">•••</button><div class="clients-ag-menu" hidden><button type="button" data-action="edit-client" data-client="${escapeHtml(client.id)}">Editar cliente</button>${active ? `<button type="button" class="danger" data-action="delete-client" data-client="${escapeHtml(client.id)}">Arquivar cliente</button>` : ''}</div></div>
      </div>
      <div class="clients-ag-contact-block">${contactName}<div>${phoneIcon}<span>${escapeHtml(client.whatsapp || 'WhatsApp não informado')}</span></div><div>${emailIcon}<span>${escapeHtml(client.email || 'E-mail não informado')}</span></div></div>
      <div class="clients-ag-metrics"><div><span>PENDENTES</span><strong>${summary.pending}</strong></div><div><span>CONCLUÍDAS</span><strong>${summary.completed}</strong></div><div><span>ÚLTIMA AÇÃO</span><strong class="is-date">${summary.latestAt ? formatDate(summary.latestAt) : '—'}</strong></div></div>
      <div class="clients-ag-card-foot">
        <div class="clients-ag-foot-state"><strong>${summary.pending} pendente${summary.pending === 1 ? '' : 's'}</strong><span class="clients-ag-active-pill ${active ? '' : 'archived'}">• ${active ? 'Ativo' : 'Arquivado'}</span></div>
        <div class="clients-ag-actions">${active && client.whatsapp ? `<button class="clients-ag-round whatsapp" type="button" data-action="whatsapp-client" data-client="${escapeHtml(client.id)}" aria-label="Abrir WhatsApp">${whatsappIcon}</button>` : ''}${active ? `<button class="clients-ag-round add" type="button" data-action="new-approval" data-client="${escapeHtml(client.id)}" aria-label="Nova aprovação">+</button><button class="clients-ag-open" type="button" data-action="client-detail" data-client="${escapeHtml(client.id)}">Abrir <span>›</span></button>` : ''}</div>
      </div>
    </article>`;
  }

  function renderList() {
    view.ownRender = true;
    dynamic.classList.remove('client-detail-approved');
    dynamic.innerHTML = `<section class="clients-ag-page"><header class="clients-ag-toolbar"><p class="clients-ag-lead">Gerencie os contatos e acompanhe as aprovações por cliente.</p><div class="clients-ag-tools"><div class="clients-ag-segmented" role="group" aria-label="Filtrar clientes"><button type="button" data-clients-ag-filter="active">Ativos</button><button type="button" data-clients-ag-filter="archived">Arquivados</button><button type="button" data-clients-ag-filter="all">Todos</button></div><label class="clients-ag-search">${searchIcon}<input type="search" data-clients-ag-search placeholder="Buscar cliente" value="${escapeHtml(view.query)}"></label><button class="clients-ag-sort" type="button" data-clients-ag-sort>Ordenar ${view.descending ? 'Z–A' : 'A–Z'} <span>⌄</span></button></div></header><div class="clients-ag-grid">${view.clients.map(clientCard).join('')}</div><div class="clients-ag-no-results" data-clients-ag-empty hidden><strong>Nenhum cliente encontrado</strong><span>Ajuste os filtros ou a busca para localizar um cliente.</span></div><div class="clients-ag-tip"><strong>Base de clientes</strong><span>Use a busca para encontrar rapidamente um contato cadastrado.</span></div></section>`;
    applyListState();
    queueMicrotask(() => { view.ownRender = false; });
  }

  function applyListState() {
    const root = dynamic.querySelector('.clients-ag-page');
    if (!root) return;
    root.querySelectorAll('[data-clients-ag-filter]').forEach(button => button.classList.toggle('active', button.dataset.clientsAgFilter === view.filter));
    const grid = root.querySelector('.clients-ag-grid');
    const cards = [...root.querySelectorAll('[data-client-card]')];
    cards.sort((a, b) => { const result = a.dataset.name.localeCompare(b.dataset.name, 'pt-BR'); return view.descending ? -result : result; }).forEach(card => grid.appendChild(card));
    let visible = 0;
    const query = view.query.trim().toLowerCase();
    cards.forEach(card => {
      const isActive = card.dataset.active === 'true';
      const statusMatch = view.filter === 'all' || (view.filter === 'active' ? isActive : !isActive);
      const searchMatch = !query || card.dataset.search.includes(query);
      card.hidden = !(statusMatch && searchMatch);
      if (!card.hidden) visible += 1;
    });
    const empty = root.querySelector('[data-clients-ag-empty]'); if (empty) empty.hidden = visible !== 0;
    const sort = root.querySelector('[data-clients-ag-sort]'); if (sort) sort.innerHTML = `Ordenar ${view.descending ? 'Z–A' : 'A–Z'} <span>⌄</span>`;
  }

  function currentApprovalRows(records) {
    if (!records.length) return `<tr><td colspan="4" class="clients-ag-table-empty">Sem aprovações em acompanhamento.</td></tr>`;
    return records.map(approval => `<tr><td><strong>${escapeHtml(approval.content)}</strong><span>${escapeHtml(approval.type || 'Conteúdo em aprovação')}</span>${approval.link ? `<button class="clients-ag-inline-link" type="button" data-action="open-post" data-id="${escapeHtml(approval.id)}">PodePostar</button>` : ''}</td><td class="clients-ag-due">${escapeHtml(dueLabel(approval))}</td><td>${statusPill(approval.status)}</td><td><button class="clients-ag-row-open" type="button" data-action="open-post" data-id="${escapeHtml(approval.id)}" aria-label="Abrir aprovação">↗</button></td></tr>`).join('');
  }

  function historyRows(records) {
    if (!records.length) return `<tr><td colspan="4" class="clients-ag-table-empty">Sem histórico de aprovações.</td></tr>`;
    return records.map(approval => `<tr><td><strong>${escapeHtml(approval.content)}</strong><span>Iniciado em ${formatDate(approval.createdAt)}</span></td><td>${formatDate(approval.approvedAt || approval.finalizedAt || approval.statusChangedAt)}</td><td>${statusPill(approval.status)}</td><td>${approval.link ? `<button class="clients-ag-row-open" type="button" data-action="open-post" data-id="${escapeHtml(approval.id)}" aria-label="Abrir no PodePostar">↗</button>` : '—'}</td></tr>`).join('');
  }

  function contactRows(client, contacts) {
    if (!contacts.length) return `<div class="clients-ag-contacts-empty">Nenhuma comunicação registrada para este cliente.</div>`;
    return contacts.map(contact => {
      const channel = contact.channel === 'whatsapp' ? 'WhatsApp' : 'E-mail';
      const label = contact.templateLabel || contact.templateKey || 'Comunicação';
      const recipient = client.contact ? ` para ${client.contact}` : '';
      return `<article class="clients-ag-contact-event"><div class="clients-ag-contact-event-main"><span class="clients-ag-contact-event-icon ${contact.channel === 'whatsapp' ? 'whatsapp' : 'email'}">${contact.channel === 'whatsapp' ? whatsappIcon : emailIcon}</span><div><strong>${escapeHtml(channel)} · ${escapeHtml(label)}</strong><span>${escapeHtml(label)} enviado via ${escapeHtml(channel)}${escapeHtml(recipient)}</span></div></div><time>${formatDateTime(contact.sentAt || contact.createdAt)}</time></article>`;
    }).join('');
  }

  async function renderDetail(clientId) {
    const client = view.clients.find(item => item.id === clientId);
    if (!client) return;
    const records = view.approvals.filter(item => item.clientId === clientId);
    const active = records.filter(item => !FINAL.has(item.status));
    const complete = records.filter(item => FINAL.has(item.status)).sort((a, b) => new Date(b.statusChangedAt || b.createdAt) - new Date(a.statusChangedAt || a.createdAt));
    let contacts = [];
    try { contacts = await loadClientContactHistory(clientId, 20); }
    catch (error) { console.error('Não foi possível carregar as comunicações do cliente.', error); }
    if (crm.dataset.page !== 'Clientes') return;

    view.ownRender = true;
    dynamic.classList.add('client-detail-approved');
    dynamic.innerHTML = `<section class="clients-ag-detail"><section class="clients-ag-detail-hero"><div class="clients-ag-detail-brand">${logo(client, true)}<div><div class="clients-ag-detail-name-line"><h2>${escapeHtml(client.name)}</h2><span class="clients-ag-active-pill ${client.isActive === false ? 'archived' : ''}">• ${client.isActive === false ? 'Arquivado' : 'Ativo'}</span></div><p>${escapeHtml(client.company || 'Sem segmento')}</p></div></div><div class="clients-ag-detail-actions"><button class="clients-ag-secondary" type="button" data-action="edit-client" data-client="${escapeHtml(client.id)}">${editIcon}<span>Editar</span></button>${client.whatsapp ? `<button class="clients-ag-secondary" type="button" data-action="whatsapp-client" data-client="${escapeHtml(client.id)}">${whatsappIcon}<span>WhatsApp</span></button>` : ''}<button class="clients-ag-primary" type="button" data-action="new-approval" data-client="${escapeHtml(client.id)}">+ <span>Nova aprovação</span></button><button class="clients-ag-icon-action danger" type="button" data-action="delete-client" data-client="${escapeHtml(client.id)}" aria-label="Arquivar cliente">${archiveIcon}</button></div></section><div class="clients-ag-detail-grid"><aside class="clients-ag-detail-side"><section class="clients-ag-panel"><h3>Informações de Contato</h3><div class="clients-ag-info-list"><div><span>CONTATO PRINCIPAL</span><strong>${escapeHtml(client.contact || '—')}</strong></div><div><span>WHATSAPP</span><strong>${escapeHtml(client.whatsapp || '—')}</strong></div><div><span>E-MAIL</span><strong>${escapeHtml(client.email || '—')}</strong></div><div><span>CANAL PREFERIDO</span><strong>${escapeHtml(preferredChannel(client))}</strong></div><div><span>OBSERVAÇÕES</span><strong class="is-note">${escapeHtml(client.notes || 'Nenhuma observação cadastrada.')}</strong></div></div></section><section class="clients-ag-panel"><h3>Resumo Operacional</h3><div class="clients-ag-info-list is-summary"><div><span>APROVAÇÕES ABERTAS</span><strong class="is-number">${active.length}</strong></div><div><span>APROVAÇÕES CONCLUÍDAS</span><strong class="is-number">${complete.length}</strong></div><div><span>CLIENTE DESDE</span><strong>${formatDate(client.createdAt)}</strong></div></div></section></aside><div class="clients-ag-detail-main"><section class="clients-ag-panel"><div class="clients-ag-panel-head"><div><h3>Aprovações em Acompanhamento (${active.length})</h3><p>Conteúdos pendentes de validação no PodePostar</p></div></div><div class="clients-ag-table-wrap"><table class="clients-ag-table"><thead><tr><th>CONTEÚDO</th><th>PRAZO</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${currentApprovalRows(active)}</tbody></table></div></section><section class="clients-ag-panel"><div class="clients-ag-panel-head"><div><h3>Histórico de Aprovações (${complete.length})</h3><p>Conteúdos finalizados e publicados</p></div></div><div class="clients-ag-table-wrap"><table class="clients-ag-table"><thead><tr><th>CONTEÚDO</th><th>APROVADO EM</th><th>STATUS</th><th>PODEPOSTAR</th></tr></thead><tbody>${historyRows(complete)}</tbody></table></div></section><section class="clients-ag-panel"><div class="clients-ag-panel-head"><div><h3>Comunicações e Lembretes Registrados</h3><p>Histórico de mensagens assistidas via WhatsApp e E-mail</p></div></div><div class="clients-ag-contact-events">${contactRows(client, contacts)}</div></section></div></div></section>`;
    queueMicrotask(() => { view.ownRender = false; });
  }

  async function loadData() {
    if (view.loading) return;
    view.loading = true;
    try { const [clients, approvals] = await Promise.all([loadClients(), loadApprovals()]); view.clients = clients || []; view.approvals = approvals || []; }
    catch (error) { console.error('Não foi possível carregar a adaptação da página Clientes.', error); }
    finally { view.loading = false; }
  }

  async function sync() {
    view.scheduled = false;
    if (view.ownRender || crm.dataset.page !== 'Clientes') return;
    if (dynamic.querySelector(':scope > .clients-ag-page, :scope > .clients-ag-detail')) return;
    const isDetail = dynamic.classList.contains('client-detail-approved') || Boolean(document.querySelector('#clientDetailHeaderBack'));
    const clientId = isDetail ? dynamic.querySelector('[data-client]')?.dataset.client : null;
    await loadData();
    if (crm.dataset.page !== 'Clientes') return;
    if (isDetail && clientId) await renderDetail(clientId); else renderList();
  }

  function scheduleSync() {
    if (view.scheduled || view.ownRender) return;
    view.scheduled = true;
    requestAnimationFrame(sync);
  }

  const observer = new MutationObserver(() => scheduleSync());
  observer.observe(dynamic, { childList: true });

  document.addEventListener('input', event => {
    const input = event.target.closest?.('[data-clients-ag-search]');
    if (!input) return;
    view.query = input.value;
    applyListState();
  }, true);

  document.addEventListener('click', event => {
    const filter = event.target.closest?.('[data-clients-ag-filter]');
    if (filter) { event.preventDefault(); event.stopPropagation(); view.filter = filter.dataset.clientsAgFilter; applyListState(); return; }
    const sort = event.target.closest?.('[data-clients-ag-sort]');
    if (sort) { event.preventDefault(); event.stopPropagation(); view.descending = !view.descending; applyListState(); return; }
    const more = event.target.closest?.('[data-clients-ag-more]');
    if (more) {
      event.preventDefault(); event.stopPropagation();
      const menu = more.nextElementSibling;
      document.querySelectorAll('.clients-ag-menu').forEach(item => { if (item !== menu) item.hidden = true; });
      if (menu) menu.hidden = !menu.hidden;
      return;
    }
    if (!event.target.closest?.('.clients-ag-menu')) document.querySelectorAll('.clients-ag-menu').forEach(item => { item.hidden = true; });
  }, true);

  window.addEventListener('hashchange', scheduleSync);
  scheduleSync();
})();
