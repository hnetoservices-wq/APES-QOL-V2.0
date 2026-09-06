(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  const R = A?.rendering;
  if (!D || !R || A.__settingsV1) return;
  A.__settingsV1 = true;

  const CATALOG = Object.freeze([
    { type: 12, label: 'Smithy' },
    { type: 17, label: 'Market' },
    { type: 19, label: 'Barracks' },
    { type: 20, label: 'Stables' },
    { type: 21, label: 'Workshop' },
    { type: 22, label: 'Academy' },
    { type: 24, label: 'Town Hall' },
    { type: 28, label: 'Trade Office' },
    { type: 29, label: 'Great Barracks' },
    { type: 30, label: 'Great Stables' },
    { type: 37, label: "Hero's Mansion" },
    { type: 46, label: 'Hospital' }
  ]);

  const DEFAULT_TRACKED = [17, 19, 20, 29, 30];
  const SORTS = new Set(['order', 'attention', 'nextEvent', 'construction', 'storage', 'population', 'alphabetical']);
  let configCache = null;
  let restoringExpanded = false;

  function key() {
    return `apes_aoc_settings_v1:${location.hostname}`;
  }

  function expandedKey() {
    return `apes_aoc_expanded_v1:${location.hostname}`;
  }

  function defaultSort() {
    try {
      const stored = localStorage.getItem(`apes_aoc_sort:${location.hostname}`);
      return SORTS.has(stored) ? stored : 'order';
    } catch (_) {
      return 'order';
    }
  }

  function defaults() {
    return {
      density: 'comfortable',
      showInformational: true,
      showIncomingAttacks: true,
      showIncomingResources: true,
      showOutgoings: true,
      trackedBuildingTypes: [...DEFAULT_TRACKED],
      defaultSort: defaultSort(),
      rememberExpanded: true
    };
  }

  function normalize(value) {
    const base = defaults();
    const source = value && typeof value === 'object' ? value : {};
    const tracked = Array.isArray(source.trackedBuildingTypes)
      ? source.trackedBuildingTypes.map(Number).filter(type => CATALOG.some(item => item.type === type))
      : base.trackedBuildingTypes;
    return {
      density: source.density === 'compact' ? 'compact' : 'comfortable',
      showInformational: source.showInformational !== false,
      showIncomingAttacks: source.showIncomingAttacks !== false,
      showIncomingResources: source.showIncomingResources !== false,
      showOutgoings: source.showOutgoings !== false,
      trackedBuildingTypes: tracked.length ? [...new Set(tracked)] : [...DEFAULT_TRACKED],
      defaultSort: SORTS.has(source.defaultSort) ? source.defaultSort : base.defaultSort,
      rememberExpanded: source.rememberExpanded !== false
    };
  }

  function read() {
    if (configCache) return configCache;
    try { configCache = normalize(JSON.parse(localStorage.getItem(key()) || '{}')); }
    catch (_) { configCache = defaults(); }
    return configCache;
  }

  function save(next) {
    configCache = normalize(next);
    try { localStorage.setItem(key(), JSON.stringify(configCache)); } catch (_) {}
    apply();
    window.dispatchEvent(new CustomEvent('apes_aoc_force_render', { detail: { reason: 'settings' } }));
  }

  function applyTracked() {
    const selected = new Set(read().trackedBuildingTypes);
    D.TRACKED = Object.freeze(CATALOG.filter(item => selected.has(item.type)).map(item => ({ ...item })));
  }

  function applyDensity(overlay = document.getElementById(D.OVERLAY_ID)) {
    if (!overlay) return;
    overlay.classList.toggle('apes-aoc-density-compact', read().density === 'compact');
    overlay.classList.toggle('apes-aoc-density-comfortable', read().density !== 'compact');
  }

  function apply() {
    applyTracked();
    applyDensity();
  }

  D.getAocConfig = () => ({ ...read(), trackedBuildingTypes: [...read().trackedBuildingTypes] });
  D.setAocConfig = patch => save({ ...read(), ...(patch || {}) });
  D.AOC_BUILDING_CATALOG = CATALOG;
  apply();

  function control(label, attrs = '', className = '') {
    return `<div class="apes-aoc-settings-control ${className}" role="button" tabindex="0" ${attrs}>${D.esc(label)}</div>`;
  }

  function checkbox(name, label, checked) {
    return `<label class="apes-aoc-settings-check"><input type="checkbox" data-aoc-setting="${D.esc(name)}" ${checked ? 'checked' : ''}><span></span><b>${D.esc(label)}</b></label>`;
  }

  function trackedChecks() {
    const selected = new Set(read().trackedBuildingTypes);
    return CATALOG.map(item => `<label class="apes-aoc-settings-check building"><input type="checkbox" data-aoc-tracked-building="${item.type}" ${selected.has(item.type) ? 'checked' : ''}><span></span><b>${D.esc(item.label)}</b></label>`).join('');
  }

  function panelHtml() {
    const c = read();
    return `<div class="apes-aoc-settings-backdrop" data-aoc-settings-backdrop>
      <section class="apes-aoc-settings-panel" role="dialog" aria-modal="true" aria-label="Account Operations Center settings">
        <header><div><strong>Operations Center Settings</strong><small>Account dashboard preferences</small></div>${control('×', 'data-aoc-settings-close', 'close')}</header>
        <div class="apes-aoc-settings-body">
          <section><h3>Display</h3><label class="apes-aoc-settings-field"><span>Density</span><select data-aoc-setting-select="density"><option value="comfortable" ${c.density === 'comfortable' ? 'selected' : ''}>Comfortable</option><option value="compact" ${c.density === 'compact' ? 'selected' : ''}>Compact</option></select></label><label class="apes-aoc-settings-field"><span>Default sort</span><select data-aoc-setting-select="defaultSort"><option value="order" ${c.defaultSort === 'order' ? 'selected' : ''}>Village order</option><option value="attention" ${c.defaultSort === 'attention' ? 'selected' : ''}>Needs attention</option><option value="nextEvent" ${c.defaultSort === 'nextEvent' ? 'selected' : ''}>Next event</option><option value="construction" ${c.defaultSort === 'construction' ? 'selected' : ''}>Construction finish</option><option value="storage" ${c.defaultSort === 'storage' ? 'selected' : ''}>Storage risk</option><option value="population" ${c.defaultSort === 'population' ? 'selected' : ''}>Population</option><option value="alphabetical" ${c.defaultSort === 'alphabetical' ? 'selected' : ''}>Alphabetical</option></select></label>${checkbox('rememberExpanded', 'Remember expanded village', c.rememberExpanded)}</section>
          <section><h3>Attention</h3>${checkbox('showInformational', 'Show informational notices', c.showInformational)}${checkbox('showIncomingAttacks', 'Incoming attacks & siege', c.showIncomingAttacks)}${checkbox('showIncomingResources', 'Incoming resources & overflow', c.showIncomingResources)}${checkbox('showOutgoings', 'Outgoing movement summary', c.showOutgoings)}</section>
          <section class="tracked"><h3>Tracked Buildings</h3><p>These are the buildings shown in the compact Buildings column and captured when villages are visited.</p><div class="apes-aoc-settings-building-grid">${trackedChecks()}</div></section>
        </div>
        <footer>${control('Clear Scanner Intel', 'data-aoc-clear-intel', 'secondary')}${control('Reset AOC Settings', 'data-aoc-settings-reset', 'secondary')}${control('Done', 'data-aoc-settings-close', 'primary')}</footer>
      </section>
    </div>`;
  }

  function ensureUi(overlay) {
    if (!overlay) return;
    applyDensity(overlay);
    const headerActions = overlay.querySelector('.apes-aoc2-header-actions');
    if (headerActions && !headerActions.querySelector('.apes-aoc-settings-open')) {
      const button = document.createElement('div');
      button.className = 'apes-aoc-settings-open apes-aoc2-control';
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      button.setAttribute('title', 'Operations Center settings');
      button.textContent = '⚙';
      const refresh = headerActions.querySelector('.apes-aoc2-refresh');
      headerActions.insertBefore(button, refresh || null);
    }
    if (!overlay.querySelector('[data-aoc-settings-backdrop]')) overlay.querySelector('.apes-aoc2-shell')?.insertAdjacentHTML('beforeend', panelHtml());
  }

  function openPanel() {
    const overlay = document.getElementById(D.OVERLAY_ID);
    ensureUi(overlay);
    const backdrop = overlay?.querySelector('[data-aoc-settings-backdrop]');
    if (!backdrop) return;
    backdrop.classList.add('open');
  }

  function closePanel() {
    document.querySelector(`#${D.OVERLAY_ID} [data-aoc-settings-backdrop]`)?.classList.remove('open');
  }

  function rebuildPanel() {
    const overlay = document.getElementById(D.OVERLAY_ID);
    const old = overlay?.querySelector('[data-aoc-settings-backdrop]');
    old?.remove();
    if (overlay) overlay.querySelector('.apes-aoc2-shell')?.insertAdjacentHTML('beforeend', panelHtml());
  }

  function applySort(value) {
    if (!SORTS.has(value)) return;
    try { localStorage.setItem(`apes_aoc_sort:${location.hostname}`, value); } catch (_) {}
    const select = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-sort`);
    if (select) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  document.addEventListener('click', event => {
    const overlay = event.target.closest?.(`#${D.OVERLAY_ID}`);
    if (!overlay) return;
    if (event.target.closest('.apes-aoc-settings-open')) {
      event.preventDefault(); event.stopPropagation(); openPanel(); return;
    }
    if (event.target.closest('[data-aoc-settings-close]') || (event.target.matches?.('[data-aoc-settings-backdrop]'))) {
      event.preventDefault(); event.stopPropagation(); closePanel(); return;
    }
    if (event.target.closest('[data-aoc-settings-reset]')) {
      event.preventDefault(); event.stopPropagation();
      configCache = defaults();
      try { localStorage.setItem(key(), JSON.stringify(configCache)); localStorage.removeItem(expandedKey()); } catch (_) {}
      apply(); rebuildPanel(); applySort(configCache.defaultSort);
      window.dispatchEvent(new CustomEvent('apes_aoc_force_render', { detail: { reason: 'settings-reset' } }));
      return;
    }
    if (event.target.closest('[data-aoc-clear-intel]')) {
      event.preventDefault(); event.stopPropagation();
      window.APES_AOC_INTEL?.clear?.();
      return;
    }
  }, true);

  document.addEventListener('change', event => {
    const overlay = event.target.closest?.(`#${D.OVERLAY_ID}`);
    if (!overlay) return;
    const setting = event.target.getAttribute?.('data-aoc-setting');
    if (setting) {
      D.setAocConfig({ [setting]: event.target.checked === true });
      return;
    }
    const selectSetting = event.target.getAttribute?.('data-aoc-setting-select');
    if (selectSetting) {
      const value = event.target.value;
      D.setAocConfig({ [selectSetting]: value });
      if (selectSetting === 'defaultSort') applySort(value);
      return;
    }
    const type = Number(event.target.getAttribute?.('data-aoc-tracked-building'));
    if (Number.isFinite(type)) {
      const selected = new Set(read().trackedBuildingTypes);
      if (event.target.checked) selected.add(type); else selected.delete(type);
      D.setAocConfig({ trackedBuildingTypes: [...selected] });
      D.captureCurrent?.();
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const target = event.target.closest?.('.apes-aoc-settings-open,[data-aoc-settings-close],[data-aoc-settings-reset],[data-aoc-clear-intel]');
    if (!target) return;
    event.preventDefault(); target.click();
  }, true);

  const baseMount = R.mount;
  R.mount = (...args) => {
    const overlay = baseMount(...args);
    ensureUi(overlay);
    return overlay;
  };

  const baseRender = R.render;
  R.render = (...args) => {
    const result = baseRender(...args);
    ensureUi(document.getElementById(D.OVERLAY_ID));
    if (read().rememberExpanded && !restoringExpanded) {
      let saved = '';
      try { saved = localStorage.getItem(expandedKey()) || ''; } catch (_) {}
      if (/^\d+$/.test(saved) && !document.querySelector(`#${D.OVERLAY_ID} [data-detail-village-id="${saved}"]`)) {
        const toggle = document.querySelector(`#${D.OVERLAY_ID} [data-expand-village-id="${saved}"]`);
        if (toggle) {
          restoringExpanded = true;
          setTimeout(() => {
            try { R.toggleExpanded?.(saved); } finally { restoringExpanded = false; }
          }, 0);
        }
      }
    }
    return result;
  };

  const baseToggleExpanded = R.toggleExpanded;
  if (typeof baseToggleExpanded === 'function') {
    R.toggleExpanded = id => {
      const value = String(id || '');
      const currentlyOpen = Boolean(document.querySelector(`#${D.OVERLAY_ID} [data-detail-village-id="${value}"]`));
      if (!restoringExpanded) {
        try {
          if (read().rememberExpanded && !currentlyOpen && /^\d+$/.test(value)) localStorage.setItem(expandedKey(), value);
          else localStorage.removeItem(expandedKey());
        } catch (_) {}
      }
      return baseToggleExpanded(id);
    };
  }

  window.APES_AOC_SETTINGS = Object.freeze({
    version: 1,
    get: () => D.getAocConfig(),
    set: patch => D.setAocConfig(patch),
    open: openPanel,
    close: closePanel
  });
})();
