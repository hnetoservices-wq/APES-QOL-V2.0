(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';

  function replaceNativeToggle(button) {
    if (!button || button.tagName !== 'BUTTON') return;

    const control = document.createElement('span');
    control.className = button.className;
    control.setAttribute('role', 'button');
    control.tabIndex = 0;

    for (const attribute of Array.from(button.attributes)) {
      if (attribute.name === 'class' || attribute.name === 'type' || attribute.name === 'tabindex' || attribute.name === 'role') continue;
      control.setAttribute(attribute.name, attribute.value);
    }

    control.textContent = button.textContent;
    button.replaceWith(control);
  }

  function fixControls() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay?.classList.contains('open')) return;
    overlay.querySelectorAll('button.apes-vd-expand-toggle').forEach(replaceNativeToggle);
  }

  document.addEventListener('keydown', event => {
    const control = event.target.closest?.('span.apes-vd-expand-toggle[role="button"]');
    if (!control || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    control.click();
  }, true);

  window.setInterval(fixControls, 120);
})();
