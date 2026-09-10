import {
  loadCommunicationSettings,
  loadMessageTemplates,
  updateAgencySettings,
  updateCommunicationSettings,
  updateMessageTemplate,
} from './communications-data.js';
import { supabase } from './supabase.js';

(() => {
  'use strict';

  const VIEW_ACTIONS = new Map([
    ['settings-agency', 'agency'],
    ['settings-user', 'users'],
    ['settings-messages', 'messages'],
    ['settings-deadlines', 'deadlines'],
    ['settings-whatsapp-info', 'whatsapp'],
    ['settings-email-info', 'email'],
  ]);
  const OWN_VIEWS = new Set(VIEW_ACTIONS.values());
  const ROLE_LABELS = { owner: 'Proprietário', admin: 'Administrador', operator: 'Operações' };
  const TEMPLATE_ORDER = ['approval_initial', 'reminder_1', 'reminder_2', 'final_notice'];
  const LOCAL_TEAM_KEY = 'lumads-settings-local-team-v1';
  const AGENCY_LOGO_KEY = 'lumads-settings-agency-logo-v1';
  const AVATAR_PREFIX = 'lumads-settings-avatar-v1:';

  let renderToken = 0;
  let messageChannel = 'whatsapp';
  let loadedTemplates = { whatsapp: [], email: [] };
  let currentAuthUser = null;
  let currentMember = null;

  const $ = selector => document.querySelector(selector);
  const app = () => $('#crmApp');
  const content = () => $('#dynamicContent');

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  const initials = name => String(name || 'Usuário')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase() || 'U';

  const roleLabel = role => ROLE_LABELS[role] || role || 'Operações';

  const icons = {
    agency: '<svg viewBox="0 0 24 24"><path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15M15 10h4a1 1 0 0 1 1 1v10M4 21h17M8 9h3M8 13h3M8 17h3"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M15 20v-1.5A3.5 3.5 0 0 0 11.5 15h-4A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="9.5" cy="8" r="3.2"/><path d="M17 15.2a3.4 3.4 0 0 1 3 3.4V20m-3.8-12a3.2 3.2 0 0 1 0 6.1"/></svg>',
    messages: '<svg viewBox="0 0 24 24"><path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8 9h8M8 12.5h5"/></svg>',
    deadlines: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24"><path d="M5 4h4l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V19a2 2 0 0 1-2.2 2A16 16 0 0 1 4 6.2 2 2 0 0 1 5 4Z"/></svg>',
    email: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  };

  const META = {
    agency: { eyebrow: 'DADOS DA AGÊNCIA', title: 'Informações da agência', panel: 'Dados da agência', desc: 'Identidade, contato e informações institucionais usadas no CRM.', status: 'Dados institucionais', icon: icons.agency, color: 'purple', narrow: true },
    users: { eyebrow: 'USUÁRIOS', title: 'Equipe e acessos', panel: 'Usuários', desc: 'Gerencie pessoas da equipe, permissões, status e foto de perfil.', status: 'Equipe LUMADS', icon: icons.users, color: 'cyan' },
    messages: { eyebrow: 'MENSAGENS RÁPIDAS', title: 'Modelos de mensagem', panel: 'Mensagens rápidas', desc: 'Biblioteca dos modelos usados em WhatsApp e e-mail.', status: '8 modelos ativos', icon: icons.messages, color: 'orange' },
    deadlines: { eyebrow: 'PRAZOS PADRÃO', title: 'Fluxo de acompanhamento', panel: 'Prazos padrão', desc: 'Cadência de lembretes e aviso final do acompanhamento.', status: '48h · 96h', icon: icons.deadlines, color: 'violet', narrow: true },
    whatsapp: { eyebrow: 'WHATSAPP', title: 'Envio pelo WhatsApp', panel: 'WhatsApp', desc: 'O CRM prepara a mensagem, abre o canal e registra após sua confirmação.', status: 'Modo assistido', icon: icons.whatsapp, color: 'green' },
    email: { eyebrow: 'E-MAIL', title: 'Envio por e-mail', panel: 'E-mail', desc: 'Assunto e mensagem prontos, com envio confirmado por você.', status: 'Modo assistido', icon: icons.email, color: 'pink' },
  };

  function panel(view, body, status = null) {
    const meta = META[view];
    return `<div class="settings-subview${meta.narrow ? ' is-narrow' : ''}">
      <section class="settings-subview-panel">
        <div class="settings-subview-head">
          <div class="settings-subview-head-left">
            <div class="settings-subview-icon ${meta.color}">${meta.icon}</div>
            <div><h2>${escapeHtml(meta.panel)}</h2><p>${escapeHtml(meta.desc)}</p></div>
          </div>
          <span class="settings-status-pill">${escapeHtml(status || meta.status)}</span>
        </div>
        <div class="settings-subview-body">${body}</div>
      </section>
    </div>`;
  }

  function setHeader(view) {
    const meta = META[view];
    const eyebrow = $('#pageEyebrow');
    const title = $('#pageTitle');
    $('#settingsSubviewBack')?.remove();
    if (eyebrow) {
      eyebrow.insertAdjacentHTML('beforebegin', '<button type="button" id="settingsSubviewBack" data-settings-subview-back>← Voltar para configurações</button>');
      eyebrow.textContent = meta.eyebrow;
    }
    if (title) title.textContent = meta.title;
  }

  function show(view, body, status = null) {
    const crm = app();
    const target = content();
    if (!crm || !target || crm.dataset.page !== 'Configurações') return false;
    crm.dataset.settingsView = view;
    setHeader(view);
    target.innerHTML = panel(view, body, status);
    return true;
  }

  function showLoading(view) {
    show(view, '<div class="settings-loading"><div><strong>Carregando…</strong>Buscando os dados atuais do CRM.</div></div>', 'Carregando');
  }

  function showError(view, error) {
    console.error(`Configurações > ${view}`, error);
    show(view, `<div class="settings-error-state"><div><strong>Não foi possível carregar esta configuração.</strong>Nenhum dado foi alterado. Tente novamente.</div></div>`, 'Erro');
  }

  function feedback(message, isError = false) {
    const node = $('#settingsSubviewFeedback');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', isError);
    node.classList.add('is-visible');
  }

  function setSaving(button, saving, normalLabel) {
    if (!button) return;
    button.disabled = saving;
    button.textContent = saving ? 'Salvando…' : normalLabel;
  }

  function currentViewFromTrigger(target) {
    const crm = app();
    if (!crm || crm.dataset.page !== 'Configurações') return null;
    const trigger = target.closest?.('[data-action]');
    return trigger ? VIEW_ACTIONS.get(trigger.dataset.action) || null : null;
  }

  function removeSubviewState() {
    const crm = app();
    if (crm && OWN_VIEWS.has(crm.dataset.settingsView)) delete crm.dataset.settingsView;
    $('#settingsSubviewBack')?.remove();
    closeSubviewModal();
  }

  function returnToSettings() {
    ++renderToken;
    removeSubviewState();
    const nav = document.querySelector('.nav-item[data-page="Configurações"]');
    if (nav) nav.click();
    else window.location.hash = '#settings';
  }

  function localJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveLocalJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  async function imageFileToDataUrl(file, size = 256) {
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Escolha um arquivo de imagem.');
    if (file.size > 5 * 1024 * 1024) throw new Error('A imagem precisa ter no máximo 5 MB.');
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
      img.onload = () => resolve(img);
      img.src = source;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const crop = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - crop) / 2;
    const sy = (image.naturalHeight - crop) / 2;
    ctx.drawImage(image, sx, sy, crop, crop, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', .86);
  }

  function avatarKey(userId) {
    return `${AVATAR_PREFIX}${userId || 'current'}`;
  }

  function avatarFor(userId) {
    return localStorage.getItem(avatarKey(userId)) || '';
  }

  function saveAvatar(userId, dataUrl) {
    const key = avatarKey(userId);
    if (dataUrl) localStorage.setItem(key, dataUrl);
    else localStorage.removeItem(key);
  }

  async function loadAuthProfile() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    currentAuthUser = authData.user || null;
    if (!currentAuthUser) throw new Error('Usuário autenticado não encontrado.');
    const { data: member, error: memberError } = await supabase
      .from('app_members')
      .select('user_id,display_name,role')
      .eq('user_id', currentAuthUser.id)
      .single();
    if (memberError) throw memberError;
    currentMember = member;
    return { user: currentAuthUser, member: currentMember };
  }

  async function applyCurrentSidebarAvatar() {
    try {
      if (!currentAuthUser) {
        const { data } = await supabase.auth.getUser();
        currentAuthUser = data.user || null;
      }
      const avatar = document.querySelector('#userMenuButton .avatar');
      if (!avatar || !currentAuthUser) return;
      const photo = avatarFor(currentAuthUser.id);
      if (!photo) {
        avatar.classList.remove('has-settings-photo');
        return;
      }
      avatar.classList.add('has-settings-photo');
      avatar.innerHTML = `<img src="${photo}" alt="Foto do usuário">`;
    } catch (_) {}
  }

  async function renderAgency(token) {
    showLoading('agency');
    const settings = await loadCommunicationSettings();
    if (token !== renderToken) return;
    const logo = localStorage.getItem(AGENCY_LOGO_KEY) || '';
    const body = `
      <div class="settings-section-title">Identidade da agência</div>
      <p class="settings-section-sub">Os dados abaixo já utilizam as informações salvas no CRM.</p>
      <div class="settings-upload">
        <div class="settings-upload-preview" id="settingsAgencyLogoPreview">${logo ? `<img src="${logo}" alt="Logo da agência">` : 'L'}</div>
        <div class="settings-upload-copy">
          <strong>Logo da agência</strong>
          <p>Imagem usada como referência visual nesta etapa. O armazenamento definitivo pode ser refinado depois.</p>
          <div class="settings-upload-actions">
            <label class="settings-file-button">Escolher imagem<input id="settingsAgencyLogoInput" type="file" accept="image/*"></label>
            <button class="settings-btn secondary" type="button" data-settings-remove-agency-logo>Remover</button>
          </div>
        </div>
      </div>
      <div style="height:18px"></div>
      <form class="settings-form" data-settings-form="agency">
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsAgencyName">Nome da agência</label><input id="settingsAgencyName" value="${escapeHtml(settings.agency_name)}" required></div>
          <div class="settings-field"><label for="settingsAgencyDisplay">Nome de exibição</label><input id="settingsAgencyDisplay" value="${escapeHtml(settings.agency_display_name)}" required></div>
          <div class="settings-field"><label for="settingsAgencyPhone">Telefone</label><input id="settingsAgencyPhone" value="${escapeHtml(settings.agency_phone)}"></div>
          <div class="settings-field"><label for="settingsAgencyEmail">E-mail institucional</label><input id="settingsAgencyEmail" type="email" value="${escapeHtml(settings.agency_email)}"></div>
        </div>
        <div class="settings-actions"><span class="settings-feedback" id="settingsSubviewFeedback"></span><button class="settings-btn primary" type="submit">Salvar dados</button></div>
      </form>`;
    show('agency', body, 'Dados institucionais');
  }

  async function loadVisibleMembers() {
    const profile = await loadAuthProfile();
    let members = [profile.member];
    try {
      const { data, error } = await supabase.from('app_members').select('user_id,display_name,role').order('display_name');
      if (!error && Array.isArray(data) && data.length) members = data;
    } catch (_) {}
    return { ...profile, members };
  }

  function localTeam() {
    return localJson(LOCAL_TEAM_KEY, []);
  }

  function saveLocalTeam(team) {
    saveLocalJson(LOCAL_TEAM_KEY, team);
  }

  function realMemberRow(member, user) {
    const id = member.user_id;
    const photo = avatarFor(id);
    const email = id === user.id ? user.email : '';
    const name = member.display_name || email || 'Usuário';
    return `<div class="settings-user-row">
      <div class="settings-user-identity">
        <div class="settings-user-avatar">${photo ? `<img src="${photo}" alt="">` : escapeHtml(initials(name))}</div>
        <div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(email || 'Acesso vinculado ao CRM')}</span></div>
      </div>
      <span class="settings-role-pill">${escapeHtml(roleLabel(member.role))}</span>
      <span class="settings-active-pill">Ativo</span>
      <button class="settings-user-edit" type="button" data-settings-edit-real-user="${escapeHtml(id)}" title="Editar usuário"><svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button>
    </div>`;
  }

  function localMemberRow(member) {
    return `<div class="settings-user-row">
      <div class="settings-user-identity">
        <div class="settings-user-avatar">${member.photo ? `<img src="${member.photo}" alt="">` : escapeHtml(initials(member.name))}</div>
        <div><strong>${escapeHtml(member.name)}</strong><span>${escapeHtml(member.email || 'E-mail não informado')}</span></div>
      </div>
      <span class="settings-role-pill">${escapeHtml(member.role)}</span>
      <span class="settings-local-pill">Pré-cadastro</span>
      <button class="settings-user-edit" type="button" data-settings-edit-local-user="${escapeHtml(member.id)}" title="Editar pré-cadastro"><svg viewBox="0 0 24 24"><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg></button>
    </div>`;
  }

  async function renderUsers(token) {
    showLoading('users');
    const { user, members } = await loadVisibleMembers();
    if (token !== renderToken) return;
    const local = localTeam();
    const rows = [
      ...members.map(member => realMemberRow(member, user)),
      ...local.map(localMemberRow),
    ].join('');
    const body = `
      <div class="settings-team-toolbar">
        <div><strong>Equipe LUMADS</strong><span>Foto, nome, e-mail, função e status. A foto do usuário atual também aparece na sidebar.</span></div>
        <button class="settings-btn primary" type="button" data-settings-add-user>+ Adicionar usuário</button>
      </div>
      <div class="settings-user-list">${rows || '<div class="settings-loading"><div><strong>Nenhum usuário encontrado.</strong></div></div>'}</div>
      <div class="settings-note"><strong>Nesta implementação:</strong> nome do usuário autenticado é salvo no Supabase. Fotos e novos pré-cadastros ficam neste navegador até o refinamento da gestão de convites e armazenamento de imagens.</div>`;
    show('users', body, `${members.length + local.length} usuário${members.length + local.length === 1 ? '' : 's'}`);
    await applyCurrentSidebarAvatar();
  }

  function templateCard(template, channel) {
    const subject = channel === 'email' && template.subject ? `<strong style="color:inherit">Assunto:</strong> ${escapeHtml(template.subject)}<br>` : '';
    return `<article class="settings-template-card">
      <small>${channel === 'whatsapp' ? 'WhatsApp' : 'E-mail'}</small>
      <h3>${escapeHtml(template.label || template.template_key)}</h3>
      <p>${subject}${escapeHtml(template.body)}</p>
      <div class="settings-template-foot"><span>Modelo ativo</span><button class="settings-text-button" type="button" data-settings-edit-template="${escapeHtml(template.id)}" data-settings-channel="${channel}">Editar</button></div>
    </article>`;
  }

  function renderTemplateGrid() {
    const grid = $('#settingsTemplateGrid');
    if (!grid) return;
    const items = [...(loadedTemplates[messageChannel] || [])]
      .sort((a, b) => TEMPLATE_ORDER.indexOf(a.template_key) - TEMPLATE_ORDER.indexOf(b.template_key));
    grid.innerHTML = items.map(item => templateCard(item, messageChannel)).join('');
    document.querySelectorAll('.settings-tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.settingsChannel === messageChannel));
  }

  async function renderMessages(token) {
    showLoading('messages');
    const [whatsapp, email] = await Promise.all([loadMessageTemplates('whatsapp'), loadMessageTemplates('email')]);
    if (token !== renderToken) return;
    loadedTemplates = { whatsapp, email };
    const total = whatsapp.length + email.length;
    const body = `
      <div class="settings-tabs">
        <button class="settings-tab is-active" type="button" data-settings-channel="whatsapp">WhatsApp · ${whatsapp.length}</button>
        <button class="settings-tab" type="button" data-settings-channel="email">E-mail · ${email.length}</button>
      </div>
      <div class="settings-template-grid" id="settingsTemplateGrid"></div>`;
    show('messages', body, `${total} modelos ativos`);
    renderTemplateGrid();
  }

  async function renderDeadlines(token) {
    showLoading('deadlines');
    const settings = await loadCommunicationSettings();
    if (token !== renderToken) return;
    const r1 = Number(settings.reminder_1_hours) || 48;
    const r2 = Number(settings.reminder_2_hours) || 96;
    const body = `
      <div class="settings-section-title">Visão do fluxo</div>
      <p class="settings-section-sub">Os valores abaixo já vêm das configurações reais do acompanhamento.</p>
      <div class="settings-flow">
        <div class="settings-flow-step"><div class="settings-flow-badge">0h</div><strong>Aprovação enviada</strong><span>O acompanhamento começa quando o link é enviado ao cliente.</span></div>
        <div class="settings-flow-step"><div class="settings-flow-badge" id="settingsFlowR1">${r1}h</div><strong>Lembrete 1</strong><span>Primeiro contato enquanto a aprovação estiver pendente.</span></div>
        <div class="settings-flow-step"><div class="settings-flow-badge" id="settingsFlowR2">${r2}h</div><strong>Lembrete 2</strong><span>Segundo contato para pendências ainda sem retorno.</span></div>
        <div class="settings-flow-step"><div class="settings-flow-badge">Final</div><strong>Aviso final</strong><span>Última etapa do fluxo antes de exigir ação manual.</span></div>
      </div>
      <form class="settings-form" data-settings-form="deadlines">
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsDeadlineR1">Primeiro lembrete após</label><input id="settingsDeadlineR1" type="number" min="1" value="${r1}" required><span class="settings-field-help">Horas após o início do acompanhamento.</span></div>
          <div class="settings-field"><label for="settingsDeadlineR2">Segundo lembrete após</label><input id="settingsDeadlineR2" type="number" min="1" value="${r2}" required><span class="settings-field-help">Precisa ocorrer depois do primeiro lembrete.</span></div>
        </div>
        <div class="settings-switch-row">
          <div class="settings-switch-copy"><strong>Aviso final</strong><span>Manter a etapa final depois do segundo lembrete.</span></div>
          <button class="settings-switch${settings.final_notice_enabled ? ' is-on' : ''}" type="button" data-settings-final-switch aria-pressed="${settings.final_notice_enabled ? 'true' : 'false'}"></button>
        </div>
        <input type="hidden" id="settingsDeadlineFinal" value="${settings.final_notice_enabled ? 'true' : 'false'}">
        <div class="settings-actions"><span class="settings-feedback" id="settingsSubviewFeedback"></span><button class="settings-btn primary" type="submit">Salvar prazos</button></div>
      </form>`;
    show('deadlines', body, `${r1}h · ${r2}h`);
  }

  async function renderChannel(view, token) {
    showLoading(view);
    const [settings, templates] = await Promise.all([
      loadCommunicationSettings(),
      loadMessageTemplates(view === 'whatsapp' ? 'whatsapp' : 'email')
    ]);
    if (token !== renderToken) return;
    const isWhatsApp = view === 'whatsapp';
    const mode = isWhatsApp ? settings.whatsapp_mode : settings.email_mode;
    const isManual = !mode || mode === 'manual';
    const summary = isWhatsApp
      ? [
          ['Modo', isManual ? 'Assistido' : mode],
          ['Código padrão', settings.default_country_code || '+55'],
          ['Modelos disponíveis', `${templates.length} mensagens`],
          ['Disparo automático', isManual ? 'Desativado' : 'Configurado'],
        ]
      : [
          ['Modo', isManual ? 'Assistido' : mode],
          ['Modelos disponíveis', `${templates.length} e-mails`],
          ['Assunto', 'Preparado pelo CRM'],
          ['Disparo automático', isManual ? 'Desativado' : 'Configurado'],
        ];
    const identity = isWhatsApp ? '' : `
      <div class="settings-email-identity">
        <div class="settings-section-title">Identidade do remetente</div>
        <p class="settings-section-sub">Campos já existentes nas configurações do CRM. Nesta etapa são exibidos como referência.</p>
        <div class="settings-form-grid">
          <div class="settings-field"><label>Nome do remetente</label><input value="${escapeHtml(settings.email_from_name || settings.agency_display_name || '')}" readonly></div>
          <div class="settings-field"><label>E-mail do remetente</label><input value="${escapeHtml(settings.email_from_address || settings.agency_email || '')}" readonly></div>
          <div class="settings-field full"><label>Responder para</label><input value="${escapeHtml(settings.email_reply_to || settings.agency_email || '')}" readonly></div>
        </div>
      </div>`;
    const body = `
      <div class="settings-channel-hero">
        <div class="settings-channel-card">
          <span class="settings-channel-badge">● Modo assistido ativo</span>
          <h3>${isWhatsApp ? 'O CRM prepara. Você revisa e envia.' : 'Mensagem e assunto preparados pelo CRM.'}</h3>
          <p>${isWhatsApp ? 'O sistema escolhe o modelo correto, abre o WhatsApp com a mensagem preenchida e registra o contato depois da sua confirmação.' : 'O sistema monta destinatário, assunto e mensagem e abre o aplicativo padrão de e-mail para revisão antes do envio.'}</p>
        </div>
        <div class="settings-channel-summary">${summary.map(([label, value]) => `<div class="settings-summary-line"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
      </div>
      ${identity}
      <div class="settings-step-grid">
        <div class="settings-step-card"><small>PASSO 01</small><strong>Preparar</strong><span>O CRM seleciona o modelo e preenche os dados necessários.</span></div>
        <div class="settings-step-card"><small>PASSO 02</small><strong>${isWhatsApp ? 'Abrir WhatsApp' : 'Abrir e-mail'}</strong><span>O canal é aberto com o conteúdo pronto para revisão.</span></div>
        <div class="settings-step-card"><small>PASSO 03</small><strong>Confirmar envio</strong><span>Depois de enviar, você confirma no CRM para registrar o contato.</span></div>
      </div>
      <div class="settings-note"><strong>Modo assistido:</strong> o CRM automatiza a preparação e o registro. O clique final de envio continua sob seu controle.</div>`;
    show(view, body, 'Modo assistido');
  }

  async function openView(view) {
    if (!OWN_VIEWS.has(view)) return;
    const token = ++renderToken;
    try {
      if (view === 'agency') await renderAgency(token);
      else if (view === 'users') await renderUsers(token);
      else if (view === 'messages') await renderMessages(token);
      else if (view === 'deadlines') await renderDeadlines(token);
      else await renderChannel(view, token);
    } catch (error) {
      if (token === renderToken) showError(view, error);
    }
  }

  async function saveAgencyForm(form) {
    const button = form.querySelector('button[type="submit"]');
    setSaving(button, true, 'Salvar dados');
    try {
      await updateAgencySettings({
        agency_name: $('#settingsAgencyName').value.trim(),
        agency_display_name: $('#settingsAgencyDisplay').value.trim(),
        agency_phone: $('#settingsAgencyPhone').value.trim(),
        agency_email: $('#settingsAgencyEmail').value.trim(),
      });
      feedback('Dados salvos com sucesso.');
    } catch (error) {
      console.error(error);
      feedback('Não foi possível salvar os dados.', true);
    } finally {
      setSaving(button, false, 'Salvar dados');
    }
  }

  async function saveDeadlineForm(form) {
    const r1 = Number($('#settingsDeadlineR1').value);
    const r2 = Number($('#settingsDeadlineR2').value);
    if (!Number.isFinite(r1) || r1 < 1 || !Number.isFinite(r2) || r2 < 1) return feedback('Informe prazos válidos em horas.', true);
    if (r2 <= r1) return feedback('O segundo lembrete precisa ocorrer depois do primeiro.', true);
    const button = form.querySelector('button[type="submit"]');
    setSaving(button, true, 'Salvar prazos');
    try {
      await updateCommunicationSettings({
        reminder_1_hours: r1,
        reminder_2_hours: r2,
        final_notice_enabled: $('#settingsDeadlineFinal').value === 'true',
      });
      $('#settingsFlowR1').textContent = `${r1}h`;
      $('#settingsFlowR2').textContent = `${r2}h`;
      const pill = document.querySelector('.settings-status-pill');
      if (pill) pill.textContent = `${r1}h · ${r2}h`;
      feedback('Prazos salvos com sucesso.');
    } catch (error) {
      console.error(error);
      feedback('Não foi possível salvar os prazos.', true);
    } finally {
      setSaving(button, false, 'Salvar prazos');
    }
  }

  function openSubviewModal({ title, description = '', body = '' }) {
    closeSubviewModal();
    const root = document.createElement('div');
    root.className = 'settings-subview-modal is-open';
    root.id = 'settingsSubviewModal';
    root.innerHTML = `<section class="settings-subview-modal-card" role="dialog" aria-modal="true">
      <div class="settings-subview-modal-head">
        <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
        <button class="settings-subview-modal-close" type="button" data-settings-modal-close>×</button>
      </div>
      <div class="settings-subview-modal-body">${body}</div>
    </section>`;
    (app() || document.body).appendChild(root);
  }

  function closeSubviewModal() {
    $('#settingsSubviewModal')?.remove();
  }

  function realUserModal(userId) {
    const user = currentAuthUser;
    const member = currentMember;
    if (!user || !member || member.user_id !== userId) {
      openSubviewModal({
        title: 'Usuário da equipe',
        description: 'Nesta etapa, a edição completa fica disponível apenas para o usuário autenticado.',
        body: '<div class="settings-note" style="margin-top:0">O gerenciamento de outros acessos será refinado junto com o fluxo de convites.</div>',
      });
      return;
    }
    const photo = avatarFor(user.id);
    const body = `
      <form class="settings-form" data-settings-modal-form="real-user">
        <div class="settings-upload">
          <div class="settings-upload-preview is-avatar" id="settingsUserPhotoPreview">${photo ? `<img src="${photo}" alt="">` : escapeHtml(initials(member.display_name || user.email))}</div>
          <div class="settings-upload-copy">
            <strong>Foto do usuário</strong>
            <p>A foto aparece nesta lista e também no card inferior da sidebar.</p>
            <div class="settings-upload-actions">
              <label class="settings-file-button">Escolher foto<input id="settingsUserPhotoInput" type="file" accept="image/*"></label>
              <button class="settings-btn secondary" type="button" data-settings-remove-user-photo>Remover foto</button>
            </div>
          </div>
        </div>
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsRealUserName">Nome</label><input id="settingsRealUserName" value="${escapeHtml(member.display_name || '')}" required></div>
          <div class="settings-field"><label>E-mail</label><input value="${escapeHtml(user.email || '')}" readonly></div>
          <div class="settings-field full"><label>Função</label><input value="${escapeHtml(roleLabel(member.role))}" readonly><span class="settings-field-help">A função continua controlada pelas permissões atuais do CRM.</span></div>
        </div>
        <div class="settings-actions"><span class="settings-feedback" id="settingsSubviewFeedback"></span><button class="settings-btn primary" type="submit">Salvar usuário</button></div>
      </form>`;
    openSubviewModal({ title: 'Editar usuário', description: 'Dados do usuário autenticado.', body });
  }

  function localUserModal(id = null) {
    const team = localTeam();
    const member = id ? team.find(item => item.id === id) : null;
    const body = `
      <form class="settings-form" data-settings-modal-form="local-user">
        <input type="hidden" id="settingsLocalUserId" value="${escapeHtml(member?.id || '')}">
        <input type="hidden" id="settingsLocalUserPhoto" value="${escapeHtml(member?.photo || '')}">
        <div class="settings-upload">
          <div class="settings-upload-preview is-avatar" id="settingsLocalUserPhotoPreview">${member?.photo ? `<img src="${member.photo}" alt="">` : escapeHtml(initials(member?.name || 'Novo usuário'))}</div>
          <div class="settings-upload-copy">
            <strong>Foto do usuário</strong>
            <p>Pré-cadastro local para refinarmos depois a criação real de acesso.</p>
            <div class="settings-upload-actions">
              <label class="settings-file-button">Escolher foto<input id="settingsLocalUserPhotoInput" type="file" accept="image/*"></label>
              <button class="settings-btn secondary" type="button" data-settings-remove-local-photo>Remover foto</button>
            </div>
          </div>
        </div>
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsLocalUserName">Nome</label><input id="settingsLocalUserName" value="${escapeHtml(member?.name || '')}" required></div>
          <div class="settings-field"><label for="settingsLocalUserEmail">E-mail</label><input id="settingsLocalUserEmail" type="email" value="${escapeHtml(member?.email || '')}"></div>
          <div class="settings-field"><label for="settingsLocalUserRole">Função</label><select id="settingsLocalUserRole"><option ${member?.role === 'Proprietário' ? 'selected' : ''}>Proprietário</option><option ${member?.role === 'Administrador' ? 'selected' : ''}>Administrador</option><option ${!member || member?.role === 'Operações' ? 'selected' : ''}>Operações</option></select></div>
          <div class="settings-field"><label for="settingsLocalUserStatus">Status</label><select id="settingsLocalUserStatus"><option ${!member || member?.status === 'Ativo' ? 'selected' : ''}>Ativo</option><option ${member?.status === 'Inativo' ? 'selected' : ''}>Inativo</option></select></div>
        </div>
        <div class="settings-note">Este registro é um pré-cadastro visual neste navegador. Não cria login ou convite no Supabase ainda.</div>
        <div class="settings-actions"><span class="settings-feedback" id="settingsSubviewFeedback"></span><button class="settings-btn primary" type="submit">Salvar pré-cadastro</button></div>
      </form>`;
    openSubviewModal({ title: member ? 'Editar pré-cadastro' : 'Adicionar usuário', description: 'Foto, identificação e função.', body });
  }

  function templateModal(id, channel) {
    const template = (loadedTemplates[channel] || []).find(item => String(item.id) === String(id));
    if (!template) return;
    const body = `
      <form class="settings-form" data-settings-modal-form="template">
        <input type="hidden" id="settingsTemplateId" value="${escapeHtml(template.id)}">
        <input type="hidden" id="settingsTemplateChannel" value="${escapeHtml(channel)}">
        ${channel === 'email' ? `<div class="settings-field"><label for="settingsTemplateSubject">Assunto</label><input id="settingsTemplateSubject" value="${escapeHtml(template.subject || '')}"></div>` : ''}
        <div class="settings-field"><label for="settingsTemplateBody">Mensagem</label><textarea id="settingsTemplateBody" required>${escapeHtml(template.body || '')}</textarea></div>
        <div class="settings-actions"><span class="settings-feedback" id="settingsSubviewFeedback"></span><button class="settings-btn primary" type="submit">Salvar modelo</button></div>
      </form>`;
    openSubviewModal({ title: template.label || 'Editar modelo', description: channel === 'email' ? 'Modelo de e-mail.' : 'Modelo de WhatsApp.', body });
  }

  async function handleRealUserSave(form) {
    const button = form.querySelector('button[type="submit"]');
    setSaving(button, true, 'Salvar usuário');
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const user = authData.user;
      if (!user) throw new Error('Usuário não encontrado.');
      const name = $('#settingsRealUserName').value.trim();
      const { data, error } = await supabase.from('app_members')
        .update({ display_name: name })
        .eq('user_id', user.id)
        .select('user_id,display_name,role')
        .single();
      if (error) throw error;
      currentAuthUser = user;
      currentMember = data;
      const sidebarName = document.querySelector('.profile-name');
      if (sidebarName) sidebarName.textContent = data.display_name || user.email || 'Usuário';
      closeSubviewModal();
      await openView('users');
      await applyCurrentSidebarAvatar();
    } catch (error) {
      console.error(error);
      feedback('Não foi possível salvar o usuário.', true);
    } finally {
      setSaving(button, false, 'Salvar usuário');
    }
  }

  async function handleLocalUserSave(form) {
    const id = $('#settingsLocalUserId').value || `local-${Date.now()}`;
    const team = localTeam();
    const value = {
      id,
      name: $('#settingsLocalUserName').value.trim(),
      email: $('#settingsLocalUserEmail').value.trim(),
      role: $('#settingsLocalUserRole').value,
      status: $('#settingsLocalUserStatus').value,
      photo: $('#settingsLocalUserPhoto').value,
    };
    if (!value.name) return feedback('Informe o nome.', true);
    const index = team.findIndex(item => item.id === id);
    if (index >= 0) team[index] = value; else team.push(value);
    saveLocalTeam(team);
    closeSubviewModal();
    await openView('users');
  }

  async function handleTemplateSave(form) {
    const button = form.querySelector('button[type="submit"]');
    setSaving(button, true, 'Salvar modelo');
    const id = $('#settingsTemplateId').value;
    const channel = $('#settingsTemplateChannel').value;
    try {
      const values = { body: $('#settingsTemplateBody').value };
      if (channel === 'email') values.subject = $('#settingsTemplateSubject').value;
      const updated = await updateMessageTemplate(id, values);
      loadedTemplates[channel] = loadedTemplates[channel].map(item => String(item.id) === String(id) ? updated : item);
      closeSubviewModal();
      renderTemplateGrid();
    } catch (error) {
      console.error(error);
      feedback('Não foi possível salvar o modelo.', true);
    } finally {
      setSaving(button, false, 'Salvar modelo');
    }
  }

  async function handleImageInput(input) {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await imageFileToDataUrl(file);
      if (input.id === 'settingsAgencyLogoInput') {
        localStorage.setItem(AGENCY_LOGO_KEY, dataUrl);
        const preview = $('#settingsAgencyLogoPreview');
        if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="Logo da agência">`;
      } else if (input.id === 'settingsUserPhotoInput' && currentAuthUser) {
        saveAvatar(currentAuthUser.id, dataUrl);
        const preview = $('#settingsUserPhotoPreview');
        if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="">`;
        await applyCurrentSidebarAvatar();
      } else if (input.id === 'settingsLocalUserPhotoInput') {
        const hidden = $('#settingsLocalUserPhoto');
        const preview = $('#settingsLocalUserPhotoPreview');
        if (hidden) hidden.value = dataUrl;
        if (preview) preview.innerHTML = `<img src="${dataUrl}" alt="">`;
      }
    } catch (error) {
      console.error(error);
      feedback(error.message || 'Não foi possível usar esta imagem.', true);
    }
  }

  window.addEventListener('pointerdown', event => {
    if (!currentViewFromTrigger(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('click', event => {
    const view = currentViewFromTrigger(event.target);
    if (view) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openView(view);
      return;
    }

    const crm = app();
    if (!crm) return;

    if (event.target.closest?.('[data-settings-subview-back]') && crm.dataset.page === 'Configurações' && OWN_VIEWS.has(crm.dataset.settingsView)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      returnToSettings();
      return;
    }

    if (event.target.closest?.('.nav-item') && OWN_VIEWS.has(crm.dataset.settingsView)) {
      removeSubviewState();
      return;
    }

    if (event.target.closest?.('[data-settings-add-user]')) {
      localUserModal();
      return;
    }

    const realEdit = event.target.closest?.('[data-settings-edit-real-user]');
    if (realEdit) {
      realUserModal(realEdit.dataset.settingsEditRealUser);
      return;
    }

    const localEdit = event.target.closest?.('[data-settings-edit-local-user]');
    if (localEdit) {
      localUserModal(localEdit.dataset.settingsEditLocalUser);
      return;
    }

    const tab = event.target.closest?.('[data-settings-channel]');
    if (tab && !event.target.closest?.('[data-settings-edit-template]')) {
      messageChannel = tab.dataset.settingsChannel;
      renderTemplateGrid();
      return;
    }

    const editTemplate = event.target.closest?.('[data-settings-edit-template]');
    if (editTemplate) {
      templateModal(editTemplate.dataset.settingsEditTemplate, editTemplate.dataset.settingsChannel);
      return;
    }

    const switchButton = event.target.closest?.('[data-settings-final-switch]');
    if (switchButton) {
      const on = !switchButton.classList.contains('is-on');
      switchButton.classList.toggle('is-on', on);
      switchButton.setAttribute('aria-pressed', String(on));
      const hidden = $('#settingsDeadlineFinal');
      if (hidden) hidden.value = String(on);
      return;
    }

    if (event.target.closest?.('[data-settings-remove-agency-logo]')) {
      localStorage.removeItem(AGENCY_LOGO_KEY);
      const preview = $('#settingsAgencyLogoPreview');
      if (preview) preview.textContent = 'L';
      return;
    }

    if (event.target.closest?.('[data-settings-remove-user-photo]') && currentAuthUser) {
      saveAvatar(currentAuthUser.id, '');
      const preview = $('#settingsUserPhotoPreview');
      if (preview) preview.textContent = initials(currentMember?.display_name || currentAuthUser.email);
      const avatar = document.querySelector('#userMenuButton .avatar');
      if (avatar) {
        avatar.classList.remove('has-settings-photo');
        avatar.textContent = initials(currentMember?.display_name || currentAuthUser.email);
      }
      return;
    }

    if (event.target.closest?.('[data-settings-remove-local-photo]')) {
      const hidden = $('#settingsLocalUserPhoto');
      const preview = $('#settingsLocalUserPhotoPreview');
      if (hidden) hidden.value = '';
      if (preview) preview.textContent = initials($('#settingsLocalUserName')?.value || 'Novo usuário');
      return;
    }

    if (event.target.closest?.('[data-settings-modal-close]') || event.target.id === 'settingsSubviewModal') {
      closeSubviewModal();
      return;
    }
  }, true);

  window.addEventListener('input', event => {
    if (event.target.id === 'settingsDeadlineR1') {
      const n = Number(event.target.value);
      const node = $('#settingsFlowR1');
      if (node && Number.isFinite(n)) node.textContent = `${n}h`;
    }
    if (event.target.id === 'settingsDeadlineR2') {
      const n = Number(event.target.value);
      const node = $('#settingsFlowR2');
      if (node && Number.isFinite(n)) node.textContent = `${n}h`;
    }
    if (event.target.id === 'settingsLocalUserName' && !$('#settingsLocalUserPhoto')?.value) {
      const preview = $('#settingsLocalUserPhotoPreview');
      if (preview) preview.textContent = initials(event.target.value || 'Novo usuário');
    }
  }, true);

  window.addEventListener('change', event => {
    if (['settingsAgencyLogoInput', 'settingsUserPhotoInput', 'settingsLocalUserPhotoInput'].includes(event.target.id)) {
      handleImageInput(event.target);
    }
  }, true);

  window.addEventListener('submit', event => {
    const form = event.target.closest?.('[data-settings-form],[data-settings-modal-form]');
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const type = form.dataset.settingsForm || form.dataset.settingsModalForm;
    if (type === 'agency') saveAgencyForm(form);
    else if (type === 'deadlines') saveDeadlineForm(form);
    else if (type === 'real-user') handleRealUserSave(form);
    else if (type === 'local-user') handleLocalUserSave(form);
    else if (type === 'template') handleTemplateSave(form);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('#settingsSubviewModal')) closeSubviewModal();
  });

  window.setTimeout(applyCurrentSidebarAvatar, 900);
  window.setTimeout(applyCurrentSidebarAvatar, 2200);
  window.addEventListener('hashchange', () => window.setTimeout(applyCurrentSidebarAvatar, 0));
})();
