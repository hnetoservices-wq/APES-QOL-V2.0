(() => {
  'use strict';

  const APES = window.APES;
  const FEATURE_KEY = 'resourceUpgradePlanner';
  const BUTTON_ID = 'qol-resource-planner-toggle-btn';
  const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
  const CHECKBOX_ID = 'qol-chk-resource-upgrade-planner';
  const TOOLBAR_ENTRY_ATTR = 'data-rup-toolbar-entry';
  const RADIAL_ACTION_ID = 'resources.open';
  const IMPORT_BUTTON_ATTR = 'data-rup-import-roadmap';
  const ROADMAP_CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const ROADMAP_SELECTED_KEY = 'qol_roadmap_selected_v1';
  const IMPORT_STYLE_ID = 'qol-resource-upgrade-roadmap-import-styles';
  const ITEMS_PER_RING = 8;
  const FIRST_RING_RADIUS = 150;
  const MIN_ITEM_DISTANCE = 126;
  const RING_GAP = 120;

  const RESOURCE_LABELS = Object.freeze({
    wood: 'Wood',
    clay: 'Clay',
    iron: 'Iron',
    crop: 'Crop'
  });
  const PRODUCTION_BUILDINGS = Object.freeze({
    sawmill: { label: 'Sawmill', id: 5 },
    brickyard: { label: 'Brickyard', id: 6 },
    foundry: { label: 'Iron Foundry', id: 7 },
    mill: { label: 'Grain Mill', id: 8 },
    bakery: { label: 'Bakery', id: 9 }
  });

  let scheduled = false;

  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[APES Resource Planner] Roadmaps import failed to save.', error);
      return false;
    }
  }

  function openPlanner() {
    if (window.APES_RESOURCE_UPGRADE_PLANNER?.open) return window.APES_RESOURCE_UPGRADE_PLANNER.open();
    return APES?.ui?.activateById?.(BUTTON_ID);
  }

  function setEnabled(value) {
    try { localStorage.setItem(`qol_${FEATURE_KEY}`, String(Boolean(value))); } catch (_) {}
    window.dispatchEvent(new CustomEvent('qol_setting_changed', {
      detail: { key: FEATURE_KEY, enabled: Boolean(value) }
    }));
  }

  function injectSettingsCard() {
    const grid = document.getElementById('qol-advanced-feature-grid') || document.getElementById('qol-basic-feature-grid');
    if (!grid) return;
    let checkbox = document.getElementById(CHECKBOX_ID);
    if (!checkbox) {
      const card = document.createElement('article');
      card.className = 'qol-feature-card';
      card.dataset.featureKey = FEATURE_KEY;
      card.innerHTML = `
        <span class="qol-feature-icon" aria-hidden="true">↥</span>
        <div class="qol-feature-copy">
          <h3 class="qol-feature-name">Resource Upgrade Planner</h3>
          <p class="qol-feature-desc">Calculates efficient resource upgrades and can import the selected plan directly into APES Roadmaps.</p>
        </div>
        <label class="qol-switch" title="Toggle Resource Upgrade Planner">
          <input type="checkbox" id="${CHECKBOX_ID}" class="qol-checkbox">
          <span class="qol-switch-track" aria-hidden="true"></span>
          <span class="qol-visually-hidden">Toggle Resource Upgrade Planner</span>
        </label>`;
      grid.appendChild(card);
      checkbox = card.querySelector(`#${CHECKBOX_ID}`);
      checkbox.addEventListener('change', event => setEnabled(event.target.checked));
      const count = grid.previousElementSibling?.querySelector('.qol-section-count');
      if (count && count.dataset.rupCounted !== 'true') {
        const current = Number.parseInt(count.textContent, 10);
        if (Number.isFinite(current)) count.textContent = `${current + 1} tools`;
        count.dataset.rupCounted = 'true';
      }
    }
    checkbox.checked = enabled();
  }

  function injectCollapsedToolbarEntry() {
    const dropdown = document.getElementById('qol-toolbar-dropdown');
    if (!dropdown?.classList.contains('qol-open')) return;
    const existing = dropdown.querySelector(`[${TOOLBAR_ENTRY_ATTR}]`);
    if (!enabled()) {
      existing?.remove();
      return;
    }
    if (existing) return;
    const item = document.createElement('div');
    item.className = 'qol-toolbar-menu-item';
    item.setAttribute(TOOLBAR_ENTRY_ATTR, 'true');
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.innerHTML = '<span>Resource Upgrade Planner</span><span class="qol-toolbar-menu-arrow">›</span>';
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      dropdown.classList.remove('qol-open');
      void openPlanner();
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    const settings = dropdown.querySelector('[data-open-settings="true"]');
    if (settings) dropdown.insertBefore(item, settings);
    else dropdown.appendChild(item);
  }

  function visibleToolbarControls() {
    const selectors = [
      '#qol-help-toggle-btn', '#qol-rally-point-toggle-btn', '#qol-watchlist-toggle', '#qol-checklist-toggle-btn',
      '#qol-npc-calc-toggle-btn', '#qol-distance-calc-toggle-btn', '#qol-oasis-toggle-btn', '#qol-report-archive-toggle',
      '#qol-cp-toggle-btn', '#qol-ss-scanner-toggle-btn', '#qol-tribe-skins-toggle-btn'
    ].join(',');
    return [...document.querySelectorAll(selectors)]
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(item => item.rect.width > 0 && item.rect.height > 0)
      .filter(item => {
        const style = getComputedStyle(item.element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
  }

  function positionPlannerButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;
    if (!enabled() || document.body?.classList.contains('qol-toolbar-collapsed')) {
      button.style.setProperty('display', 'none', 'important');
      return;
    }
    const villageRect = document.getElementById('villageList')?.getBoundingClientRect();
    if (!villageRect || villageRect.width <= 0 || villageRect.height <= 0) {
      button.style.setProperty('display', 'none', 'important');
      return;
    }
    const controls = visibleToolbarControls();
    const anchor = controls.length ? controls.reduce((rightmost, item) => item.rect.right > rightmost.rect.right ? item : rightmost) : null;
    const cog = document.getElementById('qol-cog-btn')?.getBoundingClientRect();
    button.style.setProperty('left', `${Math.round((anchor?.rect.right ?? cog?.right ?? villageRect.right + 50) + 6)}px`, 'important');
    button.style.setProperty('top', `${Math.round(anchor?.rect.top ?? cog?.top ?? villageRect.top + 4)}px`, 'important');
    button.style.setProperty('right', 'auto', 'important');
    button.style.setProperty('display', 'flex', 'important');
  }

  function radialIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16v-5M10 16V7M14 16v-3M18 16V4"/><path d="m5 8 4-4 4 3 6-5"/></svg>';
  }

  function getRingRadius(itemCount, ringIndex) {
    const minimum = itemCount > 1 ? MIN_ITEM_DISTANCE / (2 * Math.sin(Math.PI / itemCount)) : 0;
    return Math.max(FIRST_RING_RADIUS + ringIndex * RING_GAP, minimum);
  }

  function layoutRadialItems(container) {
    const items = [...container.querySelectorAll('.apes-v2-radial-item')];
    items.forEach((item, index) => {
      const ringIndex = Math.floor(index / ITEMS_PER_RING);
      const ringStart = ringIndex * ITEMS_PER_RING;
      const ringCount = Math.min(ITEMS_PER_RING, items.length - ringStart);
      const positionInRing = index - ringStart;
      const angle = -Math.PI / 2 + Math.PI * 2 * positionInRing / ringCount;
      const radius = getRingRadius(ringCount, ringIndex);
      item.style.setProperty('--apes-x', `${(Math.cos(angle) * radius).toFixed(2)}px`);
      item.style.setProperty('--apes-y', `${(Math.sin(angle) * radius).toFixed(2)}px`);
    });
    const rings = Math.max(1, Math.ceil(items.length / ITEMS_PER_RING));
    const lastStart = (rings - 1) * ITEMS_PER_RING;
    const lastCount = Math.max(1, Math.min(ITEMS_PER_RING, items.length - lastStart));
    const radius = getRingRadius(lastCount, rings - 1);
    container.closest('.apes-v2-radial')?.style.setProperty('--apes-radial-size', `${radius * 2 + 130}px`);
  }

  function injectRadialItem() {
    const container = document.getElementById('apes-v2-command-overlay')?.querySelector('.apes-v2-radial-items');
    if (!container) return;
    let item = container.querySelector(`[data-apes-action-id="${RADIAL_ACTION_ID}"]`);
    if (!enabled()) {
      if (item) { item.remove(); layoutRadialItems(container); }
      return;
    }
    if (!item) {
      item = document.createElement('div');
      item.className = 'apes-v2-radial-item';
      item.dataset.apesActionId = RADIAL_ACTION_ID;
      item.dataset.label = 'Resource Upgrade Planner';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.title = 'Resource Upgrade Planner';
      item.innerHTML = `<span class="apes-v2-radial-icon">${radialIcon()}</span><span class="apes-v2-radial-label">Resource Upgrade Planner</span>`;
      container.appendChild(item);
    }
    layoutRadialItems(container);
  }

  function registerRadialAction() {
    if (!APES?.actions?.register) return;
    try {
      APES.actions.register({
        id: RADIAL_ACTION_ID,
        label: 'Resource Upgrade Planner',
        description: 'Open Resource Upgrade Planner.',
        keywords: ['resources', 'fields', 'production', 'upgrade', 'planner', 'roadmap', 'queue'],
        group: 'Radial menu',
        enabled,
        run: openPlanner
      });
    } catch (error) {
      console.warn('[APES Resource Planner] radial action registration failed:', error);
    }
  }

  function currentVillageIdentity() {
    const contextName = clean(APES?.context?.getVillageName?.());
    const domName = clean(document.querySelector('.currentVillageName .dropdownHead .selectedItem .villageEntry, #villageList .dropdownHead .selectedItem .villageEntry')?.textContent);
    const villageName = contextName && contextName !== 'Unknown village' ? contextName : domName || 'Village';
    const hashId = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    const contextId = clean(APES?.context?.getVillageId?.());
    return {
      villageName,
      villageId: /^\d+$/.test(hashId || contextId) ? (hashId || contextId) : ''
    };
  }

  function newStepId() {
    return APES?.roadmapsStableIds?.newStepId?.() || `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function newRoadmapId() {
    return `custom_resources_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function checkpointStep(villageName) {
    return {
      id: newStepId(),
      type: 'instruction',
      text: `[Checkpoint] This Roadmap was made for ${villageName} - Make sure you're at the right village before starting`
    };
  }

  function importedStep(row) {
    if (row?.kind === 'building') {
      const meta = PRODUCTION_BUILDINGS[String(row.building || '')];
      if (!meta) return null;
      return {
        id: newStepId(),
        type: 'building',
        building: meta.label,
        buildingId: meta.id,
        level: Math.max(1, Number(row.toLevel) || 1),
        exact: true
      };
    }

    const resource = String(row?.resource || '').toLowerCase();
    const resourceLabel = RESOURCE_LABELS[resource];
    const fieldIndex = Number(row?.index);
    const level = Number(row?.toLevel);
    if (!resourceLabel || !Number.isInteger(fieldIndex) || fieldIndex < 0 || !Number.isInteger(level) || level < 1) return null;
    return {
      id: newStepId(),
      type: 'instruction',
      text: `${resourceLabel} Field #${fieldIndex + 1} → Level ${level}`
    };
  }

  function showToast(message, tone = 'success') {
    document.querySelector('.qol-rup-import-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rup-import-toast ${tone}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  async function importCurrentPlan(button) {
    const planner = window.APES_RESOURCE_UPGRADE_PLANNER;
    if (!planner?.calculate || !planner?.getState) {
      showToast('Resource Upgrade Planner data is unavailable.', 'error');
      return;
    }

    let plan;
    let plannerState;
    try {
      plan = planner.calculate();
      plannerState = planner.getState();
    } catch (error) {
      showToast(error?.message || 'Could not calculate the current resource plan.', 'error');
      return;
    }

    const selectedSteps = Math.max(1, Math.min(100, Number.parseInt(plannerState?.steps, 10) || 15));
    const rows = Array.isArray(plan?.results) ? plan.results.slice(0, selectedSteps) : [];
    if (!rows.length) {
      showToast('Calculate a resource plan before importing it.', 'error');
      return;
    }

    const identity = currentVillageIdentity();
    const villageName = identity.villageName || 'Village';
    const roadmapId = newRoadmapId();
    const imported = rows.map(importedStep).filter(Boolean);
    if (!imported.length) {
      showToast('No compatible resource steps were available to import.', 'error');
      return;
    }

    const custom = readJson(ROADMAP_CUSTOM_KEY, {});
    const roadmaps = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
    roadmaps[roadmapId] = {
      name: `${villageName} ${selectedSteps} Steps Resources Roadmap`,
      description: `Imported from APES Resource Upgrade Planner for ${villageName}. ${imported.length} calculated upgrades plus a starting checkpoint.`,
      steps: [checkpointStep(villageName), ...imported]
    };

    if (!writeJson(ROADMAP_CUSTOM_KEY, roadmaps)) {
      showToast('Could not save the imported Roadmap.', 'error');
      return;
    }

    try { localStorage.setItem(ROADMAP_SELECTED_KEY, roadmapId); } catch (_) {}
    APES?.roadmapsStableIds?.syncNow?.();
    APES?.roadmaps?.refresh?.();
    APES?.roadmapsEditor?.enhance?.();
    window.dispatchEvent(new CustomEvent('apes_roadmap_imported', {
      detail: { roadmapId, villageId: identity.villageId, villageName, selectedSteps, importedSteps: imported.length }
    }));

    if (button) {
      const original = button.textContent;
      button.textContent = 'Imported ✓';
      button.classList.add('success');
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = original;
        button.classList.remove('success');
      }, 1800);
    }
    showToast(`Imported “${villageName} ${selectedSteps} Steps Resources Roadmap”.`);
  }

  function injectImportStyles() {
    if (document.getElementById(IMPORT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = IMPORT_STYLE_ID;
    style.textContent = `
      #${PANEL_ID} .qol-rup-tabs [${IMPORT_BUTTON_ATTR}]{margin-left:auto!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;height:27px!important;padding:0 12px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8eb!important;font-size:8px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}
      #${PANEL_ID} .qol-rup-tabs [${IMPORT_BUTTON_ATTR}]:hover{filter:brightness(1.08)!important}
      #${PANEL_ID} .qol-rup-tabs [${IMPORT_BUTTON_ATTR}].success{border-color:#526f2f!important;background:linear-gradient(#6f963d,#55782d)!important}
      .qol-rup-import-toast{position:fixed!important;left:50%!important;bottom:28px!important;z-index:2147483647!important;transform:translateX(-50%)!important;max-width:min(620px,88vw)!important;padding:10px 14px!important;border:1px solid #526f2f!important;border-radius:5px!important;background:#5f812f!important;color:#fff!important;box-shadow:0 8px 24px rgba(0,0,0,.38)!important;font:700 10px Arial,sans-serif!important;text-align:center!important}
      .qol-rup-import-toast.error{border-color:#843d34!important;background:#9c493d!important}
    `;
    document.head.appendChild(style);
  }

  function injectImportButton() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel?.classList.contains('qol-open')) return;
    const results = panel.querySelector('[data-results].show');
    const tabs = results?.querySelector('.qol-rup-tabs');
    if (!tabs) return;

    // Clean up the retired Resource Planner-specific Roadmap view if an old DOM
    // survived a hot extension reload.
    results.querySelector('[data-view="roadmap"]')?.remove();
    tabs.querySelector('[data-tab="roadmap"]')?.remove();

    let button = tabs.querySelector(`[${IMPORT_BUTTON_ATTR}]`);
    if (button) return;
    button = document.createElement('div');
    button.setAttribute(IMPORT_BUTTON_ATTR, 'true');
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.textContent = 'Import to Roadmap';
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      void importCurrentPlan(button);
    };
    button.addEventListener('click', activate);
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    tabs.appendChild(button);
  }

  function sync() {
    scheduled = false;
    injectSettingsCard();
    injectCollapsedToolbarEntry();
    injectRadialItem();
    positionPlannerButton();
    injectImportStyles();
    injectImportButton();
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  registerRadialAction();
  const begin = () => {
    sync();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('hashchange', schedule);
    window.addEventListener('qol_setting_changed', schedule);
    window.setTimeout(schedule, 250);
    window.setTimeout(schedule, 1000);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
  else begin();
})();