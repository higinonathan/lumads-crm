import { supabase } from './supabase.js';
import { loadClients, createClient, updateClient, archiveClient } from './clients-data.js';
import { validateClientLogo, uploadClientLogo, publicClientLogoUrl, deleteClientLogo } from './client-logo-storage.js';
import { loadApprovals, createApproval, updateApproval, setApprovalStatus, archiveApproval } from './approvals-data.js';
import { loadClientContactHistory, loadCommunicationSettings, loadMessageTemplates, updateCommunicationSettings, updateAgencySettings, updateMessageTemplate } from './communications-data.js';

(() => {
  'use strict';

  const roleLabels = { owner: 'Proprietário', admin: 'Administrador', operator: 'Operações' };
  const authState = {
    status: 'loading', session: null, user: null, member: null, error: null,
    memberUserId: null, memberPromise: null, accessUserId: null, accessPromise: null,
    clientsUserId: null, clientsPromise: null, approvalsUserId: null, approvalsPromise: null, loginInFlight: false
  };

  function setAuthMessage(id, message = '', isError = false) {
    const target = document.getElementById(id);
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
    target.classList.toggle('is-error', isError);
  }

  function setAuthView(view, message = '', isError = false) {
    authState.status = view;
    document.querySelectorAll('[data-auth-view]').forEach(element => {
      const isActive = element.dataset.authView === view;
      element.hidden = !isActive;
      element.style.display = isActive ? '' : 'none';
    });
    const authGate = document.getElementById('authGate');
    const crmApp = document.getElementById('crmApp');
    authGate.hidden = false;
    authGate.style.removeProperty('display');
    crmApp.hidden = true;
    crmApp.style.display = 'none';
    if (view === 'login') setAuthMessage('authMessage', message, isError);
  }

  function resetAuthState() {
    authState.status = 'login';
    authState.session = null;
    authState.user = null;
    authState.member = null;
    authState.error = null;
    authState.memberUserId = null;
    authState.memberPromise = null;
    authState.accessUserId = null;
    authState.accessPromise = null;
    authState.clientsUserId = null;
    authState.clientsPromise = null;
    authState.approvalsUserId = null;
    authState.approvalsPromise = null;
    authState.loginInFlight = false;
    clientsLoading = false;
    clientsLoadError = false;
    approvalsLoading = false;
    approvalsLoadError = false;
  }

  function setSessionState(session) {
    authState.session = session || null;
    authState.user = session?.user || null;
  }

  function authRedirectUrl() {
    return window.location.origin;
  }

  function isRecoveryUrl() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    return query.get('type') === 'recovery' || hash.get('type') === 'recovery';
  }

  function setSubmitState(form, pending) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (pending) button.dataset.label = button.textContent;
    button.disabled = pending;
    button.textContent = pending ? 'Aguarde…' : button.dataset.label;
  }

  function showCRM() {
    authState.status = 'authenticated';
    console.log('[PERF] CRM liberado');
    const authGate = document.getElementById('authGate');
    const crmApp = document.getElementById('crmApp');
    authGate.hidden = true;
    authGate.style.display = 'none';
    crmApp.hidden = false;
    crmApp.style.removeProperty('display');
    refreshUserUI();
    navigate(pageFromHash());
  }

  function loadAuthorizedClients(user) {
    if (authState.clientsUserId === user.id && authState.clientsPromise) return authState.clientsPromise;
    authState.clientsUserId = user.id;
    clientsLoading = true;
    clientsLoadError = false;
    if (authState.status === 'authenticated') rerender();
    const startedAt = performance.now();
    const request = loadClients()
      .then(clients => {
        if (authState.user?.id !== user.id) return false;
        state.clients = clients;
        return true;
      })
      .catch(error => {
        if (authState.user?.id === user.id) {
          clientsLoadError = true;
          console.error('Não foi possível carregar os clientes.', error);
        }
        return false;
      })
      .finally(() => {
        if (authState.clientsPromise === request) authState.clientsPromise = null;
        if (authState.user?.id === user.id) {
          clientsLoading = false;
          rerender();
        }
        console.log(`[PERF] loadClients ${(performance.now() - startedAt).toFixed(0)}ms`);
      });
    authState.clientsPromise = request;
    return request;
  }

  function loadAuthorizedApprovals(user) {
    if (authState.approvalsUserId === user.id && authState.approvalsPromise) return authState.approvalsPromise;
    authState.approvalsUserId = user.id;
    approvalsLoading = true;
    approvalsLoadError = false;
    if (authState.status === 'authenticated') rerender();
    let request;
    request = loadApprovals()
      .then(approvals => {
        if (authState.user?.id !== user.id) return false;
        state.approvals = approvals;
        return true;
      })
      .catch(error => {
        if (authState.user?.id === user.id) {
          approvalsLoadError = true;
          console.error('Não foi possível carregar as aprovações.', error);
        }
        return false;
      })
      .finally(() => {
        if (authState.approvalsPromise === request) authState.approvalsPromise = null;
        if (authState.user?.id === user.id) {
          approvalsLoading = false;
          if (approvalsLoadError) authState.approvalsUserId = null;
          rerender();
        }
      });
    authState.approvalsPromise = request;
    return request;
  }

  function reloadOperationalData() {
    const user = authState.user;
    if (!user) return;
    clientsLoadError = false;
    approvalsLoadError = false;
    approvalsLoading = true;
    rerender();
    void loadAuthorizedClients(user).then(clientsReady => {
      if (clientsReady) return loadAuthorizedApprovals(user);
      approvalsLoading = false;
      rerender();
      return false;
    });
  }

  async function loadMember(user) {
    if (authState.memberUserId === user.id && authState.member) return { member: authState.member, error: null };
    if (authState.memberUserId === user.id && authState.memberPromise) return authState.memberPromise;

    authState.memberUserId = user.id;
    console.log('[AUTH] iniciando validação do membro', user.id);
    const startedAt = performance.now();
    const request = supabase
      .from('app_members')
      .select('display_name, role')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!error && data && authState.user?.id === user.id) authState.member = data;
        return { member: data, error };
      })
      .catch(error => ({ member: null, error }))
      .finally(() => console.log(`[PERF] app_members ${(performance.now() - startedAt).toFixed(0)}ms`));

    authState.memberPromise = request;
    try {
      return await request;
    } finally {
      if (authState.memberPromise === request) authState.memberPromise = null;
    }
  }

  async function authorizeSession(session, user = session?.user) {
    if (!session || !user) {
      resetAuthState();
      return setAuthView('login');
    }
    if (authState.accessUserId === user.id && authState.accessPromise) return authState.accessPromise;
    if (authState.status === 'authenticated' && authState.user?.id === user.id && authState.member) {
      setSessionState(session);
      return;
    }

    setSessionState(session);
    setAuthView('loading');
    let accessRequest;
    accessRequest = (async () => {
      try {
        const { member, error } = await loadMember(user);
        if (authState.user?.id !== user.id) return;
        if (error) {
          authState.error = error;
          console.error('Não foi possível validar o acesso ao LUMADS CRM.', error);
          return setAuthView('login', 'Não foi possível validar seu acesso. Tente novamente.', true);
        }
        if (!member) {
          setAuthView('login', 'Este e-mail não possui acesso ao LUMADS CRM.', true);
          await supabase.auth.signOut({ scope: 'local' });
          return;
        }

        authState.member = member;
        console.log('[AUTH] membro validado', member?.role);
        state.currentUser = {
          name: member.display_name || user.email || 'Usuário',
          role: roleLabels[member.role] || 'Operações',
          email: user.email || ''
        };
        clientsLoading = true;
        approvalsLoading = true;
        clientsLoadError = false;
        approvalsLoadError = false;
        showCRM();
        void loadAuthorizedClients(user).then(clientsReady => {
          if (clientsReady) return loadAuthorizedApprovals(user);
          approvalsLoading = false;
          rerender();
          return false;
        });
      } catch (error) {
        if (authState.user?.id !== user.id) return;
        authState.error = error;
        console.error('Não foi possível validar o acesso ao LUMADS CRM.', error);
        setAuthView('login', 'Não foi possível validar seu acesso. Tente novamente.', true);
      } finally {
        if (authState.accessPromise === accessRequest) {
          authState.accessPromise = null;
          authState.accessUserId = null;
        }
        if (authState.status === 'loading') setAuthView('login', 'Não foi possível validar seu acesso. Tente novamente.', true);
      }
    })();
    authState.accessUserId = user.id;
    authState.accessPromise = accessRequest;
    return accessRequest;
  }

  async function initializeAuthentication() {
    setAuthView('loading');
    try {
      const startedAt = performance.now();
      const { data, error } = await supabase.auth.getSession();
      console.log(`[PERF] getSession ${(performance.now() - startedAt).toFixed(0)}ms`);
      if (error) throw error;
      if (!data.session) {
        resetAuthState();
        return setAuthView('login');
      }
      setSessionState(data.session);
      if (isRecoveryUrl()) return setAuthView('update-password');
      return await authorizeSession(data.session);
    } catch (error) {
      authState.error = error;
      console.error('Não foi possível verificar a sessão do LUMADS CRM.', error);
      setAuthView('login', 'Não foi possível verificar sua sessão. Tente novamente.', true);
    }
  }

  async function logout(message = '') {
    resetAuthState();
    setAuthView('login', message);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) console.error('Não foi possível encerrar a sessão do LUMADS CRM.', error);
  }

  function setupAuthentication() {
    document.addEventListener('click', event => {
      if (!event.target.closest('[data-action="logout"]')) return;
      event.stopPropagation();
      toggleUserMenu(false);
      void logout();
    }, true);

    document.addEventListener('click', event => {
      const link = event.target.closest('[data-auth-link]');
      if (link) {
        setAuthMessage('authMessage');
        setAuthMessage('signupMessage');
        setAuthMessage('recoveryMessage');
        setAuthMessage('updatePasswordMessage');
        setAuthView(link.dataset.authLink);
      }
    });

    document.getElementById('loginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      setSubmitState(form, true);
      setAuthMessage('authMessage');
      authState.loginInFlight = true;
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: document.getElementById('loginEmail').value.trim(),
          password: document.getElementById('loginPassword').value
        });
        const user = data?.user || data?.session?.user;
        if (error || !data.session || !user) return setAuthMessage('authMessage', 'E-mail ou senha incorretos.', true);
        console.log('[AUTH] signIn concluído');
        await authorizeSession(data.session, user);
      } catch (error) {
        console.error('Não foi possível iniciar a sessão no LUMADS CRM.', error);
        setAuthMessage('authMessage', 'Não foi possível validar seu acesso. Tente novamente.', true);
      } finally {
        authState.loginInFlight = false;
        setSubmitState(form, false);
      }
    });

    document.getElementById('signupForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = document.getElementById('signupPassword').value;
      if (password !== document.getElementById('signupPasswordConfirm').value) return setAuthMessage('signupMessage', 'As senhas não coincidem.', true);
      setSubmitState(form, true);
      setAuthMessage('signupMessage');
      try {
        const { data, error } = await supabase.auth.signUp({
          email: document.getElementById('signupEmail').value.trim(),
          password,
          options: { emailRedirectTo: authRedirectUrl() }
        });
        if (error) return setAuthMessage('signupMessage', 'Não foi possível concluir o cadastro. Tente novamente.', true);
        if (!data.session) return setAuthMessage('signupMessage', 'Cadastro realizado. Verifique seu e-mail para confirmar sua conta.');
        await authorizeSession(data.session);
      } catch (error) {
        console.error('Não foi possível concluir o cadastro no LUMADS CRM.', error);
        setAuthMessage('signupMessage', 'Não foi possível concluir o cadastro. Tente novamente.', true);
      } finally {
        setSubmitState(form, false);
      }
    });

    document.getElementById('recoveryForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      setSubmitState(form, true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(document.getElementById('recoveryEmail').value.trim(), { redirectTo: authRedirectUrl() });
        if (error) console.error('Não foi possível solicitar a recuperação de senha.', error);
        setAuthMessage('recoveryMessage', 'Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.');
      } catch (error) {
        console.error('Não foi possível solicitar a recuperação de senha.', error);
        setAuthMessage('recoveryMessage', 'Se este e-mail estiver cadastrado, enviaremos as instruções para redefinir sua senha.');
      } finally {
        setSubmitState(form, false);
      }
    });

    document.getElementById('updatePasswordForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = document.getElementById('newPassword').value;
      if (password !== document.getElementById('newPasswordConfirm').value) return setAuthMessage('updatePasswordMessage', 'As senhas não coincidem.', true);
      setSubmitState(form, true);
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          console.error('Não foi possível redefinir a senha.', error);
          return setAuthMessage('updatePasswordMessage', 'Não foi possível redefinir sua senha. Tente novamente.', true);
        }
        await logout('Senha alterada com sucesso. Entre com sua nova senha.');
      } catch (error) {
        console.error('Não foi possível redefinir a senha.', error);
        setAuthMessage('updatePasswordMessage', 'Não foi possível redefinir sua senha. Tente novamente.', true);
      } finally {
        setSubmitState(form, false);
      }
    });

    supabase.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT') {
          resetAuthState();
          return setAuthView('login');
        }
        if (event === 'PASSWORD_RECOVERY' && session) {
          setSessionState(session);
          return setAuthView('update-password');
        }
        if (event === 'USER_UPDATED' && session) {
          setSessionState(session);
          return;
        }
        if (event === 'SIGNED_IN' && session) {
          if (authState.loginInFlight) {
            setSessionState(session);
            return;
          }
          if (authState.status === 'authenticated' && authState.user?.id === session.user.id) return setSessionState(session);
          void authorizeSession(session);
          return;
        }
        if (event === 'TOKEN_REFRESHED' && session) {
          if (authState.status === 'authenticated' && authState.user?.id === session.user.id) return setSessionState(session);
          void authorizeSession(session);
        }
      }, 0);
    });
  }

  const STORAGE_KEY = 'lumads-crm-frontend-v2';
  const THEME_KEY = 'lumads-theme-preference';
  const statusMeta = {
    waiting_approval: { label: 'Aguardando aprovação', cls: 'waiting' },
    reminder_1: { label: 'Lembrete 1 enviado', cls: 'reminder1' },
    reminder_2: { label: 'Lembrete 2 enviado', cls: 'reminder2' },
    adjustment_requested: { label: 'Ajuste solicitado', cls: 'changes' },
    approved: { label: 'Aprovado', cls: 'approved' },
    published: { label: 'Publicado', cls: 'published' },
    closed: { label: 'Encerrado', cls: 'closed' }
  };
  const activeStatuses = ['waiting_approval', 'reminder_1', 'reminder_2', 'adjustment_requested'];
  const finalStatuses = ['approved', 'published', 'closed'];
  const iconSvg = name => ({
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>',
    bellRing: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4M4 4l-2 2m18-2 2 2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 11a8 8 0 0 0-14.8-4L3 10m0-6v6h6"/><path d="M4 13a8 8 0 0 0 14.8 4L21 14m0 6v-6h-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.3 2.3 4.8-5"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-9 5 1.6 1.6L16 13"/></svg>'
  }[name] || '');
  const dashboardMetricIcon = name => ({
    clock: '<svg viewBox="0 0 80 80"><defs><linearGradient id="metricPlane" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#72A8FF"/><stop offset="1" stop-color="#0040D8"/></linearGradient><filter id="metricPlaneShadow"><feDropShadow dx="0" dy="7" stdDeviation="5" flood-color="#1A4AC8" flood-opacity=".35"/></filter></defs><path filter="url(#metricPlaneShadow)" fill="url(#metricPlane)" d="M67 14 13 37c-4 1.7-3.6 7.5.6 8.7l19.7 5.5 7.8 15.4c1.7 3.4 6.5 3.7 8.6.5L72 20.7c2.1-4.3-.6-8.7-5-6.7Z"/><path d="m34 51 27-25-20 31" fill="#91BBFF" opacity=".55"/></svg>',
    bell: '<svg viewBox="0 0 80 80"><defs><linearGradient id="metricBell" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#73A9FF"/><stop offset="1" stop-color="#0044DF"/></linearGradient></defs><path fill="url(#metricBell)" d="M17 17h46a9 9 0 0 1 9 9v27a9 9 0 0 1-9 9H41l-12 9 2-9H17a9 9 0 0 1-9-9V26a9 9 0 0 1 9-9Z"/><circle cx="28" cy="40" r="4" fill="#fff"/><circle cx="40" cy="40" r="4" fill="#d8e7ff"/><circle cx="52" cy="40" r="4" fill="#fff"/></svg>',
    bellRing: '<svg viewBox="0 0 80 80"><defs><linearGradient id="metricMail" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D5B3FF"/><stop offset="1" stop-color="#7C45E8"/></linearGradient></defs><rect x="9" y="18" width="62" height="44" rx="11" fill="url(#metricMail)"/><path d="m15 25 25 21 25-21" fill="none" stroke="#eddfff" stroke-width="4"/><circle cx="65" cy="17" r="12" fill="#8F47F2"/><path d="M65 12v10m-5-5h10" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/></svg>',
    refresh: '<svg viewBox="0 0 80 80"><defs><linearGradient id="metricDoc" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFE3A6"/><stop offset="1" stop-color="#F0A838"/></linearGradient></defs><rect x="14" y="10" width="48" height="58" rx="8" fill="url(#metricDoc)"/><path d="M24 25h26M24 34h22M24 43h18" stroke="#C87B1F" stroke-width="4" stroke-linecap="round"/><path d="m48 54 18-19 6 6-18 19-9 3z" fill="#2D6BFF"/></svg>',
    check: '<svg viewBox="0 0 80 80"><defs><linearGradient id="metricCheck" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7FE4A1"/><stop offset="1" stop-color="#26A558"/></linearGradient></defs><path fill="url(#metricCheck)" d="M40 8 68 20v19c0 16-11 27-28 33C23 66 12 55 12 39V20Z"/><path d="m26 39 9 9 19-20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    calendar: '<svg viewBox="0 0 80 80"><defs><linearGradient id="metricCalendar" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9FC0FF"/><stop offset="1" stop-color="#316AE8"/></linearGradient></defs><rect x="8" y="18" width="56" height="48" rx="8" fill="url(#metricCalendar)"/><rect x="8" y="18" width="56" height="14" rx="8" fill="#1455E8"/><path d="M22 10v15M50 10v15" stroke="#0F3EAA" stroke-width="5" stroke-linecap="round"/><circle cx="61" cy="58" r="14" fill="#F7F9FF" stroke="#2D65E6" stroke-width="4"/><path d="M61 50v8l6 3" fill="none" stroke="#244CA7" stroke-width="3" stroke-linecap="round"/></svg>'
  }[name] || '');
  const approvalMetricIcon = name => ({
    tracking: '<svg viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="approvalTrackingMetric" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9ABEFF"/><stop offset="1" stop-color="#2861E6"/></linearGradient></defs><circle cx="40" cy="40" r="29" fill="url(#approvalTrackingMetric)"/><circle cx="40" cy="40" r="21" fill="#F7F9FF"/><path d="M40 26v15l10 7" fill="none" stroke="#2B53A9" stroke-width="4" stroke-linecap="round"/><path d="m51 55 5 5 10-12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    late: '<svg viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="approvalLateMetric" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFB5A9"/><stop offset="1" stop-color="#E65353"/></linearGradient></defs><circle cx="40" cy="40" r="28" fill="url(#approvalLateMetric)"/><circle cx="40" cy="40" r="20" fill="#FFF7F7"/><path d="M40 27v14l8 5" fill="none" stroke="#B33D3D" stroke-width="4" stroke-linecap="round"/><circle cx="61" cy="22" r="11" fill="#EF5151"/><path d="M61 17v7m0 4v.2" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>',
    adjustment: '<svg viewBox="0 0 80 80" aria-hidden="true"><defs><linearGradient id="approvalAdjustmentMetric" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFE29A"/><stop offset="1" stop-color="#F2A737"/></linearGradient></defs><rect x="16" y="12" width="44" height="56" rx="8" fill="url(#approvalAdjustmentMetric)"/><path d="M25 28h23M25 37h18M25 46h16" stroke="#BB731A" stroke-width="4" stroke-linecap="round"/><path d="m47 57 18-18 6 6-18 18-9 3z" fill="#2D6BFF"/></svg>'
  }[name] || '');
  const approvalActionIcon = name => ({
    whatsapp: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 5.3c-5.75 0-10.43 4.56-10.43 10.18 0 1.98.58 3.9 1.68 5.54L5 27l6.17-2.02a10.72 10.72 0 0 0 4.82 1.14h.01c5.75 0 10.43-4.56 10.43-10.18S21.75 5.3 16 5.3Zm0 18.99c-1.51 0-2.99-.4-4.28-1.15l-.31-.18-3.66 1.2 1.23-3.48-.2-.32a8.05 8.05 0 0 1-1.28-4.37c0-4.61 3.81-8.36 8.5-8.36 4.69 0 8.5 3.75 8.5 8.36 0 4.61-3.81 8.36-8.5 8.36Zm4.66-6.26c-.26-.13-1.53-.74-1.77-.83-.24-.09-.42-.13-.59.13-.17.26-.68.83-.83 1-.15.17-.31.19-.57.06-.26-.13-1.08-.39-2.06-1.24-.76-.66-1.27-1.48-1.42-1.74-.15-.26-.02-.4.11-.52.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.32-.02-.45-.06-.13-.59-1.4-.81-1.91-.21-.5-.43-.43-.59-.44l-.5-.01c-.17 0-.46.06-.7.32-.24.26-.92.88-.92 2.15s.94 2.5 1.07 2.67c.13.17 1.84 2.76 4.47 3.87.62.26 1.11.42 1.49.54.63.19 1.2.16 1.65.1.5-.07 1.53-.61 1.75-1.2.22-.58.22-1.08.15-1.19-.07-.11-.24-.17-.5-.3Z"/></svg>',
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
    approve: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.3 3.3 7.7-8"/></svg>'
  }[name] || '');
  const themeIcon = name => ({
    light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/></svg>',
    dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z"/></svg>'
  }[name] || '');
  const settingIcon = name => ({
    appearance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m9.9 9.9 1.5 1.5M3 12h2m14 0h2M5.6 18.4l1.4-1.4m9.9-9.9 1.5-1.5"/></svg>',
    agency: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15"/><path d="M15 10h4a1 1 0 0 1 1 1v10M4 21h17"/><path d="M8 9h3M8 13h3M8 17h3"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 18.5V20"/><circle cx="9.5" cy="8" r="3.2"/><path d="M17 15.2a3.4 3.4 0 0 1 3 3.4V20m-3.8-12a3.2 3.2 0 0 1 0 6.1"/></svg>',
    messages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z"/><path d="M8 9h8M8 12.5h5"/></svg>',
    deadlines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M9 2h6"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 4h4l1.5 4-2 1.5a11 11 0 0 0 5 5l1.5-2 4 1.5V19a2 2 0 0 1-2.2 2A16 16 0 0 1 4 6.2 2 2 0 0 1 5 4Z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>'
  }[name] || '');
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const shift = (days, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const initials = name => name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

  function themePreference() { const saved = localStorage.getItem(THEME_KEY); const value = saved === 'dark' ? 'dark' : 'light'; if (saved !== value) localStorage.setItem(THEME_KEY, value); return value; }
  function resolvedTheme(preference = themePreference()) { return preference === 'dark' ? 'dark' : 'light'; }
  function renderThemeUI() {
    const preference = themePreference(); const button = $('#themeButton');
    if (!button) return;
    const target = preference === 'light' ? 'dark' : 'light';
    button.innerHTML = themeIcon(target); button.title = `Ativar modo ${{ light: 'claro', dark: 'escuro' }[target]}`; button.setAttribute('aria-label', button.title);
  }
  function setTheme(preference) {
    const value = preference === 'dark' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, value); document.documentElement.dataset.themePreference = value; document.documentElement.dataset.theme = resolvedTheme(value);
    renderThemeUI(); if (currentPage === 'Configurações') renderSettings();
  }
  function toggleTheme() { setTheme(themePreference() === 'light' ? 'dark' : 'light'); }

  function seedState() {
    return {
      currentUser: { name: 'Usuário', role: 'Operações' },
      clients: [],
      approvals: [],
      messages: {
        initial: 'Olá! Seus conteúdos já estão disponíveis para aprovação no PodePostar. Acesse o link abaixo para aprovar ou solicitar ajustes: [LINK]',
        reminder1: 'Olá! Passando para lembrar que os conteúdos ainda estão aguardando sua aprovação no PodePostar. Quando puder, acesse o link enviado para aprovar ou solicitar ajustes.',
        reminder2: 'Olá! Seus conteúdos ainda estão pendentes de aprovação no PodePostar. Precisamos do seu retorno para manter o calendário de publicações previsto.',
        deadline: 'Olá! O conteúdo previsto para publicação ainda está aguardando sua aprovação no PodePostar. Para mantermos a data programada, precisamos da sua aprovação hoje.'
      }
    };
  }

  const defaultData = seedState();
  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) {
        const { agency, currentUser, messages, deadlines, ...savedState } = saved;
        if (agency || currentUser || messages || deadlines) localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...savedState, clients: [], approvals: [] }));
        return { ...defaultData, ...savedState, clients: [], approvals: [] };
      }
    } catch (_) { /* use defaults */ }
    return { ...defaultData, clients: [], approvals: [] };
  }

  const pageByHash = { dashboard: 'Dashboard', approvals: 'Aprovações', clients: 'Clientes', history: 'Histórico', settings: 'Configurações' };
  const hashByPage = Object.fromEntries(Object.entries(pageByHash).map(([hash, page]) => [page, hash]));
  const pageFromHash = () => pageByHash[window.location.hash.slice(1).toLowerCase()] || 'Dashboard';
  let state = loadState();
  let currentPage = pageFromHash();
  let dashboardStatus = '';
  let dashboardDescending = true;
  let pendingApprovalFilters = null;
  let currentClientId = null;
  let selectedClientLogoFile = null;
  let clientLogoPreviewObjectUrl = null;
  let clientLogoRemovalRequested = false;
  let clientsLoading = false;
  let clientsLoadError = false;
  let approvalsLoading = false;
  let approvalsLoadError = false;
  const save = () => { const { agency, currentUser, messages, ...savedState } = state; localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...savedState, clients: [], approvals: [] })); };
  const clientById = id => state.clients.find(client => client.id === id);
  const activeClients = () => state.clients.filter(client => client.isActive !== false);
  const approvalClientById = id => clientById(id);
  const approvalClients = () => state.clients;
  const validApprovals = () => state.approvals.filter(approval => Boolean(approvalClientById(approval.clientId)));
  const visibleApprovals = () => validApprovals().filter(approval => isFinal(approval) || approvalClientById(approval.clientId)?.isActive !== false);
  const approvalById = id => state.approvals.find(approval => approval.id === id);
  const isFinal = approval => finalStatuses.includes(approval.status);
  const activeApprovals = () => validApprovals().filter(approval => !isFinal(approval) && approvalClientById(approval.clientId)?.isActive !== false);
  const hasWhatsApp = client => Boolean(String(client?.whatsapp || '').replace(/\D/g, ''));
  const whatsappActionState = client => hasWhatsApp(client) ? '' : ' disabled aria-disabled="true"';
  const text = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const formatDate = value => new Intl.DateTimeFormat('pt-BR').format(new Date(value));
  const formatDateTime = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  const formatLongDate = value => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(value));
  const formatDashboardDate = value => { const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)); return date.charAt(0).toUpperCase() + date.slice(1); };
  const inputDateTime = value => { const d = new Date(value); const offset = d.getTimezoneOffset() * 60000; return new Date(d - offset).toISOString().slice(0, 16); };
  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
  const statusLabel = status => statusMeta[status]?.label || status;
  const badge = status => status ? `<span class="badge ${statusMeta[status]?.cls || 'waiting'}">${text(statusLabel(status))}</span>` : '';
  const clientLogoUrl = logo => /^data:|^https?:\/\//i.test(logo || '') ? logo : publicClientLogoUrl(logo);
  const clientMark = (client, cls = '') => `<div class="company-dot${client && client.logo ? ' has-logo' : ''}${cls ? ' ' + cls : ''}">${client && client.logo ? `<img src="${text(clientLogoUrl(client.logo))}" alt="Logo de ${text(client.name)}">` : text(initials(client?.name || 'Cliente'))}</div>`;
  const clientCell = client => client ? `<div class="client-cell">${clientMark(client)}<div><div class="client-name">${text(client.name)}</div><div class="client-company">${text(client.company)}</div></div></div>` : '';
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function dueDescriptor(approval) {
    if (!approval?.dueAt) return { label: 'Sem prazo', late: false, days: Number.POSITIVE_INFINITY };
    const days = Math.round((new Date(approval.dueAt).setHours(0, 0, 0, 0) - startOfToday()) / 86400000);
    if (days < 0) return { label: `Venceu há ${Math.abs(days)} dia${Math.abs(days) === 1 ? '' : 's'}`, late: true, days };
    if (days === 0) return { label: 'Hoje', late: false, days };
    if (days === 1) return { label: 'Amanhã', late: false, days };
    return { label: formatDate(approval.dueAt), late: false, days };
  }
  function metrics() {
    const placeholder = approvalsLoading || clientsLoading ? '…' : (approvalsLoadError || clientsLoadError ? '—' : null);
    const labels = [
      ['Aguardando aprovação', 'yellow', 'clock'],
      ['Após 1º lembrete', 'yellow', 'bell'],
      ['Após 2º lembrete', 'pink', 'bellRing'],
      ['Ajustes solicitados', 'violet', 'refresh'],
      ['Aprovados esta semana', 'mint', 'check'],
      ['Prazos próximos', 'blue', 'calendar']
    ];
    if (placeholder) return labels.map(([label, tone, icon]) => [label, placeholder, tone, icon]);
    const all = validApprovals();
    const active = activeApprovals();
    const monday = startOfToday(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return [
      ['Aguardando aprovação', active.filter(a => a.status === 'waiting_approval').length, 'yellow', 'clock'],
      ['Após 1º lembrete', all.filter(a => Number(a.reminders) >= 1).length, 'yellow', 'bell'],
      ['Após 2º lembrete', all.filter(a => Number(a.reminders) >= 2).length, 'pink', 'bellRing'],
      ['Ajustes solicitados', active.filter(a => a.status === 'adjustment_requested').length, 'violet', 'refresh'],
      ['Aprovados esta semana', all.filter(a => { const approvalDate = a.approvedAt || (a.status === 'published' ? a.publishedAt : null); return approvalDate && new Date(approvalDate) >= monday; }).length, 'mint', 'check'],
      ['Prazos próximos', active.filter(a => dueDescriptor(a).days >= 0 && dueDescriptor(a).days <= 7).length, 'blue', 'calendar']
    ];
  }
  function showToast(message, type = 'success') { const toast = $('#toast'); toast.textContent = message; toast.className = `toast show ${type}`; clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800); }
  function refreshUserUI() {
    $('#sidebarUserName').textContent = state.currentUser.name;
    $('#sidebarUserRole').textContent = state.currentUser.role;
    $('#sidebarAvatar').textContent = initials(state.currentUser.name);
    $('#currentDate').textContent = formatLongDate(new Date());
    $('#workspaceLabel').textContent = 'Operações';
  }
  function setHeader(page) {
    $('#clientDetailHeaderBack')?.remove();
    const map = { Dashboard: ['Visão geral', `${greeting()}, ${state.currentUser.name}.`], Aprovações: ['Fluxo de aprovação', 'Aprovações'], Clientes: ['Base de clientes', 'Clientes'], Histórico: ['Resultados concluídos', 'Histórico'], Configurações: ['Administração', 'Configurações'] };
    $('#pageEyebrow').textContent = map[page][0]; $('#pageTitle').textContent = map[page][1];
    const action = page === 'Clientes' ? '<button class="primary" data-action="new-client">+ Novo cliente</button>' : page === 'Configurações' ? '' : '<button class="primary" data-action="new-approval">+ Nova aprovação</button>';
    const usesDashboardShell = page === 'Dashboard' || page === 'Aprovações';
    const dashboardTools = usesDashboardShell ? '<button class="icon-btn" data-action="dashboard-filter" aria-label="Pesquisar aprovações"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="6.25"/><path d="m16 16 4.25 4.25"/></svg></button>' : '';
    const notifications = '<button class="icon-btn" data-action="notifications" aria-label="Notificações"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></button>';
    const themeControl = '<button class="icon-btn theme-button" id="themeButton" aria-label="Alterar tema"></button>';
    const date = usesDashboardShell ? `<span class="date" id="currentDate">${formatDashboardDate(new Date())}</span>` : `<span class="date" id="currentDate">${formatLongDate(new Date())}</span>`;
    $('#headerActions').innerHTML = usesDashboardShell ? `${dashboardTools}${notifications}${themeControl}${date}${action}` : `${date}${themeControl}${notifications}${action}`;
    renderThemeUI();
  }
  function dashboardRow(approval) {
    const client = approvalClientById(approval.clientId); const due = dueDescriptor(approval);
    const channel = '<div class="dashboard-channel-cell"><span class="dashboard-round-icon manual" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2.25"/><path d="M9 4V3h6v1"/><path d="m9.4 11.8 1.8 1.8 3.7-3.7"/><path d="M9.5 16.5h5"/></svg></span><span>Não informado</span></div>';
    return `<tr><td>${clientCell(client)}</td><td><div class="content-title">${text(approval.content)}</div><div class="content-type">${text(approval.type)}</div></td><td class="deadline ${due.late ? 'late' : ''}">${due.label}</td><td>${badge(approval.status)}</td><td>${channel}</td><td><button class="dashboard-action" data-action="open-post" data-id="${approval.id}">Abrir</button></td></tr>`;
  }
  function nextAction(approval) {
    if (approval.status === 'waiting_approval') return dueDescriptor(approval).late ? 'Enviar lembrete hoje' : 'Aguardar retorno';
    if (approval.status === 'reminder_1') return 'Aguardar retorno';
    if (approval.status === 'reminder_2') return 'Ação manual necessária';
    if (approval.status === 'adjustment_requested') return 'Revisar ajuste recebido';
    return '—';
  }
  function renderDashboard() {
    refreshUserUI(); setHeader('Dashboard');
    $('#dashboardMetrics').innerHTML = metrics().map(([label, value, tone, icon]) => `<div class="dashboard-metric"><div><div class="metric-label">${label}</div><strong class="metric-value">${value}</strong></div><span class="dashboard-icon3d ${tone}">${dashboardMetricIcon(icon)}</span></div>`).join('');
    const empty = $('#emptyNote');
    if (clientsLoading || approvalsLoading) {
      $('#tableBody').innerHTML = '';
      empty.textContent = 'Carregando aprovações…'; empty.style.display = 'block';
      $('#dashboardTableSub').textContent = 'Sincronizando com o Supabase…';
      return;
    }
    if (clientsLoadError || approvalsLoadError) {
      $('#tableBody').innerHTML = '';
      empty.textContent = 'Os dados não puderam ser carregados.'; empty.style.display = 'block';
      $('#dashboardTableSub').textContent = 'Falha na sincronização com o Supabase.';
      return;
    }
    const attention = activeApprovals().filter(approval => dueDescriptor(approval).days <= 7 || approval.status !== 'waiting_approval');
    $('#dashboardAttentionCount').textContent = attention.length;
    const durations = validApprovals().filter(approval => approval.approvedAt && approval.createdAt).map(approval => (new Date(approval.approvedAt) - new Date(approval.createdAt)) / 86400000).filter(value => Number.isFinite(value) && value >= 0);
    const average = durations.length ? durations.reduce((total, value) => total + value, 0) / durations.length : null;
    $('#dashboardAverageValue').textContent = average === null ? '—' : `${average.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
    let records = activeApprovals(); if (dashboardStatus) records = records.filter(approval => approval.status === dashboardStatus); records.sort((a, b) => dashboardDescending ? new Date(b.createdAt) - new Date(a.createdAt) : new Date(a.createdAt) - new Date(b.createdAt));
    $('#tableBody').innerHTML = records.map(dashboardRow).join('');
    empty.textContent = 'Nenhuma aprovação com este status.'; empty.style.display = records.length ? 'none' : 'block';
    $('#dashboardTableSub').textContent = `${records.length} aprovações ativas de ${activeClients().length} clientes`;
  }
  function approvalRows(records, fullActions = true) {
    return records.map(approval => {
      const client = approvalClientById(approval.clientId); const due = activeStatuses.includes(approval.status) ? dueDescriptor(approval) : { label: approval.dueAt ? formatDate(approval.dueAt) : 'Sem prazo', late: false };
      const actions = `<td><div class="compact-actions approval-row-actions"><button class="text-action primary-action approval-open-action" data-action="open-post" data-id="${approval.id}">Abrir</button><button class="text-action whatsapp-action approval-action-icon approval-whatsapp-action" data-action="whatsapp" data-id="${approval.id}" aria-label="Preparar WhatsApp" title="WhatsApp"${whatsappActionState(client)}>${approvalActionIcon('whatsapp')}</button>${!isFinal(approval) ? `<button class="text-action approval-action-icon approval-approve-action" data-action="approve" data-id="${approval.id}" aria-label="Marcar como aprovado" title="Aprovar">${approvalActionIcon('approve')}</button>` : ''}<button class="text-action approval-more-action" data-action="approval-menu" data-id="${approval.id}" aria-label="Mais ações" title="Mais ações">•••</button></div></td>`;
      return `<tr><td>${clientCell(client)}</td><td><div class="content-title">${text(approval.content)}</div><div class="content-type">${text(approval.type)}</div></td><td class="date-cell">${formatDateTime(approval.createdAt)}</td><td class="deadline ${due.late ? 'late' : ''}">${due.label}</td><td>${badge(approval.status)}</td><td class="next-action">${text(nextAction(approval))}</td>${fullActions ? actions : ''}</tr>`;
    }).join('');
  }
  function clientDetailApprovalRows(records) {
    return records.map(approval => { const due = dueDescriptor(approval); return `<tr><td><div class="content-title">${text(approval.content)}</div><div class="content-type">${text(approval.type)}</div></td><td class="date-cell">${formatDateTime(approval.createdAt)}</td><td class="deadline ${due.late ? 'late' : ''}">${due.label}</td><td>${badge(approval.status)}</td></tr>`; }).join('');
  }
  function renderApprovals() {
    if (clientsLoading || approvalsLoading) {
      $('#dynamicContent').innerHTML = '<div class="empty-note" style="display:block">Carregando aprovações…</div>';
      return;
    }
    if (clientsLoadError || approvalsLoadError) {
      $('#dynamicContent').innerHTML = '<div class="empty-note" style="display:block">Não foi possível carregar as aprovações. <button class="secondary" data-action="retry-data">Tentar novamente</button></div>';
      return;
    }
    const filters = pendingApprovalFilters || { query: '', status: '', client: '', deadline: '' }; pendingApprovalFilters = null;
    const statusOptions = Object.entries(statusMeta).map(([key, meta]) => `<option value="${key}" ${filters.status === key ? 'selected' : ''}>${meta.label}</option>`).join('');
    const clientOptions = approvalClients().map(client => `<option value="${client.id}" ${filters.client === client.id ? 'selected' : ''}>${text(client.name)}${client.isActive === false ? ' (arquivado)' : ''}</option>`).join('');
    $('#dynamicContent').innerHTML = `<section class="approval-overview page-content"><div class="approval-metric-card"><div><div class="metric-label">Em acompanhamento</div><strong class="metric-value">${activeApprovals().length}</strong></div><span class="approval-metric-icon">${approvalMetricIcon('tracking')}</span></div><div class="approval-metric-card"><div><div class="metric-label">Atrasadas</div><strong class="metric-value">${activeApprovals().filter(a => dueDescriptor(a).late).length}</strong></div><span class="approval-metric-icon">${approvalMetricIcon('late')}</span></div><div class="approval-metric-card"><div><div class="metric-label">Ajustes</div><strong class="metric-value">${activeApprovals().filter(a => a.status === 'adjustment_requested').length}</strong></div><span class="approval-metric-icon">${approvalMetricIcon('adjustment')}</span></div></section><section class="page-section approval-page-section"><div class="page-intro approval-page-intro"><div><h2>Lista completa de aprovações</h2><p>Filtros combinados e ações disponíveis por conteúdo.</p></div></div><div class="filter-panel approval-filter-panel"><input id="approvalSearch" class="search-input" value="${text(filters.query)}" placeholder="Buscar cliente, empresa ou conteúdo"/><select id="approvalStatus" class="filter-select"><option value="">Todos os status</option><option value="__active__" ${filters.status === '__active__' ? 'selected' : ''}>Em acompanhamento</option>${statusOptions}</select><select id="approvalClient" class="filter-select"><option value="">Todos os clientes</option>${clientOptions}</select><select id="approvalDeadline" class="filter-select"><option value="">Todos os prazos</option><option value="today" ${filters.deadline === 'today' ? 'selected' : ''}>Hoje</option><option value="tomorrow" ${filters.deadline === 'tomorrow' ? 'selected' : ''}>Amanhã</option><option value="late" ${filters.deadline === 'late' ? 'selected' : ''}>Atrasados</option><option value="three" ${filters.deadline === 'three' ? 'selected' : ''}>Próximos 3 dias</option><option value="seven" ${filters.deadline === 'seven' ? 'selected' : ''}>Próximos 7 dias</option></select></div><div class="table-wrap approval-table-wrap"><table class="page-table approval-page-table"><thead><tr><th>Cliente</th><th>Conteúdo</th><th>Enviado</th><th>Prazo</th><th>Status</th><th>Próxima ação</th><th>Ações</th></tr></thead><tbody id="approvalPageBody"></tbody></table></div></section>`;
    const update = () => { const current = { query: $('#approvalSearch').value, status: $('#approvalStatus').value, client: $('#approvalClient').value, deadline: $('#approvalDeadline').value }; const q = current.query.toLowerCase(); const found = visibleApprovals().filter(approval => { const client = approvalClientById(approval.clientId); const due = dueDescriptor(approval); const statusMatches = !current.status || (current.status === '__active__' ? !isFinal(approval) && client?.isActive !== false : approval.status === current.status); return (!q || `${client.name} ${client.company} ${approval.content}`.toLowerCase().includes(q)) && statusMatches && (!current.client || approval.clientId === current.client) && (!current.deadline || (current.deadline === 'today' && due.days === 0) || (current.deadline === 'tomorrow' && due.days === 1) || (current.deadline === 'late' && due.days < 0 && !isFinal(approval)) || (current.deadline === 'three' && due.days >= 0 && due.days <= 3 && !isFinal(approval)) || (current.deadline === 'seven' && due.days >= 0 && due.days <= 7 && !isFinal(approval))); }); $('#approvalPageBody').innerHTML = approvalRows(found) || '<tr><td colspan="7" class="next-action">Nenhuma aprovação encontrada com esses filtros.</td></tr>'; };
    ['approvalSearch', 'approvalStatus', 'approvalClient', 'approvalDeadline'].forEach(id => $("#" + id).addEventListener('input', update)); update();
  }
  function clientSummary(client) {
    if (approvalsLoading) return { loading: true, error: false, pending: 0, completed: 0, latest: 'Carregando…', status: null };
    if (approvalsLoadError) return { loading: false, error: true, pending: 0, completed: 0, latest: 'Indisponível', status: null };
    const records = validApprovals().filter(approval => approval.clientId === client.id); const pending = records.filter(approval => !isFinal(approval)).length; const completed = records.filter(isFinal).length; const latest = [...records].sort((a, b) => new Date(b.statusChangedAt) - new Date(a.statusChangedAt))[0]; return { loading: false, error: false, pending, completed, latest: latest ? formatDateTime(latest.statusChangedAt) : 'Sem interações', status: latest?.status || null };
  }
  function renderClients() {
    $('#dynamicContent').classList.remove('client-detail-approved');
    const clients = activeClients();
    const searchIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="5.8"></circle><path d="m15.2 15.2 4.3 4.3"></path></svg>';
    const phoneIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 3.8 5.4 4.7c-1 .5-1.5 1.6-1.2 2.7 1.7 6.5 5.9 10.7 12.4 12.4 1.1.3 2.2-.2 2.7-1.2l.9-1.8-4-2.4-1.3 1.3c-2.3-.9-4.3-2.9-5.2-5.2l1.3-1.3-2.4-4z"></path></svg>';
    const emailIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4.5 7 7.5 5.5L19.5 7"></path></svg>';
    const card = client => {
      const summary = clientSummary(client);
      const status = summary.loading ? '<span class="lumads-client-status-muted">Carregando aprovações…</span>' : summary.error ? '<span class="lumads-client-status-muted">Aprovações indisponíveis</span>' : summary.status ? badge(summary.status) : '<span class="lumads-client-status-muted">Sem aprovações</span>';
      const searchable = text(`${client.name} ${client.company} ${client.contact || ''} ${client.whatsapp || ''} ${client.email || ''}`).toLowerCase();
      return `<article class="lumads-client-card" data-action="client-detail" data-client="${client.id}" data-client-search="${searchable}" tabindex="0"><div class="lumads-client-card-top"><div class="lumads-client-brand"><div class="lumads-client-logo">${clientMark(client, 'client-card-mark')}</div><div class="lumads-client-identity"><div class="lumads-client-name">${text(client.name)}</div><div class="lumads-client-type">${text(client.company)}</div></div></div><div class="lumads-client-menu-wrap"><button type="button" class="lumads-client-more" data-client-menu-toggle aria-label="Ações de ${text(client.name)}" aria-expanded="false">•••</button><div class="lumads-client-menu" hidden><button type="button" data-action="edit-client" data-client="${client.id}">Editar cliente</button><button type="button" class="danger" data-action="delete-client" data-client="${client.id}">Arquivar cliente</button></div></div></div><div class="lumads-client-contact-list"><div class="lumads-client-contact">${phoneIcon}<span>${text(client.whatsapp) || 'WhatsApp não informado'}</span></div><div class="lumads-client-contact">${emailIcon}<span>${text(client.email) || 'E-mail não informado'}</span></div></div><div class="lumads-client-divider"></div><footer class="lumads-client-footer"><div class="lumads-client-pending"><strong>${summary.pending}</strong><span>pendente${summary.pending === 1 ? '' : 's'}</span></div><div class="lumads-client-status">${status}</div></footer></article>`;
    };
    const stateContent = clientsLoading ? '<div class="lumads-clients-state"><div class="empty-note">Carregando clientes…</div></div>' : clientsLoadError ? '<div class="lumads-clients-state"><div class="empty-note">Não foi possível carregar os clientes agora. <button class="secondary" data-action="retry-data">Tentar novamente</button></div></div>' : clients.length ? clients.map(card).join('') : '<div class="lumads-clients-state"><div class="empty-note"><strong>Nenhum cliente cadastrado ainda</strong><br><span>Cadastre seu primeiro cliente para começar a organizar aprovações e comunicações.</span></div></div>';
    $('#dynamicContent').innerHTML = `<section class="lumads-clients-shell"><header class="lumads-clients-head"><div class="lumads-clients-heading"><h2>Clientes</h2><p>Gerencie os contatos e acompanhe as aprovações por cliente.</p></div><div class="lumads-clients-tools"><label class="lumads-clients-search">${searchIcon}<input type="search" data-clients-search placeholder="Buscar cliente" ${clientsLoading || clientsLoadError ? 'disabled' : ''}></label><button type="button" class="lumads-clients-sort" data-clients-sort ${clientsLoading || clientsLoadError ? 'disabled' : ''}>Ordenar A–Z</button></div></header><div class="lumads-clients-grid">${stateContent}</div><div class="lumads-clients-empty-space"><div class="lumads-clients-tip"><div><strong>Base de clientes</strong><span>Use a busca para encontrar rapidamente um contato cadastrado.</span></div></div></div></section>`;
  }
  function renderClientDetail(clientId) {
    const client = clientById(clientId); if (!client || client.isActive === false) { navigate('Clientes'); return; } currentClientId = clientId; $('#clientDetailHeaderBack')?.remove(); $('#pageEyebrow').insertAdjacentHTML('beforebegin', '<button class="back-link client-detail-back-approved" id="clientDetailHeaderBack" data-action="back-clients">← Voltar para clientes</button>'); $('#pageEyebrow').textContent = 'Base de clientes'; $('#pageTitle').textContent = 'Detalhe do cliente'; const headerPrimary = $('#headerActions .primary'); if (headerPrimary) { headerPrimary.dataset.action = 'new-approval'; headerPrimary.dataset.client = client.id; headerPrimary.textContent = '+ Nova aprovação'; } const records = validApprovals().filter(approval => approval.clientId === client.id); const sum = clientSummary(client); const active = records.filter(approval => !isFinal(approval)); const complete = records.filter(isFinal);
    const metricIcon = { active: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="m8.5 12 2.2 2.2 4.9-5.2"/></svg>', complete: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>', contacts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v12H8l-4 3z"/><path d="M8 9h8M8 13h5"/></svg>' };
    const summary = `<section class="client-detail-summary-approved"><article class="client-detail-mini-approved"><div><div class="client-detail-mini-label">Aprovações ativas</div><div class="client-detail-mini-value">${sum.pending}</div><div class="client-detail-mini-sub">Em acompanhamento</div></div><span class="client-detail-mini-icon blue">${metricIcon.active}</span></article><article class="client-detail-mini-approved"><div><div class="client-detail-mini-label">Histórico concluído</div><div class="client-detail-mini-value">${sum.completed}</div><div class="client-detail-mini-sub">Aprovações finalizadas</div></div><span class="client-detail-mini-icon green">${metricIcon.complete}</span></article><article class="client-detail-mini-approved"><div><div class="client-detail-mini-label">Últimos contatos</div><div class="client-detail-mini-value" id="clientContactCount">…</div><div class="client-detail-mini-sub">WhatsApp e e-mail</div></div><span class="client-detail-mini-icon purple">${metricIcon.contacts}</span></article></section>`;
    const currentRows = approvalsLoading ? '<tr><td colspan="4" class="next-action">Carregando aprovações…</td></tr>' : approvalsLoadError ? '<tr><td colspan="4" class="next-action">Não foi possível carregar as aprovações.</td></tr>' : clientDetailApprovalRows(active) || '<tr><td colspan="4" class="next-action">Sem aprovações em acompanhamento.</td></tr>';
    const historyRows = approvalsLoading ? '<tr><td colspan="4">Carregando histórico…</td></tr>' : approvalsLoadError ? '<tr><td colspan="4">Histórico indisponível</td></tr>' : complete.map(approval => `<tr><td><span class="strong">${text(approval.content)}</span><span class="sub">Conteúdo finalizado</span></td><td>${formatDateTime(approval.finalizedAt || approval.statusChangedAt)}</td><td>${approval.reminders}</td><td>${badge(approval.status)}</td></tr>`).join('') || '<tr><td colspan="4">Sem histórico recente</td></tr>';
    $('#dynamicContent').classList.add('client-detail-approved');
    $('#dynamicContent').innerHTML = `<section class="detail-layout client-detail-layout-approved"><aside class="detail-card client-detail-profile-approved"><div class="client-detail-logo-approved">${clientMark(client)}</div><h2>${text(client.name)}</h2><p>${text(client.company)}</p><div class="detail-list"><div><b>Contato</b>${text(client.contact) || '—'}</div><div><b>WhatsApp</b>${text(client.whatsapp) || '—'}</div><div><b>E-mail</b>${text(client.email) || '—'}</div><div><b>Última interação</b>${sum.latest}</div></div><div class="modal-foot client-detail-profile-actions-approved"><button class="secondary" data-action="edit-client" data-client="${client.id}">Editar</button><button class="primary whatsapp-action" data-action="whatsapp-client" data-client="${client.id}"${whatsappActionState(client)}>WhatsApp</button></div><button class="back-link" data-action="new-approval" data-client="${client.id}">+ Nova aprovação</button><button class="back-link text-destructive" data-action="delete-client" data-client="${client.id}">Excluir cliente</button></aside><div class="client-detail-content-approved">${summary}<section class="sub-card client-detail-panel-approved"><div class="detail-heading"><h3>Aprovações atuais</h3><span class="next-action">${approvalsLoading ? 'Carregando…' : `${sum.pending} pendente${sum.pending === 1 ? '' : 's'}`}</span></div><div class="table-wrap"><table class="page-table"><thead><tr><th>Conteúdo</th><th>Enviado</th><th>Prazo</th><th>Status</th></tr></thead><tbody>${currentRows}</tbody></table></div></section><section class="sub-card client-detail-panel-approved"><div class="detail-heading"><h3>Histórico de aprovações</h3><span class="next-action">${approvalsLoading ? 'Carregando…' : `${sum.completed} concluída${sum.completed === 1 ? '' : 's'}`}</span></div><div class="table-wrap client-detail-history-table-approved"><table class="page-table"><thead><tr><th>Conteúdo</th><th>Data final</th><th>Lembretes</th><th>Status</th></tr></thead><tbody>${historyRows}</tbody></table></div></section><section class="sub-card client-detail-panel-approved"><div class="detail-heading"><h3>Últimos contatos</h3></div><div class="timeline client-detail-contacts-approved" id="clientContactHistory" data-client-id="${client.id}"><div class="timeline-item"><b>Carregando contatos…</b></div></div></section></div></section>`;
    void renderClientContactHistory(client.id);
  }
  function communicationChannelLabel(channel) { return channel === 'whatsapp' ? 'WhatsApp' : channel === 'email' ? 'E-mail' : channel || 'Comunicação'; }
  function communicationStatusLabel(status) { return ({ sent: 'Enviado', delivered: 'Entregue', read: 'Lido' })[status] || status || 'Registrado'; }
  async function renderClientContactHistory(clientId) {
    const container = $('#clientContactHistory');
    if (!container || container.dataset.clientId !== clientId) return;
    try {
      const contacts = await loadClientContactHistory(clientId, 20);
      if (!container.isConnected || container.dataset.clientId !== clientId) return;
      const icons = { whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5A14 14 0 0 0 14 16l1.5-2.5 5 2V19a2 2 0 0 1-2 2C10 21 3 14 3 5a2 2 0 0 1 2-1Z"/></svg>', email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/></svg>' };
      container.innerHTML = contacts.map(contact => { const channel = contact.channel === 'whatsapp' ? 'whatsapp' : 'email'; return `<div class="client-contact-row"><span class="client-contact-icon ${channel}">${icons[channel]}</span><span><span class="client-contact-title">${text(communicationChannelLabel(contact.channel))} · ${text(contact.templateLabel || contact.templateKey || 'Comunicação')}</span><span class="client-contact-sub">${contact.sentAt ? formatDateTime(contact.sentAt) : 'Data de envio indisponível'}</span></span><span class="client-contact-status">${text(communicationStatusLabel(contact.status))}</span></div>`; }).join('') || '<div class="client-detail-empty-approved"><b>Nenhum contato registrado</b>Os envios de WhatsApp e e-mail aparecerão aqui quando forem registrados.</div>';
      const count = $('#clientContactCount'); if (count) count.textContent = String(contacts.length);
    } catch (error) {
      console.error('Não foi possível carregar o histórico de contatos.', error);
      if (!container.isConnected || container.dataset.clientId !== clientId) return;
      container.innerHTML = '<div class="client-detail-empty-approved"><b>Não foi possível carregar os contatos</b>Tente novamente mais tarde.</div>';
      const count = $('#clientContactCount'); if (count) count.textContent = '—';
    }
  }
  function renderHistory() {
    if (clientsLoading || approvalsLoading) {
      $('#dynamicContent').innerHTML = '<div class="empty-note" style="display:block">Carregando histórico…</div>';
      return;
    }
    if (clientsLoadError || approvalsLoadError) {
      $('#dynamicContent').innerHTML = '<div class="empty-note" style="display:block">Não foi possível carregar o histórico. <button class="secondary" data-action="retry-data">Tentar novamente</button></div>';
      return;
    }
    const clientOptions = approvalClients().map(client => `<option value="${client.id}">${text(client.name)}${client.isActive === false ? ' (arquivado)' : ''}</option>`).join('');
    $('#dynamicContent').innerHTML = `<section class="history-kpi"><div class="metric"><div class="metric-label">Finalizadas no mês</div><div class="metric-line"><strong class="metric-value">${validApprovals().filter(a => isFinal(a) && new Date(a.finalizedAt || a.statusChangedAt).getMonth() === new Date().getMonth()).length}</strong><span class="mini blue">✓</span></div></div><div class="metric"><div class="metric-label">Tempo médio de aprovação</div><div class="metric-line"><strong class="metric-value">${averageApprovalTime()}d</strong><span class="mini violet">◷</span></div></div><div class="metric"><div class="metric-label">Concluídas sem lembrete</div><div class="metric-line"><strong class="metric-value">${completedWithoutReminder()}%</strong><span class="mini mint">↑</span></div></div></section><section class="page-section"><div class="page-intro"><div><h2>Histórico de aprovações</h2><p>Registros concluídos, aprovados ou publicados.</p></div></div><div class="filter-panel"><input id="historySearch" class="search-input" placeholder="Buscar cliente ou conteúdo"/><select id="historyClient" class="filter-select"><option value="">Todos os clientes</option>${clientOptions}</select><select id="historyPeriod" class="filter-select"><option value="">Todo o período</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select><select id="historyStatus" class="filter-select"><option value="">Todos os status</option><option value="approved">Aprovado</option><option value="published">Publicado</option><option value="closed">Encerrado</option></select></div><div class="table-wrap"><table class="page-table"><thead><tr><th>Cliente</th><th>Conteúdo</th><th>Data de início</th><th>Data de aprovação</th><th>Publicação</th><th>Lembretes</th><th>Status final</th></tr></thead><tbody id="historyBody"></tbody></table></div></section>`;
    const update = () => { const q = $('#historySearch').value.toLowerCase(), c = $('#historyClient').value, p = Number($('#historyPeriod').value || 0), s = $('#historyStatus').value; const cutoff = p ? Date.now() - p * 86400000 : 0; const found = validApprovals().filter(a => isFinal(a) && (!q || `${approvalClientById(a.clientId).name} ${a.content}`.toLowerCase().includes(q)) && (!c || a.clientId === c) && (!s || a.status === s) && (!cutoff || new Date(a.finalizedAt || a.statusChangedAt) >= cutoff)); $('#historyBody').innerHTML = found.map(a => `<tr><td>${clientCell(approvalClientById(a.clientId))}</td><td><div class="content-title">${text(a.content)}</div></td><td class="date-cell">${formatDate(a.createdAt)}</td><td class="date-cell">${a.approvedAt ? formatDateTime(a.approvedAt) : formatDateTime(a.finalizedAt || a.statusChangedAt)}</td><td class="date-cell">${a.publishedAt ? formatDateTime(a.publishedAt) : '—'}</td><td class="next-action">${a.reminders}</td><td>${badge(a.status)}</td></tr>`).join('') || '<tr><td colspan="7" class="next-action">Nenhum registro encontrado.</td></tr>'; };
    ['historySearch', 'historyClient', 'historyPeriod', 'historyStatus'].forEach(id => $("#" + id).addEventListener('input', update)); update();
  }
  function averageApprovalTime() { const records = validApprovals().filter(isFinal); if (!records.length) return '0,0'; const days = records.reduce((total, record) => total + (new Date(record.finalizedAt || record.statusChangedAt) - new Date(record.createdAt)) / 86400000, 0) / records.length; return days.toFixed(1).replace('.', ','); }
  function completedWithoutReminder() { const records = validApprovals().filter(isFinal); return records.length ? Math.round(records.filter(record => !record.reminders).length / records.length * 100) : 0; }
  function renderSettings() {
    const selected = { light: 'Claro', dark: 'Escuro' }[themePreference()];
    const cards = [['appearance', 'appearance', 'Aparência', `Tema atual: ${selected}. Ajuste a preferência visual do CRM.`], ['agency', 'agency', 'Dados da agência', 'Nome de exibição, telefone e e-mail usados no CRM.'], ['user', 'user', 'Usuários', 'Informações do usuário autenticado exibidas no CRM.'], ['messages', 'messages', 'Mensagens rápidas', 'Modelos reais de WhatsApp e e-mail para envios manuais.'], ['deadlines', 'deadlines', 'Prazos padrão', 'Parâmetros reais do fluxo de acompanhamento.'], ['whatsapp-info', 'whatsapp', 'WhatsApp', 'Modo manual ativo. O CRM prepara a mensagem para envio.'], ['email-info', 'email', 'E-mail', 'Modo manual ativo. O CRM prepara o e-mail para envio.']];
    $('#dynamicContent').innerHTML = `<section class="settings-grid">${cards.map(([action, icon, title, description]) => `<button class="setting-card" data-action="settings-${action}"><span class="setting-icon">${settingIcon(icon)}</span><h3>${title}</h3><p>${description}</p><span class="back-link">Abrir configurações →</span></button>`).join('')}</section>`;
  }
  function navigate(page, { updateHash = true } = {}) {
    const nextPage = Object.values(pageByHash).includes(page) ? page : 'Dashboard';
    if (nextPage !== 'Clientes') currentClientId = null;
    if (updateHash && window.location.hash !== `#${hashByPage[nextPage]}`) window.location.hash = hashByPage[nextPage];
    toggleUserMenu(false); currentPage = nextPage; $('#crmApp').dataset.page = nextPage; $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === nextPage)); setHeader(nextPage); $('#dashboardContent').hidden = nextPage !== 'Dashboard'; $('#dynamicContent').hidden = nextPage === 'Dashboard';
    if (nextPage === 'Dashboard') renderDashboard(); if (nextPage === 'Aprovações') renderApprovals(); if (nextPage === 'Clientes') renderClients(); if (nextPage === 'Histórico') renderHistory(); if (nextPage === 'Configurações') renderSettings(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function updateApprovalStatus(id, status) {
    if (!approvalById(id)) return false;
    try {
      const updated = await setApprovalStatus(id, status);
      state.approvals = state.approvals.map(approval => approval.id === id ? updated : approval);
      rerender();
      showToast(`Status atualizado para “${statusLabel(status)}”.`);
      return true;
    } catch (error) {
      console.error('Não foi possível atualizar o status da aprovação.', error);
      modalError('Não foi possível atualizar o status da aprovação. Tente novamente.');
      return false;
    }
  }
  function rerender() { if (currentPage === 'Dashboard') renderDashboard(); else if (currentPage === 'Aprovações') renderApprovals(); else if (currentPage === 'Clientes') renderClients(); else if (currentPage === 'Histórico') renderHistory(); else if (currentPage === 'Configurações') renderSettings(); if (currentClientId && currentPage === 'Clientes') renderClientDetail(currentClientId); }
  function openPost(id) { const approval = approvalById(id); if (!approval) return; if (!approval.link) return showToast('Esta aprovação não possui link cadastrado.', 'error'); window.open(approval.link, '_blank', 'noopener'); showToast('Abrindo aprovação no PodePostar.'); }
  function whatsappMessage(approval) { const client = approvalClientById(approval.clientId); let template = state.messages.initial; if (approval.status === 'reminder_1') template = state.messages.reminder1; if (approval.status === 'reminder_2') template = state.messages.reminder2; if (dueDescriptor(approval).days <= 0 && activeStatuses.includes(approval.status)) template = state.messages.deadline; return template.replace('[LINK]', approval.link || '').replace('[CLIENTE]', client?.name || ''); }
  function openWhatsAppForApproval(id) { const approval = approvalById(id); if (!approval) return; const client = approvalClientById(approval.clientId); const number = String(client?.whatsapp || '').replace(/\D/g, ''); if (!number) return showToast('Este cliente não possui WhatsApp cadastrado.', 'error'); window.open(`https://wa.me/55${number.replace(/^55/, '')}?text=${encodeURIComponent(whatsappMessage(approval))}`, '_blank', 'noopener'); showToast('Abrindo WhatsApp com mensagem preparada.'); }
  function openWhatsAppForClient(id) { const client = clientById(id); if (!client) return; const number = String(client.whatsapp || '').replace(/\D/g, ''); if (!number) return showToast('Este cliente não possui WhatsApp cadastrado.', 'error'); const latest = state.approvals.filter(a => a.clientId === id && !isFinal(a))[0]; if (latest) { openWhatsAppForApproval(latest.id); return; } window.open(`https://wa.me/55${number.replace(/^55/, '')}?text=${encodeURIComponent('Olá! Como podemos ajudar?')}`, '_blank', 'noopener'); showToast('Abrindo WhatsApp.'); }
  function copyLink(id) { const approval = approvalById(id); if (!approval) return; if (!approval.link) return showToast('Esta aprovação não possui link cadastrado.', 'error'); const done = () => showToast('Link do PodePostar copiado.'); if (navigator.clipboard?.writeText) navigator.clipboard.writeText(approval.link).then(done).catch(() => showToast('Não foi possível copiar o link.', 'error')); else showToast('Não foi possível copiar o link.', 'error'); }
  function releaseClientLogoPreview() { if (clientLogoPreviewObjectUrl) URL.revokeObjectURL(clientLogoPreviewObjectUrl); clientLogoPreviewObjectUrl = null; }
  function closeModal() { releaseClientLogoPreview(); selectedClientLogoFile = null; clientLogoRemovalRequested = false; $('#modalBackdrop').classList.remove('open'); $('#modalContent').innerHTML = ''; }
  function modalShell(title, subtitle, body, footer, wide = false) { $('#modalContent').className = `modal${wide ? ' modal-wide' : ''}`; $('#modalContent').innerHTML = `<div class="modal-head"><div><h2 id="modalTitle">${title}</h2><p>${subtitle || ''}</p></div><button class="close" data-action="modal-close" aria-label="Fechar">×</button></div>${body}${footer || ''}`; $('#modalBackdrop').classList.add('open'); }
  function modalError(message) { const el = $('#modalError'); if (el) { el.textContent = message; el.hidden = false; } }
  function formFooter(label) { return `<div class="modal-foot"><button class="secondary" type="button" data-action="modal-close">Cancelar</button><button class="primary" type="submit">${label}</button></div>`; }
  function showApprovalForm(editId = null, defaultClientId = '') {
    const approval = editId ? approvalById(editId) : null; const selectedId = approval?.clientId || defaultClientId; const client = clientById(selectedId); const list = activeClients().map(c => `<option value="${text(c.name)}"></option>`).join('');
    const contactPlaceholder = client ? 'Não cadastrado' : 'Selecione um cliente';
    const body = `<form class="form approval-form" id="approvalForm" data-form="approval"><input type="hidden" id="editApprovalId" value="${editId || ''}"><div class="form-grid"><div class="field"><label for="approvalClientName">Cliente</label><input id="approvalClientName" list="clientList" value="${client && client.isActive !== false ? text(client.name) : ''}" placeholder="Pesquise e selecione um cliente" required><datalist id="clientList">${list}</datalist><small>Selecione um cliente cadastrado.</small></div><div class="field"><label for="approvalWhatsApp">WhatsApp</label><input id="approvalWhatsApp" value="${client ? text(client.whatsapp) : ''}" placeholder="${contactPlaceholder}" readonly><small>Informação do cadastro do cliente.</small></div><div class="field"><label for="approvalEmail">E-mail</label><input id="approvalEmail" type="email" value="${client ? text(client.email) : ''}" placeholder="${contactPlaceholder}" readonly><small>Informação do cadastro do cliente.</small></div><div class="field"><label for="approvalContent">Nome ou referência do conteúdo</label><input id="approvalContent" value="${approval ? text(approval.content) : ''}" required></div><div class="field full"><label for="approvalLink">Link de aprovação do PodePostar</label><input id="approvalLink" type="url" value="${approval ? text(approval.link) : ''}" placeholder="https://podepostarapp.com/..." required><small id="linkHint">Use preferencialmente um link do PodePostar.</small></div><div class="field"><label for="approvalSent">Data e hora do envio</label><input id="approvalSent" type="datetime-local" value="${inputDateTime(approval?.createdAt || new Date())}" required></div><div class="field"><label for="approvalDue">Prazo para aprovação</label><input id="approvalDue" type="datetime-local" value="${inputDateTime(approval?.dueAt || shift(2, 17))}" required></div></div><p class="form-error" id="modalError" hidden></p>${formFooter(editId ? 'Salvar alterações' : 'Iniciar acompanhamento')}</form>`;
    modalShell(editId ? 'Editar aprovação' : 'Nova aprovação', 'Dados sincronizados com o Supabase.', body);
    $('#modalContent').classList.add('approval-modal');
    $('#approvalClientName').addEventListener('input', event => { const match = activeClients().find(c => c.name.toLowerCase() === event.target.value.toLowerCase()); const placeholder = match ? 'Não cadastrado' : 'Selecione um cliente'; $('#approvalWhatsApp').value = match?.whatsapp || ''; $('#approvalWhatsApp').placeholder = placeholder; $('#approvalEmail').value = match?.email || ''; $('#approvalEmail').placeholder = placeholder; });
    $('#approvalLink').addEventListener('input', event => { $('#linkHint').textContent = event.target.value && !event.target.value.startsWith('https://podepostarapp.com/') ? 'Aviso: o link não usa o domínio padrão do PodePostar, mas poderá ser salvo.' : 'Use preferencialmente um link do PodePostar.'; });
  }
  async function saveApprovalForm(form) {
    if (form.dataset.saving === 'true') return;
    const client = activeClients().find(c => c.name.toLowerCase() === $('#approvalClientName').value.trim().toLowerCase()); const content = $('#approvalContent').value.trim(); const link = $('#approvalLink').value.trim(); const sent = $('#approvalSent').value; const due = $('#approvalDue').value; const editId = $('#editApprovalId').value;
    if (!client) return modalError('Selecione um cliente existente para iniciar o acompanhamento.'); if (!content) return modalError('Informe o nome ou referência do conteúdo.'); if (!/^https?:\/\//.test(link)) return modalError('Informe uma URL válida para a aprovação.'); if (!sent || !due) return modalError('Informe a data de envio e o prazo para aprovação.');
    const values = { clientId: client.id, content, link, createdAt: new Date(sent).toISOString(), dueAt: new Date(due).toISOString() };
    form.dataset.saving = 'true'; setSubmitState(form, true);
    try {
      if (editId) {
        const approval = approvalById(editId);
        if (!approval) throw new Error('Aprovação não encontrada.');
        const updated = await updateApproval(editId, { ...approval, ...values });
        state.approvals = state.approvals.map(item => item.id === editId ? updated : item);
        showToast('Aprovação atualizada com sucesso.');
      } else {
        const created = await createApproval({ ...values, type: 'Conteúdo em aprovação' }, authState.user?.id || null);
        state.approvals.unshift(created);
        showToast('Acompanhamento iniciado com sucesso.');
      }
      closeModal();
      rerender();
    } catch (error) {
      console.error('Não foi possível salvar a aprovação.', error);
      modalError('Não foi possível salvar a aprovação. Tente novamente.');
    } finally {
      form.dataset.saving = 'false'; setSubmitState(form, false);
    }
  }
  function showClientForm(editId = null) { releaseClientLogoPreview(); selectedClientLogoFile = null; clientLogoRemovalRequested = false; const client = editId ? clientById(editId) : null; const logo = client?.logo || ''; const logoUrl = clientLogoUrl(logo); const body = `<form class="form" id="clientForm" data-form="client"><input type="hidden" id="editClientId" value="${editId || ''}"><input type="hidden" id="clientLogo" value="${text(logo)}"><div class="field full"><label>Logotipo do cliente</label><div class="logo-field"><div class="logo-preview${logo ? ' has-logo' : ''}" id="clientLogoPreview">${logo ? `<img src="${text(logoUrl)}" alt="Pré-visualização do logotipo">` : `<span>${client ? text(initials(client.name)) : 'Logo'}</span>`}</div><div class="logo-field-actions"><button type="button" class="secondary" id="clientLogoBtn">Enviar imagem</button><button type="button" class="button-link logo-remove${logo ? '' : ' is-hidden'}" id="clientLogoRemove">Remover</button><small>PNG, JPG, JPEG, WebP ou SVG. Fundo transparente é preservado.</small></div><input type="file" id="clientLogoInput" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></div></div><div class="form-grid"><div class="field"><label for="clientName">Nome do cliente/empresa</label><input id="clientName" value="${client ? text(client.name) : ''}" required></div><div class="field"><label for="clientCompany">Segmento</label><input id="clientCompany" value="${client ? text(client.company) : ''}"></div><div class="field"><label for="clientContact">Nome do contato</label><input id="clientContact" value="${client ? text(client.contact) : ''}"></div><div class="field"><label for="clientPhone">WhatsApp</label><input id="clientPhone" value="${client ? text(client.whatsapp) : ''}"></div><div class="field full"><label for="clientEmail">E-mail</label><input id="clientEmail" type="email" value="${client ? text(client.email) : ''}"></div><div class="field full"><label for="clientNotes">Observações</label><textarea id="clientNotes" rows="3">${client ? text(client.notes) : ''}</textarea></div></div><p class="form-error" id="modalError" hidden></p>${formFooter(editId ? 'Salvar cliente' : 'Criar cliente')}</form>`; modalShell(editId ? 'Editar cliente' : 'Novo cliente', 'Dados sincronizados com o cadastro de clientes.', body); bindClientLogoField(); }
  function bindClientLogoField() {
    const input = $('#clientLogoInput'); if (!input) return;
    $('#clientLogoBtn').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
      const file = input.files && input.files[0]; if (!file) return;
      try { validateClientLogo(file); } catch (error) { console.error('Logo de cliente inválido.', error); modalError(error.message || 'Não foi possível usar esta imagem.'); input.value = ''; return; }
      releaseClientLogoPreview(); selectedClientLogoFile = file; clientLogoRemovalRequested = false; clientLogoPreviewObjectUrl = URL.createObjectURL(file);
      $('#clientLogoPreview').classList.add('has-logo'); $('#clientLogoPreview').innerHTML = `<img src="${clientLogoPreviewObjectUrl}" alt="Pré-visualização do logotipo">`; $('#clientLogoRemove').classList.remove('is-hidden'); const err = $('#modalError'); if (err) err.hidden = true;
    });
    $('#clientLogoRemove').addEventListener('click', () => { releaseClientLogoPreview(); selectedClientLogoFile = null; clientLogoRemovalRequested = Boolean($('#clientLogo').value); input.value = ''; const name = $('#clientName').value.trim(); $('#clientLogoPreview').classList.remove('has-logo'); $('#clientLogoPreview').innerHTML = `<span>${text(name ? initials(name) : 'Logo')}</span>`; $('#clientLogoRemove').classList.add('is-hidden'); });
  }
  function replaceClientInState(client) {
    const exists = state.clients.some(item => item.id === client.id);
    state.clients = (exists ? state.clients.map(item => item.id === client.id ? client : item) : [...state.clients, client])
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  async function saveClientForm(form) {
    if (form.dataset.saving === 'true') return;
    let id = $('#editClientId').value;
    const editing = Boolean(id);
    const values = { name: $('#clientName').value.trim(), company: $('#clientCompany').value.trim(), contact: $('#clientContact').value.trim(), whatsapp: $('#clientPhone').value.trim(), email: $('#clientEmail').value.trim(), notes: $('#clientNotes').value.trim() };
    if (!values.name) return modalError('Informe o nome do cliente/empresa.');
    form.dataset.saving = 'true'; setSubmitState(form, true);
    try {
      let current = id ? clientById(id) : null;
      if (id && !current) throw new Error('Cliente não encontrado.');
      if (!id) {
        current = await createClient({ ...values, logo: '' }, authState.user?.id || null);
        id = current.id; $('#editClientId').value = id; replaceClientInState(current);
      }
      const previousLogo = current.logo || '';
      let logo = previousLogo;
      if (clientLogoRemovalRequested && previousLogo) { await deleteClientLogo(previousLogo); logo = ''; }
      if (selectedClientLogoFile) logo = await uploadClientLogo(selectedClientLogoFile, id);
      const updated = await updateClient(id, { ...current, ...values, logo });
      replaceClientInState(updated);
      if (selectedClientLogoFile && previousLogo && previousLogo !== logo && !clientLogoRemovalRequested) {
        deleteClientLogo(previousLogo).catch(error => console.error('Não foi possível remover o logo anterior.', error));
      }
      releaseClientLogoPreview(); selectedClientLogoFile = null; clientLogoRemovalRequested = false;
      closeModal();
      if (editing) renderClientDetail(id); else navigate('Clientes');
      showToast('Cliente salvo com sucesso.');
    } catch (error) {
      console.error('Não foi possível salvar o cliente.', error);
      modalError('Não foi possível salvar o cliente. Tente novamente.');
    } finally {
      form.dataset.saving = 'false'; setSubmitState(form, false);
    }
  }
  function showApprovalMenu(id) { const approval = approvalById(id); if (!approval) return; const client = approvalClientById(approval.clientId); const options = [['edit-approval', 'Editar aprovação'], ...(approval.status === 'approved' ? [['set-published', 'Marcar como publicado']] : approval.status === 'published' ? [] : [['set-adjustment', 'Marcar ajuste solicitado'], ['approve', 'Marcar como aprovado']]), ['copy-link', 'Copiar link PodePostar'], ['whatsapp', 'Abrir WhatsApp'], ...(approval.status === 'published' ? [] : [['close-approval', 'Encerrar acompanhamento']]), ['delete-approval', 'Arquivar aprovação']]; const body = `<div class="form"><div class="action-list">${options.map(([action, label]) => `<button class="action-list-item ${action === 'delete-approval' ? 'danger' : ''}${action === 'whatsapp' ? ' whatsapp-action' : ''}" data-action="${action}" data-id="${id}"${action === 'whatsapp' ? whatsappActionState(client) : ''}>${label}</button>`).join('')}</div></div>`; modalShell('Ações da aprovação', text(approval.content), body); }
  function showConfirm(title, description, action, id) { modalShell(title, description, `<form class="form" data-form="confirm"><input type="hidden" id="confirmAction" value="${action}"><input type="hidden" id="confirmId" value="${id}"><p class="confirmation-copy">Esta ação será confirmada nesta etapa.</p>${formFooter('Confirmar')}</form>`); }
  async function handleConfirm(form) {
    const action = $('#confirmAction').value, id = $('#confirmId').value;
    if (action === 'delete-client') {
      if (form.dataset.saving === 'true') return;
      form.dataset.saving = 'true'; setSubmitState(form, true);
      try {
        await archiveClient(id);
        state.clients = state.clients.map(client => client.id === id ? { ...client, isActive: false } : client);
        currentClientId = null;
        closeModal(); navigate('Clientes'); showToast('Cliente arquivado com sucesso.');
      } catch (error) {
        console.error('Não foi possível arquivar o cliente.', error);
        modalError('Não foi possível arquivar o cliente. Tente novamente.');
      } finally {
        form.dataset.saving = 'false'; setSubmitState(form, false);
      }
      return;
    }
    const statusByAction = { approve: 'approved', publish: 'published', adjustment: 'adjustment_requested', close: 'closed' };
    if (statusByAction[action]) {
      const approval = approvalById(id);
      if ((action === 'approve' && approval?.status === 'published') || (action === 'adjustment' && (approval?.status === 'approved' || approval?.status === 'published'))) {
        showToast('Esta alteração de status não é permitida no estágio atual da aprovação.', 'error');
        closeModal();
        return;
      }
      if (action === 'publish') {
        if (!approval || approval.status !== 'approved') {
          showToast('A aprovação precisa estar aprovada antes de ser marcada como publicada.', 'error');
          closeModal();
          return;
        }
      }
      if (form.dataset.saving === 'true') return;
      form.dataset.saving = 'true'; setSubmitState(form, true);
      try {
        if (await updateApprovalStatus(id, statusByAction[action])) closeModal();
      } finally {
        form.dataset.saving = 'false'; setSubmitState(form, false);
      }
      return;
    }
    if (action === 'delete-approval') {
      if (form.dataset.saving === 'true') return;
      form.dataset.saving = 'true'; setSubmitState(form, true);
      try {
        const updated = await archiveApproval(id);
        state.approvals = state.approvals.map(approval => approval.id === id ? updated : approval);
        rerender();
        closeModal();
        showToast('Aprovação arquivada.');
      } catch (error) {
        console.error('Não foi possível arquivar a aprovação.', error);
        modalError('Não foi possível arquivar a aprovação. Tente novamente.');
      } finally {
        form.dataset.saving = 'false'; setSubmitState(form, false);
      }
    }
  }
  const communicationTemplateKeys = ['approval_initial', 'reminder_1', 'reminder_2', 'final_notice'];
  const communicationTemplateLabels = { approval_initial: 'Mensagem inicial', reminder_1: 'Lembrete 1', reminder_2: 'Lembrete 2', final_notice: 'Aviso final' };
  function settingsModalOpen(title) { return $('#modalTitle')?.textContent === title; }
  function messageTemplateFields(channel, templates) {
    const templatesByKey = new Map(templates.map(template => [template.template_key, template]));
    return communicationTemplateKeys.map(key => {
      const template = templatesByKey.get(key);
      if (!template) return `<div class="modal-info"><b>${communicationTemplateLabels[key]}</b><p>Modelo indisponível.</p></div>`;
      const label = text(template.label || communicationTemplateLabels[key]);
      const fields = channel === 'email'
        ? `<div class="field"><label>Assunto</label><input data-template-id="${template.id}" data-template-field="subject" value="${text(template.subject)}"></div><div class="field"><label>Mensagem</label><textarea rows="4" data-template-id="${template.id}" data-template-field="body">${text(template.body)}</textarea></div>`
        : `<div class="field"><label>Mensagem</label><textarea rows="4" data-template-id="${template.id}" data-template-field="body">${text(template.body)}</textarea></div>`;
      return `<div class="modal-info"><b>${label}</b><div class="form-grid" style="margin-top:12px">${fields}</div></div>`;
    }).join('');
  }
  async function showMessageTemplatesForm() {
    modalShell('Mensagens rápidas', 'Carregando modelos do Supabase…', '<div class="form"><div class="modal-info"><b>Carregando…</b></div></div>', undefined, true);
    try {
      const [whatsappTemplates, emailTemplates] = await Promise.all([loadMessageTemplates('whatsapp'), loadMessageTemplates('email')]);
      if (!settingsModalOpen('Mensagens rápidas')) return;
      modalShell('Mensagens rápidas', 'Modelos reais usados nos envios manuais.', `<form class="form" data-form="messages"><h3>WhatsApp</h3>${messageTemplateFields('whatsapp', whatsappTemplates)}<h3 style="margin-top:24px">E-mail</h3>${messageTemplateFields('email', emailTemplates)}<p class="form-error" id="modalError" hidden></p>${formFooter('Salvar mensagens')}</form>`, undefined, true);
    } catch (error) {
      console.error('Não foi possível carregar os modelos de mensagem.', error);
      if (settingsModalOpen('Mensagens rápidas')) modalShell('Mensagens rápidas', 'Modelos do Supabase.', '<div class="form"><div class="modal-info"><b>Não foi possível carregar os modelos</b><p>Tente novamente mais tarde.</p></div><div class="modal-foot"><button class="primary" data-action="modal-close">Entendi</button></div></div>', undefined, true);
    }
  }
  async function showDeadlineSettingsForm() {
    modalShell('Prazos padrão', 'Carregando configurações do Supabase…', '<div class="form"><div class="modal-info"><b>Carregando…</b></div></div>');
    try {
      const settings = await loadCommunicationSettings();
      if (!settingsModalOpen('Prazos padrão')) return;
      modalShell('Prazos padrão', 'Parâmetros reais do fluxo de acompanhamento.', `<form class="form" data-form="deadlines"><div class="form-grid"><div class="field"><label>Primeiro lembrete após (horas)</label><input id="deadlineR1" type="number" min="1" value="${settings.reminder_1_hours}" required></div><div class="field"><label>Segundo lembrete após (horas)</label><input id="deadlineR2" type="number" min="1" value="${settings.reminder_2_hours}" required></div><div class="field full"><label>Aviso final</label><select id="deadlineFinal" class="filter-select"><option value="true" ${settings.final_notice_enabled ? 'selected' : ''}>Ativado</option><option value="false" ${settings.final_notice_enabled ? '' : 'selected'}>Desativado</option></select></div></div><p class="form-error" id="modalError" hidden></p>${formFooter('Salvar prazos')}</form>`);
    } catch (error) {
      console.error('Não foi possível carregar os prazos padrão.', error);
      if (settingsModalOpen('Prazos padrão')) modalShell('Prazos padrão', 'Configurações do Supabase.', '<div class="form"><div class="modal-info"><b>Não foi possível carregar os prazos</b><p>Tente novamente mais tarde.</p></div><div class="modal-foot"><button class="primary" data-action="modal-close">Entendi</button></div></div>');
    }
  }
  async function saveMessageTemplatesForm(form) {
    if (form.dataset.saving === 'true') return;
    const updates = new Map();
    form.querySelectorAll('[data-template-id]').forEach(field => {
      const values = updates.get(field.dataset.templateId) || {};
      values[field.dataset.templateField] = field.value;
      updates.set(field.dataset.templateId, values);
    });
    form.dataset.saving = 'true'; setSubmitState(form, true);
    try {
      await Promise.all([...updates].map(([id, values]) => updateMessageTemplate(id, values)));
      closeModal();
      showToast('Mensagens salvas com sucesso.');
    } catch (error) {
      console.error('Não foi possível salvar os modelos de mensagem.', error);
      modalError('Não foi possível salvar as mensagens. Tente novamente.');
    } finally {
      form.dataset.saving = 'false'; setSubmitState(form, false);
    }
  }
  async function saveDeadlineSettingsForm(form) {
    if (form.dataset.saving === 'true') return;
    const reminder1 = Number($('#deadlineR1').value);
    const reminder2 = Number($('#deadlineR2').value);
    if (!Number.isFinite(reminder1) || reminder1 < 1 || !Number.isFinite(reminder2) || reminder2 < 1) return modalError('Informe prazos válidos em horas.');
    if (reminder2 <= reminder1) return modalError('O segundo lembrete precisa ocorrer depois do primeiro.');
    form.dataset.saving = 'true'; setSubmitState(form, true);
    try {
      await updateCommunicationSettings({ reminder_1_hours: reminder1, reminder_2_hours: reminder2, final_notice_enabled: $('#deadlineFinal').value === 'true' });
      closeModal();
      showToast('Prazos salvos com sucesso.');
    } catch (error) {
      console.error('Não foi possível salvar os prazos padrão.', error);
      modalError('Não foi possível salvar os prazos. Tente novamente.');
    } finally {
      form.dataset.saving = 'false'; setSubmitState(form, false);
    }
  }
  async function showAgencySettingsForm() {
    modalShell('Dados da agência', 'Carregando dados do Supabase…', '<div class="form"><div class="modal-info"><b>Carregando…</b></div></div>');
    try {
      const settings = await loadCommunicationSettings();
      if (!settingsModalOpen('Dados da agência')) return;
      modalShell('Dados da agência', 'Informações exibidas no CRM.', `<form class="form" data-form="agency"><div class="form-grid"><div class="field"><label>Nome da agência</label><input id="agencyLegal" value="${text(settings.agency_name)}"></div><div class="field"><label>Nome de exibição no CRM</label><input id="agencyDisplay" value="${text(settings.agency_display_name)}"></div><div class="field"><label>Telefone</label><input id="agencyPhone" value="${text(settings.agency_phone)}"></div><div class="field"><label>E-mail</label><input id="agencyEmail" type="email" value="${text(settings.agency_email)}"></div></div><p class="form-error" id="modalError" hidden></p>${formFooter('Salvar dados')}</form>`);
    } catch (error) {
      console.error('Não foi possível carregar os dados da agência.', error);
      if (settingsModalOpen('Dados da agência')) modalShell('Dados da agência', 'Informações exibidas no CRM.', '<div class="form"><div class="modal-info"><b>Não foi possível carregar os dados</b><p>Tente novamente mais tarde.</p></div><div class="modal-foot"><button class="primary" data-action="modal-close">Entendi</button></div></div>');
    }
  }
  async function saveAgencySettingsForm(form) {
    if (form.dataset.saving === 'true') return;
    form.dataset.saving = 'true'; setSubmitState(form, true);
    try {
      await updateAgencySettings({ agency_name: $('#agencyLegal').value.trim(), agency_display_name: $('#agencyDisplay').value.trim(), agency_phone: $('#agencyPhone').value.trim(), agency_email: $('#agencyEmail').value.trim() });
      closeModal();
      showToast('Configurações salvas.');
    } catch (error) {
      console.error('Não foi possível salvar os dados da agência.', error);
      modalError('Não foi possível salvar os dados da agência. Tente novamente.');
    } finally {
      form.dataset.saving = 'false'; setSubmitState(form, false);
    }
  }
  function showSettingsForm(type) {
    if (type === 'appearance') { toggleTheme(); return showToast(`Tema ${{ light: 'claro', dark: 'escuro' }[themePreference()]} selecionado.`); }
    if (type === 'whatsapp-info' || type === 'email-info') { const isWhatsApp = type.startsWith('whatsapp'); const label = isWhatsApp ? 'WhatsApp' : 'E-mail'; const description = isWhatsApp ? 'O CRM prepara a mensagem e abre o WhatsApp para envio.' : 'O CRM prepara o e-mail no aplicativo padrão para envio.'; return modalShell(label, 'Modo manual ativo', `<div class="form"><div class="modal-info"><b>Modo manual ativo</b><p>${description}</p></div><div class="modal-foot"><button class="primary" data-action="modal-close">Entendi</button></div></div>`); }
    if (type === 'agency') return void showAgencySettingsForm();
    if (type === 'user') { const u = state.currentUser; return modalShell('Usuário atual', 'Informações do usuário autenticado nesta sessão.', `<form class="form" data-form="user"><div class="form-grid"><div class="field"><label>Nome</label><input id="userName" value="${text(u.name)}" required></div><div class="field"><label>E-mail</label><input value="${text(u.email || authState.user?.email)}" readonly></div><div class="field"><label>Função</label><input value="${text(u.role)}" readonly></div></div><p class="form-error" id="modalError" hidden></p>${formFooter('Salvar usuário')}</form>`); }
    if (type === 'messages') return void showMessageTemplatesForm();
    if (type === 'deadlines') return void showDeadlineSettingsForm();
  }
  async function saveSettingsForm(type, form) {
    if (type !== 'user' || form.dataset.saving === 'true') return;
    const user = authState.user;
    if (!user) return modalError('Não foi possível identificar o usuário autenticado.');
    form.dataset.saving = 'true'; setSubmitState(form, true);
    try {
      const { data, error } = await supabase.from('app_members').update({ display_name: $('#userName').value.trim() }).eq('user_id', user.id).select('display_name, role').single();
      if (error) throw error;
      authState.member = data;
      state.currentUser = { name: data.display_name || user.email || 'Usuário', role: roleLabels[data.role] || 'Operações', email: user.email || '' };
      closeModal();
      refreshUserUI();
      rerender();
      showToast('Configurações salvas.');
    } catch (error) {
      console.error('Não foi possível salvar o usuário atual.', error);
      modalError('Não foi possível salvar o usuário. Tente novamente.');
    } finally {
      form.dataset.saving = 'false'; setSubmitState(form, false);
    }
  }
  function showDashboardFilter() { modalShell('Filtrar status', 'Escolha um status para a tabela do dashboard.', `<form class="form" data-form="dashboard-filter"><div class="field"><label>Status</label><select id="dashboardStatusSelect" class="filter-select"><option value="">Todos os pendentes</option>${activeStatuses.map(status => `<option value="${status}" ${dashboardStatus === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}</select></div>${formFooter('Aplicar filtro')}</form>`); }
  function toggleUserMenu(force) { const menu = $('#userPopover'), button = $('#userMenuButton'); const next = typeof force === 'boolean' ? force : menu.hidden; menu.hidden = !next; button.setAttribute('aria-expanded', String(next)); }
  function showUserProfile() { const user = state.currentUser; toggleUserMenu(false); modalShell('Meu perfil', 'Informações do usuário autenticado.', `<div class="form"><div class="profile-identity"><span class="avatar profile-avatar">${text(initials(user.name))}</span><div><b class="profile-identity-name">${text(user.name)}</b><span class="profile-identity-role">${text(user.role)}</span><span class="profile-identity-role">${text(user.email || authState.user?.email)}</span></div></div><div class="modal-foot"><button class="primary" data-action="modal-close">Entendi</button></div></div>`); }
  function handleForm(form) { const type = form.dataset.form; if (type === 'approval') return void saveApprovalForm(form); if (type === 'client') return void saveClientForm(form); if (type === 'confirm') return void handleConfirm(form); if (type === 'messages') return void saveMessageTemplatesForm(form); if (type === 'deadlines') return void saveDeadlineSettingsForm(form); if (type === 'agency') return void saveAgencySettingsForm(form); if (type === 'user') return void saveSettingsForm(type, form); if (type === 'dashboard-filter') { dashboardStatus = $('#dashboardStatusSelect').value; closeModal(); renderDashboard(); showToast(dashboardStatus ? 'Filtro de status aplicado.' : 'Filtro removido.'); } }
  document.addEventListener('submit', event => { const form = event.target.closest('form[data-form]'); if (form) { event.preventDefault(); handleForm(form); } });
  document.addEventListener('click', event => {
    const menuToggle = event.target.closest('[data-client-menu-toggle]');
    if (menuToggle) { const menu = menuToggle.nextElementSibling; const open = menu.hidden; $$('.lumads-client-menu').forEach(item => { item.hidden = true; }); $$('.lumads-client-more').forEach(item => item.setAttribute('aria-expanded', 'false')); menu.hidden = !open; menuToggle.setAttribute('aria-expanded', String(open)); return; }
    const sortClients = event.target.closest('[data-clients-sort]');
    if (sortClients) { const grid = $('.lumads-clients-grid'); const cards = [...grid.querySelectorAll('.lumads-client-card')]; const descending = sortClients.dataset.direction === 'asc'; cards.sort((a, b) => a.dataset.clientSearch.localeCompare(b.dataset.clientSearch, 'pt-BR') * (descending ? -1 : 1)).forEach(card => grid.append(card)); sortClients.dataset.direction = descending ? 'desc' : 'asc'; sortClients.textContent = descending ? 'Ordenar A–Z' : 'Ordenar Z–A'; return; }
    if (!event.target.closest('.lumads-client-menu')) { $$('.lumads-client-menu').forEach(menu => { menu.hidden = true; }); $$('.lumads-client-more').forEach(button => button.setAttribute('aria-expanded', 'false')); }
    const nav = event.target.closest('.nav-item'); if (nav) { if (nav.dataset.page === 'Clientes') currentClientId = null; return navigate(nav.dataset.page); }
    if (event.target.closest('#brandHome')) return navigate('Dashboard');
    if (event.target.closest('#userMenuButton')) return toggleUserMenu();
    if (event.target.closest('#themeButton')) return toggleTheme();
    if (!event.target.closest('.user-menu-wrap')) toggleUserMenu(false);
    const trigger = event.target.closest('[data-action]'); if (!trigger) return; const action = trigger.dataset.action, id = trigger.dataset.id, clientId = trigger.dataset.client;
    if (action === 'modal-close') return closeModal();
    if (action === 'logout') { toggleUserMenu(false); return supabase.auth.signOut({ scope: 'local' }); }
    if (action === 'user-profile') return showUserProfile();
    if (action === 'user-settings') return navigate('Configurações');
    if (action === 'retry-data') return reloadOperationalData();
    if (action === 'new-approval') return showApprovalForm(null, clientId || '');
    if (action === 'new-client') return showClientForm();
    if (action === 'client-detail') return renderClientDetail(clientId);
    if (action === 'back-clients') { currentClientId = null; return navigate('Clientes'); }
    if (action === 'edit-client') return showClientForm(clientId);
    if (action === 'delete-client') { const linked = validApprovals().filter(a => a.clientId === clientId).length; return showConfirm('Arquivar cliente?', linked ? `Este cliente possui ${linked} aprovação(ões) vinculada(s). O cliente será ocultado da base ativa, mas o histórico das aprovações será preservado.` : 'O cliente será ocultado da base ativa e poderá permanecer associado a registros históricos.', 'delete-client', clientId); }
    if (action === 'whatsapp-client') return openWhatsAppForClient(clientId);
    if (action === 'open-post') return openPost(id);
    if (action === 'whatsapp') return openWhatsAppForApproval(id);
    if (action === 'approve') {
      const approval = approvalById(id);
      if (approval?.status === 'published') return showToast('Esta alteração de status não é permitida no estágio atual da aprovação.', 'error');
      return showConfirm('Marcar como aprovado?', 'O status será atualizado e o registro irá para o histórico.', 'approve', id);
    }
    if (action === 'set-adjustment') {
      const approval = approvalById(id);
      if (approval?.status === 'approved' || approval?.status === 'published') return showToast('Esta alteração de status não é permitida no estágio atual da aprovação.', 'error');
      return showConfirm('Marcar ajuste solicitado?', 'O conteúdo continuará em acompanhamento até o retorno do cliente.', 'adjustment', id);
    }
    if (action === 'set-published') {
      const approval = approvalById(id);
      if (!approval || approval.status !== 'approved') return showToast('A aprovação precisa estar aprovada antes de ser marcada como publicada.', 'error');
      return showConfirm('Marcar como publicado?', 'A publicação será registrada no histórico.', 'publish', id);
    }
    if (action === 'close-approval') return showConfirm('Encerrar acompanhamento?', 'O registro será mantido no histórico como encerrado.', 'close', id);
    if (action === 'delete-approval') return showConfirm('Arquivar aprovação?', 'A aprovação será arquivada e permanecerá disponível no histórico como encerrada.', 'delete-approval', id);
    if (action === 'edit-approval') return showApprovalForm(id);
    if (action === 'copy-link') return copyLink(id);
    if (action === 'approval-menu') return showApprovalMenu(id);
    if (action === 'all-pending') { pendingApprovalFilters = { query: '', status: '__active__', client: '', deadline: '' }; return navigate('Aprovações'); }
    if (action === 'dashboard-filter') return showDashboardFilter();
    if (action === 'dashboard-sort') { dashboardDescending = !dashboardDescending; renderDashboard(); return showToast(dashboardDescending ? 'Ordenado por mais recentes.' : 'Ordenado por mais antigos.'); }
    if (action === 'notifications') return modalShell('Notificações', 'Resumo do acompanhamento', `<div class="form"><div class="modal-info"><b>${activeApprovals().filter(a => dueDescriptor(a).late).length} aprovações atrasadas</b><p>Use a seção “Precisam de atenção” para tratar as pendências prioritárias.</p></div><div class="modal-foot"><button class="primary" data-action="modal-close">Entendi</button></div></div>`);
    if (action?.startsWith('settings-')) return showSettingsForm(action.replace('settings-', ''));
  });
  $('#modalBackdrop').addEventListener('click', event => { if (event.target === $('#modalBackdrop')) closeModal(); });
  document.addEventListener('input', event => { const input = event.target.closest('[data-clients-search]'); if (!input) return; const query = input.value.trim().toLocaleLowerCase('pt-BR'); $$('.lumads-client-card').forEach(card => { card.hidden = Boolean(query) && !card.dataset.clientSearch.includes(query); }); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { $$('.lumads-client-menu').forEach(menu => { menu.hidden = true; }); closeModal(); } const card = event.target.closest('.lumads-client-card'); if (card && (event.key === 'Enter' || event.key === ' ') && !event.target.closest('button')) { event.preventDefault(); renderClientDetail(card.dataset.client); } });
  window.addEventListener('hashchange', () => { const page = pageFromHash(); if (page !== currentPage) navigate(page, { updateHash: false }); });
  refreshUserUI(); renderThemeUI(); navigate(currentPage, { updateHash: false });
  setupAuthentication();
  initializeAuthentication();
})();
