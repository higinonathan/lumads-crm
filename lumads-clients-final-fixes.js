(() => {
  'use strict';

  const crm = document.querySelector('#crmApp');
  const dynamic = document.querySelector('#dynamicContent');
  if (!crm || !dynamic) return;

  const style = document.createElement('style');
  style.id = 'lumads-clients-final-fixes';
  style.textContent = `
    /* Ajustes finais de Clientes: legibilidade e navegação direta pelo card. */
    #crmApp[data-page="Clientes"] .clients-ag-card{cursor:pointer}
    #crmApp[data-page="Clientes"] .clients-ag-open,
    #crmApp[data-page="Clientes"] .clients-ag-round.add{display:none!important}

    #crmApp[data-page="Clientes"] .clients-ag-lead{font-size:16px}
    #crmApp[data-page="Clientes"] .clients-ag-segmented button{font-size:12px}
    #crmApp[data-page="Clientes"] .clients-ag-search input,
    #crmApp[data-page="Clientes"] .clients-ag-sort{font-size:13px}
    #crmApp[data-page="Clientes"] .clients-ag-identity strong{font-size:14.5px}
    #crmApp[data-page="Clientes"] .clients-ag-identity span{font-size:11px}
    #crmApp[data-page="Clientes"] .clients-ag-contact-name,
    #crmApp[data-page="Clientes"] .clients-ag-contact-block>div:not(.clients-ag-contact-name){font-size:12px}
    #crmApp[data-page="Clientes"] .clients-ag-metrics span{font-size:9.5px}
    #crmApp[data-page="Clientes"] .clients-ag-metrics strong{font-size:14.5px}
    #crmApp[data-page="Clientes"] .clients-ag-metrics strong.is-date{font-size:11px}
    #crmApp[data-page="Clientes"] .clients-ag-foot-state>strong{font-size:11px}
    #crmApp[data-page="Clientes"] .clients-ag-active-pill,
    #crmApp[data-page="Clientes"] .clients-ag-status{font-size:10px}
    #crmApp[data-page="Clientes"] .clients-ag-tip strong{font-size:12px}
    #crmApp[data-page="Clientes"] .clients-ag-no-results span,
    #crmApp[data-page="Clientes"] .clients-ag-tip span{font-size:12px}

    #crmApp[data-page="Clientes"] .clients-ag-detail-name-line h2{font-size:24px}
    #crmApp[data-page="Clientes"] .clients-ag-detail-brand p{font-size:13px}
    #crmApp[data-page="Clientes"] .clients-ag-panel h3{font-size:18px}
    #crmApp[data-page="Clientes"] .clients-ag-panel-head p{font-size:13px}
    #crmApp[data-page="Clientes"] .clients-ag-info-list span{font-size:10px}
    #crmApp[data-page="Clientes"] .clients-ag-info-list strong{font-size:13px}
    #crmApp[data-page="Clientes"] .clients-ag-info-list strong.is-number{font-size:17px}
    #crmApp[data-page="Clientes"] .clients-ag-table th{font-size:10.5px}
    #crmApp[data-page="Clientes"] .clients-ag-table td{font-size:12.5px}
    #crmApp[data-page="Clientes"] .clients-ag-table td strong{font-size:13px}
    #crmApp[data-page="Clientes"] .clients-ag-table td>span{font-size:11px}
    #crmApp[data-page="Clientes"] .clients-ag-inline-link{font-size:11px}
    #crmApp[data-page="Clientes"] .clients-ag-status{font-size:10.5px}
    #crmApp[data-page="Clientes"] .clients-ag-table-empty{font-size:12.5px!important}
    #crmApp[data-page="Clientes"] .clients-ag-contact-event-main strong{font-size:12.5px}
    #crmApp[data-page="Clientes"] .clients-ag-contact-event-main span{font-size:11.5px}
    #crmApp[data-page="Clientes"] .clients-ag-contact-event time{font-size:10.5px}
    #crmApp[data-page="Clientes"] .clients-ag-contacts-empty{font-size:12px}

    #crmApp[data-page="Clientes"] .clients-ag-card:focus-visible{
      outline:2px solid var(--lumads-accent);
      outline-offset:3px;
    }

    #crmApp[data-page="Clientes"] .clients-ag-detail-loading{
      min-height:220px;
      display:grid;
      place-items:center;
      color:var(--lumads-muted,#727a90);
      font-size:13px;
      font-weight:600;
    }
  `;
  document.head.appendChild(style);

  const isInteractive = target => Boolean(target.closest('button, a, input, select, textarea, label, [role="menuitem"]'));
  const safe = value => String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);

  function prepareCards(root = dynamic) {
    root.querySelectorAll?.('.clients-ag-card').forEach(card => {
      card.querySelector('.clients-ag-open')?.remove();
      card.querySelector('.clients-ag-round.add')?.remove();
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Abrir cliente ${card.querySelector('.clients-ag-identity strong')?.textContent || ''}`.trim());
    });
  }

  function prepareDetailHeader(clientId) {
    document.querySelector('#clientDetailHeaderBack')?.remove();
    const eyebrow = document.querySelector('#pageEyebrow');
    const title = document.querySelector('#pageTitle');
    if (eyebrow) {
      eyebrow.insertAdjacentHTML('beforebegin', '<button class="back-link client-detail-back-approved" id="clientDetailHeaderBack" data-action="back-clients">← Voltar para clientes</button>');
      eyebrow.textContent = 'Base de clientes';
    }
    if (title) title.textContent = 'Detalhe do cliente';

    const headerPrimary = document.querySelector('#headerActions .primary');
    if (headerPrimary) {
      headerPrimary.dataset.action = 'new-approval';
      headerPrimary.dataset.client = clientId;
      headerPrimary.textContent = '+ Nova aprovação';
    }
  }

  function openClientFromCard(card) {
    const clientId = card?.dataset?.client;
    if (!clientId) return;

    /*
      Não chamamos mais data-action="client-detail".
      Essa ação acionava primeiro o renderClientDetail antigo do app-core e
      causava a tela antiga aparecer antes da nova. Entregamos diretamente
      o id ao adaptador atual de Clientes, que já observa #dynamicContent.
    */
    prepareDetailHeader(clientId);
    dynamic.classList.add('client-detail-approved');
    dynamic.innerHTML = `<span hidden data-client="${safe(clientId)}" data-clients-ag-detail-marker="true"></span><div class="clients-ag-detail-loading" aria-live="polite">Carregando cliente…</div>`;
  }

  document.addEventListener('click', event => {
    const card = event.target.closest?.('.clients-ag-card');
    if (!card || crm.dataset.page !== 'Clientes' || isInteractive(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openClientFromCard(card);
  }, true);

  document.addEventListener('keydown', event => {
    const card = event.target.closest?.('.clients-ag-card');
    if (!card || crm.dataset.page !== 'Clientes' || isInteractive(event.target)) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openClientFromCard(card);
  }, true);

  const observer = new MutationObserver(() => prepareCards());
  observer.observe(dynamic, { childList: true, subtree: false });
  prepareCards();
})();
