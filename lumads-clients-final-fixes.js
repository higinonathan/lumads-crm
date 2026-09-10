(() => {
  'use strict';

  const crm = document.querySelector('#crmApp');
  const dynamic = document.querySelector('#dynamicContent');
  if (!crm || !dynamic) return;

  const style = document.createElement('style');
  style.id = 'lumads-clients-final-fixes';
  style.textContent = `
    /* Ajustes finais de Clientes: somente legibilidade e navegação dos cards. */
    #crmApp[data-page="Clientes"] .clients-ag-card{cursor:pointer}
    #crmApp[data-page="Clientes"] .clients-ag-open{display:none!important}

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
  `;
  document.head.appendChild(style);

  const isInteractive = target => Boolean(target.closest('button, a, input, select, textarea, label, [role="menuitem"]'));

  function prepareCards(root = dynamic) {
    root.querySelectorAll?.('.clients-ag-card').forEach(card => {
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Abrir cliente ${card.querySelector('.clients-ag-identity strong')?.textContent || ''}`.trim());
    });
  }

  function openClientFromCard(card) {
    const clientId = card?.dataset?.client;
    if (!clientId) return;

    dynamic.dataset.clientsAgPendingId = clientId;

    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.hidden = true;
    proxy.dataset.action = 'client-detail';
    proxy.dataset.client = clientId;
    document.body.appendChild(proxy);
    proxy.click();
    proxy.remove();
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

  const observer = new MutationObserver(() => {
    prepareCards();

    const clientId = dynamic.dataset.clientsAgPendingId;
    if (!clientId) return;

    if (dynamic.querySelector(':scope > .clients-ag-detail')) {
      delete dynamic.dataset.clientsAgPendingId;
      return;
    }

    const oldDetailVisible = dynamic.classList.contains('client-detail-approved') || Boolean(dynamic.querySelector('#clientDetailHeaderBack'));
    if (!oldDetailVisible) return;

    let marker = dynamic.querySelector('[data-clients-ag-detail-marker]');
    if (!marker) {
      marker = document.createElement('span');
      marker.hidden = true;
      marker.dataset.clientsAgDetailMarker = 'true';
      marker.dataset.client = clientId;
      dynamic.appendChild(marker);
    }
  });

  observer.observe(dynamic, { childList: true, subtree: false });
  prepareCards();
})();
