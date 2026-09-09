(() => {
  'use strict';

  const FEATURE_KEY = 'roadmaps';
  const STORAGE_KEY = `qol_${FEATURE_KEY}`;
  const CHECKBOX_ID = 'qol-chk-roadmaps';
  const LAUNCHER_ID = 'qol-roadmaps-toggle-btn';
  const PANEL_ID = 'qol-roadmaps-container';
  const ADVANCED_GRID_ID = 'qol-advanced-feature-grid';
  const ADVANCED_COUNT_ID = 'qol-advanced-feature-count';

  let syncQueued = false;

  function isEnabled() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === null ? true : stored !== 'false';
    } catch (_) {
      return true;
    }
  }

  function setEnabled(enabled) {
    try {
      localStorage.setItem(STORAGE_KEY, String(Boolean(enabled)));
    } catch (error) {
      console.warn('[APES Roadmaps] Could not save Roadmaps setting.', error);
    }
    window.dispatchEvent(new CustomEvent('qol_setting_changed', {
      detail: { key: FEATURE_KEY, enabled: Boolean(enabled) }
    }));
    scheduleSync();
  }

  function makeCard() {
    const card = document.createElement('article');
    card.className = 'qol-feature-card';
    card.dataset.featureKey = FEATURE_KEY;
    card.dataset.qolRoadmapsExpertCard = '1';
    card.innerHTML = `
      <span class="qol-feature-icon" aria-hidden="true">↪</span>
      <div class="qol-feature-copy">
        <h3 class="qol-feature-name">Roadmaps</h3>
        <p class="qol-feature-desc">Build, import and run step-by-step village development plans with manual or automatic progress tracking.</p>
      </div>
      <label class="qol-switch" title="Toggle Roadmaps">
        <input type="checkbox" id="${CHECKBOX_ID}" class="qol-checkbox">
        <span class="qol-switch-track" aria-hidden="true"></span>
        <span class="qol-visually-hidden">Toggle Roadmaps</span>
      </label>`;

    const checkbox = card.querySelector(`#${CHECKBOX_ID}`);
    checkbox.checked = isEnabled();
    checkbox.addEventListener('change', event => setEnabled(Boolean(event.target.checked)));
    return card;
  }

  function syncMenu() {
    const modal = document.getElementById('qol-modal');
    if (!modal) return;

    const heading = modal.querySelector('.qol-advanced-heading');
    const title = heading?.querySelector('.qol-section-title');
    const caption = heading?.querySelector('.qol-section-caption');
    if (title) title.textContent = 'Expert Features';
    if (caption) caption.textContent = 'Power tools for planning, archiving, tracking and deeper account management.';

    const grid = modal.querySelector(`#${ADVANCED_GRID_ID}`);
    if (!grid) return;

    let card = grid.querySelector('[data-qol-roadmaps-expert-card="1"]');
    if (!card) {
      card = makeCard();
      grid.appendChild(card);
    }

    const checkbox = card.querySelector(`#${CHECKBOX_ID}`);
    if (checkbox && checkbox.checked !== isEnabled()) checkbox.checked = isEnabled();

    const count = modal.querySelector(`#${ADVANCED_COUNT_ID}`);
    if (count) {
      const total = grid.querySelectorAll(':scope > .qol-feature-card').length;
      count.textContent = `${total} tool${total === 1 ? '' : 's'}`;
    }
  }

  function syncRuntime() {
    const enabled = isEnabled();
    const launcher = document.getElementById(LAUNCHER_ID);
    const panel = document.getElementById(PANEL_ID);

    if (!enabled) {
      if (panel?.classList.contains('qol-rm-open')) window.APES?.roadmaps?.close?.();
      if (launcher) {
        launcher.dataset.qolRoadmapsDisabled = '1';
        launcher.style.setProperty('display', 'none', 'important');
      }
      return;
    }

    if (launcher?.dataset.qolRoadmapsDisabled === '1') {
      delete launcher.dataset.qolRoadmapsDisabled;
      launcher.style.removeProperty('display');
      window.dispatchEvent(new Event('resize'));
    }
  }

  function sync() {
    syncQueued = false;
    syncMenu();
    syncRuntime();
  }

  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(sync);
  }

  function init() {
    scheduleSync();

    const observer = new MutationObserver(mutations => {
      const relevant = mutations.some(mutation => {
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          return target?.id === LAUNCHER_ID || target?.id === PANEL_ID;
        }
        return [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === Node.ELEMENT_NODE);
      });
      if (relevant) scheduleSync();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });

    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key === FEATURE_KEY) scheduleSync();
    });

    setTimeout(scheduleSync, 200);
    setTimeout(scheduleSync, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
