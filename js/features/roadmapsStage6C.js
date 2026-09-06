(() => {
  'use strict';

  const CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const ASSIGNMENT_PREFIX = 'qol_roadmap_assignments_v1';
  const VISIBLE_KEY = 'qol_roadmap_runner_visible_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const RUNNER_ID = 'qol-roadmap-runner';
  const ASSIGN_DIALOG_ID = 'qol-roadmap-assignment-dialog';
  const EDIT_DIALOG_ID = 'qol-roadmaps-dialog-layer';
  const CHECKPOINT_PREFIX = '[Checkpoint] ';

  let queued = false;
  let observer = null;

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
      console.warn('[APES Roadmaps Stage 6C] Save failed.', error);
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

  function currentContext() {
    const source = window.APES?.context?.snapshot?.() || {};
    const server = clean(source.server || location.hostname.toLowerCase());
    const playerId = clean(source.playerId);
    const hashVillage = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    const villageId = clean(source.villageId === 'unknown' ? hashVillage : source.villageId) || hashVillage;
    const villageName = clean(source.villageName) || 'Current village';
    return { server, playerId, villageId, villageName };
  }

  function assignmentKey(ctx) {
    if (!ctx.server || !/^\d+$/.test(ctx.playerId)) return '';
    return `${ASSIGNMENT_PREFIX}:${ctx.server}:${ctx.playerId}`;
  }

  function checkpointText(step) {
    if (!step || step.type !== 'instruction') return '';
    const text = clean(step.text);
    if (!/^\[Checkpoint\]\s*/i.test(text)) return '';
    return clean(text.replace(/^\[Checkpoint\]\s*/i, ''));
  }

  function makeCheckpoint(text, id = '') {
    return {
      ...(id ? { id } : {}),
      type: 'instruction',
      text: `${CHECKPOINT_PREFIX}${clean(text)}`
    };
  }

  function newStepId() {
    return window.APES?.roadmapsStableIds?.newStepId?.()
      || `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }

  function showToast(message, type = 'success') {
    document.querySelector('.qol-rms6-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rms6-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function closeEditorDialog() {
    document.getElementById(EDIT_DIALOG_ID)?.remove();
  }

  function wireButton(element, handler) {
    if (!element || element.dataset.rms6Bound === '1') return;
    element.dataset.rms6Bound = '1';
    const run = event => {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    };
    element.addEventListener('click', run);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      run(event);
    });
  }

  function openCheckpointEditor(index = null) {
    const custom = readCustom();
    const roadmapId = selectedId();
    const roadmap = custom[roadmapId];
    if (!roadmap || !Array.isArray(roadmap.steps)) return;

    const editing = Number.isInteger(index);
    const oldStep = editing ? roadmap.steps[index] : null;
    const oldText = checkpointText(oldStep);
    if (editing && !oldText) return;

    closeEditorDialog();
    const layer = document.createElement('div');
    layer.id = EDIT_DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rm-dialog qol-rme-dialog qol-rms6-checkpoint-dialog" role="dialog" aria-modal="true">
        <div class="qol-rm-dialog-head">${editing ? 'Edit Checkpoint' : 'Add Checkpoint'}</div>
        <div class="qol-rm-dialog-body">
          <label for="qol-rms6-checkpoint-text">Checkpoint</label>
          <textarea id="qol-rms6-checkpoint-text" data-rms6-text rows="5" maxlength="600" placeholder="Example: Verify the village is ready before continuing."></textarea>
          <div class="qol-rms6-checkpoint-note">Checkpoints are always manual. APES will stop here until you press Complete or Skip, even when Automatic Detection is enabled.</div>
          <div class="qol-rm-dialog-status" aria-live="polite"></div>
        </div>
        <div class="qol-rm-dialog-actions">
          <div class="qol-rm-action qol-secondary" data-rms6-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rm-action" data-rms6-save role="button" tabindex="0">${editing ? 'Save Checkpoint' : 'Add Checkpoint'}</div>
        </div>
      </div>`;
    document.body.appendChild(layer);

    const input = layer.querySelector('[data-rms6-text]');
    const status = layer.querySelector('.qol-rm-dialog-status');
    input.value = oldText;

    wireButton(layer.querySelector('[data-rms6-cancel]'), closeEditorDialog);
    wireButton(layer.querySelector('[data-rms6-save]'), () => {
      const text = clean(input.value);
      if (!text) {
        status.textContent = 'Enter a checkpoint instruction.';
        input.focus();
        return;
      }
      const current = readCustom();
      const target = current[roadmapId];
      if (!target || !Array.isArray(target.steps)) return;
      if (editing) {
        const existingId = clean(target.steps[index]?.id) || newStepId();
        target.steps[index] = makeCheckpoint(text, existingId);
      } else {
        target.steps.push(makeCheckpoint(text, newStepId()));
      }
      writeJson(CUSTOM_KEY, current);
      closeEditorDialog();
      window.APES?.roadmapsStableIds?.syncNow?.();
      window.APES?.roadmaps?.refresh?.();
      window.APES?.roadmapsEditor?.enhance?.();
      scheduleEnhance();
      showToast(editing ? 'Checkpoint updated.' : 'Checkpoint added.');
    });

    layer.addEventListener('pointerdown', event => {
      if (event.target === layer) closeEditorDialog();
    });
    layer.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeEditorDialog();
    });
    input.focus();
  }

  function duplicateCheckpoint(index) {
    const custom = readCustom();
    const roadmap = custom[selectedId()];
    if (!roadmap || !Array.isArray(roadmap.steps)) return;
    const text = checkpointText(roadmap.steps[index]);
    if (!text) return;
    roadmap.steps.splice(index + 1, 0, makeCheckpoint(text, newStepId()));
    writeJson(CUSTOM_KEY, custom);
    window.APES?.roadmapsStableIds?.syncNow?.();
    window.APES?.roadmaps?.refresh?.();
    window.APES?.roadmapsEditor?.enhance?.();
    scheduleEnhance();
    showToast('Checkpoint duplicated.');
  }

  function interceptCheckpointActions(event) {
    const control = event.target.closest?.(`#${HUB_ID} [data-rme-step]`);
    if (!control) return;
    const index = Number(control.dataset.index);
    if (!Number.isInteger(index)) return;
    const roadmap = readCustom()[selectedId()];
    const step = Array.isArray(roadmap?.steps) ? roadmap.steps[index] : null;
    if (!checkpointText(step)) return;
    const action = clean(control.dataset.rmeStep);
    if (action !== 'edit' && action !== 'duplicate') return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (action === 'edit') openCheckpointEditor(index);
    else duplicateCheckpoint(index);
  }

  function enhanceCheckpointHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return;
    const roadmap = readCustom()[selectedId()];

    const add = hub.querySelector('.qol-rme-add');
    if (add && roadmap && !add.querySelector('[data-rms6-checkpoint-add]')) {
      const button = document.createElement('div');
      button.className = 'qol-rm-action qol-secondary';
      button.dataset.rms6CheckpointAdd = '1';
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      button.textContent = '+ Checkpoint';
      const instruction = add.querySelector('[data-rme-add="instruction"]');
      if (instruction) add.insertBefore(button, instruction);
      else add.appendChild(button);
      wireButton(button, () => openCheckpointEditor());
    }

    if (!Array.isArray(roadmap?.steps)) return;
    hub.querySelectorAll('.qol-rm-route .qol-rm-step').forEach((row, index) => {
      const text = checkpointText(roadmap.steps[index]);
      if (!text) return;
      row.classList.add('qol-rms6-checkpoint-row');
      const badge = row.querySelector('.qol-rm-step-type');
      if (badge) {
        badge.textContent = 'Checkpoint';
        badge.classList.remove('building', 'resource', 'instruction');
        badge.classList.add('checkpoint');
      }
      const stepText = row.querySelector('.qol-rm-step-text');
      if (stepText) stepText.textContent = text;
    });
  }

  function rawRuntime() {
    const runner = window.APES?.roadmapsRunner;
    return runner?.getRawContextState?.() || runner?.getContextState?.() || null;
  }

  function enhanceCheckpointRunner() {
    const panel = document.getElementById(RUNNER_ID);
    const runtime = rawRuntime();
    if (!panel || !runtime?.roadmap || !runtime?.progress) return;
    const index = Math.max(0, Number(runtime.progress.currentStep) || 0);
    const step = runtime.roadmap.steps?.[index];
    const text = checkpointText(step);
    panel.classList.toggle('qol-rms6-current-checkpoint', Boolean(text));
    if (!text) return;

    const badge = panel.querySelector('.qol-rmr-type');
    if (badge) {
      badge.textContent = 'Checkpoint';
      badge.classList.remove('building', 'resource');
      badge.classList.add('checkpoint');
    }
    const stepText = panel.querySelector('.qol-rmr-step-text');
    if (stepText) stepText.textContent = text;

    const card = panel.querySelector('.qol-rmr-step-card');
    if (card && !card.querySelector('.qol-rms6-checkpoint-note')) {
      const note = document.createElement('div');
      note.className = 'qol-rms6-checkpoint-note';
      note.textContent = 'Manual checkpoint — confirm this yourself before continuing.';
      card.appendChild(note);
    }

    const nextIndex = index + 1;
    const nextText = checkpointText(runtime.roadmap.steps?.[nextIndex]);
    if (nextText) {
      const next = panel.querySelector('.qol-rmr-next strong');
      if (next) next.textContent = nextText;
    }
  }

  function currentDetection() {
    return window.APES?.roadmapsStableIds?.getDetectionMode?.() || 'automatic';
  }

  function enhanceAssignmentDialog() {
    const layer = document.getElementById(ASSIGN_DIALOG_ID);
    if (!layer || layer.dataset.rms6Enhanced === '1') return;
    layer.dataset.rms6Enhanced = '1';

    const all = layer.querySelector('[data-scope="all"]');
    const wasAll = all?.classList.contains('active');
    all?.remove();
    if (wasAll || !layer.querySelector('[data-scope].active')) {
      const fallback = layer.querySelector('[data-scope="every"]') || layer.querySelector('[data-scope="village"]');
      if (fallback) {
        layer.querySelectorAll('[data-scope]').forEach(item => {
          item.classList.toggle('active', item === fallback);
          item.setAttribute('aria-checked', item === fallback ? 'true' : 'false');
        });
      }
    }

    const status = layer.querySelector('.qol-rma-dialog-status');
    if (!status) return;
    const block = document.createElement('div');
    block.className = 'qol-rms6-detection-block';
    block.innerHTML = `
      <div class="qol-rms6-section-title">Progress Detection</div>
      <div class="qol-rms6-detection-list" role="radiogroup" aria-label="Progress detection">
        <div class="qol-rms6-detection" data-rms6-detection="manual" role="radio" tabindex="0" aria-checked="false">
          <span class="qol-rma-radio"></span>
          <div><strong>Manual Detection</strong><small>APES shows the current step and waits for you to press Complete or Skip. Building and resource levels will not advance the roadmap automatically.</small></div>
        </div>
        <div class="qol-rms6-detection" data-rms6-detection="automatic" role="radio" tabindex="0" aria-checked="false">
          <span class="qol-rma-radio"></span>
          <div><strong>Automatic Detection</strong><small>APES watches supported building and resource levels and advances when the live village data indicates the objective is complete.</small></div>
        </div>
      </div>
      <div class="qol-rms6-auto-warning">Automatic detection depends on Travian's live/cached game data. Rare stale or incomplete data may cause errors or false positives. If APES advances incorrectly, use Back and continue manually.</div>`;
    status.before(block);

    let detection = currentDetection() === 'manual' ? 'manual' : 'automatic';
    const sync = () => {
      block.querySelectorAll('[data-rms6-detection]').forEach(option => {
        const active = option.dataset.rms6Detection === detection;
        option.classList.toggle('active', active);
        option.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      block.querySelector('.qol-rms6-auto-warning')?.classList.toggle('visible', detection === 'automatic');
      layer.dataset.rms6Detection = detection;
    };
    block.querySelectorAll('[data-rms6-detection]').forEach(option => {
      wireButton(option, () => {
        detection = option.dataset.rms6Detection;
        sync();
      });
    });
    sync();
  }

  function assignWithOptions(layer) {
    const ctx = currentContext();
    const key = assignmentKey(ctx);
    const roadmapId = selectedId();
    const roadmaps = window.APES?.roadmaps?.getAllRoadmaps?.() || {};
    if (!key || !/^\d+$/.test(ctx.villageId) || !roadmaps[roadmapId]) {
      showToast('APES is still resolving the current account and village.', 'error');
      return;
    }

    const scope = layer.querySelector('[data-scope].active')?.dataset.scope === 'every' ? 'every' : 'village';
    const detection = layer.dataset.rms6Detection === 'manual' ? 'manual' : 'automatic';
    const state = readJson(key, {});
    state.version = Math.max(1, Number(state.version) || 1);
    state.villages = state.villages && typeof state.villages === 'object' ? state.villages : {};
    state.progress = state.progress && typeof state.progress === 'object' ? state.progress : { shared: {}, villages: {} };
    state.progress.shared = state.progress.shared && typeof state.progress.shared === 'object' ? state.progress.shared : {};
    state.progress.villages = state.progress.villages && typeof state.progress.villages === 'object' ? state.progress.villages : {};
    const now = Date.now();

    if (scope === 'every') {
      state.defaultAssignment = { scope: 'every', roadmapId, assignedAt: now, detection };
      state.villages = {};
    } else {
      state.villages[ctx.villageId] = {
        roadmapId,
        assignedAt: now,
        villageName: ctx.villageName,
        detection
      };
    }

    state.progress.villages[ctx.villageId] = state.progress.villages[ctx.villageId] || {};
    state.progress.villages[ctx.villageId][roadmapId] = state.progress.villages[ctx.villageId][roadmapId] || { currentStep: 0, skipped: [] };

    if (!writeJson(key, state)) return;
    try { localStorage.setItem(VISIBLE_KEY, 'true'); } catch (_) {}
    document.getElementById(ASSIGN_DIALOG_ID)?.remove();
    window.APES?.roadmapsStableIds?.syncNow?.();
    window.APES?.roadmaps?.close?.();
    setTimeout(() => {
      window.APES?.roadmapsRunner?.refresh?.();
      window.APES?.roadmapsRunner?.open?.();
    }, 0);
    showToast(`${scope === 'every' ? 'Every Village' : 'This Village'} · ${detection === 'manual' ? 'Manual' : 'Automatic'} detection loaded.`);
  }

  function interceptAssignmentLoad(event) {
    const load = event.target.closest?.(`#${ASSIGN_DIALOG_ID} [data-load]`);
    if (!load) return;
    const layer = document.getElementById(ASSIGN_DIALOG_ID);
    if (!layer) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    assignWithOptions(layer);
  }

  function enhanceDetectionLabels() {
    const runtime = rawRuntime();
    if (!runtime?.assignment) return;
    const mode = currentDetection();
    const runner = document.getElementById(RUNNER_ID);
    if (runner) {
      let badge = runner.querySelector('.qol-rms6-detection-mode');
      const body = runner.querySelector('.qol-rmr-body');
      if (body && !badge) {
        badge = document.createElement('div');
        badge.className = 'qol-rms6-detection-mode';
        body.prepend(badge);
      }
      if (badge) {
        badge.className = `qol-rms6-detection-mode ${mode}`;
        badge.textContent = mode === 'manual' ? 'Manual Detection' : 'Automatic Detection';
      }
    }

    const hub = document.getElementById(HUB_ID);
    const context = hub?.querySelector('.qol-rma-context-copy small');
    if (context && !context.querySelector?.('.qol-rms6-inline-mode')) {
      const suffix = document.createElement('span');
      suffix.className = `qol-rms6-inline-mode ${mode}`;
      suffix.textContent = ` · ${mode === 'manual' ? 'Manual' : 'Automatic'}`;
      context.appendChild(suffix);
    }
  }

  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhanceCheckpointHub();
      enhanceCheckpointRunner();
      enhanceAssignmentDialog();
      enhanceDetectionLabels();
    });
  }

  function init() {
    document.addEventListener('click', interceptCheckpointActions, true);
    document.addEventListener('click', interceptAssignmentLoad, true);
    document.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      interceptCheckpointActions(event);
      interceptAssignmentLoad(event);
    }, true);

    observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('hashchange', scheduleEnhance);

    scheduleEnhance();
    setTimeout(scheduleEnhance, 300);
    setTimeout(scheduleEnhance, 900);

    window.APES = window.APES || {};
    window.APES.roadmapsStage6C = Object.freeze({
      addCheckpoint: () => openCheckpointEditor(),
      checkpointText,
      enhance: scheduleEnhance
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
