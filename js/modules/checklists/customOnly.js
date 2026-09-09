(() => {
  'use strict';

  const PANEL_ID = 'qol-checklist-container';
  const BUILTIN_IDS = new Set(['x3_speedsettle', 'x1_support_500cp']);
  let scheduled = false;

  function customEntries() {
    try {
      const parsed = JSON.parse(localStorage.getItem('qol_custom_checklists') || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? Object.keys(parsed)
        : [];
    } catch (_) {
      return [];
    }
  }

  function emptyMain(panel) {
    const main = panel.querySelector('.qol-cl-main');
    if (!main) return;
    main.innerHTML = `
      <div class="qol-cl-empty" style="margin:14px!important">
        No custom checklists yet.<br>
        Use <strong>+ New</strong> to create one.
      </div>
    `;
  }

  function apply() {
    scheduled = false;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const library = panel.querySelector('.qol-cl-library');
    if (!library) return;

    library.querySelectorAll('[data-checklist-id]').forEach(item => {
      if (BUILTIN_IDS.has(String(item.dataset.checklistId || ''))) item.remove();
    });

    library.querySelectorAll('.qol-cl-group-title').forEach(title => {
      if (title.textContent.trim().toLowerCase() === 'apes guides') title.remove();
    });

    const customIds = customEntries();
    const activeBuiltin = [...BUILTIN_IDS].some(id => {
      const item = library.querySelector(`[data-checklist-id="${CSS.escape(id)}"]`);
      return item?.classList.contains('qol-active');
    });

    const selectedStored = String(localStorage.getItem('qol_checklist_selected') || '');
    const mainTitle = panel.querySelector('.qol-cl-title')?.textContent?.trim() || '';
    const builtinWasSelected = BUILTIN_IDS.has(selectedStored)
      || (!customIds.length && /x3 speed settle|500 cp\/day/i.test(mainTitle));

    if ((activeBuiltin || builtinWasSelected) && customIds.length) {
      const target = library.querySelector(`[data-checklist-id="${CSS.escape(customIds[0])}"]`);
      if (target) {
        target.click();
        return;
      }
    }

    if (!customIds.length) emptyMain(panel);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === 'checklists') setTimeout(schedule, 0);
  });

  document.addEventListener('click', event => {
    if (event.target.closest?.('#qol-checklist-toggle-btn,[data-action="new"]')) {
      setTimeout(schedule, 0);
      setTimeout(schedule, 80);
    }
  }, true);

  schedule();
})();
