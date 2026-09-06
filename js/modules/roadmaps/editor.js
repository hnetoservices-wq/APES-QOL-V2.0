(() => {
  'use strict';

  const CUSTOM_STORAGE_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_STORAGE_KEY = 'qol_roadmap_selected_v1';
  const PANEL_ID = 'qol-roadmaps-container';
  const DIALOG_ID = 'qol-roadmaps-dialog-layer';

  const BUILDINGS = [
    ['Warehouse', 10, 20],
    ['Granary', 11, 20],
    ['Main Building', 15, 20],
    ['Rally Point', 16, 20],
    ['Marketplace', 17, 20],
    ['Embassy', 18, 20],
    ['Barracks', 19, 20],
    ['Stable', 20, 20],
    ['Workshop', 21, 20],
    ['Academy', 22, 20],
    ['Cranny', 23, 10, true],
    ['Town Hall', 24, 20],
    ['Residence', 25, 20],
    ['Palace', 26, 20],
    ['Treasury', 27, 20],
    ['Trade Office', 28, 20],
    ['Sawmill', 5, 5],
    ['Brickyard', 6, 5],
    ['Iron Foundry', 7, 5],
    ['Grain Mill', 8, 5],
    ['Bakery', 9, 5],
    ['Smithy', 12, 20],
    ['Tribe Wall', null, 20, false, true],
    ['Tournament Square', null, 20],
    ['Stonemason', null, 20],
    ['Trapper', null, 20],
    ['Brewery', null, 20],
    ['Horse Drinking Trough', null, 20],
    ['Great Barracks', null, 20],
    ['Great Stable', null, 20],
    ['Great Warehouse', null, 20],
    ['Great Granary', null, 20],
    ['Wonder of the World', null, 100]
  ].map(([name, id, max, repeatable = false, tribeWall = false]) => ({ name, id, max, repeatable, tribeWall }));

  let panelObserver = null;
  let rootObserver = null;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalized(value) {
    return clean(value).toLocaleLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function readCustomRoadmaps() {
    try {
      const value = JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (_) {
      return {};
    }
  }

  function writeCustomRoadmaps(custom) {
    try {
      localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(custom));
      return true;
    } catch (error) {
      console.warn('[APES Roadmaps Editor] Save failed.', error);
      return false;
    }
  }

  function selectedId() {
    try {
      return clean(localStorage.getItem(SELECTED_STORAGE_KEY));
    } catch (_) {
      return '';
    }
  }

  function setSelectedId(id) {
    try {
      localStorage.setItem(SELECTED_STORAGE_KEY, id);
    } catch (_) {}
  }

  function catalogEntry(name) {
    return BUILDINGS.find(item => normalized(item.name) === normalized(name)) || BUILDINGS[0];
  }

  function buildingIdentity(name, instance = 0) {
    const building = catalogEntry(name);
    const resolvedInstance = building.repeatable ? Math.max(1, Number(instance) || 1) : 0;
    return `${normalized(building.name)}::${resolvedInstance}`;
  }

  function normalizeStoredBuildingStep(step) {
    if (!step || step.type !== 'building') return false;
    const building = catalogEntry(step.building);
    const previous = JSON.stringify(step);
    step.building = building.name;
    step.buildingId = building.id;
    step.level = Math.max(1, Math.min(building.max, Number(step.level) || 1));
    if (building.repeatable) step.instance = Math.max(1, Math.min(20, Number(step.instance) || 1));
    else delete step.instance;
    if (building.tribeWall) step.tribeWall = true;
    else delete step.tribeWall;
    return previous !== JSON.stringify(step);
  }

  function repairRoadmapSequences(roadmap) {
    if (!roadmap || !Array.isArray(roadmap.steps)) return false;
    let changed = false;
    const firstLevelByIdentity = new Map();

    roadmap.steps.forEach(step => {
      if (!step || step.type !== 'building') return;
      if (normalizeStoredBuildingStep(step)) changed = true;
      const key = buildingIdentity(step.building, step.instance);
      if (!firstLevelByIdentity.has(key)) firstLevelByIdentity.set(key, Number(step.level) || 1);
    });

    const lastLevelByIdentity = new Map();
    roadmap.steps.forEach(step => {
      if (!step || step.type !== 'building') return;
      const building = catalogEntry(step.building);
      const key = buildingIdentity(step.building, step.instance);
      const firstLevel = firstLevelByIdentity.get(key) || 1;
      const lastLevel = lastLevelByIdentity.get(key) || 0;

      // A chain beginning at level 1 is an exact roadmap chain. This also repairs
      // Stage 2 data created before sequence enforcement (e.g. 1,2,1,1 -> 1,2,3,4).
      if (firstLevel === 1) {
        const expected = Math.min(building.max, lastLevel + 1);
        if (step.level !== expected || step.exact !== true) changed = true;
        step.level = expected;
        step.exact = true;
        lastLevelByIdentity.set(key, expected);
        return;
      }

      // Legacy target-style steps are preserved. Any exact step appended after them
      // continues from the highest earlier target rather than rewriting the legacy route.
      if (step.exact === true) {
        const expected = Math.min(building.max, lastLevel + 1);
        if (step.level !== expected) changed = true;
        step.level = expected;
        lastLevelByIdentity.set(key, expected);
      } else {
        lastLevelByIdentity.set(key, Math.max(lastLevel, Number(step.level) || 1));
      }
    });

    return changed;
  }

  function prepareCustomRoadmaps() {
    const custom = readCustomRoadmaps();
    let changed = false;
    Object.values(custom).forEach(roadmap => {
      if (repairRoadmapSequences(roadmap)) changed = true;
    });
    if (changed) writeCustomRoadmaps(custom);
    return custom;
  }

  function editorState() {
    const custom = prepareCustomRoadmaps();
    const id = selectedId();
    return { id, custom, roadmap: custom[id] || null };
  }

  function refreshHub() {
    if (typeof window.APES?.roadmaps?.refresh === 'function') window.APES.roadmaps.refresh();
    else window.APES?.roadmaps?.open?.();
    requestAnimationFrame(enhance);
  }

  function showToast(message, type = 'success') {
    document.querySelector('.qol-rme-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rme-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove();
  }

  function wireButton(element, handler) {
    if (!element || element.dataset.rmeBound === '1') return;
    element.dataset.rmeBound = '1';
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    });
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    });
  }

  function createDialog(title, bodyHtml, confirmLabel = 'Save') {
    closeDialog();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rm-dialog qol-rme-dialog" role="dialog" aria-modal="true">
        <div class="qol-rm-dialog-head">${escapeHtml(title)}</div>
        <div class="qol-rm-dialog-body">
          ${bodyHtml}
          <div class="qol-rm-dialog-status" aria-live="polite"></div>
        </div>
        <div class="qol-rm-dialog-actions">
          <div class="qol-rm-action qol-secondary" data-rme-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rm-action" data-rme-confirm role="button" tabindex="0">${escapeHtml(confirmLabel)}</div>
        </div>
      </div>`;
    document.body.appendChild(layer);
    wireButton(layer.querySelector('[data-rme-cancel]'), closeDialog);
    layer.addEventListener('pointerdown', event => {
      if (event.target === layer) closeDialog();
    });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeDialog();
      }
    });
    return layer;
  }

  function openDetailsEditor(create = false) {
    const state = editorState();
    const source = create ? { name: '', description: '' } : state.roadmap;
    if (!source) return;

    const layer = createDialog(
      create ? 'Create Roadmap' : 'Edit Roadmap Details',
      `<label for="qol-rme-name">Name</label>
       <input id="qol-rme-name" data-name maxlength="90">
       <label for="qol-rme-description">Description</label>
       <textarea id="qol-rme-description" data-description rows="4" maxlength="500"></textarea>`,
      create ? 'Create Roadmap' : 'Save Changes'
    );

    const nameInput = layer.querySelector('[data-name]');
    const descriptionInput = layer.querySelector('[data-description]');
    const status = layer.querySelector('.qol-rm-dialog-status');
    nameInput.value = source.name || '';
    descriptionInput.value = source.description || '';

    const save = () => {
      const name = clean(nameInput.value);
      if (!name) {
        status.textContent = 'Enter a roadmap name.';
        nameInput.focus();
        return;
      }

      const custom = prepareCustomRoadmaps();
      if (create) {
        const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        custom[id] = { name, description: clean(descriptionInput.value), steps: [] };
        writeCustomRoadmaps(custom);
        setSelectedId(id);
      } else {
        if (!custom[state.id]) return;
        custom[state.id].name = name;
        custom[state.id].description = clean(descriptionInput.value);
        writeCustomRoadmaps(custom);
      }

      closeDialog();
      refreshHub();
      showToast(create ? 'Roadmap created.' : 'Roadmap updated.');
    };

    wireButton(layer.querySelector('[data-rme-confirm]'), save);
    nameInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      save();
    });
    nameInput.focus();
    if (!create) nameInput.select();
  }

  function buildingPickerHtml(selectedName) {
    const selected = catalogEntry(selectedName);
    return `
      <div class="qol-rme-picker-shell">
        <div class="qol-rme-picker" data-building-picker data-value="${escapeHtml(selected.name)}" role="button" tabindex="0" aria-expanded="false">
          <span data-building-label>${escapeHtml(selected.name)}</span><span class="qol-rme-picker-arrow">▾</span>
        </div>
        <div class="qol-rme-picker-menu" data-building-menu>
          ${BUILDINGS.map(building => `<div class="qol-rme-picker-option${building.name === selected.name ? ' active' : ''}" data-building-option="${escapeHtml(building.name)}" role="button" tabindex="0">${escapeHtml(building.name)}<span>Lv ${building.max}</span></div>`).join('')}
        </div>
      </div>`;
  }

  function bindBuildingPicker(layer, initialName, onChange) {
    const picker = layer.querySelector('[data-building-picker]');
    const menu = layer.querySelector('[data-building-menu]');
    const label = layer.querySelector('[data-building-label]');
    if (!picker || !menu || !label) return;

    const setOpen = open => {
      picker.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('open', open);
    };

    const select = name => {
      const building = catalogEntry(name);
      picker.dataset.value = building.name;
      label.textContent = building.name;
      menu.querySelectorAll('[data-building-option]').forEach(option => option.classList.toggle('active', option.dataset.buildingOption === building.name));
      setOpen(false);
      onChange?.(building);
    };

    picker.dataset.value = catalogEntry(initialName).name;
    wireButton(picker, () => setOpen(picker.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('[data-building-option]').forEach(option => {
      wireButton(option, () => select(option.dataset.buildingOption));
    });

    layer.addEventListener('pointerdown', event => {
      if (!event.target.closest('.qol-rme-picker-shell')) setOpen(false);
    });
  }

  function previousLevel(steps, buildingName, instance, beforeIndex) {
    const key = buildingIdentity(buildingName, instance);
    let level = 0;
    for (let index = 0; index < Math.min(beforeIndex, steps.length); index += 1) {
      const step = steps[index];
      if (!step || step.type !== 'building') continue;
      if (buildingIdentity(step.building, step.instance) !== key) continue;
      level = Math.max(level, Number(step.level) || 0);
    }
    return level;
  }

  function makeExactBuildingStep(building, level, instance) {
    return {
      type: 'building',
      building: building.name,
      buildingId: building.id,
      level,
      exact: true,
      ...(building.repeatable ? { instance: Math.max(1, Number(instance) || 1) } : {}),
      ...(building.tribeWall ? { tribeWall: true } : {})
    };
  }

  function openBuildingEditor(stepIndex = null) {
    const state = editorState();
    if (!state.roadmap) return;

    const editing = Number.isInteger(stepIndex);
    const oldStep = editing ? state.roadmap.steps[stepIndex] : null;
    const initialBuilding = oldStep?.type === 'building' ? catalogEntry(oldStep.building) : BUILDINGS[0];
    const initialInstance = oldStep?.type === 'building' ? Math.max(1, Number(oldStep.instance) || 1) : 1;

    const layer = createDialog(
      editing ? 'Edit Building Step' : 'Add Building Step',
      `<div class="qol-rme-building-grid">
         <div class="qol-rme-building-field">
           <label>Building</label>
           ${buildingPickerHtml(initialBuilding.name)}
         </div>
         <div class="qol-rme-level-field">
           <label>Exact upgrade</label>
           <div class="qol-rme-next-level"><strong data-next-level>Level 1</strong><small>Set by roadmap order</small></div>
         </div>
         <div class="qol-rme-instance-field" data-instance-wrap>
           <label for="qol-rme-instance">Instance</label>
           <input id="qol-rme-instance" data-instance type="number" min="1" max="20" value="${initialInstance}">
         </div>
       </div>
       <div class="qol-rme-sequence-note" data-sequence-note></div>`,
      editing ? 'Save Step' : 'Add Step'
    );

    const status = layer.querySelector('.qol-rm-dialog-status');
    const nextLevelLabel = layer.querySelector('[data-next-level]');
    const sequenceNote = layer.querySelector('[data-sequence-note]');
    const instanceInput = layer.querySelector('[data-instance]');
    const instanceWrap = layer.querySelector('[data-instance-wrap]');
    const picker = layer.querySelector('[data-building-picker]');

    let selectedBuilding = initialBuilding;

    const sync = () => {
      selectedBuilding = catalogEntry(picker.dataset.value);
      const instance = selectedBuilding.repeatable ? Math.max(1, Math.min(20, Number(instanceInput.value) || 1)) : 0;
      if (selectedBuilding.repeatable) instanceInput.value = instance;
      instanceWrap.style.display = selectedBuilding.repeatable ? 'flex' : 'none';

      const beforeIndex = editing ? stepIndex : state.roadmap.steps.length;
      const previous = previousLevel(state.roadmap.steps, selectedBuilding.name, instance, beforeIndex);
      const next = previous + 1;
      nextLevelLabel.textContent = next <= selectedBuilding.max ? `Level ${next}` : 'MAX';
      sequenceNote.textContent = previous
        ? `${selectedBuilding.name}${selectedBuilding.repeatable ? ` #${instance}` : ''} is Level ${previous} at the previous roadmap step. The next step is therefore locked to Level ${next}.`
        : `${selectedBuilding.name}${selectedBuilding.repeatable ? ` #${instance}` : ''} has no earlier roadmap step. Its first exact upgrade is Level 1.`;
      status.textContent = next > selectedBuilding.max ? `${selectedBuilding.name} is already at its roadmap maximum of Level ${selectedBuilding.max}.` : '';
      return { instance, next };
    };

    bindBuildingPicker(layer, initialBuilding.name, building => {
      selectedBuilding = building;
      picker.dataset.value = building.name;
      sync();
    });
    instanceInput.addEventListener('input', sync);
    sync();

    wireButton(layer.querySelector('[data-rme-confirm]'), () => {
      const { instance, next } = sync();
      if (next > selectedBuilding.max) {
        status.textContent = `${selectedBuilding.name} cannot go above Level ${selectedBuilding.max}.`;
        return;
      }

      const custom = prepareCustomRoadmaps();
      const roadmap = custom[state.id];
      if (!roadmap) return;
      const exactStep = makeExactBuildingStep(selectedBuilding, next, instance);

      if (editing) roadmap.steps[stepIndex] = exactStep;
      else roadmap.steps.push(exactStep);

      repairRoadmapSequences(roadmap);
      writeCustomRoadmaps(custom);
      closeDialog();
      refreshHub();
      showToast(editing ? 'Building step updated.' : `${selectedBuilding.name} → Level ${exactStep.level} added.`);
    });

    picker.focus();
  }

  function openInstructionEditor(stepIndex = null) {
    const state = editorState();
    if (!state.roadmap) return;
    const editing = Number.isInteger(stepIndex);
    const oldStep = editing ? state.roadmap.steps[stepIndex] : null;

    const layer = createDialog(
      editing ? 'Edit Instruction' : 'Add Instruction',
      `<label for="qol-rme-instruction">Instruction</label>
       <textarea id="qol-rme-instruction" data-text rows="6" maxlength="600"></textarea>`,
      editing ? 'Save Step' : 'Add Step'
    );

    const input = layer.querySelector('[data-text]');
    const status = layer.querySelector('.qol-rm-dialog-status');
    input.value = oldStep?.type === 'instruction' ? oldStep.text : '';

    wireButton(layer.querySelector('[data-rme-confirm]'), () => {
      const text = clean(input.value);
      if (!text) {
        status.textContent = 'Enter an instruction.';
        input.focus();
        return;
      }
      const custom = prepareCustomRoadmaps();
      const roadmap = custom[state.id];
      if (!roadmap) return;
      const step = { type: 'instruction', text };
      if (editing) roadmap.steps[stepIndex] = step;
      else roadmap.steps.push(step);
      repairRoadmapSequences(roadmap);
      writeCustomRoadmaps(custom);
      closeDialog();
      refreshHub();
      showToast(editing ? 'Instruction updated.' : 'Instruction added.');
    });

    input.focus();
  }

  function buildingOccurrenceCount(steps, buildingName, instance) {
    const key = buildingIdentity(buildingName, instance);
    return steps.filter(step => step?.type === 'building' && buildingIdentity(step.building, step.instance) === key).length;
  }

  function handleStepAction(action, index) {
    const state = editorState();
    const roadmap = state.roadmap;
    if (!roadmap || index < 0 || index >= roadmap.steps.length) return;

    if (action === 'edit') {
      if (roadmap.steps[index].type === 'building') openBuildingEditor(index);
      else openInstructionEditor(index);
      return;
    }

    const step = roadmap.steps[index];
    if (action === 'up') {
      if (index <= 0) return;
      [roadmap.steps[index - 1], roadmap.steps[index]] = [roadmap.steps[index], roadmap.steps[index - 1]];
    } else if (action === 'down') {
      if (index >= roadmap.steps.length - 1) return;
      [roadmap.steps[index + 1], roadmap.steps[index]] = [roadmap.steps[index], roadmap.steps[index + 1]];
    } else if (action === 'duplicate') {
      if (step.type === 'building') {
        const building = catalogEntry(step.building);
        const instance = building.repeatable ? Math.max(1, Number(step.instance) || 1) : 0;
        const count = buildingOccurrenceCount(roadmap.steps, building.name, instance);
        const highest = roadmap.steps
          .filter(item => item?.type === 'building' && buildingIdentity(item.building, item.instance) === buildingIdentity(building.name, instance))
          .reduce((max, item) => Math.max(max, Number(item.level) || 0), 0);
        if (Math.max(count, highest) >= building.max) {
          showToast(`${building.name} is already at Level ${building.max}.`, 'error');
          return;
        }
        const duplicate = clone(step);
        duplicate.exact = true;
        roadmap.steps.splice(index + 1, 0, duplicate);
      } else {
        roadmap.steps.splice(index + 1, 0, clone(step));
      }
    } else if (action === 'delete') {
      roadmap.steps.splice(index, 1);
    } else {
      return;
    }

    repairRoadmapSequences(roadmap);
    writeCustomRoadmaps(state.custom);
    refreshHub();
    if (action === 'duplicate') showToast('Step duplicated.');
    if (action === 'delete') showToast('Step deleted.', 'info');
  }

  function stepControlsHtml(index, total) {
    return `
      <div class="qol-rme-step-actions">
        <div class="qol-rme-icon${index === 0 ? ' disabled' : ''}" data-rme-step="up" data-index="${index}" role="button" tabindex="${index === 0 ? -1 : 0}" title="Move up">↑</div>
        <div class="qol-rme-icon${index === total - 1 ? ' disabled' : ''}" data-rme-step="down" data-index="${index}" role="button" tabindex="${index === total - 1 ? -1 : 0}" title="Move down">↓</div>
        <div class="qol-rme-icon" data-rme-step="duplicate" data-index="${index}" role="button" tabindex="0" title="Duplicate step">⧉</div>
        <div class="qol-rme-icon" data-rme-step="edit" data-index="${index}" role="button" tabindex="0" title="Edit step">✎</div>
        <div class="qol-rme-icon danger" data-rme-step="delete" data-index="${index}" role="button" tabindex="0" title="Delete step">×</div>
      </div>`;
  }

  function enhance() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const sidebarTitle = panel.querySelector('.qol-rm-sidebar-title');
    if (sidebarTitle && !sidebarTitle.querySelector('[data-rme-new]')) {
      sidebarTitle.insertAdjacentHTML('beforeend', '<div class="qol-rm-action qol-secondary qol-rme-new" data-rme-new role="button" tabindex="0">+ New</div>');
    }
    wireButton(sidebarTitle?.querySelector('[data-rme-new]'), () => openDetailsEditor(true));

    const state = editorState();
    if (!state.roadmap) return;

    const actions = panel.querySelector('.qol-rm-actions');
    if (actions) {
      const rename = actions.querySelector('[data-roadmap-action="rename"]');
      if (rename) rename.outerHTML = '<div class="qol-rm-action qol-secondary" data-rme-details role="button" tabindex="0">Edit Details</div>';
      if (!actions.querySelector('[data-rme-details]')) actions.insertAdjacentHTML('afterbegin', '<div class="qol-rm-action qol-secondary" data-rme-details role="button" tabindex="0">Edit Details</div>');
      wireButton(actions.querySelector('[data-rme-details]'), () => openDetailsEditor(false));
    }

    const routeHead = panel.querySelector('.qol-rm-route-head');
    if (routeHead && !routeHead.querySelector('[data-rme-add]')) {
      routeHead.insertAdjacentHTML('beforeend', `
        <div class="qol-rme-add">
          <div class="qol-rm-action qol-secondary" data-rme-add="building" role="button" tabindex="0">+ Building Step</div>
          <div class="qol-rm-action qol-secondary" data-rme-add="instruction" role="button" tabindex="0">+ Instruction</div>
        </div>`);
    }
    wireButton(routeHead?.querySelector('[data-rme-add="building"]'), () => openBuildingEditor());
    wireButton(routeHead?.querySelector('[data-rme-add="instruction"]'), () => openInstructionEditor());

    const rows = panel.querySelectorAll('.qol-rm-route .qol-rm-step');
    rows.forEach((row, index) => {
      row.classList.add('qol-rme-editable');
      if (!row.querySelector('.qol-rme-step-actions')) row.insertAdjacentHTML('beforeend', stepControlsHtml(index, rows.length));
      row.querySelectorAll('[data-rme-step]').forEach(control => {
        if (control.classList.contains('disabled')) return;
        wireButton(control, () => handleStepAction(control.dataset.rmeStep, Number(control.dataset.index)));
      });
    });
  }

  function attachPanelObserver() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.dataset.rmeObserved === '1') return false;
    panel.dataset.rmeObserved = '1';
    panelObserver?.disconnect();
    panelObserver = new MutationObserver(() => requestAnimationFrame(enhance));
    panelObserver.observe(panel, { childList: true, subtree: true });
    requestAnimationFrame(enhance);
    return true;
  }

  function init() {
    prepareCustomRoadmaps();
    if (!attachPanelObserver()) {
      rootObserver = new MutationObserver(() => {
        if (attachPanelObserver()) rootObserver?.disconnect();
      });
      rootObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.APES = window.APES || {};
    window.APES.roadmapsEditor = Object.freeze({
      buildings: BUILDINGS,
      enhance,
      repair: prepareCustomRoadmaps
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
