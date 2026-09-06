(() => {
  'use strict';

  const FEATURE_KEY = 'roadmaps';
  const FEATURE = Object.freeze({
    id: 'qol-chk-roadmaps',
    key: FEATURE_KEY,
    name: 'Roadmaps',
    icon: '↪',
    description: 'Create, share and follow step-by-step village development guides with manual or automatic progress tracking.'
  });

  const LEGACY_FEATURE_ID = 'qol-chk-checklists';
  const LEGACY_TOOLBAR_ID = 'qol-checklist-toggle-btn';
  const STANDALONE_ROADMAP_ID = 'qol-roadmaps-toggle-btn';
  const LEGACY_KEY = 'checklists';
  const RESPONSIVE_MENU_ID = 'qol-responsive-toolbar-menu';

  let commandObserver = null;
  let toolbarObserver = null;
  let initialized = false;

  function roadmapsEnabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }

  function migratePreference() {
    try {
      if (localStorage.getItem('qol_roadmaps') === null) {
        const legacy = localStorage.getItem('qol_checklists');
        if (legacy === 'true' || legacy === 'false') localStorage.setItem('qol_roadmaps', legacy);
      }
      mirrorLegacyPreference(roadmapsEnabled());
    } catch (_) {}
  }

  function mirrorLegacyPreference(enabled) {
    try {
      localStorage.setItem('qol_checklists', enabled ? 'true' : 'false');
    } catch (_) {}
  }

  function patchFeatureRegistries() {
    try {
      if (typeof BASIC_FEATURES !== 'undefined' && Array.isArray(BASIC_FEATURES)) {
        const oldIndex = BASIC_FEATURES.findIndex(item => item?.key === LEGACY_KEY || item?.id === LEGACY_FEATURE_ID);
        const existingIndex = BASIC_FEATURES.findIndex(item => item?.key === FEATURE_KEY || item?.id === FEATURE.id);
        if (existingIndex >= 0 && existingIndex !== oldIndex) BASIC_FEATURES.splice(existingIndex, 1);
        const targetIndex = oldIndex >= 0 ? oldIndex : Math.min(1, BASIC_FEATURES.length);
        if (oldIndex >= 0) BASIC_FEATURES.splice(oldIndex, 1, { ...FEATURE });
        else if (existingIndex < 0) BASIC_FEATURES.splice(targetIndex, 0, { ...FEATURE });
      }
    } catch (error) {
      console.warn('[APES Roadmaps] Could not replace Checklists in Basic Features.', error);
    }

    try {
      if (typeof TOOLBAR_ITEMS !== 'undefined' && Array.isArray(TOOLBAR_ITEMS)) {
        const oldIndex = TOOLBAR_ITEMS.findIndex(item => item?.key === LEGACY_KEY || item?.id === LEGACY_TOOLBAR_ID);
        const replacement = { id: LEGACY_TOOLBAR_ID, label: 'Roadmaps', key: FEATURE_KEY };
        if (oldIndex >= 0) TOOLBAR_ITEMS.splice(oldIndex, 1, replacement);
        else if (!TOOLBAR_ITEMS.some(item => item?.key === FEATURE_KEY)) TOOLBAR_ITEMS.splice(Math.min(3, TOOLBAR_ITEMS.length), 0, replacement);
      }
    } catch (error) {
      console.warn('[APES Roadmaps] Could not update fallback toolbar registry.', error);
    }

    try {
      if (typeof menuConfigMap !== 'undefined' && menuConfigMap && typeof menuConfigMap === 'object') {
        delete menuConfigMap[LEGACY_FEATURE_ID];
        menuConfigMap[FEATURE.id] = FEATURE_KEY;
      }
      if (typeof QOL_PREFERENCE_STORAGE_KEYS !== 'undefined' && QOL_PREFERENCE_STORAGE_KEYS?.add) {
        QOL_PREFERENCE_STORAGE_KEYS.add('qol_roadmaps');
      }
    } catch (error) {
      console.warn('[APES Roadmaps] Could not update Settings preference registry.', error);
    }
  }

  function rebuildSettingsIfNeeded() {
    const overlay = document.getElementById('qol-modal-overlay');
    const legacyCard = overlay?.querySelector('[data-feature-key="checklists"], #qol-chk-checklists');
    if (!legacyCard) return;

    overlay.remove();
    document.getElementById('qol-toolbar-dropdown')?.remove();
    try {
      if (typeof setupQolMenu === 'function') setupQolMenu();
    } catch (error) {
      console.warn('[APES Roadmaps] Could not refresh APES Settings.', error);
    }
  }

  function activateRoadmaps(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!roadmapsEnabled()) return;
    window.APES?.roadmaps?.toggle?.(event);
  }

  function createToolbarBridgeSource() {
    let source = document.getElementById(LEGACY_TOOLBAR_ID);
    if (source?.dataset?.qolRoadmapsBridge === '1') return source;
    source?.remove();

    source = document.createElement('div');
    source.id = LEGACY_TOOLBAR_ID;
    source.dataset.qolRoadmapsBridge = '1';
    source.className = 'qol-roadmaps-toolbar-source';
    source.title = 'Roadmaps';
    source.setAttribute('role', 'button');
    source.setAttribute('tabindex', '0');
    source.setAttribute('aria-label', 'Open Roadmaps');
    source.innerHTML = '<span aria-hidden="true">↪</span>';

    source.addEventListener('click', activateRoadmaps);
    source.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      activateRoadmaps(event);
    });
    document.body.appendChild(source);
    return source;
  }

  function detachStandaloneLauncher() {
    document.getElementById(STANDALONE_ROADMAP_ID)?.remove();
  }

  function enhanceResponsiveToolbarMenu() {
    const menu = document.getElementById(RESPONSIVE_MENU_ID);
    if (!menu) return;
    const entry = menu.querySelector(`[data-qol-source-id="${LEGACY_TOOLBAR_ID}"]`);
    if (!entry) return;
    const label = entry.querySelector('span');
    if (label && label.textContent !== 'Roadmaps') label.textContent = 'Roadmaps';
    if (entry.getAttribute('aria-label') !== 'Roadmaps') entry.setAttribute('aria-label', 'Roadmaps');
    if (entry.title !== 'Roadmaps') entry.title = 'Roadmaps';
  }

  function installToolbarBridge() {
    if (!window.APES?.roadmaps?.toggle) return false;
    detachStandaloneLauncher();
    createToolbarBridgeSource();
    mirrorLegacyPreference(roadmapsEnabled());
    window.qolRefreshToolbar?.();
    window.qolRepositionAllButtons?.();
    enhanceResponsiveToolbarMenu();
    return true;
  }

  function watchToolbar() {
    if (toolbarObserver) return;
    toolbarObserver = new MutationObserver(() => {
      if (!document.getElementById(LEGACY_TOOLBAR_ID)) createToolbarBridgeSource();
      detachStandaloneLauncher();
      enhanceResponsiveToolbarMenu();
    });
    toolbarObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function registerCommandPaletteAction() {
    try {
      const actions = window.APES?.actions;
      if (!actions?.register) return;
      actions.register({
        id: 'roadmaps.open',
        label: 'Roadmaps',
        description: 'Open Roadmaps.',
        keywords: ['Roadmaps', 'roadmaps', 'guides', 'checklists'],
        group: 'Radial menu',
        enabled: roadmapsEnabled,
        run: () => window.APES?.roadmaps?.open?.()
      });
    } catch (_) {}
  }

  function enhanceCommandPalette() {
    const overlay = document.getElementById('apes-v2-command-overlay');
    if (!overlay) return;
    overlay.querySelectorAll('[data-apes-action-id="checklists.open"]').forEach(item => {
      item.dataset.apesActionId = 'roadmaps.open';
      item.dataset.label = 'Roadmaps';
      item.title = 'Roadmaps';
      const label = item.querySelector('.apes-v2-radial-label');
      if (label && label.textContent !== 'Roadmaps') label.textContent = 'Roadmaps';
      const icon = item.querySelector('.apes-v2-radial-icon');
      const roadmapIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h11a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3z"/><path d="M8 8h7M8 12h7M8 16h4"/><path d="M5 5v11a3 3 0 0 0 3 3"/></svg>';
      if (icon && icon.innerHTML !== roadmapIcon) icon.innerHTML = roadmapIcon;
    });
  }

  function watchCommandPalette() {
    registerCommandPaletteAction();
    if (commandObserver) return;
    commandObserver = new MutationObserver(enhanceCommandPalette);
    commandObserver.observe(document.documentElement, { childList: true, subtree: true });
    enhanceCommandPalette();
  }

  function updateStorageCopy() {
    const overlay = document.getElementById('qol-modal-overlay');
    const cacheBody = overlay?.querySelector('.qol-cache-dialog-body');
    if (!cacheBody) return;
    const current = cacheBody.innerHTML;
    const updated = current.replace('Saved watchlists, checklist data, scanner results and archived reports', 'Saved watchlists, Roadmap data, legacy checklist backups, scanner results and archived reports');
    if (updated !== current) cacheBody.innerHTML = updated;
  }

  function enforceFeatureState() {
    const enabled = roadmapsEnabled();
    mirrorLegacyPreference(enabled);
    if (!enabled) {
      window.APES?.roadmaps?.close?.();
      window.APES?.roadmapsRunner?.close?.();
      window.APES?.roadmapsTracking?.setCurrent?.(false);
    }
    installToolbarBridge();
    window.qolRefreshToolbar?.();
    enhanceResponsiveToolbarMenu();
    enhanceCommandPalette();
  }

  function init() {
    if (initialized) return;
    initialized = true;

    migratePreference();
    patchFeatureRegistries();
    rebuildSettingsIfNeeded();
    updateStorageCopy();
    watchCommandPalette();
    watchToolbar();

    const installer = setInterval(() => {
      if (!installToolbarBridge()) return;
      clearInterval(installer);
      enforceFeatureState();
    }, 50);

    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key !== FEATURE_KEY) return;
      enforceFeatureState();
    });

    window.addEventListener('hashchange', () => {
      if (!roadmapsEnabled()) window.APES?.roadmapsTracking?.setCurrent?.(false);
      installToolbarBridge();
    });

    setTimeout(() => {
      installToolbarBridge();
      updateStorageCopy();
      registerCommandPaletteAction();
      enhanceCommandPalette();
      enforceFeatureState();
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
