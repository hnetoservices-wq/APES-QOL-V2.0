(() => {
  'use strict';

  const CUSTOM_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const ORDER_KEY = 'qol_roadmap_custom_order_v1';
  const SORT_KEY = 'qol_roadmap_custom_sort_v1';
  const PANEL_ID = 'qol-roadmaps-container';
  const RUNNER_ID = 'qol-roadmap-runner';
  const DIALOG_ID = 'qol-roadmap-ux-dialog';
  const SHARING_DIALOG_ID = 'qol-roadmap-sharing-dialog';
  const FORMAT = 'APES_QOL_ROADMAP';
  const FORMAT_VERSION = 1;

  let enhanceQueued = false;
  let stepDrag = null;
  let roadmapDrag = null;
  let pendingEditedComment = null;
  let pendingDuplicateSource = null;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function cleanComment(value) {
    return String(value ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.replace(/[\t ]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
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
      console.warn('[APES Roadmaps UX] Could not save data.', error);
      return false;
    }
  }

  function selectedId() {
    try { return clean(localStorage.getItem(SELECTED_KEY)); }
    catch (_) { return ''; }
  }

  function setSelectedId(id) {
    try { localStorage.setItem(SELECTED_KEY, String(id || '')); }
    catch (_) {}
  }

  function readCustom() {
    const value = readJson(CUSTOM_KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function writeCustom(custom) {
    return writeJson(CUSTOM_KEY, custom);
  }

  function getSortMode() {
    try { return localStorage.getItem(SORT_KEY) === 'alpha' ? 'alpha' : 'manual'; }
    catch (_) { return 'manual'; }
  }

  function setSortMode(mode) {
    try { localStorage.setItem(SORT_KEY, mode === 'alpha' ? 'alpha' : 'manual'); }
    catch (_) {}
  }

  function normalizedOrder(custom = readCustom()) {
    const ids = Object.keys(custom);
    const saved = readJson(ORDER_KEY, []);
    const seen = new Set();
    const ordered = [];
    if (Array.isArray(saved)) {
      saved.forEach(id => {
        const key = String(id || '');
        if (custom[key] && !seen.has(key)) {
          seen.add(key);
          ordered.push(key);
        }
      });
    }
    ids.forEach(id => { if (!seen.has(id)) ordered.push(id); });
    if (JSON.stringify(saved) !== JSON.stringify(ordered)) writeJson(ORDER_KEY, ordered);
    return ordered;
  }

  function showToast(message, tone = 'success') {
    document.querySelector('.qol-rmux-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rmux-toast ${tone}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  }

  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove();
  }

  function wirePress(element, handler) {
    if (!element || element.dataset.rmuxBound === '1') return;
    element.dataset.rmuxBound = '1';
    element.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    });
    element.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      handler(event);
    });
  }

  function openCommentDialog(index) {
    const custom = readCustom();
    const id = selectedId();
    const roadmap = custom[id];
    const step = roadmap?.steps?.[index];
    if (!step) return;

    closeDialog();
    const label = step.type === 'building'
      ? `${step.building}${step.instance ? ` #${step.instance}` : ''} → Level ${step.level}`
      : step.text || '';
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rmux-dialog" role="dialog" aria-modal="true" aria-label="Step comment">
        <div class="qol-rmux-dialog-head">Step ${index + 1} Comment</div>
        <div class="qol-rmux-dialog-body">
          <div class="qol-rmux-dialog-step">${escapeHtml(label)}</div>
          <label for="qol-rmux-comment-input">Comment</label>
          <textarea id="qol-rmux-comment-input" maxlength="700" rows="5" placeholder="Optional note shown with this step..."></textarea>
          <small>Comments are informational. They do not affect automatic detection.</small>
        </div>
        <div class="qol-rmux-dialog-actions">
          <div class="qol-rmux-btn secondary" data-rmux-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rmux-btn" data-rmux-save role="button" tabindex="0">Save Comment</div>
        </div>
      </div>`;
    document.body.appendChild(layer);
    const input = layer.querySelector('#qol-rmux-comment-input');
    input.value = step.comment || '';

    const save = () => {
      const latest = readCustom();
      const latestStep = latest[id]?.steps?.[index];
      if (!latestStep) return closeDialog();
      const comment = cleanComment(input.value);
      if (comment) latestStep.comment = comment;
      else delete latestStep.comment;
      writeCustom(latest);
      closeDialog();
      window.APES?.roadmaps?.refresh?.();
      scheduleEnhance();
      showToast(comment ? 'Step comment saved.' : 'Step comment removed.', comment ? 'success' : 'info');
    };

    wirePress(layer.querySelector('[data-rmux-cancel]'), closeDialog);
    wirePress(layer.querySelector('[data-rmux-save]'), save);
    layer.addEventListener('pointerdown', event => { if (event.target === layer) closeDialog(); });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  function restorePendingEditComment() {
    if (!pendingEditedComment || document.getElementById('qol-roadmaps-dialog-layer')) return;
    const { id, index, comment } = pendingEditedComment;
    pendingEditedComment = null;
    if (!comment) return;
    const custom = readCustom();
    const step = custom[id]?.steps?.[index];
    if (!step || cleanComment(step.comment) === comment) return;
    step.comment = comment;
    writeCustom(custom);
    window.APES?.roadmaps?.refresh?.();
  }

  function restoreDuplicateComments() {
    if (!pendingDuplicateSource) return;
    const targetId = selectedId();
    if (!targetId || targetId === pendingDuplicateSource.id) return;
    const custom = readCustom();
    const target = custom[targetId];
    if (!target || !Array.isArray(target.steps)) return;
    pendingDuplicateSource.comments.forEach((comment, index) => {
      if (comment && target.steps[index]) target.steps[index].comment = comment;
    });
    writeCustom(custom);
    pendingDuplicateSource = null;
    window.APES?.roadmaps?.refresh?.();
  }

  function reorderSteps(fromIndex, toIndex) {
    const id = selectedId();
    const custom = readCustom();
    const roadmap = custom[id];
    if (!roadmap || !Array.isArray(roadmap.steps)) return;
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= roadmap.steps.length || toIndex >= roadmap.steps.length) return;
    const [step] = roadmap.steps.splice(fromIndex, 1);
    roadmap.steps.splice(toIndex, 0, step);
    if (!writeCustom(custom)) return;
    window.APES?.roadmapsEditor?.repair?.();
    window.APES?.roadmaps?.refresh?.();
    scheduleEnhance();
  }

  function reorderRoadmaps(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const custom = readCustom();
    if (!custom[fromId] || !custom[toId]) return;
    const order = normalizedOrder(custom);
    const fromIndex = order.indexOf(fromId);
    const toIndex = order.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    order.splice(fromIndex, 1);
    order.splice(toIndex, 0, fromId);
    writeJson(ORDER_KEY, order);
    scheduleEnhance();
  }

  function enhanceCustomSidebar(panel) {
    const library = panel.querySelector('.qol-rm-library');
    if (!library) return;
    const custom = readCustom();
    const customIds = new Set(Object.keys(custom));
    const groupTitle = [...library.querySelectorAll('.qol-rm-group-title')]
      .find(node => clean(node.childNodes?.[0]?.textContent || node.textContent).toLowerCase().startsWith('my roadmaps'));
    if (!groupTitle) return;

    let controls = groupTitle.querySelector('.qol-rmux-order-controls');
    if (!controls) {
      controls = document.createElement('span');
      controls.className = 'qol-rmux-order-controls';
      controls.innerHTML = '<span class="qol-rmux-sort" data-rmux-sort="manual" role="button" tabindex="0" title="Drag custom roadmaps to reorder">Manual</span><span class="qol-rmux-sort" data-rmux-sort="alpha" role="button" tabindex="0" title="Sort custom roadmaps alphabetically">A–Z</span>';
      groupTitle.appendChild(controls);
      controls.querySelectorAll('[data-rmux-sort]').forEach(control => wirePress(control, () => {
        setSortMode(control.dataset.rmuxSort);
        scheduleEnhance();
      }));
    }

    const mode = getSortMode();
    controls.querySelectorAll('[data-rmux-sort]').forEach(control => control.classList.toggle('active', control.dataset.rmuxSort === mode));
    const items = [...library.querySelectorAll('.qol-rm-nav-item[data-roadmap-select]')].filter(item => customIds.has(item.dataset.roadmapSelect));
    const byId = new Map(items.map(item => [item.dataset.roadmapSelect, item]));
    const order = mode === 'alpha'
      ? Object.keys(custom).sort((a, b) => clean(custom[a]?.name).localeCompare(clean(custom[b]?.name), undefined, { sensitivity: 'base', numeric: true }))
      : normalizedOrder(custom);

    let anchor = groupTitle;
    order.forEach(id => {
      const item = byId.get(id);
      if (!item) return;
      if (anchor.nextElementSibling !== item) anchor.insertAdjacentElement('afterend', item);
      anchor = item;
      item.classList.toggle('qol-rmux-roadmap-draggable', mode === 'manual');
      let handle = item.querySelector('.qol-rmux-roadmap-drag');
      if (mode === 'manual' && !handle) {
        handle = document.createElement('span');
        handle.className = 'qol-rmux-roadmap-drag';
        handle.setAttribute('draggable', 'true');
        handle.setAttribute('title', 'Drag to reorder roadmap');
        handle.setAttribute('aria-label', 'Drag roadmap');
        handle.textContent = '⋮⋮';
        item.querySelector('.qol-rm-nav-row')?.prepend(handle);
      }
      if (mode !== 'manual' && handle) handle.remove();
    });
  }

  function syncStepComment(row, step) {
    const comment = cleanComment(step?.comment);
    let note = row.querySelector('.qol-rmux-step-comment');
    if (!comment) {
      note?.remove();
      return;
    }
    if (!note) {
      note = document.createElement('div');
      note.className = 'qol-rmux-step-comment';
      const text = row.querySelector('.qol-rm-step-text');
      if (text) text.insertAdjacentElement('afterend', note);
      else row.appendChild(note);
    }
    if (note.textContent !== comment) note.textContent = comment;
  }

  function enhanceSteps(panel) {
    const custom = readCustom();
    const roadmap = custom[selectedId()];
    if (!roadmap || !Array.isArray(roadmap.steps)) return;
    const rows = [...panel.querySelectorAll('.qol-rm-route .qol-rm-step')];

    rows.forEach((row, index) => {
      const step = roadmap.steps[index];
      if (!step) return;
      row.dataset.rmuxStepIndex = String(index);
      row.classList.add('qol-rmux-step');

      if (!row.querySelector('.qol-rmux-step-drag')) {
        const handle = document.createElement('span');
        handle.className = 'qol-rmux-step-drag';
        handle.setAttribute('draggable', 'true');
        handle.setAttribute('title', 'Drag to reorder step');
        handle.setAttribute('aria-label', `Drag step ${index + 1}`);
        handle.textContent = '⋮⋮';
        row.prepend(handle);
      }

      const actions = row.querySelector('.qol-rme-step-actions');
      let commentButton = actions?.querySelector('[data-rmux-comment]');
      if (actions && !commentButton) {
        commentButton = document.createElement('div');
        commentButton.className = 'qol-rme-icon qol-rmux-comment-btn';
        commentButton.setAttribute('role', 'button');
        commentButton.setAttribute('tabindex', '0');
        commentButton.setAttribute('title', 'Add or edit comment');
        commentButton.textContent = '✎+';
        actions.prepend(commentButton);
        wirePress(commentButton, () => openCommentDialog(Number(commentButton.dataset.rmuxComment)));
      }
      if (commentButton) {
        commentButton.dataset.rmuxComment = String(index);
        commentButton.classList.toggle('has-comment', Boolean(cleanComment(step.comment)));
      }
      syncStepComment(row, step);
    });
  }

  function enhanceRunnerComment() {
    const runner = document.getElementById(RUNNER_ID);
    if (!runner) return;
    const rt = window.APES?.roadmapsRunner?.getContextState?.() || window.APES?.roadmapsRunner?.getRawContextState?.();
    const roadmapId = clean(rt?.assignment?.roadmapId || selectedId());
    const index = Math.max(0, Number(rt?.progress?.currentStep) || 0);
    const comment = cleanComment(readCustom()?.[roadmapId]?.steps?.[index]?.comment);
    let note = runner.querySelector('.qol-rmux-runner-comment');
    if (!comment) {
      note?.remove();
      return;
    }
    const card = runner.querySelector('.qol-rmr-step-card');
    if (!card) return;
    if (!note) {
      note = document.createElement('div');
      note.className = 'qol-rmux-runner-comment';
      note.innerHTML = '<strong>Note</strong><span></span>';
      card.appendChild(note);
    } else if (note.parentElement !== card) {
      card.appendChild(note);
    }
    const span = note.querySelector('span');
    if (span && span.textContent !== comment) span.textContent = comment;
  }

  function enhancePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.classList.add('qol-rmux-clean');
    restorePendingEditComment();
    restoreDuplicateComments();
    enhanceCustomSidebar(panel);
    enhanceSteps(panel);
    enhanceRunnerComment();
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      enhancePanel();
      enhanceSharingDialog();
    });
  }

  function onDragStart(event) {
    const stepHandle = event.target?.closest?.('.qol-rmux-step-drag');
    const stepRow = stepHandle?.closest?.('.qol-rm-step[data-rmux-step-index]');
    if (stepHandle && stepRow) {
      stepDrag = { id: selectedId(), index: Number(stepRow.dataset.rmuxStepIndex) };
      stepRow.classList.add('qol-rmux-dragging');
      try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `step:${stepDrag.index}`); } catch (_) {}
      return;
    }
    const roadmapHandle = event.target?.closest?.('.qol-rmux-roadmap-drag');
    const roadmapItem = roadmapHandle?.closest?.('.qol-rm-nav-item[data-roadmap-select]');
    if (roadmapHandle && roadmapItem && getSortMode() === 'manual') {
      roadmapDrag = { id: roadmapItem.dataset.roadmapSelect };
      roadmapItem.classList.add('qol-rmux-dragging');
      try { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', `roadmap:${roadmapDrag.id}`); } catch (_) {}
    }
  }

  function onDragOver(event) {
    const stepRow = event.target?.closest?.('.qol-rm-step[data-rmux-step-index]');
    if (stepDrag && stepRow && stepDrag.id === selectedId()) {
      event.preventDefault();
      stepRow.classList.add('qol-rmux-drop-target');
      return;
    }
    const nav = event.target?.closest?.('.qol-rm-nav-item[data-roadmap-select]');
    if (roadmapDrag && nav && readCustom()[nav.dataset.roadmapSelect] && getSortMode() === 'manual') {
      event.preventDefault();
      nav.classList.add('qol-rmux-drop-target');
    }
  }

  function onDragLeave(event) {
    event.target?.closest?.('.qol-rmux-drop-target')?.classList.remove('qol-rmux-drop-target');
  }

  function clearDragState() {
    stepDrag = null;
    roadmapDrag = null;
    document.querySelectorAll('.qol-rmux-drop-target,.qol-rmux-dragging').forEach(node => node.classList.remove('qol-rmux-drop-target', 'qol-rmux-dragging'));
  }

  function onDrop(event) {
    const stepRow = event.target?.closest?.('.qol-rm-step[data-rmux-step-index]');
    if (stepDrag && stepRow && stepDrag.id === selectedId()) {
      event.preventDefault();
      const source = stepDrag.index;
      const target = Number(stepRow.dataset.rmuxStepIndex);
      clearDragState();
      reorderSteps(source, target);
      return;
    }
    const nav = event.target?.closest?.('.qol-rm-nav-item[data-roadmap-select]');
    if (roadmapDrag && nav && getSortMode() === 'manual') {
      event.preventDefault();
      const source = roadmapDrag.id;
      const target = nav.dataset.roadmapSelect;
      clearDragState();
      reorderRoadmaps(source, target);
    }
  }

  function preserveEditAndDuplicate(event) {
    const edit = event.target?.closest?.('[data-rme-step="edit"]');
    if (edit) {
      const id = selectedId();
      const index = Number(edit.dataset.index);
      pendingEditedComment = { id, index, comment: cleanComment(readCustom()?.[id]?.steps?.[index]?.comment) };
      return;
    }
    const duplicate = event.target?.closest?.('[data-roadmap-action="duplicate"]');
    if (duplicate) {
      const id = selectedId();
      const source = readCustom()[id];
      if (source?.steps) pendingDuplicateSource = { id, comments: source.steps.map(step => cleanComment(step?.comment)) };
    }
  }

  function sanitizeStep(step) {
    if (!step || typeof step !== 'object') throw new Error('A roadmap step is invalid.');
    const comment = cleanComment(step.comment);
    if (step.type === 'building') {
      const building = clean(step.building);
      const level = Number(step.level);
      if (!building || !Number.isInteger(level) || level < 1) throw new Error('A building step is invalid.');
      return {
        type: 'building', building,
        buildingId: Number.isFinite(Number(step.buildingId)) ? Number(step.buildingId) : null,
        level,
        ...(step.exact === true ? { exact: true } : {}),
        ...(Number.isInteger(Number(step.instance)) && Number(step.instance) > 0 ? { instance: Number(step.instance) } : {}),
        ...(step.tribeWall === true ? { tribeWall: true } : {}),
        ...(comment ? { comment } : {})
      };
    }
    const text = clean(step.text ?? step.label);
    if (!text) throw new Error('An instruction step is empty.');
    return { type: 'instruction', text, ...(comment ? { comment } : {}) };
  }

  function sanitizeRoadmap(value) {
    const source = value && typeof value === 'object' ? value : null;
    if (!source) throw new Error('Roadmap data is missing.');
    const name = clean(source.name);
    if (!name) throw new Error('The roadmap has no name.');
    if (!Array.isArray(source.steps)) throw new Error('The roadmap has no valid step list.');
    return { name, description: clean(source.description ?? source.pretext), steps: source.steps.map(sanitizeStep) };
  }

  function selectedForSharing() {
    return readCustom()[selectedId()] || window.APES?.roadmaps?.getAllRoadmaps?.()?.[selectedId()] || null;
  }

  function exportJson() {
    const roadmap = selectedForSharing();
    if (!roadmap) return '';
    return JSON.stringify({ format: FORMAT, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), roadmap: sanitizeRoadmap(roadmap) }, null, 2);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) {}
      area.remove();
      return ok;
    }
  }

  function uniqueImportedName(name) {
    const all = window.APES?.roadmaps?.getAllRoadmaps?.() || {};
    const custom = readCustom();
    const names = new Set([...Object.values(all), ...Object.values(custom)].map(item => clean(item?.name).toLocaleLowerCase()));
    if (!names.has(name.toLocaleLowerCase())) return name;
    const base = name.replace(/\s+-\s+Imported(?:\s+\d+)?$/i, '') || name;
    let candidate = `${base} - Imported`;
    let number = 2;
    while (names.has(candidate.toLocaleLowerCase())) candidate = `${base} - Imported ${number++}`;
    return candidate;
  }

  function parseImportedRoadmap(text) {
    let parsed;
    try { parsed = JSON.parse(String(text || '').trim()); }
    catch (_) { throw new Error('That does not appear to be valid Roadmap JSON.'); }
    if (parsed?.format) {
      if (parsed.format !== FORMAT) throw new Error('This is not an APES Roadmap export.');
      if (Number(parsed.version) !== FORMAT_VERSION) throw new Error(`Unsupported Roadmap format version: ${parsed.version}.`);
      return sanitizeRoadmap(parsed.roadmap);
    }
    return sanitizeRoadmap(parsed?.roadmap || parsed);
  }

  function enhanceSharingDialog() {
    const layer = document.getElementById(SHARING_DIALOG_ID);
    if (!layer) return;
    const exportArea = layer.querySelector('[data-rms-export]');
    if (exportArea && exportArea.dataset.rmuxPrepared !== '1') {
      const json = exportJson();
      if (json) exportArea.value = json;
      exportArea.dataset.rmuxPrepared = '1';
      exportArea.focus();
      exportArea.select();
    }
  }

  async function handleSharingAction(event) {
    const layer = event.target?.closest?.(`#${SHARING_DIALOG_ID}`);
    if (!layer) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;

    const copy = event.target?.closest?.('[data-rms-copy]');
    if (copy) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const text = layer.querySelector('[data-rms-export]')?.value || exportJson();
      const ok = await copyText(text);
      const status = layer.querySelector('[data-rms-status]');
      if (status) {
        status.textContent = ok ? 'Copied. Paste this into Discord or send it to another APES user.' : 'Copy failed. Select the text and copy it manually.';
        status.classList.toggle('error', !ok);
      }
      return;
    }

    const confirm = event.target?.closest?.('[data-rms-import-confirm]');
    if (!confirm) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const status = layer.querySelector('[data-rms-status]');
    let roadmap;
    try { roadmap = parseImportedRoadmap(layer.querySelector('[data-rms-import]')?.value || ''); }
    catch (error) {
      if (status) {
        status.textContent = error.message || 'Could not import this roadmap.';
        status.classList.add('error');
      }
      return;
    }
    roadmap.name = uniqueImportedName(roadmap.name);
    const custom = readCustom();
    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    custom[id] = roadmap;
    if (!writeCustom(custom)) {
      if (status) {
        status.textContent = 'Could not save the imported roadmap.';
        status.classList.add('error');
      }
      return;
    }
    setSelectedId(id);
    normalizedOrder(custom);
    layer.remove();
    window.APES?.roadmaps?.open?.();
    window.APES?.roadmapsRunner?.refresh?.();
    showToast(`Imported “${roadmap.name}”.`);
    scheduleEnhance();
  }

  function handlePlannerImport() {
    window.APES_RESOURCE_UPGRADE_PLANNER?.close?.();
    setTimeout(() => {
      window.APES?.roadmaps?.open?.();
      window.APES?.roadmaps?.refresh?.();
      scheduleEnhance();
    }, 80);
  }

  function init() {
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('dragleave', onDragLeave, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('dragend', clearDragState, true);
    document.addEventListener('click', preserveEditAndDuplicate, true);
    document.addEventListener('click', handleSharingAction, true);
    document.addEventListener('keydown', handleSharingAction, true);
    window.addEventListener('apes_roadmap_imported', handlePlannerImport);

    const observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scheduleEnhance();
    setInterval(() => {
      restorePendingEditComment();
      enhanceRunnerComment();
    }, 1200);

    window.APES = window.APES || {};
    window.APES.roadmapsUx = Object.freeze({ refresh: scheduleEnhance, openComment: openCommentDialog, sortMode: getSortMode });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
