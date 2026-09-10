import { supabase } from './supabase.js';

(() => {
  'use strict';

  const loginView = document.querySelector('[data-auth-view="login"]');
  const loginForm = document.getElementById('loginForm');
  if (!loginView || !loginForm || document.getElementById('googleSignInButton')) return;

  const style = document.createElement('style');
  style.id = 'lumads-google-auth-styles';
  style.textContent = `
    .auth-oauth-divider{
      display:flex;
      align-items:center;
      gap:12px;
      margin:18px 0;
      color:var(--muted);
      font-size:10.5px;
      font-weight:600;
    }
    .auth-oauth-divider::before,
    .auth-oauth-divider::after{
      content:'';
      height:1px;
      flex:1;
      background:var(--line);
    }
    .auth-google-button{
      width:100%;
      height:42px;
      display:flex;
      align-items:center;
      justify-content:center;
      gap:10px;
      border:1px solid var(--line);
      border-radius:8px;
      background:var(--surface);
      color:var(--ink);
      font:600 12px 'Geist',sans-serif;
      transition:border-color .18s ease,background .18s ease,box-shadow .18s ease;
    }
    .auth-google-button:hover{
      border-color:var(--accent-border);
      background:var(--accent-soft);
      box-shadow:0 0 0 3px rgba(0,2,253,.05);
    }
    .auth-google-button:focus-visible{
      outline:2px solid var(--accent);
      outline-offset:2px;
    }
    .auth-google-button:disabled{
      cursor:wait;
      opacity:.65;
    }
    .auth-google-button svg{
      width:18px;
      height:18px;
      flex:0 0 auto;
    }
  `;
  document.head.appendChild(style);

  const divider = document.createElement('div');
  divider.className = 'auth-oauth-divider';
  divider.textContent = 'ou';

  const button = document.createElement('button');
  button.id = 'googleSignInButton';
  button.className = 'auth-google-button';
  button.type = 'button';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.87h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.35Z"/>
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.42l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.59A10 10 0 0 0 12 22Z"/>
      <path fill="#FBBC05" d="M6.39 13.9a6.02 6.02 0 0 1 0-3.8V7.51H3.04a10 10 0 0 0 0 8.98l3.35-2.59Z"/>
      <path fill="#EA4335" d="M12 5.97c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.51l3.35 2.59C7.18 7.73 9.39 5.97 12 5.97Z"/>
    </svg>
    <span>Continuar com Google</span>
  `;

  loginForm.insertAdjacentElement('afterend', divider);
  divider.insertAdjacentElement('afterend', button);

  button.addEventListener('click', async () => {
    const message = document.getElementById('authMessage');
    if (message) {
      message.textContent = '';
      message.hidden = true;
      message.classList.remove('is-error');
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');

    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Não foi possível iniciar o login com Google.', error);
      if (message) {
        message.textContent = 'Não foi possível entrar com Google. Tente novamente.';
        message.hidden = false;
        message.classList.add('is-error');
      }
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
})();
