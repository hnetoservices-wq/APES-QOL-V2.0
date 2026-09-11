(() => {
  'use strict';

  const STYLE_ID = 'qol-report-archive-layer-priority';

  function ensureLayerPriority() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body .qol-ra-dialog-layer {
        z-index: 1000010 !important;
      }

      body .qol-ra-toast {
        z-index: 1000011 !important;
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureLayerPriority, { once: true });
  } else {
    ensureLayerPriority();
  }
})();
