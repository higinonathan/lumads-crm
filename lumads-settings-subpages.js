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

  const crm = () => document.querySelector('#crmApp');
  const content = () => document.querySelector('#dynamicContent');
  const OWN_VIEWS = new Set(['agency', 'user', 'messages', 'deadlines', 'whatsapp-info', 'email-info']);
  const ACTION_VIEW = new Map([
    ['settings-agency', 'agency'],
    ['settings-user', 'user'],
    ['settings-messages', 'messages'],
    ['settings-deadlines', 'deadlines'],
    ['settings-whatsapp-info', 'whatsapp-info'],
    ['settings-email-info', 'email-info'],
  ]);
  const ROLE_LABELS = { owner: 'Proprietário', admin: 'Administrador', operator: 'Operações' };
  let renderToken = 0;

  const icons = {
    agency: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M8 19h4"/></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M16 8.5a2.5 2.5 0 1 1 0 5M16.5 14.5c2.5.3 3.8 1.8 4 4.5"/></svg>',
    messages: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 3v-4a2 2 0 0 1-1-1V7a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/></svg>',
    deadlines: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6M12 2v3"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5A14 14 0 0 0 14 16l1.5-2.5 5 2V19a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-1Z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
  };

  const VIEW_META = {
    agency: { eyebrow: 'DADOS DA AGÊNCIA', pageTitle: 'Informações da agência', panelTitle: 'Dados da agência', description: 'Nome de exibição, telefone e e-mail usados no CRM.', status: 'Dados institucionais', icon: icons.agency, iconClass: 'purple' },
    user: { eyebrow: 'USUÁRIOS', pageTitle: 'Perfil do usuário', panelTitle: 'Usuário atual', description: 'Informações do usuário autenticado exibidas no CRM.', status: 'Perfil do usuário', icon: icons.user, iconClass: 'cyan' },
    messages: { eyebrow: 'MENSAGENS RÁPIDAS', pageTitle: 'Modelos de mensagem', panelTitle: 'Mensagens rápidas', description: 'Oito modelos reais usados nos envios manuais.', status: '8 modelos ativos', icon: icons.messages, iconClass: 'orange', wide: true },
    deadlines: { eyebrow: 'PRAZOS PADRÃO', pageTitle: 'Fluxo de acompanhamento', panelTitle: 'Prazos padrão', description: 'Parâmetros reais de lembretes e aviso final.', status: 'Acompanhamento', icon: icons.deadlines, iconClass: 'violet' },
    'whatsapp-info': { eyebrow: 'WHATSAPP', pageTitle: 'Envio pelo WhatsApp', panelTitle: 'WhatsApp', description: 'Canal manual de comunicação do CRM.', status: 'Modo manual', icon: icons.whatsapp, iconClass: 'green' },
    'email-info': { eyebrow: 'E-MAIL', pageTitle: 'Envio por e-mail', panelTitle: 'E-mail', description: 'Canal manual de comunicação do CRM.', status: 'Modo manual', icon: icons.email, iconClass: 'pink' },
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  }

  function removeBack() {
    document.querySelector('#settingsSubpageHeaderBack')?.remove();
  }

  function setHeader(view) {
    const meta = VIEW_META[view];
    const eyebrow = document.querySelector('#pageEyebrow');
    const title = document.querySelector('#pageTitle');
    removeBack();
    if (eyebrow) {
      eyebrow.insertAdjacentHTML('beforebegin', '<button type="button" id="settingsSubpageHeaderBack" data-settings-subpage-back>← Voltar para configurações</button>');
      eyebrow.textContent = meta.eyebrow;
    }
    if (title) title.textContent = meta.pageTitle;
  }

  function panelHtml(view, body, status = null) {
    const meta = VIEW_META[view];
    return `<div class="settings-subpage-content${meta.wide ? ' is-wide' : ''}">
      <section class="settings-subpage-panel">
        <div class="settings-subpage-head">
          <div class="settings-subpage-title-wrap">
            <div class="settings-subpage-head-icon ${meta.iconClass}">${meta.icon}</div>
            <div><h2>${escapeHtml(meta.panelTitle)}</h2><p>${escapeHtml(meta.description)}</p></div>
          </div>
          <span class="settings-subpage-status">${escapeHtml(status || meta.status)}</span>
        </div>
        <div class="settings-subpage-body">${body}</div>
      </section>
    </div>`;
  }

  function showPanel(view, body, status = null) {
    const app = crm();
    const target = content();
    if (!app || !target || app.dataset.page !== 'Configurações') return false;
    app.dataset.settingsView = view;
    setHeader(view);
    target.innerHTML = panelHtml(view, body, status);
    return true;
  }

  function showLoading(view) {
    showPanel(view, '<div class="settings-loading"><div><b>Carregando…</b>Buscando os dados atuais do CRM.</div></div>', 'Carregando');
  }

  function showError(view, message) {
    showPanel(view, `<div class="settings-loading"><div><b>Não foi possível carregar</b>${escapeHtml(message)}</div></div>`, 'Erro');
  }

  function feedback(message, type = 'success') {
    const el = document.querySelector('#settingsSubpageFeedback');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('is-error', type === 'error');
    el.classList.add('is-visible');
  }

  function setSaving(form, saving) {
    form.dataset.saving = String(saving);
    const button = form.querySelector('.settings-save-button');
    if (!button) return;
    button.disabled = saving;
    button.textContent = saving ? 'Salvando…' : button.dataset.label;
  }

  async function renderAgency(token) {
    showLoading('agency');
    const settings = await loadCommunicationSettings();
    if (token !== renderToken) return;
    const body = `<div class="settings-subpage-section-title">Dados institucionais</div>
      <div class="settings-subpage-section-sub">Essas informações são usadas como identidade da agência dentro do CRM.</div>
      <form class="settings-subpage-form" data-settings-subpage-form="agency">
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsAgencyName">Nome da agência</label><input id="settingsAgencyName" value="${escapeHtml(settings.agency_name)}" required></div>
          <div class="settings-field"><label for="settingsAgencyDisplay">Nome de exibição no CRM</label><input id="settingsAgencyDisplay" value="${escapeHtml(settings.agency_display_name)}" required></div>
          <div class="settings-field"><label for="settingsAgencyPhone">Telefone</label><input id="settingsAgencyPhone" value="${escapeHtml(settings.agency_phone)}"></div>
          <div class="settings-field"><label for="settingsAgencyEmail">E-mail</label><input id="settingsAgencyEmail" type="email" value="${escapeHtml(settings.agency_email)}"></div>
        </div>
        <div class="settings-form-actions"><span id="settingsSubpageFeedback" class="settings-subpage-feedback"></span><button class="settings-save-button" type="submit" data-label="Salvar dados">Salvar dados</button></div>
      </form>`;
    showPanel('agency', body, 'Dados institucionais');
  }

  async function loadCurrentMember() {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    const user = authData.user;
    if (!user) throw new Error('Usuário autenticado não encontrado.');
    const { data: member, error: memberError } = await supabase.from('app_members').select('display_name, role').eq('user_id', user.id).single();
    if (memberError) throw memberError;
    return { user, member };
  }

  async function renderUser(token) {
    showLoading('user');
    const { user, member } = await loadCurrentMember();
    if (token !== renderToken) return;
    const role = ROLE_LABELS[member.role] || member.role || 'Operações';
    const body = `<div class="settings-subpage-section-title">Perfil do usuário</div>
      <div class="settings-subpage-section-sub">Você pode alterar seu nome. E-mail e função são definidos pela autenticação e pelas permissões do CRM.</div>
      <form class="settings-subpage-form" data-settings-subpage-form="user">
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsUserName">Nome</label><input id="settingsUserName" value="${escapeHtml(member.display_name || user.email || '')}" required></div>
          <div class="settings-field"><label for="settingsUserEmail">E-mail</label><input id="settingsUserEmail" value="${escapeHtml(user.email)}" readonly></div>
          <div class="settings-field full"><label for="settingsUserRole">Função</label><input id="settingsUserRole" value="${escapeHtml(role)}" readonly><span class="settings-field-help">A função é controlada pelas permissões da conta.</span></div>
        </div>
        <div class="settings-form-actions"><span id="settingsSubpageFeedback" class="settings-subpage-feedback"></span><button class="settings-save-button" type="submit" data-label="Salvar nome">Salvar nome</button></div>
      </form>`;
    showPanel('user', body, role);
  }

  function templateCard(template, channel) {
    const subject = channel === 'email' ? `<div class="settings-field"><label>Assunto</label><input data-settings-template-id="${escapeHtml(template.id)}" data-settings-template-field="subject" value="${escapeHtml(template.subject)}"></div>` : '';
    return `<article class="settings-template-card">
      <div class="settings-template-label">${escapeHtml(template.label)}</div>
      <div class="settings-subpage-form">${subject}<div class="settings-field"><label>Mensagem</label><textarea data-settings-template-id="${escapeHtml(template.id)}" data-settings-template-field="body">${escapeHtml(template.body)}</textarea></div></div>
    </article>`;
  }

  async function renderMessages(token) {
    showLoading('messages');
    const [whatsapp, email] = await Promise.all([loadMessageTemplates('whatsapp'), loadMessageTemplates('email')]);
    if (token !== renderToken) return;
    const total = whatsapp.length + email.length;
    const body = `<div class="settings-subpage-section-title">Modelos ativos</div>
      <div class="settings-subpage-section-sub">Edite os textos que o CRM prepara para os envios manuais. As alterações são salvas no Supabase.</div>
      <form class="settings-subpage-form" data-settings-subpage-form="messages">
        <div class="settings-template-channels">
          <section class="settings-template-channel"><div class="settings-template-channel-head"><h3>WhatsApp</h3><span>${whatsapp.length} modelos</span></div>${whatsapp.map(item => templateCard(item, 'whatsapp')).join('')}</section>
          <section class="settings-template-channel"><div class="settings-template-channel-head"><h3>E-mail</h3><span>${email.length} modelos</span></div>${email.map(item => templateCard(item, 'email')).join('')}</section>
        </div>
        <div class="settings-form-actions"><span id="settingsSubpageFeedback" class="settings-subpage-feedback"></span><button class="settings-save-button" type="submit" data-label="Salvar mensagens">Salvar mensagens</button></div>
      </form>`;
    showPanel('messages', body, `${total} modelos ativos`);
  }

  async function renderDeadlines(token) {
    showLoading('deadlines');
    const settings = await loadCommunicationSettings();
    if (token !== renderToken) return;
    const body = `<div class="settings-subpage-section-title">Prazos do fluxo</div>
      <div class="settings-subpage-section-sub">O segundo lembrete precisa ocorrer depois do primeiro. O aviso final pode ser ativado ou desativado.</div>
      <form class="settings-subpage-form" data-settings-subpage-form="deadlines">
        <div class="settings-form-grid">
          <div class="settings-field"><label for="settingsDeadlineR1">Primeiro lembrete após (horas)</label><input id="settingsDeadlineR1" type="number" min="1" value="${Number(settings.reminder_1_hours) || 48}" required></div>
          <div class="settings-field"><label for="settingsDeadlineR2">Segundo lembrete após (horas)</label><input id="settingsDeadlineR2" type="number" min="1" value="${Number(settings.reminder_2_hours) || 96}" required></div>
          <div class="settings-field full"><label for="settingsDeadlineFinal">Aviso final</label><select id="settingsDeadlineFinal"><option value="true" ${settings.final_notice_enabled ? 'selected' : ''}>Ativado</option><option value="false" ${settings.final_notice_enabled ? '' : 'selected'}>Desativado</option></select></div>
        </div>
        <div class="settings-form-actions"><span id="settingsSubpageFeedback" class="settings-subpage-feedback"></span><button class="settings-save-button" type="submit" data-label="Salvar prazos">Salvar prazos</button></div>
      </form>`;
    showPanel('deadlines', body, `${settings.reminder_1_hours}h · ${settings.reminder_2_hours}h`);
  }

  async function renderChannel(view, token) {
    showLoading(view);
    const settings = await loadCommunicationSettings();
    if (token !== renderToken) return;
    const whatsapp = view === 'whatsapp-info';
    const mode = whatsapp ? settings.whatsapp_mode : settings.email_mode;
    const channel = whatsapp ? 'WhatsApp' : 'e-mail';
    const destination = whatsapp ? 'o WhatsApp com a mensagem preparada' : 'o aplicativo padrão de e-mail com assunto e mensagem preparados';
    const body = `<div class="settings-subpage-section-title">Modo manual ativo</div>
      <div class="settings-subpage-section-sub">O CRM organiza a comunicação, mas o envio continua sob seu controle.</div>
      <div class="settings-info-grid">
        <article class="settings-info-card"><small>Operação</small><strong>Manual</strong><p>O sistema não dispara mensagens automaticamente.</p></article>
        <article class="settings-info-card"><small>Preparação</small><strong>Mensagem pronta</strong><p>O CRM monta o conteúdo com o modelo correto antes de abrir ${escapeHtml(channel)}.</p></article>
        <article class="settings-info-card"><small>Registro</small><strong>Confirmação do envio</strong><p>Depois de enviar, você confirma no CRM para registrar o contato.</p></article>
      </div>
      <div class="settings-channel-note"><strong>Como funciona:</strong> o CRM prepara e abre ${escapeHtml(destination)}. Você revisa, envia e depois confirma o envio no CRM.</div>`;
    showPanel(view, body, mode === 'manual' ? 'Modo manual ativo' : `Modo: ${mode || 'manual'}`);
  }

  async function openSubpage(view) {
    if (!OWN_VIEWS.has(view)) return;
    const token = ++renderToken;
    try {
      if (view === 'agency') await renderAgency(token);
      else if (view === 'user') await renderUser(token);
      else if (view === 'messages') await renderMessages(token);
      else if (view === 'deadlines') await renderDeadlines(token);
      else await renderChannel(view, token);
    } catch (error) {
      console.error(`Não foi possível carregar Configurações > ${view}.`, error);
      if (token === renderToken) showError(view, 'Tente novamente. Os dados existentes não foram alterados.');
    }
  }

  function returnToSettings() {
    ++renderToken;
    const app = crm();
    removeBack();
    if (app && OWN_VIEWS.has(app.dataset.settingsView)) delete app.dataset.settingsView;
    const nav = document.querySelector('.nav-item[data-page="Configurações"]');
    if (nav) nav.click();
    else window.location.hash = '#settings';
  }

  function viewFromTarget(target) {
    const app = crm();
    if (!app || app.dataset.page !== 'Configurações') return null;
    const action = target.closest?.('[data-action]')?.dataset.action;
    return ACTION_VIEW.get(action) || null;
  }

  async function saveAgency(form) {
    await updateAgencySettings({
      agency_name: form.querySelector('#settingsAgencyName').value.trim(),
      agency_display_name: form.querySelector('#settingsAgencyDisplay').value.trim(),
      agency_phone: form.querySelector('#settingsAgencyPhone').value.trim(),
      agency_email: form.querySelector('#settingsAgencyEmail').value.trim(),
    });
    feedback('Dados salvos com sucesso.');
  }

  async function saveUser(form) {
    const name = form.querySelector('#settingsUserName').value.trim();
    const { user } = await loadCurrentMember();
    const { data, error } = await supabase.from('app_members').update({ display_name: name }).eq('user_id', user.id).select('display_name, role').single();
    if (error) throw error;
    document.querySelector('.user-card strong')?.replaceChildren(document.createTextNode(data.display_name || name));
    feedback('Nome atualizado com sucesso.');
  }

  async function saveMessages(form) {
    const updates = new Map();
    form.querySelectorAll('[data-settings-template-id]').forEach(field => {
      const id = field.dataset.settingsTemplateId;
      const values = updates.get(id) || {};
      values[field.dataset.settingsTemplateField] = field.value;
      updates.set(id, values);
    });
    await Promise.all([...updates].map(([id, values]) => updateMessageTemplate(id, values)));
    feedback('Mensagens salvas com sucesso.');
  }

  async function saveDeadlines(form) {
    const reminder1 = Number(form.querySelector('#settingsDeadlineR1').value);
    const reminder2 = Number(form.querySelector('#settingsDeadlineR2').value);
    if (!Number.isFinite(reminder1) || reminder1 < 1 || !Number.isFinite(reminder2) || reminder2 < 1) throw new Error('Informe prazos válidos em horas.');
    if (reminder2 <= reminder1) throw new Error('O segundo lembrete precisa ocorrer depois do primeiro.');
    await updateCommunicationSettings({ reminder_1_hours: reminder1, reminder_2_hours: reminder2, final_notice_enabled: form.querySelector('#settingsDeadlineFinal').value === 'true' });
    const status = document.querySelector('.settings-subpage-status');
    if (status) status.textContent = `${reminder1}h · ${reminder2}h`;
    feedback('Prazos salvos com sucesso.');
  }

  async function handleSubmit(form) {
    if (form.dataset.saving === 'true') return;
    if (!form.reportValidity()) return;
    setSaving(form, true);
    try {
      const type = form.dataset.settingsSubpageForm;
      if (type === 'agency') await saveAgency(form);
      else if (type === 'user') await saveUser(form);
      else if (type === 'messages') await saveMessages(form);
      else if (type === 'deadlines') await saveDeadlines(form);
    } catch (error) {
      console.error('Não foi possível salvar a configuração.', error);
      feedback(error?.message || 'Não foi possível salvar. Tente novamente.', 'error');
    } finally {
      setSaving(form, false);
    }
  }

  window.addEventListener('pointerdown', event => {
    if (!viewFromTarget(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('click', event => {
    const view = viewFromTarget(event.target);
    if (view) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSubpage(view);
      return;
    }

    const app = crm();
    if (!app) return;

    if (event.target.closest?.('[data-settings-subpage-back]') && app.dataset.page === 'Configurações' && OWN_VIEWS.has(app.dataset.settingsView)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      returnToSettings();
      return;
    }

    if (event.target.closest?.('.nav-item') && OWN_VIEWS.has(app.dataset.settingsView)) {
      ++renderToken;
      removeBack();
      delete app.dataset.settingsView;
    }
  }, true);

  window.addEventListener('submit', event => {
    const form = event.target.closest?.('[data-settings-subpage-form]');
    if (!form) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    handleSubmit(form);
  }, true);
})();
