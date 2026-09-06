(() => {
  'use strict';

  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const LEGACY_STATE_KEY = 'qol_roadmap_runner_v1';
  const WINDOW_KEY = 'qol_roadmap_runner_window_v1';
  const VISIBLE_KEY = 'qol_roadmap_runner_visible_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const PANEL_ID = 'qol-roadmap-runner';
  const HUB_ID = 'qol-roadmaps-container';
  const ASSIGN_DIALOG_ID = 'qol-roadmap-assignment-dialog';
  const CONFIRM_DIALOG_ID = 'qol-roadmap-runner-dialog';

  let panel = null;
  let refreshQueued = false;
  let lastContextSignature = '';

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
      console.warn('[APES Roadmaps] Could not save assignment state.', error);
      return false;
    }
  }

  function getAllRoadmaps() {
    return window.APES?.roadmaps?.getAllRoadmaps?.() || {};
  }

  function getSelectedId() {
    try {
      return clean(localStorage.getItem(SELECTED_KEY));
    } catch (_) {
      return '';
    }
  }

  function contextSnapshot() {
    const source = window.APES?.context?.snapshot?.() || {};
    const server = clean(source.server || location.hostname.toLowerCase()) || 'unknown';
    const playerId = clean(source.playerId) || 'unknown';
    const hashVillage = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    const villageId = clean(source.villageId === 'unknown' ? hashVillage : source.villageId) || hashVillage || 'unknown';
    const villageName = clean(source.villageName) || 'Unknown village';
    return { server, playerId, villageId, villageName };
  }

  function validPlayer(ctx) {
    return /^\d+$/.test(ctx.playerId);
  }

  function validVillage(ctx) {
    return /^\d+$/.test(ctx.villageId);
  }

  function storageKey(ctx) {
    if (!validPlayer(ctx)) return '';
    return `${ASSIGNMENT_PREFIX}:${ctx.server}:${ctx.playerId}`;
  }

  function normalizeProgress(raw, total = Number.MAX_SAFE_INTEGER) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const currentStep = Math.max(0, Math.min(total, Number.isInteger(Number(source.currentStep)) ? Number(source.currentStep) : 0));
    const skipped = Array.isArray(source.skipped)
      ? [...new Set(source.skipped.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < total))].sort((a, b) => a - b)
      : [];
    return { currentStep, skipped };
  }

  function normalizeAssignment(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const roadmapId = clean(raw.roadmapId);
    const scope = raw.scope === 'all' || raw.scope === 'every' ? raw.scope : '';
    if (!roadmapId || !scope) return null;
    return { scope, roadmapId, assignedAt: Number(raw.assignedAt) || 0 };
  }

  function loadAccountState(ctx = contextSnapshot()) {
    const key = storageKey(ctx);
    const raw = key ? readJson(key, {}) : {};
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const villages = source.villages && typeof source.villages === 'object' && !Array.isArray(source.villages) ? source.villages : {};
    const shared = source.progress?.shared && typeof source.progress.shared === 'object' && !Array.isArray(source.progress.shared) ? source.progress.shared : {};
    const villageProgress = source.progress?.villages && typeof source.progress.villages === 'object' && !Array.isArray(source.progress.villages) ? source.progress.villages : {};
    return {
      version: 1,
      defaultAssignment: normalizeAssignment(source.defaultAssignment),
      villages,
      progress: { shared, villages: villageProgress }
    };
  }

  function saveAccountState(ctx, state) {
    const key = storageKey(ctx);
    return key ? writeJson(key, state) : false;
  }

  function resolveAssignment(ctx = contextSnapshot(), state = loadAccountState(ctx)) {
    const roadmaps = getAllRoadmaps();
    if (validVillage(ctx)) {
      const explicit = state.villages?.[ctx.villageId];
      if (explicit && roadmaps[clean(explicit.roadmapId)]) {
        return { scope: 'village', roadmapId: clean(explicit.roadmapId), villageId: ctx.villageId };
      }
    }
    const fallback = normalizeAssignment(state.defaultAssignment);
    if (!fallback || !roadmaps[fallback.roadmapId]) return null;
    if (fallback.scope === 'every' && !validVillage(ctx)) return null;
    return {
      scope: fallback.scope,
      roadmapId: fallback.roadmapId,
      villageId: fallback.scope === 'every' ? ctx.villageId : ''
    };
  }

  function progressSlot(state, assignment, create = false) {
    if (!assignment) return null;
    if (assignment.scope === 'all') {
      if (create && !state.progress.shared[assignment.roadmapId]) state.progress.shared[assignment.roadmapId] = { currentStep: 0, skipped: [] };
      return state.progress.shared[assignment.roadmapId] || null;
    }
    const villageId = assignment.villageId;
    if (!villageId) return null;
    if (create && !state.progress.villages[villageId]) state.progress.villages[villageId] = {};
    if (create && !state.progress.villages[villageId][assignment.roadmapId]) state.progress.villages[villageId][assignment.roadmapId] = { currentStep: 0, skipped: [] };
    return state.progress.villages[villageId]?.[assignment.roadmapId] || null;
  }

  function getProgress(state, assignment, total) {
    return normalizeProgress(progressSlot(state, assignment, false), total);
  }

  function setProgress(ctx, state, assignment, progress) {
    const slot = progressSlot(state, assignment, true);
    if (!slot) return false;
    const normalized = normalizeProgress(progress);
    slot.currentStep = normalized.currentStep;
    slot.skipped = normalized.skipped;
    return saveAccountState(ctx, state);
  }

  function legacyProgress(roadmapId, total) {
    const legacy = readJson(LEGACY_STATE_KEY, {});
    return normalizeProgress(legacy?.progress?.[roadmapId], total);
  }

  function seedProgressIfEmpty(state, assignment, roadmap) {
    if (progressSlot(state, assignment, false)) return;
    const legacy = legacyProgress(assignment.roadmapId, roadmap.steps.length);
    const slot = progressSlot(state, assignment, true);
    if (!slot) return;
    slot.currentStep = legacy.currentStep;
    slot.skipped = legacy.skipped;
  }

  function assignmentLabel(scope) {
    if (scope === 'all') return 'All Villages · shared progress';
    if (scope === 'every') return 'Every Village · independent progress';
    return 'This Village';
  }

  function stepLabel(step) {
    if (!step) return '';
    if (step.type === 'building') {
      const instance = step.instance ? ` #${step.instance}` : '';
      return `${step.building}${instance} → Level ${step.level}`;
    }
    return clean(step.text ?? step.label);
  }

  function setVisible(visible) {
    try {
      localStorage.setItem(VISIBLE_KEY, visible ? 'true' : 'false');
    } catch (_) {}
  }

  function isVisibleWanted() {
    try {
      return localStorage.getItem(VISIBLE_KEY) === 'true';
    } catch (_) {
      return false;
    }
  }

  function showToast(message, type = 'success') {
    document.querySelector('.qol-rma-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rma-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  }

  function closeDialog(id) {
    document.getElementById(id)?.remove();
  }

  function wireKeyboardButtons(root) {
    root.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"],[role="radio"]')) {
        event.preventDefault();
        event.target.click();
      }
    });
  }

  function showConfirm(title, message, confirmLabel, onConfirm) {
    closeDialog(CONFIRM_DIALOG_ID);
    const layer = document.createElement('div');
    layer.id = CONFIRM_DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rmr-dialog" role="alertdialog" aria-modal="true">
        <div class="qol-rmr-dialog-head">${escapeHtml(title)}</div>
        <div class="qol-rmr-dialog-body">${escapeHtml(message)}</div>
        <div class="qol-rmr-dialog-actions">
          <div class="qol-rmr-action secondary" data-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rmr-action" data-confirm role="button" tabindex="0">${escapeHtml(confirmLabel)}</div>
        </div>
      </div>`;
    layer.querySelector('[data-cancel]').addEventListener('click', () => closeDialog(CONFIRM_DIALOG_ID));
    layer.querySelector('[data-confirm]').addEventListener('click', () => {
      closeDialog(CONFIRM_DIALOG_ID);
      onConfirm?.();
    });
    layer.addEventListener('pointerdown', event => {
      if (event.target === layer) closeDialog(CONFIRM_DIALOG_ID);
    });
    wireKeyboardButtons(layer);
    document.body.appendChild(layer);
  }

  function openAssignmentDialog() {
    closeDialog(ASSIGN_DIALOG_ID);
    const ctx = contextSnapshot();
    const roadmapId = getSelectedId();
    const roadmap = getAllRoadmaps()[roadmapId];
    if (!roadmap) return;
    if (!validPlayer(ctx) || !validVillage(ctx)) {
      showToast('APES is still resolving the current account and village. Try again in a moment.', 'error');
      return;
    }

    const state = loadAccountState(ctx);
    const current = resolveAssignment(ctx, state);
    let chosen = current?.roadmapId === roadmapId ? current.scope : 'village';
    const layer = document.createElement('div');
    layer.id = ASSIGN_DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rma-dialog" role="dialog" aria-modal="true">
        <div class="qol-rma-dialog-head">Load Roadmap</div>
        <div class="qol-rma-dialog-body">
          <strong class="qol-rma-dialog-roadmap">${escapeHtml(roadmap.name)}</strong>
          <span class="qol-rma-dialog-village">Current village: ${escapeHtml(ctx.villageName)}</span>
          <div class="qol-rma-scope-list" role="radiogroup" aria-label="Roadmap scope">
            <div class="qol-rma-scope" data-scope="village" role="radio" tabindex="0" aria-checked="false">
              <span class="qol-rma-radio"></span><div><strong>This Village</strong><small>Only ${escapeHtml(ctx.villageName)}. Progress belongs to this village.</small></div>
            </div>
            <div class="qol-rma-scope" data-scope="all" role="radio" tabindex="0" aria-checked="false">
              <span class="qol-rma-radio"></span><div><strong>All Villages</strong><small>Loads everywhere with one shared step and shared progress. Replaces individual assignments.</small></div>
            </div>
            <div class="qol-rma-scope" data-scope="every" role="radio" tabindex="0" aria-checked="false">
              <span class="qol-rma-radio"></span><div><strong>Every Village</strong><small>Loads the same roadmap everywhere, but each village advances independently. Replaces individual assignments.</small></div>
            </div>
          </div>
          <div class="qol-rma-dialog-status" aria-live="polite"></div>
        </div>
        <div class="qol-rma-dialog-actions">
          <div class="qol-rma-action secondary" data-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rma-action" data-load role="button" tabindex="0">Load Roadmap</div>
        </div>
      </div>`;

    const syncChoice = () => {
      layer.querySelectorAll('[data-scope]').forEach(option => {
        const active = option.dataset.scope === chosen;
        option.classList.toggle('active', active);
        option.setAttribute('aria-checked', active ? 'true' : 'false');
      });
    };
    layer.querySelectorAll('[data-scope]').forEach(option => {
      option.addEventListener('click', () => {
        chosen = option.dataset.scope;
        syncChoice();
      });
    });
    layer.querySelector('[data-cancel]').addEventListener('click', () => closeDialog(ASSIGN_DIALOG_ID));
    layer.querySelector('[data-load]').addEventListener('click', () => {
      closeDialog(ASSIGN_DIALOG_ID);
      assignRoadmap(roadmapId, chosen);
    });
    layer.addEventListener('pointerdown', event => {
      if (event.target === layer) closeDialog(ASSIGN_DIALOG_ID);
    });
    wireKeyboardButtons(layer);
    document.body.appendChild(layer);
    syncChoice();
  }

  function assignRoadmap(roadmapId, scope) {
    const ctx = contextSnapshot();
    const roadmap = getAllRoadmaps()[roadmapId];
    if (!roadmap || !validPlayer(ctx) || !validVillage(ctx)) return;
    const state = loadAccountState(ctx);
    const now = Date.now();

    if (scope === 'village') {
      state.villages[ctx.villageId] = { roadmapId, assignedAt: now, villageName: ctx.villageName };
    } else if (scope === 'all' || scope === 'every') {
      state.defaultAssignment = { scope, roadmapId, assignedAt: now };
      state.villages = {};
    } else {
      return;
    }

    const assignment = resolveAssignment(ctx, state);
    seedProgressIfEmpty(state, assignment, roadmap);
    saveAccountState(ctx, state);
    setVisible(true);
    window.APES?.roadmaps?.close?.();
    showRunner();
    scheduleRefresh();
    showToast(`Loaded for ${assignmentLabel(scope)}.`);
  }

  function removeCurrentAssignment() {
    const ctx = contextSnapshot();
    if (!validPlayer(ctx)) return;
    const state = loadAccountState(ctx);
    const assignment = resolveAssignment(ctx, state);
    if (!assignment) return;
    const roadmap = getAllRoadmaps()[assignment.roadmapId];
    const label = assignmentLabel(assignment.scope);
    showConfirm('Remove Roadmap?', `Remove “${roadmap?.name || 'this roadmap'}” from ${label}? Saved progress will be kept.`, 'Remove', () => {
      if (assignment.scope === 'village' && validVillage(ctx)) delete state.villages[ctx.villageId];
      else state.defaultAssignment = null;
      saveAccountState(ctx, state);
      scheduleRefresh();
      syncContext(true);
      showToast('Roadmap assignment removed.', 'info');
    });
  }

  function saveWindowPosition() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    writeJson(WINDOW_KEY, { left: Math.round(rect.left), top: Math.round(rect.top) });
  }

  function applyWindowPosition() {
    if (!panel) return;
    const saved = readJson(WINDOW_KEY, null);
    if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
    const left = Math.max(8, Math.min(saved.left, window.innerWidth - panel.offsetWidth - 8));
    const top = Math.max(8, Math.min(saved.top, window.innerHeight - panel.offsetHeight - 8));
    panel.style.setProperty('left', `${left}px`, 'important');
    panel.style.setProperty('top', `${top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
  }

  function clampPanel() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - rect.height - 8));
    panel.style.setProperty('left', `${left}px`, 'important');
    panel.style.setProperty('top', `${top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
  }

  function makeDraggable() {
    const handle = panel?.querySelector('.qol-rmr-header');
    if (!handle) return;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('[role="button"]')) return;
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const move = moveEvent => {
        const left = Math.max(8, Math.min(rect.left + moveEvent.clientX - startX, window.innerWidth - panel.offsetWidth - 8));
        const top = Math.max(8, Math.min(rect.top + moveEvent.clientY - startY, window.innerHeight - panel.offsetHeight - 8));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        saveWindowPosition();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      event.preventDefault();
    });
  }

  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="qol-rmr-header">
        <div class="qol-rmr-header-copy"><span>↪</span><strong>Roadmap</strong></div>
        <div class="qol-rmr-close" data-action="close" role="button" tabindex="0" aria-label="Close Roadmap Runner">×</div>
      </div>
      <div class="qol-rmr-body"></div>`;
    document.body.appendChild(panel);
    makeDraggable();
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-action]');
      if (action) handleRunnerAction(action.dataset.action);
    });
    wireKeyboardButtons(panel);
    requestAnimationFrame(() => {
      applyWindowPosition();
      clampPanel();
    });
    return panel;
  }

  function currentRuntime() {
    const ctx = contextSnapshot();
    const state = loadAccountState(ctx);
    const assignment = resolveAssignment(ctx, state);
    const roadmap = assignment ? getAllRoadmaps()[assignment.roadmapId] : null;
    const progress = roadmap ? getProgress(state, assignment, roadmap.steps.length) : null;
    return { ctx, state, assignment, roadmap, progress };
  }

  function renderRunner() {
    if (!panel) return false;
    const runtime = currentRuntime();
    const { ctx, assignment, roadmap, progress } = runtime;
    if (!assignment || !roadmap || !progress) {
      panel.classList.remove('qol-rmr-open');
      panel.setAttribute('aria-hidden', 'true');
      return false;
    }

    const body = panel.querySelector('.qol-rmr-body');
    const title = panel.querySelector('.qol-rmr-header strong');
    if (title) title.textContent = roadmap.name;
    const total = roadmap.steps.length;
    const contextLine = assignment.scope === 'all'
      ? 'All Villages · shared progress'
      : `${ctx.villageName} · ${assignment.scope === 'every' ? 'Every Village' : 'This Village'}`;

    if (!total) {
      body.innerHTML = `
        <div class="qol-rma-runner-scope">${escapeHtml(contextLine)}</div>
        <div class="qol-rmr-empty">This roadmap has no steps yet.</div>
        <div class="qol-rmr-footer"><div class="qol-rmr-action secondary" data-action="hub" role="button" tabindex="0">Open Hub</div></div>`;
      return true;
    }

    if (progress.currentStep >= total) {
      body.innerHTML = `
        <div class="qol-rma-runner-scope">${escapeHtml(contextLine)}</div>
        <div class="qol-rmr-complete-mark">✓</div>
        <div class="qol-rmr-complete-title">Roadmap complete</div>
        <div class="qol-rmr-complete-copy">${escapeHtml(roadmap.name)} · ${total} steps processed${progress.skipped.length ? ` · ${progress.skipped.length} skipped` : ''}</div>
        <div class="qol-rmr-progress"><span style="width:100%"></span></div>
        <div class="qol-rmr-footer">
          <div class="qol-rmr-action secondary" data-action="back" role="button" tabindex="0">‹ Back</div>
          <div class="qol-rmr-action secondary" data-action="hub" role="button" tabindex="0">Open Hub</div>
          <div class="qol-rmr-action" data-action="restart" role="button" tabindex="0">Restart</div>
        </div>`;
      return true;
    }

    const step = roadmap.steps[progress.currentStep];
    const next = roadmap.steps[progress.currentStep + 1];
    const percent = Math.round((progress.currentStep / total) * 100);
    const wasSkipped = progress.skipped.includes(progress.currentStep);
    body.innerHTML = `
      <div class="qol-rma-runner-scope">${escapeHtml(contextLine)}</div>
      <div class="qol-rmr-meta"><span>Step ${progress.currentStep + 1} of ${total}</span><strong>${percent}%</strong></div>
      <div class="qol-rmr-progress"><span style="width:${percent}%"></span></div>
      <div class="qol-rmr-step-card${wasSkipped ? ' skipped' : ''}">
        <div class="qol-rmr-step-top"><span class="qol-rmr-type ${step.type === 'building' ? 'building' : ''}">${step.type === 'building' ? 'Building' : 'Instruction'}</span>${wasSkipped ? '<span class="qol-rmr-skipped">Previously skipped</span>' : ''}</div>
        <div class="qol-rmr-step-text">${escapeHtml(stepLabel(step))}</div>
      </div>
      <div class="qol-rmr-next"><span>Next</span><strong>${next ? escapeHtml(stepLabel(next)) : 'Final step'}</strong></div>
      <div class="qol-rmr-footer">
        <div class="qol-rmr-action secondary${progress.currentStep === 0 ? ' disabled' : ''}" data-action="back" role="button" tabindex="${progress.currentStep === 0 ? -1 : 0}">‹ Back</div>
        <div class="qol-rmr-action secondary" data-action="hub" role="button" tabindex="0">Hub</div>
        <div class="qol-rmr-action secondary" data-action="skip" role="button" tabindex="0">Skip ›</div>
        <div class="qol-rmr-action" data-action="complete" role="button" tabindex="0">✓ Complete</div>
      </div>`;
    return true;
  }

  function showRunner() {
    buildPanel();
    if (!renderRunner()) {
      window.APES?.roadmaps?.open?.();
      return;
    }
    panel.classList.add('qol-rmr-open');
    panel.setAttribute('aria-hidden', 'false');
    setVisible(true);
    requestAnimationFrame(clampPanel);
  }

  function hideRunner(userInitiated = true) {
    panel?.classList.remove('qol-rmr-open');
    panel?.setAttribute('aria-hidden', 'true');
    if (userInitiated) setVisible(false);
  }

  function moveBack() {
    const runtime = currentRuntime();
    if (!runtime.assignment || !runtime.roadmap || !runtime.progress || runtime.progress.currentStep <= 0) return;
    runtime.progress.currentStep -= 1;
    setProgress(runtime.ctx, runtime.state, runtime.assignment, runtime.progress);
    renderRunner();
    scheduleRefresh();
  }

  function advance(skip = false) {
    const runtime = currentRuntime();
    if (!runtime.assignment || !runtime.roadmap || !runtime.progress) return;
    if (runtime.progress.currentStep >= runtime.roadmap.steps.length) return;
    const index = runtime.progress.currentStep;
    const skipped = new Set(runtime.progress.skipped);
    if (skip) skipped.add(index);
    else skipped.delete(index);
    runtime.progress.skipped = [...skipped];
    runtime.progress.currentStep += 1;
    setProgress(runtime.ctx, runtime.state, runtime.assignment, runtime.progress);
    renderRunner();
    scheduleRefresh();
  }

  function restartCurrent() {
    const runtime = currentRuntime();
    if (!runtime.assignment || !runtime.roadmap) return;
    showConfirm('Restart Roadmap?', `Reset progress for “${runtime.roadmap.name}” in ${assignmentLabel(runtime.assignment.scope)}?`, 'Restart', () => {
      setProgress(runtime.ctx, runtime.state, runtime.assignment, { currentStep: 0, skipped: [] });
      showRunner();
      scheduleRefresh();
    });
  }

  function handleRunnerAction(action) {
    if (action === 'close') hideRunner(true);
    else if (action === 'hub') window.APES?.roadmaps?.open?.();
    else if (action === 'back') moveBack();
    else if (action === 'complete') advance(false);
    else if (action === 'skip') advance(true);
    else if (action === 'restart') restartCurrent();
  }

  function renderHubContext() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return;
    const actions = hub.querySelector('.qol-rm-actions');
    const selectedRoadmap = getAllRoadmaps()[getSelectedId()];
    if (actions && selectedRoadmap) {
      let load = actions.querySelector('[data-rma-load]');
      if (!load) {
        load = document.createElement('div');
        load.className = 'qol-rm-action qol-rma-load';
        load.dataset.rmaLoad = '1';
        load.setAttribute('role', 'button');
        load.setAttribute('tabindex', '0');
        actions.prepend(load);
      }
      load.textContent = 'Load Roadmap';
    }

    const summary = hub.querySelector('.qol-rm-summary');
    if (!summary) return;
    let card = hub.querySelector('.qol-rma-context');
    if (!card) {
      card = document.createElement('div');
      card.className = 'qol-rma-context';
      summary.insertAdjacentElement('afterend', card);
    }

    const runtime = currentRuntime();
    const { ctx, assignment, roadmap, progress } = runtime;
    const signature = JSON.stringify({
      playerId: ctx.playerId,
      villageId: ctx.villageId,
      villageName: ctx.villageName,
      roadmapId: assignment?.roadmapId || '',
      scope: assignment?.scope || '',
      current: progress?.currentStep ?? -1,
      total: roadmap?.steps?.length ?? 0
    });
    if (card.dataset.signature === signature) return;
    card.dataset.signature = signature;

    const contextName = validVillage(ctx) ? ctx.villageName : 'Resolving current village…';
    if (!assignment || !roadmap) {
      card.innerHTML = `
        <div class="qol-rma-context-copy">
          <span class="qol-rma-kicker">Current Village</span>
          <strong>${escapeHtml(contextName)}</strong>
          <small>No roadmap assigned here. Select a roadmap and choose Load Roadmap.</small>
        </div>`;
      return;
    }

    const total = roadmap.steps.length;
    const done = Math.min(progress.currentStep, total);
    card.innerHTML = `
      <div class="qol-rma-context-copy">
        <span class="qol-rma-kicker">Current Village</span>
        <strong>${escapeHtml(contextName)}</strong>
        <small>${escapeHtml(roadmap.name)} · ${escapeHtml(assignmentLabel(assignment.scope))} · Step ${total ? `${Math.min(done + 1, total)}/${total}` : '0/0'}</small>
      </div>
      <div class="qol-rma-context-progress"><span style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></div>
      <div class="qol-rma-context-actions">
        <div class="qol-rm-action qol-secondary" data-rma-open role="button" tabindex="0">Open Runner</div>
        <div class="qol-rm-action qol-secondary" data-rma-remove role="button" tabindex="0">Remove</div>
      </div>`;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      renderHubContext();
      if (panel?.classList.contains('qol-rmr-open')) renderRunner();
    });
  }

  function syncContext(force = false) {
    const ctx = contextSnapshot();
    const signature = `${ctx.server}|${ctx.playerId}|${ctx.villageId}|${ctx.villageName}`;
    if (!force && signature === lastContextSignature) return;
    lastContextSignature = signature;
    scheduleRefresh();
    const assignment = resolveAssignment(ctx, loadAccountState(ctx));
    if (assignment && isVisibleWanted()) {
      buildPanel();
      renderRunner();
      panel.classList.add('qol-rmr-open');
      panel.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(clampPanel);
    } else if (!assignment) {
      hideRunner(false);
    }
  }

  function init() {
    document.addEventListener('click', event => {
      const hub = document.getElementById(HUB_ID);
      const load = event.target.closest('[data-rma-load]');
      if (load && hub?.contains(load)) {
        event.preventDefault();
        event.stopPropagation();
        openAssignmentDialog();
        return;
      }
      const open = event.target.closest('[data-rma-open]');
      if (open && hub?.contains(open)) {
        event.preventDefault();
        event.stopPropagation();
        showRunner();
        return;
      }
      const remove = event.target.closest('[data-rma-remove]');
      if (remove && hub?.contains(remove)) {
        event.preventDefault();
        event.stopPropagation();
        removeCurrentAssignment();
      }
    }, true);

    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-rma-load],[data-rma-open],[data-rma-remove]')) {
        event.preventDefault();
        event.target.click();
      }
      if (event.key === 'Escape') {
        if (document.getElementById(ASSIGN_DIALOG_ID)) {
          closeDialog(ASSIGN_DIALOG_ID);
          event.stopImmediatePropagation();
        } else if (document.getElementById(CONFIRM_DIALOG_ID)) {
          closeDialog(CONFIRM_DIALOG_ID);
          event.stopImmediatePropagation();
        }
      }
    }, true);

    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', () => syncContext(true));
    window.addEventListener('resize', () => {
      if (panel?.classList.contains('qol-rmr-open')) clampPanel();
    }, { passive: true });
    setInterval(() => syncContext(false), 750);

    window.APES = window.APES || {};
    window.APES.roadmapsRunner = Object.freeze({
      open: showRunner,
      close: () => hideRunner(true),
      assignSelected: openAssignmentDialog,
      getContextState: currentRuntime,
      refresh: () => syncContext(true)
    });

    setTimeout(() => syncContext(true), 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
