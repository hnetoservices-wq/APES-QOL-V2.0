(() => {
  'use strict';

  const CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const LAST_GROUP_KEY = 'qol_roadmap_last_resource_group_v1';
  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const DIALOG_ID = 'qol-roadmaps-dialog-layer';
  const HUB_ID = 'qol-roadmaps-container';
  const RUNNER_ID = 'qol-roadmap-runner';
  const UI_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_DASHBOARD_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_SNAPSHOT';
  const RESPONSE_TYPE = 'VILLAGE_SNAPSHOT';
  const MAX_FIELD_LEVEL = 20;
  const REQUIRED_CONFIRMATIONS = 2;

  const GROUPS = Object.freeze([
    { id: 'wood', label: 'All Wood Fields', typeIds: [1] },
    { id: 'clay', label: 'All Clay Fields', typeIds: [2] },
    { id: 'iron', label: 'All Iron Fields', typeIds: [3] },
    { id: 'crop', label: 'All Crop Fields', typeIds: [4] },
    { id: 'all', label: 'All Resource Fields', typeIds: [1, 2, 3, 4] }
  ]);

  let hubObserver = null;
  let runnerObserver = null;
  let rootObserver = null;
  let queued = false;
  let originalAutoComplete = null;
  let confirmationKey = '';
  let confirmationCount = 0;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
      console.warn('[APES Roadmaps Resource Fields] Save failed.', error);
      return false;
    }
  }

  function selectedId() {
    try {
      return clean(localStorage.getItem(SELECTED_KEY));
    } catch (_) {
      return '';
    }
  }

  function readCustom() {
    const value = readJson(CUSTOM_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function groupById(id) {
    return GROUPS.find(group => group.id === id) || GROUPS[3];
  }

  function groupByWord(word) {
    const normalized = clean(word).toLowerCase();
    if (normalized === 'resource') return groupById('all');
    return GROUPS.find(group => group.id === normalized) || null;
  }

  function parseResourceText(text) {
    const value = clean(text);
    let match = value.match(/^All (Wood|Clay|Iron|Crop|Resource) Fields\s*(?:→|->)\s*Level\s*(\d+)$/i);
    if (match) {
      const group = groupByWord(match[1]);
      const level = Number(match[2]);
      if (group && Number.isInteger(level) && level >= 1 && level <= MAX_FIELD_LEVEL) {
        return { group, level, generated: true };
      }
    }

    match = value.match(/^Upgrade every (wood|clay|iron|crop|resource) field to level (\d+)\.?$/i);
    if (match) {
      const group = groupByWord(match[1]);
      const level = Number(match[2]);
      if (group && Number.isInteger(level) && level >= 1 && level <= MAX_FIELD_LEVEL) {
        return { group, level, generated: false };
      }
    }

    match = value.match(/^Upgrade every (wood|clay|iron|crop|resource) field to level \d+, then every \1 field to level (\d+)\.?$/i);
    if (match) {
      const group = groupByWord(match[1]);
      const level = Number(match[2]);
      if (group && Number.isInteger(level) && level >= 1 && level <= MAX_FIELD_LEVEL) {
        return { group, level, generated: false };
      }
    }

    return null;
  }

  function resourceText(group, level) {
    return `${group.label} → Level ${level}`;
  }

  function resourceInfo(step) {
    if (!step || step.type !== 'instruction') return null;
    return parseResourceText(step.text);
  }

  function runtime() {
    return window.APES?.roadmapsRunner?.getContextState?.() || null;
  }

  function currentResource() {
    const rt = runtime();
    if (!rt?.roadmap || !rt?.progress || !Array.isArray(rt.roadmap.steps)) return null;
    const index = Math.max(0, Number(rt.progress.currentStep) || 0);
    const step = rt.roadmap.steps[index];
    const info = resourceInfo(step);
    return info ? { rt, index, step, info } : null;
  }

  function lastGroup() {
    try {
      const id = localStorage.getItem(LAST_GROUP_KEY);
      return GROUPS.some(group => group.id === id) ? id : 'crop';
    } catch (_) {
      return 'crop';
    }
  }

  function saveLastGroup(id) {
    try {
      localStorage.setItem(LAST_GROUP_KEY, id);
    } catch (_) {}
  }

  function repairResourceSequences(roadmap) {
    if (!roadmap || !Array.isArray(roadmap.steps)) return false;
    let changed = false;
    const first = new Map();

    roadmap.steps.forEach(step => {
      const info = resourceInfo(step);
      if (!info?.generated) return;
      if (!first.has(info.group.id)) first.set(info.group.id, info.level);
    });

    const last = new Map();
    roadmap.steps.forEach(step => {
      const info = resourceInfo(step);
      if (!info?.generated || first.get(info.group.id) !== 1) return;
      const expected = Math.min(MAX_FIELD_LEVEL, (last.get(info.group.id) || 0) + 1);
      if (info.level !== expected) {
        step.text = resourceText(info.group, expected);
        changed = true;
      }
      last.set(info.group.id, expected);
    });

    return changed;
  }

  function repairAllCustom() {
    const custom = readCustom();
    let changed = false;
    Object.values(custom).forEach(roadmap => {
      if (repairResourceSequences(roadmap)) changed = true;
    });
    if (changed) writeJson(CUSTOM_KEY, custom);
    return changed;
  }

  function highestLevel(steps, groupId, beforeIndex = Number.MAX_SAFE_INTEGER) {
    let highest = 0;
    for (let index = 0; index < Math.min(steps.length, beforeIndex); index += 1) {
      const info = resourceInfo(steps[index]);
      if (info?.group.id === groupId) highest = Math.max(highest, info.level);
    }
    return highest;
  }

  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove();
  }

  function wireButton(element, handler) {
    if (!element || element.dataset.rmrfBound === '1') return;
    element.dataset.rmrfBound = '1';
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

  function createDialog(title, body, confirmLabel) {
    closeDialog();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rm-dialog qol-rme-dialog qol-rmrf-dialog" role="dialog" aria-modal="true">
        <div class="qol-rm-dialog-head">${escapeHtml(title)}</div>
        <div class="qol-rm-dialog-body">
          ${body}
          <div class="qol-rm-dialog-status" aria-live="polite"></div>
        </div>
        <div class="qol-rm-dialog-actions">
          <div class="qol-rm-action qol-secondary" data-rmrf-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rm-action" data-rmrf-confirm role="button" tabindex="0">${escapeHtml(confirmLabel)}</div>
        </div>
      </div>`;
    document.body.appendChild(layer);
    wireButton(layer.querySelector('[data-rmrf-cancel]'), closeDialog);
    layer.addEventListener('pointerdown', event => {
      if (event.target === layer) closeDialog();
    });
    layer.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    });
    return layer;
  }

  function pickerHtml(selectedId) {
    const selected = groupById(selectedId);
    return `
      <div class="qol-rmrf-picker-shell">
        <div class="qol-rmrf-picker" data-rmrf-picker data-value="${selected.id}" role="button" tabindex="0" aria-expanded="false">
          <span data-rmrf-picker-label>${escapeHtml(selected.label)}</span><span>▾</span>
        </div>
        <div class="qol-rmrf-picker-menu" data-rmrf-menu>
          ${GROUPS.map(group => `<div class="qol-rmrf-picker-option${group.id === selected.id ? ' active' : ''}" data-rmrf-option="${group.id}" role="button" tabindex="0"><strong>${escapeHtml(group.label)}</strong><small>${group.id === 'all' ? 'All 18 resource fields' : 'Every field of this resource type'}</small></div>`).join('')}
        </div>
      </div>`;
  }

  function bindPicker(layer, initialId, onChange) {
    const picker = layer.querySelector('[data-rmrf-picker]');
    const label = layer.querySelector('[data-rmrf-picker-label]');
    const menu = layer.querySelector('[data-rmrf-menu]');
    if (!picker || !label || !menu) return;

    const setOpen = open => {
      picker.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.classList.toggle('open', open);
    };

    wireButton(picker, () => setOpen(picker.getAttribute('aria-expanded') !== 'true'));
    menu.querySelectorAll('[data-rmrf-option]').forEach(option => {
      wireButton(option, () => {
        const group = groupById(option.dataset.rmrfOption);
        picker.dataset.value = group.id;
        label.textContent = group.label;
        menu.querySelectorAll('[data-rmrf-option]').forEach(item => item.classList.toggle('active', item === option));
        setOpen(false);
        onChange?.(group);
      });
    });

    layer.addEventListener('pointerdown', event => {
      if (!event.target.closest('.qol-rmrf-picker-shell')) setOpen(false);
    });
  }

  function openResourceEditor(stepIndex = null) {
    const custom = readCustom();
    const id = selectedId();
    const roadmap = custom[id];
    if (!roadmap || !Array.isArray(roadmap.steps)) return;

    const editing = Number.isInteger(stepIndex);
    const oldInfo = editing ? resourceInfo(roadmap.steps[stepIndex]) : null;
    const initialGroup = oldInfo?.group || groupById(lastGroup());
    const previous = highestLevel(roadmap.steps, initialGroup.id, editing ? stepIndex : roadmap.steps.length);
    const initialLevel = editing ? Math.max(1, previous + 1) : Math.max(1, Math.min(MAX_FIELD_LEVEL, previous + 1));

    const layer = createDialog(
      editing ? 'Edit Resource Fields Step' : 'Add Resource Fields',
      `<div class="qol-rmrf-grid">
         <div class="qol-rmrf-field">
           <label>Resource fields</label>
           ${pickerHtml(initialGroup.id)}
         </div>
         <div class="qol-rmrf-field">
           <label for="qol-rmrf-level">${editing ? 'Exact upgrade' : 'Build through level'}</label>
           <input id="qol-rmrf-level" data-rmrf-level type="number" min="1" max="${MAX_FIELD_LEVEL}" value="${initialLevel}">
         </div>
       </div>
       <div class="qol-rmrf-note" data-rmrf-note></div>`,
      editing ? 'Save Step' : 'Add Steps'
    );

    const picker = layer.querySelector('[data-rmrf-picker]');
    const levelInput = layer.querySelector('[data-rmrf-level]');
    const note = layer.querySelector('[data-rmrf-note]');
    const status = layer.querySelector('.qol-rm-dialog-status');
    const confirm = layer.querySelector('[data-rmrf-confirm]');

    let selectedGroup = initialGroup;

    const sync = () => {
      selectedGroup = groupById(picker.dataset.value);
      saveLastGroup(selectedGroup.id);
      const before = editing ? stepIndex : roadmap.steps.length;
      const earlier = highestLevel(roadmap.steps, selectedGroup.id, before);
      const next = Math.min(MAX_FIELD_LEVEL, earlier + 1);

      if (editing) {
        levelInput.value = next;
        levelInput.disabled = true;
        note.textContent = earlier
          ? `${selectedGroup.label} previously reaches Level ${earlier}, so this exact step is Level ${next}.`
          : `${selectedGroup.label} has no earlier resource step, so this exact step is Level 1.`;
        confirm.textContent = 'Save Step';
        status.textContent = earlier >= MAX_FIELD_LEVEL ? `${selectedGroup.label} is already at the roadmap maximum.` : '';
        return { earlier, target: next, count: 1 };
      }

      levelInput.disabled = false;
      let target = Math.max(1, Math.min(MAX_FIELD_LEVEL, Number(levelInput.value) || next));
      levelInput.value = target;
      const count = Math.max(0, target - earlier);
      note.textContent = earlier
        ? `${selectedGroup.label} already reaches Level ${earlier} in this roadmap. This will add Level ${earlier + 1}${count > 1 ? ` through Level ${target}` : ''}.`
        : `This will add ${selectedGroup.label} Level 1${target > 1 ? ` through Level ${target}` : ''}.`;
      confirm.textContent = count === 1 ? 'Add 1 Step' : `Add ${count} Steps`;
      status.textContent = count === 0 ? `${selectedGroup.label} already reaches Level ${earlier}. Choose a higher target.` : '';
      return { earlier, target, count };
    };

    bindPicker(layer, initialGroup.id, group => {
      selectedGroup = group;
      picker.dataset.value = group.id;
      const earlier = highestLevel(roadmap.steps, group.id, editing ? stepIndex : roadmap.steps.length);
      levelInput.value = Math.min(MAX_FIELD_LEVEL, earlier + 1);
      sync();
    });
    levelInput.addEventListener('input', sync);
    sync();

    wireButton(confirm, () => {
      const currentCustom = readCustom();
      const currentRoadmap = currentCustom[id];
      if (!currentRoadmap || !Array.isArray(currentRoadmap.steps)) return;
      const result = sync();
      if (!editing && result.count <= 0) return;
      if (editing && result.earlier >= MAX_FIELD_LEVEL) return;

      if (editing) {
        currentRoadmap.steps[stepIndex] = { type: 'instruction', text: resourceText(selectedGroup, result.target) };
      } else {
        for (let level = result.earlier + 1; level <= result.target; level += 1) {
          currentRoadmap.steps.push({ type: 'instruction', text: resourceText(selectedGroup, level) });
        }
      }

      repairResourceSequences(currentRoadmap);
      writeJson(CUSTOM_KEY, currentCustom);
      closeDialog();
      window.APES?.roadmaps?.refresh?.();
      window.APES?.roadmapsEditor?.enhance?.();
      scheduleEnhance();
    });

    picker.focus();
  }

  function duplicateResourceStep(index) {
    const custom = readCustom();
    const id = selectedId();
    const roadmap = custom[id];
    if (!roadmap || !Array.isArray(roadmap.steps) || index < 0 || index >= roadmap.steps.length) return;
    const info = resourceInfo(roadmap.steps[index]);
    if (!info) return;

    const highest = highestLevel(roadmap.steps, info.group.id);
    if (highest >= MAX_FIELD_LEVEL) return;
    roadmap.steps.splice(index + 1, 0, { type: 'instruction', text: resourceText(info.group, highest + 1) });
    repairResourceSequences(roadmap);
    writeJson(CUSTOM_KEY, custom);
    window.APES?.roadmaps?.refresh?.();
    window.APES?.roadmapsEditor?.enhance?.();
    scheduleEnhance();
  }

  function selectedRawStep(index) {
    const roadmap = readCustom()[selectedId()];
    return Array.isArray(roadmap?.steps) ? roadmap.steps[index] : null;
  }

  function interceptStepAction(event) {
    const control = event.target.closest?.('#qol-roadmaps-container [data-rme-step]');
    if (!control) return;
    const index = Number(control.dataset.index);
    if (!Number.isInteger(index)) return;
    const info = resourceInfo(selectedRawStep(index));
    if (!info) {
      if (control.dataset.rmeStep === 'up' || control.dataset.rmeStep === 'down' || control.dataset.rmeStep === 'delete') {
        setTimeout(() => {
          if (repairAllCustom()) window.APES?.roadmaps?.refresh?.();
          scheduleEnhance();
        }, 0);
      }
      return;
    }

    const action = control.dataset.rmeStep;
    if (action === 'edit' || action === 'duplicate') {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (action === 'edit') openResourceEditor(index);
      else duplicateResourceStep(index);
      return;
    }

    if (action === 'up' || action === 'down' || action === 'delete') {
      setTimeout(() => {
        if (repairAllCustom()) window.APES?.roadmaps?.refresh?.();
        scheduleEnhance();
      }, 0);
    }
  }

  function enhanceHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return;

    const add = hub.querySelector('.qol-rme-add');
    if (add && !add.querySelector('[data-rmrf-add]')) {
      const resource = document.createElement('div');
      resource.className = 'qol-rm-action qol-secondary';
      resource.dataset.rmrfAdd = '1';
      resource.setAttribute('role', 'button');
      resource.setAttribute('tabindex', '0');
      resource.textContent = '+ Resource Fields';
      const instruction = add.querySelector('[data-rme-add="instruction"]');
      if (instruction) add.insertBefore(resource, instruction);
      else add.appendChild(resource);
      wireButton(resource, () => openResourceEditor());
    }

    let resourceCount = 0;
    hub.querySelectorAll('.qol-rm-route .qol-rm-step').forEach(row => {
      const text = clean(row.querySelector('.qol-rm-step-text')?.textContent);
      const info = parseResourceText(text);
      if (!info) return;
      resourceCount += 1;
      const badge = row.querySelector('.qol-rm-step-type');
      if (badge) {
        badge.textContent = 'Resource';
        badge.classList.remove('instruction');
        badge.classList.add('resource');
      }
      row.classList.add('qol-rmrf-resource-row');
    });

    const summary = hub.querySelector('.qol-rm-summary');
    if (summary) {
      const spans = summary.querySelectorAll(':scope > span');
      if (spans.length >= 4) {
        const roadmap = window.APES?.roadmaps?.getAllRoadmaps?.()[selectedId()];
        const total = Array.isArray(roadmap?.steps) ? roadmap.steps.length : 0;
        const buildings = Array.isArray(roadmap?.steps) ? roadmap.steps.filter(step => step.type === 'building').length : 0;
        const resources = Array.isArray(roadmap?.steps) ? roadmap.steps.filter(step => resourceInfo(step)).length : resourceCount;
        const instructions = Math.max(0, total - buildings - resources);
        spans[0].innerHTML = `<strong>${total}</strong>Total steps`;
        spans[1].innerHTML = `<strong>${buildings}</strong>Building steps`;
        spans[2].innerHTML = `<strong>${resources}</strong>Resource steps`;
        spans[3].innerHTML = `<strong>${instructions}</strong>Instructions`;
      }
    }

    const routeHint = hub.querySelector('.qol-rm-route-head > span');
    if (routeHint) routeHint.textContent = 'Exact order followed by the runner.';
  }

  function ensureResourceDetectionNode() {
    const card = document.querySelector(`#${RUNNER_ID} .qol-rmr-step-card`);
    if (!card) return null;
    let node = card.querySelector('.qol-rmrf-detection');
    if (!node) {
      node = document.createElement('div');
      node.className = 'qol-rmrf-detection waiting';
      card.appendChild(node);
    }
    return node;
  }

  function renderResourceDetection(text, tone = 'waiting') {
    const node = ensureResourceDetectionNode();
    if (!node) return;
    node.className = `qol-rmrf-detection ${tone}`;
    node.textContent = text;
  }

  function enhanceRunner() {
    const panel = document.getElementById(RUNNER_ID);
    if (!panel) return;
    const current = currentResource();
    panel.classList.toggle('qol-rmrf-current', Boolean(current));
    if (!current) {
      panel.querySelector('.qol-rmrf-detection')?.remove();
      return;
    }

    const type = panel.querySelector('.qol-rmr-type');
    if (type) {
      type.textContent = 'Resource Fields';
      type.classList.remove('building');
      type.classList.add('resource');
    }

    const stepText = panel.querySelector('.qol-rmr-step-text');
    if (stepText && current.info.generated) stepText.textContent = resourceText(current.info.group, current.info.level);
    if (!panel.querySelector('.qol-rmrf-detection')) renderResourceDetection('Checking live resource fields…', 'waiting');
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceHub();
      enhanceRunner();
    });
  }

  function attachObservers() {
    const hub = document.getElementById(HUB_ID);
    if (hub && hub.dataset.rmrfObserved !== '1') {
      hub.dataset.rmrfObserved = '1';
      hubObserver?.disconnect();
      hubObserver = new MutationObserver(scheduleEnhance);
      hubObserver.observe(hub, { childList: true, subtree: true });
    }

    const runner = document.getElementById(RUNNER_ID);
    if (runner && runner.dataset.rmrfObserved !== '1') {
      runner.dataset.rmrfObserved = '1';
      runnerObserver?.disconnect();
      runnerObserver = new MutationObserver(scheduleEnhance);
      runnerObserver.observe(runner, { childList: true, subtree: true });
    }
  }

  function resetConfirmation() {
    confirmationKey = '';
    confirmationCount = 0;
  }

  function requestResourceSnapshot() {
    const current = currentResource();
    if (!current) {
      resetConfirmation();
      originalAutoComplete?.checkNow?.();
      scheduleEnhance();
      return;
    }
    enhanceRunner();
    window.postMessage({ source: UI_SOURCE, type: REQUEST_TYPE }, location.origin);
  }

  function storageKey(ctx) {
    const server = clean(ctx?.server);
    const playerId = clean(ctx?.playerId);
    if (!server || !/^\d+$/.test(playerId)) return '';
    return `${ASSIGNMENT_PREFIX}:${server}:${playerId}`;
  }

  function progressSlot(rt, create = false) {
    const { state, assignment } = rt || {};
    if (!state || !assignment) return null;
    state.progress = state.progress || { shared: {}, villages: {} };
    state.progress.shared = state.progress.shared || {};
    state.progress.villages = state.progress.villages || {};

    if (assignment.scope === 'all') {
      if (create && !state.progress.shared[assignment.roadmapId]) state.progress.shared[assignment.roadmapId] = { currentStep: 0, skipped: [] };
      return state.progress.shared[assignment.roadmapId] || null;
    }

    const villageId = clean(assignment.villageId || rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return null;
    if (create && !state.progress.villages[villageId]) state.progress.villages[villageId] = {};
    if (create && !state.progress.villages[villageId][assignment.roadmapId]) state.progress.villages[villageId][assignment.roadmapId] = { currentStep: 0, skipped: [] };
    return state.progress.villages[villageId]?.[assignment.roadmapId] || null;
  }

  function completeResource(current) {
    const rt = current.rt;
    const slot = progressSlot(rt, true);
    const total = Array.isArray(rt.roadmap.steps) ? rt.roadmap.steps.length : 0;
    if (!slot || current.index >= total) return false;
    const stored = Math.max(0, Math.min(total, Number(slot.currentStep) || 0));
    if (stored !== current.index) return false;

    const skipped = new Set(Array.isArray(slot.skipped) ? slot.skipped.map(Number) : []);
    skipped.delete(stored);
    slot.skipped = [...skipped].filter(index => Number.isInteger(index) && index >= 0 && index < total).sort((a, b) => a - b);
    slot.currentStep = stored + 1;

    const key = storageKey(rt.ctx);
    if (!key || !writeJson(key, rt.state)) return false;
    resetConfirmation();
    window.APES?.roadmapsRunner?.refresh?.();
    window.APES?.roadmapsRunnerControls?.refresh?.();
    setTimeout(requestResourceSnapshot, 100);
    return true;
  }

  function onSnapshot(event) {
    if (event.source !== window) return;
    if (event.data?.source !== BRIDGE_SOURCE || event.data?.type !== RESPONSE_TYPE) return;
    const current = currentResource();
    if (!current) return;

    const villageId = clean(current.rt.ctx?.villageId);
    if (!/^\d+$/.test(villageId)) return;
    const villages = Array.isArray(event.data?.payload?.villages) ? event.data.payload.villages : [];
    const village = villages.find(item => String(item?.villageId) === villageId);
    if (!village) {
      resetConfirmation();
      renderResourceDetection('Waiting for live village data…', 'waiting');
      return;
    }

    const allBuildings = Array.isArray(village.buildings) ? village.buildings : [];
    const allResourceFields = allBuildings.filter(building => [1, 2, 3, 4].includes(Number(building?.buildingType)));
    if (allResourceFields.length < 18) {
      resetConfirmation();
      renderResourceDetection(`Loading resource fields… ${allResourceFields.length}/18 detected`, 'waiting');
      return;
    }

    const matches = allResourceFields.filter(building => current.info.group.typeIds.includes(Number(building?.buildingType)));
    if (!matches.length) {
      resetConfirmation();
      renderResourceDetection('No matching resource fields detected yet.', 'waiting');
      return;
    }

    const target = current.info.level;
    const completed = matches.filter(building => (Number(building?.lvl) || 0) >= target).length;
    const lowest = matches.reduce((min, building) => Math.min(min, Number(building?.lvl) || 0), Number.POSITIVE_INFINITY);

    if (completed < matches.length) {
      resetConfirmation();
      renderResourceDetection(`${completed}/${matches.length} at Lv ${target} · lowest Lv ${Number.isFinite(lowest) ? lowest : 0}`, 'waiting');
      return;
    }

    const key = `${current.rt.ctx?.server}|${current.rt.ctx?.playerId}|${villageId}|${current.rt.assignment?.roadmapId}|${current.index}|${current.info.group.id}|${target}`;
    if (confirmationKey === key) confirmationCount += 1;
    else {
      confirmationKey = key;
      confirmationCount = 1;
    }

    if (confirmationCount < REQUIRED_CONFIRMATIONS) {
      renderResourceDetection(`${matches.length}/${matches.length} at Lv ${target} · confirming…`, 'confirming');
      return;
    }

    renderResourceDetection(`${matches.length}/${matches.length} at Lv ${target} · complete`, 'complete');
    completeResource(current);
  }

  function wrapAutoComplete() {
    const current = window.APES?.roadmapsAutoComplete;
    if (!current || current.__resourceFieldsWrapped) return Boolean(current);
    originalAutoComplete = current;
    window.APES.roadmapsAutoComplete = Object.freeze({
      __resourceFieldsWrapped: true,
      checkNow: requestResourceSnapshot,
      reset: () => {
        resetConfirmation();
        originalAutoComplete?.reset?.();
      }
    });
    return true;
  }

  function init() {
    repairAllCustom();
    document.addEventListener('click', interceptStepAction, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      interceptStepAction(event);
    }, true);
    window.addEventListener('message', onSnapshot);
    window.addEventListener('hashchange', () => {
      resetConfirmation();
      setTimeout(requestResourceSnapshot, 120);
    });

    rootObserver = new MutationObserver(() => {
      attachObservers();
      wrapAutoComplete();
      scheduleEnhance();
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });

    attachObservers();
    wrapAutoComplete();
    scheduleEnhance();
    setTimeout(() => {
      attachObservers();
      wrapAutoComplete();
      scheduleEnhance();
      requestResourceSnapshot();
    }, 350);

    window.APES = window.APES || {};
    window.APES.roadmapsResourceFields = Object.freeze({
      groups: GROUPS,
      parse: parseResourceText,
      add: () => openResourceEditor(),
      checkNow: requestResourceSnapshot
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
