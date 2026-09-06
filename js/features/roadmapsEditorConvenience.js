(() => {
  'use strict';

  const DIALOG_ID = 'qol-roadmaps-dialog-layer';
  const CUSTOM_STORAGE_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_STORAGE_KEY = 'qol_roadmap_selected_v1';
  const LAST_BUILDING_KEY = 'qol_roadmap_last_building_v1';
  const AUGMENTED_ATTR = 'data-rmec-augmented';

  const BUILDING_META = Object.freeze({
    'Academy': { id: 22, max: 20 },
    'Bakery': { id: 9, max: 5 },
    'Barracks': { id: 19, max: 20 },
    'Brickyard': { id: 6, max: 5 },
    'Brewery': { id: null, max: 20 },
    'Cranny': { id: 23, max: 10, repeatable: true },
    'Embassy': { id: 18, max: 20 },
    'Grain Mill': { id: 8, max: 5 },
    'Granary': { id: 11, max: 20 },
    'Great Barracks': { id: null, max: 20 },
    'Great Granary': { id: null, max: 20 },
    'Great Stable': { id: null, max: 20 },
    'Great Warehouse': { id: null, max: 20 },
    'Horse Drinking Trough': { id: null, max: 20 },
    'Iron Foundry': { id: 7, max: 5 },
    'Main Building': { id: 15, max: 20 },
    'Marketplace': { id: 17, max: 20 },
    'Palace': { id: 26, max: 20 },
    'Rally Point': { id: 16, max: 20 },
    'Residence': { id: 25, max: 20 },
    'Sawmill': { id: 5, max: 5 },
    'Smithy': { id: 12, max: 20 },
    'Stable': { id: 20, max: 20 },
    'Stonemason': { id: null, max: 20 },
    'Tournament Square': { id: null, max: 20 },
    'Trade Office': { id: 28, max: 20 },
    'Trapper': { id: null, max: 20 },
    'Treasury': { id: 27, max: 20 },
    'Tribe Wall': { id: null, max: 20, tribeWall: true },
    'Town Hall': { id: 24, max: 20 },
    'Warehouse': { id: 10, max: 20 },
    'Wonder of the World': { id: null, max: 100 },
    'Workshop': { id: 21, max: 20 }
  });

  let observer = null;
  let queued = false;

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
    } catch (_) {
      return false;
    }
  }

  function getSelectedRoadmapId() {
    try {
      return clean(localStorage.getItem(SELECTED_STORAGE_KEY));
    } catch (_) {
      return '';
    }
  }

  function getLastBuilding() {
    try {
      const name = clean(localStorage.getItem(LAST_BUILDING_KEY));
      return BUILDING_META[name] ? name : '';
    } catch (_) {
      return '';
    }
  }

  function rememberBuilding(name) {
    if (!BUILDING_META[name]) return;
    try {
      localStorage.setItem(LAST_BUILDING_KEY, name);
    } catch (_) {}
  }

  function currentBuilding(dialog) {
    return clean(dialog.querySelector('[data-building-picker]')?.dataset.value);
  }

  function currentInstance(dialog, buildingName) {
    if (!BUILDING_META[buildingName]?.repeatable) return 0;
    return Math.max(1, Math.min(20, Number(dialog.querySelector('[data-instance]')?.value) || 1));
  }

  function previousLevel(steps, buildingName, instance) {
    let highest = 0;
    for (const step of steps || []) {
      if (!step || step.type !== 'building' || clean(step.building) !== buildingName) continue;
      if (BUILDING_META[buildingName]?.repeatable && Number(step.instance || 1) !== Number(instance || 1)) continue;
      highest = Math.max(highest, Number(step.level) || 0);
    }
    return highest;
  }

  function createStep(buildingName, level, instance) {
    const meta = BUILDING_META[buildingName] || { id: null, max: 20 };
    return {
      type: 'building',
      building: buildingName,
      buildingId: meta.id,
      level,
      exact: true,
      ...(meta.repeatable ? { instance: Math.max(1, Number(instance) || 1) } : {}),
      ...(meta.tribeWall ? { tribeWall: true } : {})
    };
  }

  function showToast(message) {
    document.querySelector('.qol-rme-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'qol-rme-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function refreshHub() {
    window.APES?.roadmaps?.open?.();
  }

  function restoreLastBuilding(dialog) {
    const last = getLastBuilding();
    if (!last) return;
    const picker = dialog.querySelector('[data-building-picker]');
    if (!picker || clean(picker.dataset.value) === last) return;
    const option = [...dialog.querySelectorAll('[data-building-option]')]
      .find(item => clean(item.dataset.buildingOption) === last);
    option?.click();
  }

  function syncRange(dialog) {
    const buildingName = currentBuilding(dialog);
    const meta = BUILDING_META[buildingName];
    const targetInput = dialog.querySelector('[data-rmec-target]');
    const summary = dialog.querySelector('[data-rmec-summary]');
    const confirm = dialog.querySelector('[data-rme-confirm]');
    if (!meta || !targetInput || !summary || !confirm) return;

    const custom = readJson(CUSTOM_STORAGE_KEY, {});
    const roadmap = custom?.[getSelectedRoadmapId()];
    const instance = currentInstance(dialog, buildingName);
    const previous = previousLevel(roadmap?.steps, buildingName, instance);
    const next = Math.min(meta.max, previous + 1);

    targetInput.min = String(next);
    targetInput.max = String(meta.max);
    let target = Number(targetInput.value);
    if (!Number.isFinite(target) || target < next || target > meta.max) {
      target = next;
      targetInput.value = String(target);
    }

    const count = Math.max(1, target - next + 1);
    summary.textContent = count === 1
      ? `Adds ${buildingName}${meta.repeatable ? ` #${instance}` : ''} → Level ${next}.`
      : `Adds ${count} separate steps: Level ${next} through Level ${target}.`;
    confirm.textContent = count === 1 ? 'Add Step' : `Add ${count} Steps`;
  }

  function batchAdd(dialog, event) {
    const buildingName = currentBuilding(dialog);
    const meta = BUILDING_META[buildingName];
    const targetInput = dialog.querySelector('[data-rmec-target]');
    if (!meta || !targetInput) return false;

    const custom = readJson(CUSTOM_STORAGE_KEY, {});
    const roadmapId = getSelectedRoadmapId();
    const roadmap = custom?.[roadmapId];
    if (!roadmap || !Array.isArray(roadmap.steps)) return false;

    const instance = currentInstance(dialog, buildingName);
    const previous = previousLevel(roadmap.steps, buildingName, instance);
    const next = previous + 1;
    const target = Math.max(next, Math.min(meta.max, Number(targetInput.value) || next));
    if (target <= next) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    for (let level = next; level <= target; level += 1) {
      roadmap.steps.push(createStep(buildingName, level, instance));
    }

    if (!writeJson(CUSTOM_STORAGE_KEY, custom)) return true;
    rememberBuilding(buildingName);
    dialog.remove();
    refreshHub();
    showToast(`${buildingName} Levels ${next}–${target} added as ${target - next + 1} steps.`);
    return true;
  }

  function augment(dialog) {
    if (!dialog || dialog.getAttribute(AUGMENTED_ATTR) === '1') return;
    const heading = clean(dialog.querySelector('.qol-rm-dialog-head')?.textContent);
    if (heading !== 'Add Building Step') return;
    dialog.setAttribute(AUGMENTED_ATTR, '1');

    const sequenceNote = dialog.querySelector('[data-sequence-note]');
    if (!sequenceNote) return;

    const range = document.createElement('div');
    range.className = 'qol-rmec-range';
    range.innerHTML = `
      <div class="qol-rmec-range-field">
        <label for="qol-rmec-target">Build through level</label>
        <input id="qol-rmec-target" data-rmec-target type="number" min="1" value="1">
      </div>
      <div class="qol-rmec-range-copy">
        <strong>Bulk add</strong>
        <small data-rmec-summary>Each upgrade remains a separate roadmap step.</small>
      </div>`;
    sequenceNote.insertAdjacentElement('afterend', range);

    restoreLastBuilding(dialog);
    syncRange(dialog);

    dialog.addEventListener('click', event => {
      const option = event.target.closest('[data-building-option]');
      if (option) {
        rememberBuilding(clean(option.dataset.buildingOption));
        requestAnimationFrame(() => syncRange(dialog));
      }
    }, true);

    dialog.querySelector('[data-instance]')?.addEventListener('input', () => syncRange(dialog));
    dialog.querySelector('[data-rmec-target]')?.addEventListener('input', () => syncRange(dialog));

    const levelObserver = new MutationObserver(() => syncRange(dialog));
    const nextLabel = dialog.querySelector('[data-next-level]');
    if (nextLabel) levelObserver.observe(nextLabel, { childList: true, characterData: true, subtree: true });

    dialog.addEventListener('click', event => {
      const confirm = event.target.closest('[data-rme-confirm]');
      if (!confirm) return;
      const buildingName = currentBuilding(dialog);
      rememberBuilding(buildingName);
      batchAdd(dialog, event);
    }, true);
  }

  function scan() {
    queued = false;
    const dialog = document.getElementById(DIALOG_ID);
    if (dialog) augment(dialog);
  }

  function scheduleScan() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  }

  function init() {
    observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleScan();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
