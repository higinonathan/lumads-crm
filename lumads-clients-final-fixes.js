(() => {
  'use strict';

  if (document.querySelector('#lumads-clients-final-fixes')) return;
  const style = document.createElement('style');
  style.id = 'lumads-clients-final-fixes';
  style.textContent = `
    /* Ajustes finais já aprovados para legibilidade de Clientes. */
    #crmApp[data-page="Clientes"] .clients-ag-card{cursor:pointer}
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
})();
