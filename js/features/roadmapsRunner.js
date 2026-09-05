(() => {
  'use strict';

  const STATE_KEY = 'qol_roadmap_runner_v1';
  const WINDOW_KEY = 'qol_roadmap_runner_window_v1';
  const VISIBLE_KEY = 'qol_roadmap_runner_visible_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const PANEL_ID = 'qol-roadmap-runner';
  const HUB_ID = 'qol-roadmaps-container';
  const DIALOG_ID = 'qol-roadmap-runner-dialog';

  let panel = null;
  let refreshQueued = false;

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
      console.warn('[APES Roadmaps Runner] Could not save state.', error);
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

  function normalizeState() {
    const raw = readJson(STATE_KEY, {});
    const state = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const progress = state.progress && typeof state.progress === 'object' && !Array.isArray(state.progress) ? state.progress : {};
    return {
      activeId: clean(state.activeId),
      progress
    };
  }

  function saveState(state) {
    return writeJson(STATE_KEY, state);
  }

  function getProgress(state, roadmapId, total) {
    const raw = state.progress?.[roadmapId] || {};
    const currentStep = Math.max(0, Math.min(total, Number.isInteger(Number(raw.currentStep)) ? Number(raw.currentStep) : 0));
    const skipped = Array.isArray(raw.skipped)
      ? [...new Set(raw.skipped.map(Number).filter(index => Number.isInteger(index) && index >= 0 && index < total))]
      : [];
    return { currentStep, skipped };
  }

  function setProgress(state, roadmapId, progress) {
    state.progress = state.progress || {};
    state.progress[roadmapId] = {
      currentStep: Math.max(0, Number(progress.currentStep) || 0),
      skipped: [...new Set((progress.skipped || []).map(Number).filter(Number.isInteger))].sort((a, b) => a - b)
    };
    saveState(state);
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

  function stepLabel(step) {
    if (!step) return '';
    if (step.type === 'building') {
      const instance = step.instance ? ` #${step.instance}` : '';
      return `${step.building}${instance} → Level ${step.level}`;
    }
    return clean(step.text ?? step.label);
  }

  function closeConfirm() {
    document.getElementById(DIALOG_ID)?.remove();
  }

  function showConfirm(title, message, confirmLabel, onConfirm) {
    closeConfirm();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rmr-dialog" role="alertdialog" aria-modal="true">
        <div class="qol-rmr-dialog-head">${escapeHtml(title)}</div>
        <div class="qol-rmr-dialog-body">${escapeHtml(message)}</div>
        <div class="qol-rmr-dialog-actions">
          <div class="qol-rmr-action secondary" data-rmr-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rmr-action" data-rmr-confirm role="button" tabindex="0">${escapeHtml(confirmLabel)}</div>
        </div>
      </div>`;
    layer.querySelector('[data-rmr-cancel]').addEventListener('click', closeConfirm);
    layer.querySelector('[data-rmr-confirm]').addEventListener('click', () => {
      closeConfirm();
      onConfirm?.();
    });
    layer.addEventListener('click', event => {
      if (event.target === layer) closeConfirm();
    });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeConfirm();
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"]')) {
        event.preventDefault();
        event.target.click();
      }
    });
    document.body.appendChild(layer);
    layer.querySelector('[data-rmr-cancel]')?.focus();
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
        <div class="qol-rmr-close" data-rmr-action="close" role="button" tabindex="0" aria-label="Close Roadmap Runner">×</div>
      </div>
      <div class="qol-rmr-body"></div>`;
    document.body.appendChild(panel);
    makeDraggable();
    requestAnimationFrame(() => {
      applyWindowPosition();
      clampPanel();
    });
    panel.addEventListener('click', event => {
      const action = event.target.closest('[data-rmr-action]');
      if (!action) return;
      handleRunnerAction(action.dataset.rmrAction);
    });
    panel.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"]')) {
        event.preventDefault();
        event.target.click();
      }
    });
    return panel;
  }

  function renderRunner() {
    if (!panel) return;
    const state = normalizeState();
    const roadmap = getAllRoadmaps()[state.activeId];
    if (!roadmap) {
      panel.classList.remove('qol-rmr-open');
      panel.setAttribute('aria-hidden', 'true');
      return;
    }

    const total = roadmap.steps.length;
    const progress = getProgress(state, state.activeId, total);
    const body = panel.querySelector('.qol-rmr-body');
    const title = panel.querySelector('.qol-rmr-header strong');
    if (title) title.textContent = roadmap.name;

    if (!total) {
      body.innerHTML = `
        <div class="qol-rmr-empty">This roadmap has no steps yet.</div>
        <div class="qol-rmr-footer"><div class="qol-rmr-action secondary" data-rmr-action="hub" role="button" tabindex="0">Open Hub</div></div>`;
      return;
    }

    if (progress.currentStep >= total) {
      body.innerHTML = `
        <div class="qol-rmr-complete-mark">✓</div>
        <div class="qol-rmr-complete-title">Roadmap complete</div>
        <div class="qol-rmr-complete-copy">${escapeHtml(roadmap.name)} · ${total} steps processed${progress.skipped.length ? ` · ${progress.skipped.length} skipped` : ''}</div>
        <div class="qol-rmr-progress"><span style="width:100%"></span></div>
        <div class="qol-rmr-footer">
          <div class="qol-rmr-action secondary" data-rmr-action="back" role="button" tabindex="0">‹ Back</div>
          <div class="qol-rmr-action secondary" data-rmr-action="hub" role="button" tabindex="0">Open Hub</div>
          <div class="qol-rmr-action" data-rmr-action="restart" role="button" tabindex="0">Restart</div>
        </div>`;
      return;
    }

    const step = roadmap.steps[progress.currentStep];
    const next = roadmap.steps[progress.currentStep + 1];
    const percent = Math.round((progress.currentStep / total) * 100);
    const wasSkipped = progress.skipped.includes(progress.currentStep);
    body.innerHTML = `
      <div class="qol-rmr-meta"><span>Step ${progress.currentStep + 1} of ${total}</span><strong>${percent}%</strong></div>
      <div class="qol-rmr-progress"><span style="width:${percent}%"></span></div>
      <div class="qol-rmr-step-card${wasSkipped ? ' skipped' : ''}">
        <div class="qol-rmr-step-top"><span class="qol-rmr-type ${step.type === 'building' ? 'building' : ''}">${step.type === 'building' ? 'Building' : 'Instruction'}</span>${wasSkipped ? '<span class="qol-rmr-skipped">Previously skipped</span>' : ''}</div>
        <div class="qol-rmr-step-text">${escapeHtml(stepLabel(step))}</div>
      </div>
      <div class="qol-rmr-next"><span>Next</span><strong>${next ? escapeHtml(stepLabel(next)) : 'Final step'}</strong></div>
      <div class="qol-rmr-footer">
        <div class="qol-rmr-action secondary${progress.currentStep === 0 ? ' disabled' : ''}" data-rmr-action="back" role="button" tabindex="${progress.currentStep === 0 ? -1 : 0}">‹ Back</div>
        <div class="qol-rmr-action secondary" data-rmr-action="hub" role="button" tabindex="0">Hub</div>
        <div class="qol-rmr-action secondary" data-rmr-action="skip" role="button" tabindex="0">Skip ›</div>
        <div class="qol-rmr-action" data-rmr-action="complete" role="button" tabindex="0">✓ Complete</div>
      </div>`;
  }

  function showRunner() {
    buildPanel();
    renderRunner();
    panel.classList.add('qol-rmr-open');
    panel.setAttribute('aria-hidden', 'false');
    setVisible(true);
    requestAnimationFrame(clampPanel);
  }

  function hideRunner() {
    panel?.classList.remove('qol-rmr-open');
    panel?.setAttribute('aria-hidden', 'true');
    setVisible(false);
  }

  function activateRoadmap(roadmapId) {
    const all = getAllRoadmaps();
    const roadmap = all[roadmapId];
    if (!roadmap) return;
    const state = normalizeState();
    state.activeId = roadmapId;
    state.progress = state.progress || {};
    if (!state.progress[roadmapId]) state.progress[roadmapId] = { currentStep: 0, skipped: [] };
    saveState(state);
    showRunner();
    window.APES?.roadmaps?.close?.();
    scheduleRefresh();
  }

  function startSelectedRoadmap() {
    const roadmapId = getSelectedId();
    const all = getAllRoadmaps();
    if (!roadmapId || !all[roadmapId]) return;
    const state = normalizeState();
    if (state.activeId && state.activeId !== roadmapId) {
      const active = all[state.activeId];
      if (active) {
        const activeProgress = getProgress(state, state.activeId, active.steps.length);
        if (activeProgress.currentStep < active.steps.length) {
          showConfirm('Switch Roadmap?', `Stop viewing “${active.name}” and switch the runner to “${all[roadmapId].name}”? Your progress will be preserved.`, 'Switch Roadmap', () => activateRoadmap(roadmapId));
          return;
        }
      }
    }
    activateRoadmap(roadmapId);
  }

  function moveBack() {
    const state = normalizeState();
    const roadmap = getAllRoadmaps()[state.activeId];
    if (!roadmap) return;
    const progress = getProgress(state, state.activeId, roadmap.steps.length);
    if (progress.currentStep <= 0) return;
    progress.currentStep -= 1;
    setProgress(state, state.activeId, progress);
    renderRunner();
    scheduleRefresh();
  }

  function advance(skip = false) {
    const state = normalizeState();
    const roadmap = getAllRoadmaps()[state.activeId];
    if (!roadmap) return;
    const progress = getProgress(state, state.activeId, roadmap.steps.length);
    if (progress.currentStep >= roadmap.steps.length) return;
    const index = progress.currentStep;
    const skipped = new Set(progress.skipped);
    if (skip) skipped.add(index);
    else skipped.delete(index);
    progress.skipped = [...skipped];
    progress.currentStep += 1;
    setProgress(state, state.activeId, progress);
    renderRunner();
    scheduleRefresh();
  }

  function restartActive() {
    const state = normalizeState();
    const roadmap = getAllRoadmaps()[state.activeId];
    if (!roadmap) return;
    showConfirm('Restart Roadmap?', `Reset progress for “${roadmap.name}” back to Step 1?`, 'Restart', () => {
      setProgress(state, state.activeId, { currentStep: 0, skipped: [] });
      showRunner();
      scheduleRefresh();
    });
  }

  function handleRunnerAction(action) {
    if (action === 'close') hideRunner();
    else if (action === 'hub') window.APES?.roadmaps?.open?.();
    else if (action === 'back') moveBack();
    else if (action === 'complete') advance(false);
    else if (action === 'skip') advance(true);
    else if (action === 'restart') restartActive();
  }

  function hubButtonLabel(roadmapId, roadmap) {
    const state = normalizeState();
    const progress = getProgress(state, roadmapId, roadmap.steps.length);
    if (state.activeId === roadmapId) return progress.currentStep >= roadmap.steps.length ? 'View Completed' : 'Open Runner';
    if (progress.currentStep > 0 && progress.currentStep < roadmap.steps.length) return 'Continue Roadmap';
    if (progress.currentStep >= roadmap.steps.length && roadmap.steps.length) return 'View Completed';
    return 'Start Roadmap';
  }

  function enhanceHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return;
    const actions = hub.querySelector('.qol-rm-actions');
    if (!actions) return;
    const roadmapId = getSelectedId();
    const roadmap = getAllRoadmaps()[roadmapId];
    if (!roadmap) return;
    let button = actions.querySelector('[data-rmr-start]');
    if (!button) {
      button = document.createElement('div');
      button.className = 'qol-rm-action qol-rmr-hub-start';
      button.dataset.rmrStart = '1';
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      actions.prepend(button);
    }
    button.textContent = hubButtonLabel(roadmapId, roadmap);
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      enhanceHub();
      if (panel?.classList.contains('qol-rmr-open')) renderRunner();
    });
  }

  function init() {
    document.addEventListener('click', event => {
      const start = event.target.closest('[data-rmr-start]');
      if (start && document.getElementById(HUB_ID)?.contains(start)) startSelectedRoadmap();
    }, true);
    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-rmr-start]')) {
        event.preventDefault();
        event.target.click();
      }
    }, true);
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('resize', () => {
      if (panel?.classList.contains('qol-rmr-open')) clampPanel();
    }, { passive: true });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById(DIALOG_ID)) {
        closeConfirm();
        event.stopImmediatePropagation();
      }
    }, true);
    window.APES = window.APES || {};
    window.APES.roadmapsRunner = Object.freeze({
      open: showRunner,
      close: hideRunner,
      startSelected: startSelectedRoadmap,
      getState: normalizeState
    });
    setTimeout(() => {
      scheduleRefresh();
      const state = normalizeState();
      if (state.activeId && isVisibleWanted() && getAllRoadmaps()[state.activeId]) showRunner();
    }, 250);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
