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
  const TOOLBAR_ITEM = Object.freeze({
    id: 'qol-roadmaps-toggle-btn',
    label: 'Roadmaps',
    key: FEATURE_KEY
  });
  const LEGACY_FEATURE_ID = 'qol-chk-checklists';
  const LEGACY_TOOLBAR_ID = 'qol-checklist-toggle-btn';
  const LEGACY_KEY = 'checklists';
  const OFFICIAL_MARKER = 'qolOfficialRoadmaps';

  let launcherInstallTimer = null;
  let commandObserver = null;
  let initialized = false;

  function migratePreference() {
    try {
      if (localStorage.getItem('qol_roadmaps') === null) {
        const legacy = localStorage.getItem('qol_checklists');
        if (legacy === 'true' || legacy === 'false') localStorage.setItem('qol_roadmaps', legacy);
      }
      const enabled = localStorage.getItem('qol_roadmaps');
      if (enabled === 'true' || enabled === 'false') localStorage.setItem('qol_checklists', enabled);
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
        else BASIC_FEATURES.splice(targetIndex, 0, { ...FEATURE });
      }
    } catch (error) {
      console.warn('[APES Roadmaps] Could not replace Checklists in Basic Features.', error);
    }

    try {
      if (typeof TOOLBAR_ITEMS !== 'undefined' && Array.isArray(TOOLBAR_ITEMS)) {
        const oldIndex = TOOLBAR_ITEMS.findIndex(item => item?.key === LEGACY_KEY || item?.id === LEGACY_TOOLBAR_ID);
        const existingIndex = TOOLBAR_ITEMS.findIndex(item => item?.key === FEATURE_KEY || item?.id === TOOLBAR_ITEM.id);
        if (existingIndex >= 0 && existingIndex !== oldIndex) TOOLBAR_ITEMS.splice(existingIndex, 1);
        const targetIndex = oldIndex >= 0 ? oldIndex : Math.min(3, TOOLBAR_ITEMS.length);
        if (oldIndex >= 0) TOOLBAR_ITEMS.splice(oldIndex, 1, { ...TOOLBAR_ITEM });
        else TOOLBAR_ITEMS.splice(targetIndex, 0, { ...TOOLBAR_ITEM });
      }
    } catch (error) {
      console.warn('[APES Roadmaps] Could not register Roadmaps in the toolbar.', error);
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
      console.warn('[APES Roadmaps] Could not update menu preference registry.', error);
    }
  }

  function rebuildSettingsShell() {
    document.getElementById(LEGACY_TOOLBAR_ID)?.remove();
    document.getElementById('qol-toolbar-dropdown')?.remove();
    document.getElementById('qol-modal-overlay')?.remove();
    try {
      if (typeof setupQolMenu === 'function') setupQolMenu();
    } catch (error) {
      console.warn('[APES Roadmaps] Could not rebuild APES Settings after migration.', error);
    }
  }

  function makeOfficialLauncher(oldLauncher) {
    const launcher = document.createElement('div');
    launcher.id = TOOLBAR_ITEM.id;
    launcher.className = 'qol-rm-launcher qol-rm-official-toolbar';
    launcher.dataset[OFFICIAL_MARKER] = '1';
    launcher.setAttribute('role', 'button');
    launcher.setAttribute('tabindex', '0');
    launcher.setAttribute('aria-label', 'Open Roadmaps');
    launcher.title = 'Roadmaps';
    launcher.innerHTML = '<span aria-hidden="true">↪</span>';

    const activate = event => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (typeof window.isQolEnabled === 'function' && !window.isQolEnabled(FEATURE_KEY)) return;
      window.APES?.roadmaps?.toggle?.(event);
    };
    launcher.addEventListener('click', activate);
    launcher.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      activate(event);
    });

    if (oldLauncher?.isConnected) oldLauncher.replaceWith(launcher);
    else document.body.appendChild(launcher);
    return launcher;
  }

  function installOfficialLauncher() {
    if (!window.APES?.roadmaps?.toggle) return false;
    const current = document.getElementById(TOOLBAR_ITEM.id);
    if (current?.dataset?.[OFFICIAL_MARKER] === '1') {
      window.qolRepositionAllButtons?.();
      return true;
    }

    // Replacing the temporary launcher deliberately leaves Roadmaps' original
    // positioning observer attached to the now-detached node. The new launcher
    // is owned exclusively by the APES toolbar positioning system.
    makeOfficialLauncher(current);
    window.qolRepositionAllButtons?.();
    return true;
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
        enabled: () => typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true,
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
      if (label) label.textContent = 'Roadmaps';
      const icon = item.querySelector('.apes-v2-radial-icon');
      if (icon) icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h11a3 3 0 0 1 3 3v11H8a3 3 0 0 1-3-3z"/><path d="M8 8h7M8 12h7M8 16h4"/><path d="M5 5v11a3 3 0 0 0 3 3"/></svg>';
    });
  }

  function watchCommandPalette() {
    registerCommandPaletteAction();
    if (commandObserver) return;
    commandObserver = new MutationObserver(enhanceCommandPalette);
    commandObserver.observe(document.documentElement, { childList: true, subtree: true });
    enhanceCommandPalette();
  }

  function enforceFeatureState() {
    const enabled = typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY);
    mirrorLegacyPreference(enabled);
    if (!enabled) {
      window.APES?.roadmaps?.close?.();
      window.APES?.roadmapsRunner?.close?.();
      window.APES?.roadmapsTracking?.setCurrent?.(false);
    }
    window.qolRepositionAllButtons?.();
    enhanceCommandPalette();
  }

  function updateLegacyCopy() {
    const overlay = document.getElementById('qol-modal-overlay');
    const cacheBody = overlay?.querySelector('.qol-cache-dialog-body');
    if (cacheBody && cacheBody.innerHTML.includes('checklist data')) {
      cacheBody.innerHTML = cacheBody.innerHTML.replace('Saved watchlists, checklist data, scanner results and archived reports', 'Saved watchlists, Roadmap data, legacy checklist backups, scanner results and archived reports');
    }
  }

  function init() {
    if (initialized) return;
    initialized = true;
    migratePreference();
    patchFeatureRegistries();
    rebuildSettingsShell();
    updateLegacyCopy();
    watchCommandPalette();

    launcherInstallTimer = setInterval(() => {
      if (!installOfficialLauncher()) return;
      clearInterval(launcherInstallTimer);
      launcherInstallTimer = null;
      enforceFeatureState();
    }, 50);

    window.addEventListener('qol_setting_changed', event => {
      if (event.detail?.key !== FEATURE_KEY) return;
      enforceFeatureState();
    });
    window.addEventListener('hashchange', () => {
      if (typeof window.isQolEnabled === 'function' && !window.isQolEnabled(FEATURE_KEY)) {
        window.APES?.roadmapsTracking?.setCurrent?.(false);
      }
    });

    setTimeout(() => {
      installOfficialLauncher();
      registerCommandPaletteAction();
      enhanceCommandPalette();
      updateLegacyCopy();
      enforceFeatureState();
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
