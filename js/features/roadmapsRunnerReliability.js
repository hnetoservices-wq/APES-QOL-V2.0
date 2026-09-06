(() => {
  'use strict';

  const PANEL_ID = 'qol-roadmap-runner';
  const PROGRESS_ACTIONS = new Set(['complete', 'skip', 'back', 'restart']);
  const DIRECT_ACTIONS = new Set(['complete', 'skip', 'back', 'restart', 'hub', 'close']);

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function findControl(target) {
    return target?.closest?.(`#${PANEL_ID} [data-rmr-action], #${PANEL_ID} [data-action]`) || null;
  }

  function actionOf(control) {
    return clean(control?.getAttribute('data-rmr-action') || control?.getAttribute('data-action'));
  }

  function invalidateOldControl(control) {
    // Runner renders replace these nodes after progress changes. Removing the action
    // attributes before that happens prevents the later native click event from being
    // handled a second time by older delegated listeners.
    control.removeAttribute('data-rmr-action');
    control.removeAttribute('data-action');
    control.dataset.rmrPressHandled = '1';
  }

  function runAction(action) {
    if (PROGRESS_ACTIONS.has(action)) {
      return window.APES?.roadmapsStableIds?.perform?.(action) === true;
    }
    if (action === 'hub') {
      window.APES?.roadmaps?.open?.();
      return true;
    }
    if (action === 'close') {
      window.APES?.roadmapsRunner?.close?.();
      return true;
    }
    return false;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    const control = findControl(event.target);
    if (!control || control.classList.contains('disabled')) return;
    const action = actionOf(control);
    if (!DIRECT_ACTIONS.has(action)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    // Capture the action on the first physical press. This avoids losing clicks when
    // Travian or Roadmap detection re-renders the runner between pointerdown and click.
    invalidateOldControl(control);
    const handled = runAction(action);

    if (!handled) {
      // Stable-ID handling may still be installing during the first few milliseconds
      // after extension load. Restore the action and let the existing click path work.
      control.setAttribute('data-rmr-action', action);
      delete control.dataset.rmrPressHandled;
    }
  }

  function onClick(event) {
    const control = event.target?.closest?.(`#${PANEL_ID} [data-rmr-press-handled="1"]`);
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function init() {
    // Pointerdown is intentional: a normal click only fires after pointerup, and the
    // runner can legitimately be re-rendered before then by live detection updates.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
