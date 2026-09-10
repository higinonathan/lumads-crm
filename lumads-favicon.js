(() => {
  'use strict';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#0002FD"/>
      <text x="32" y="39" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">LM</text>
    </svg>
  `;

  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  let link = document.querySelector('link[rel~="icon"]');

  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }

  link.href = href;
})();
