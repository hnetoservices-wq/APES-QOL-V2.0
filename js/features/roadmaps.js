(() => {
  'use strict';

  const FEATURE_KEY = 'roadmaps';
  const CUSTOM_STORAGE_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_STORAGE_KEY = 'qol_roadmap_selected_v1';
  const WINDOW_STORAGE_KEY = 'qol_roadmap_window_state_v1';
  const BUTTON_ID = 'qol-roadmaps-toggle-btn';
  const PANEL_ID = 'qol-roadmaps-container';
  const DIALOG_ID = 'qol-roadmaps-dialog-layer';
  const TOOLBAR_ID = 'qol-responsive-toolbar';

  const instruction = text => ({ type: 'instruction', text });
  const building = (buildingName, buildingId, level, extra = {}) => ({
    type: 'building',
    building: buildingName,
    buildingId,
    level,
    ...extra
  });

  const BUILTIN_ROADMAPS = Object.freeze({
    x3_speedsettle: {
      name: 'x3 Speed Settle',
      description: 'The existing APES x3 settlement guide, represented in the new Roadmap format. These steps remain manual instructions for now.',
      steps: [
        instruction('Finish the tutorial. Do not skip it; attack the furthest hideout first during the tutorial.'),
        instruction('Queue 5 units.'),
        instruction('Attack the closest hideout until it is empty. Send the hero on adventures continuously.'),
        instruction('Upgrade the Warehouse and Granary to level 3.'),
        instruction('Build the Embassy to level 1 and annex an oasis if possible.'),
        instruction('Build the Marketplace and Cranny to level 1.'),
        instruction('Upgrade every crop field to level 2, then every crop field to level 3.'),
        instruction('Optional when demolishing the spawn village: upgrade every resource field to level 2.'),
        instruction('Upgrade the Main Building to level 7.'),
        instruction('Build the Residence to level 1.'),
        instruction('Activate Gold Club, Travian Plus, Resource Bonus and Crop Bonus.'),
        instruction('Upgrade the Warehouse to level 5 so it can hold the quest rewards.'),
        instruction('Upgrade the Residence to level 5.'),
        instruction('Complete free quests such as renaming the village, changing hero production and healing the hero.'),
        instruction('If affordable, play card games for an extra adventure point and chests.'),
        instruction('After Residence level 5 finishes, collect the quest reward, upgrade it to level 10 and queue the first Settler.'),
        instruction('Queue the second Settler as soon as possible. Clear the first two hideouts, sell stolen goods and use the seventh hero adventure for more resources.'),
        instruction('Catch animals in a nearby oasis after the seventh adventure for the quest reward.'),
        instruction('Wait for the third and fourth hideouts. They should spawn roughly 1h27m after clearing the first two.'),
        instruction('Use the first Settler to empty the third and fourth hideouts. Send extra troops so the Settler survives.'),
        instruction('Queue the third Settler. Use resource or crop chests if necessary.'),
        instruction('Upgrade the Main Building to level 10.'),
        instruction('Demolish the Residence, timing completion for a few seconds after the third Settler completes.'),
        instruction('Upgrade Barracks to level 3, Academy to level 10, Town Hall to level 1 and Workshop to level 1.'),
        instruction('Upgrade the Granary to level 7.'),
        instruction('Start a Small Celebration, relocate and send the Settlers.'),
        instruction('Thank Ruben from Triangles for the guide.')
      ]
    },
    x1_support_500cp: {
      name: 'x1 Support Village — 500 CP/day',
      description: 'A structured version of the APES x1 support-village build. This is still a profile preview in Stage 1; the exact one-step-at-a-time build route will be authored in the Roadmap Editor later.',
      steps: [
        building('Main Building', 15, 5),
        building('Warehouse', 10, 12),
        building('Granary', 11, 12),
        instruction('Upgrade every resource field to level 10.'),
        building('Sawmill', 5, 5),
        building('Brickyard', 6, 5),
        building('Iron Foundry', 7, 5),
        building('Grain Mill', 8, 5),
        building('Bakery', 9, 5),
        building('Residence', 25, 10),
        building('Marketplace', 17, 20),
        building('Barracks', 19, 3),
        building('Academy', 22, 5),
        building('Smithy', 12, 3),
        building('Stable', 20, 10),
        building('Trade Office', 28, 5),
        building('Main Building', 15, 10),
        building('Academy', 22, 10),
        building('Town Hall', 24, 1),
        building('Main Building', 15, 20),
        building('Academy', 22, 17),
        building('Smithy', 12, 6),
        building('Embassy', 18, 3),
        building('Rally Point', 16, 7),
        building('Tribe Wall', null, 15, { tribeWall: true }),
        building('Cranny', 23, 10, { instance: 1 }),
        building('Cranny', 23, 10, { instance: 2 }),
        instruction('Verify the final village target: 500 passive CP/day on x1 with one normal building slot left free.'),
        instruction('Go thank Barrbara from DT, Ruben from Triangles and Requinte from APES for this guide.')
      ]
    }
  });

  let panel = null;
  let launcher = null;
  let selectedId = '';
  let launcherSyncQueued = false;

  function cleanText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function normalizedText(value) {
    return cleanText(value).toLocaleLowerCase();
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
      console.warn('[APES Roadmaps] Could not save data.', error);
      return false;
    }
  }

  function normalizeStep(step) {
    if (!step || typeof step !== 'object') return null;
    if (step.type === 'building') {
      const name = cleanText(step.building);
      const level = Number(step.level);
      if (!name || !Number.isInteger(level) || level < 1) return null;
      return {
        type: 'building',
        building: name,
        buildingId: Number.isFinite(Number(step.buildingId)) ? Number(step.buildingId) : null,
        level,
        ...(Number.isInteger(Number(step.instance)) && Number(step.instance) > 0 ? { instance: Number(step.instance) } : {}),
        ...(step.tribeWall === true ? { tribeWall: true } : {})
      };
    }
    const text = cleanText(step.text ?? step.label);
    return text ? { type: 'instruction', text } : null;
  }

  function normalizeRoadmap(value, fallbackName = 'Untitled Roadmap') {
    const source = value && typeof value === 'object' ? value : {};
    return {
      name: cleanText(source.name) || fallbackName,
      description: cleanText(source.description ?? source.pretext),
      steps: Array.isArray(source.steps) ? source.steps.map(normalizeStep).filter(Boolean) : []
    };
  }

  function getCustomRoadmaps() {
    const stored = readJson(CUSTOM_STORAGE_KEY, {});
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).map(([id, roadmap]) => [id, normalizeRoadmap(roadmap)]));
  }

  function saveCustomRoadmaps(custom) {
    return writeJson(CUSTOM_STORAGE_KEY, custom);
  }

  function getAllRoadmaps() {
    return { ...BUILTIN_ROADMAPS, ...getCustomRoadmaps() };
  }

  function isCustom(id) {
    return Object.prototype.hasOwnProperty.call(getCustomRoadmaps(), id);
  }

  function resolveSelected() {
    const all = getAllRoadmaps();
    const saved = cleanText(localStorage.getItem(SELECTED_STORAGE_KEY));
    const firstId = Object.keys(all)[0] || '';
    selectedId = all[selectedId] ? selectedId : all[saved] ? saved : firstId;
    return selectedId;
  }

  function saveSelected(id) {
    selectedId = id;
    try {
      localStorage.setItem(SELECTED_STORAGE_KEY, id);
    } catch (_) {}
  }

  function stepLabel(step) {
    if (step.type === 'building') {
      const instance = step.instance ? ` #${step.instance}` : '';
      return `${step.building}${instance} → Level ${step.level}`;
    }
    return step.text;
  }

  function renderSidebar() {
    const library = panel?.querySelector('.qol-rm-library');
    if (!library) return;
    const custom = getCustomRoadmaps();
    const item = (id, roadmap) => `
      <div class="qol-rm-nav-item${id === selectedId ? ' qol-active' : ''}" data-roadmap-select="${escapeHtml(id)}" role="button" tabindex="0">
        <div class="qol-rm-nav-row"><strong>${escapeHtml(roadmap.name)}</strong><span>${roadmap.steps.length}</span></div>
        <small>${roadmap.steps.length} steps</small>
      </div>`;
    const builtins = Object.entries(BUILTIN_ROADMAPS).map(([id, roadmap]) => item(id, roadmap)).join('');
    const customs = Object.entries(custom).map(([id, roadmap]) => item(id, roadmap)).join('');
    library.innerHTML = `
      <div class="qol-rm-group-title">APES Guides</div>
      ${builtins || '<div class="qol-rm-empty-small">No APES roadmaps available.</div>'}
      <div class="qol-rm-group-title">My Roadmaps</div>
      ${customs || '<div class="qol-rm-empty-small">Duplicate an APES roadmap to create your first editable profile.</div>'}`;
  }

  function renderMain() {
    const target = panel?.querySelector('.qol-rm-main');
    if (!target) return;
    const roadmap = getAllRoadmaps()[selectedId];
    if (!roadmap) {
      target.innerHTML = '<div class="qol-rm-empty">No roadmap selected.</div>';
      return;
    }
    const custom = isCustom(selectedId);
    const buildingCount = roadmap.steps.filter(step => step.type === 'building').length;
    const instructionCount = roadmap.steps.length - buildingCount;
    target.innerHTML = `
      <div class="qol-rm-main-head">
        <div class="qol-rm-title-copy">
          <div class="qol-rm-title-row"><h2>${escapeHtml(roadmap.name)}</h2><span class="qol-rm-badge">${custom ? 'Custom' : 'APES Guide'}</span></div>
          ${roadmap.description ? `<p>${escapeHtml(roadmap.description)}</p>` : ''}
        </div>
        <div class="qol-rm-actions">
          <div class="qol-rm-action qol-secondary" data-roadmap-action="duplicate" role="button" tabindex="0">Duplicate</div>
          ${custom ? '<div class="qol-rm-action qol-secondary" data-roadmap-action="rename" role="button" tabindex="0">Rename</div><div class="qol-rm-action qol-danger" data-roadmap-action="delete" role="button" tabindex="0">Delete</div>' : ''}
        </div>
      </div>
      <div class="qol-rm-summary">
        <span><strong>${roadmap.steps.length}</strong>Total steps</span>
        <span><strong>${buildingCount}</strong>Building steps</span>
        <span><strong>${instructionCount}</strong>Instructions</span>
        <span><strong>Stage 1</strong>Profile preview</span>
      </div>
      <div class="qol-rm-route-head"><strong>Full Roadmap</strong><span>The runner will later show only the current active step.</span></div>
      <div class="qol-rm-route">
        ${roadmap.steps.map((step, index) => `
          <div class="qol-rm-step">
            <span class="qol-rm-step-number">${index + 1}</span>
            <span class="qol-rm-step-type ${step.type === 'building' ? 'building' : 'instruction'}">${step.type === 'building' ? 'Building' : 'Instruction'}</span>
            <span class="qol-rm-step-text">${escapeHtml(stepLabel(step))}</span>
          </div>`).join('') || '<div class="qol-rm-empty">This roadmap has no steps.</div>'}
      </div>`;
  }

  function render() {
    if (!panel) return;
    resolveSelected();
    renderSidebar();
    renderMain();
  }

  function showToast(message, type = 'success') {
    document.querySelector('.qol-rm-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rm-toast${type === 'error' ? ' error' : type === 'info' ? ' info' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2500);
  }

  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove();
  }

  function showNameDialog(title, initialValue, confirmLabel, onConfirm) {
    closeDialog();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rm-dialog" role="dialog" aria-modal="true">
        <div class="qol-rm-dialog-head">${escapeHtml(title)}</div>
        <div class="qol-rm-dialog-body">
          <label for="qol-rm-name-input">Roadmap name</label>
          <input id="qol-rm-name-input" type="text" maxlength="90">
          <div class="qol-rm-dialog-status" aria-live="polite"></div>
        </div>
        <div class="qol-rm-dialog-actions">
          <div class="qol-rm-action qol-secondary" data-rm-cancel role="button" tabindex="0">Cancel</div>
          <div class="qol-rm-action" data-rm-confirm role="button" tabindex="0">${escapeHtml(confirmLabel)}</div>
        </div>
      </div>`;
    const input = layer.querySelector('#qol-rm-name-input');
    const status = layer.querySelector('.qol-rm-dialog-status');
    input.value = initialValue;
    const confirm = () => {
      const value = cleanText(input.value);
      if (!value) {
        status.textContent = 'Enter a roadmap name.';
        input.focus();
        return;
      }
      closeDialog();
      onConfirm(value);
    };
    layer.querySelector('[data-rm-cancel]').addEventListener('click', closeDialog);
    layer.querySelector('[data-rm-confirm]').addEventListener('click', confirm);
    layer.addEventListener('click', event => { if (event.target === layer) closeDialog(); });
    layer.addEventListener('keydown', event => {
      if (event.key === 'Escape') return closeDialog();
      if (event.key === 'Enter' && event.target === input) {
        event.preventDefault();
        confirm();
      }
    });
    document.body.appendChild(layer);
    input.focus();
    input.select();
  }

  function duplicateSelected() {
    const source = getAllRoadmaps()[selectedId];
    if (!source) return;
    const custom = getCustomRoadmaps();
    const baseName = cleanText(source.name.replace(/\s*(?:-\s*)?Copy(?:\s+\d+)?$/i, '')) || source.name;
    let proposed = `${baseName} - Copy`;
    const names = new Set(Object.values(custom).map(item => normalizedText(item.name)));
    let suffix = 2;
    while (names.has(normalizedText(proposed))) proposed = `${baseName} - Copy ${suffix++}`;
    showNameDialog('Duplicate Roadmap', proposed, 'Create Copy', name => {
      const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      custom[id] = normalizeRoadmap({ ...source, name });
      saveCustomRoadmaps(custom);
      saveSelected(id);
      render();
      showToast('Roadmap copy created.');
    });
  }

  function renameSelected() {
    const custom = getCustomRoadmaps();
    const source = custom[selectedId];
    if (!source) return;
    showNameDialog('Rename Roadmap', source.name, 'Save Name', name => {
      custom[selectedId] = { ...source, name };
      saveCustomRoadmaps(custom);
      render();
      showToast('Roadmap renamed.');
    });
  }

  function deleteSelected() {
    const custom = getCustomRoadmaps();
    const source = custom[selectedId];
    if (!source) return;
    showNameDialog('Delete Roadmap', source.name, 'Delete', typed => {
      if (normalizedText(typed) !== normalizedText(source.name)) {
        showToast('Roadmap name did not match. Nothing was deleted.', 'error');
        return;
      }
      delete custom[selectedId];
      saveCustomRoadmaps(custom);
      saveSelected(Object.keys(BUILTIN_ROADMAPS)[0] || '');
      render();
      showToast('Roadmap deleted.', 'info');
    });
  }

  function handleAction(action) {
    if (action === 'duplicate') duplicateSelected();
    else if (action === 'rename') renameSelected();
    else if (action === 'delete') deleteSelected();
  }

  function saveWindowState() {
    if (!panel?.classList.contains('qol-rm-open')) return;
    const rect = panel.getBoundingClientRect();
    writeJson(WINDOW_STORAGE_KEY, {
      left: Math.round(rect.left), top: Math.round(rect.top),
      width: Math.round(rect.width), height: Math.round(rect.height)
    });
  }

  function applyWindowState() {
    const state = readJson(WINDOW_STORAGE_KEY, null);
    if (!panel || !state) return;
    if (![state.left, state.top, state.width, state.height].every(Number.isFinite)) return;
    panel.style.setProperty('left', `${state.left}px`, 'important');
    panel.style.setProperty('top', `${state.top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('width', `${state.width}px`, 'important');
    panel.style.setProperty('height', `${state.height}px`, 'important');
  }

  function clampWindow() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - 16);
    const height = Math.min(rect.height, window.innerHeight - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    panel.style.setProperty('left', `${left}px`, 'important');
    panel.style.setProperty('top', `${top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('width', `${width}px`, 'important');
    panel.style.setProperty('height', `${height}px`, 'important');
  }

  function makeDraggable() {
    const handle = panel.querySelector('.qol-rm-header');
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('[role="button"],input')) return;
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
        saveWindowState();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      event.preventDefault();
    });
  }

  function makeResizable() {
    const grip = panel.querySelector('.qol-rm-resize-grip');
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const move = moveEvent => {
        const minWidth = Math.min(620, window.innerWidth - 16);
        const minHeight = Math.min(430, window.innerHeight - 16);
        const width = Math.max(minWidth, Math.min(rect.width + moveEvent.clientX - startX, window.innerWidth - rect.left - 8));
        const height = Math.max(minHeight, Math.min(rect.height + moveEvent.clientY - startY, window.innerHeight - rect.top - 8));
        panel.style.setProperty('width', `${width}px`, 'important');
        panel.style.setProperty('height', `${height}px`, 'important');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        saveWindowState();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      event.preventDefault();
      event.stopPropagation();
    });
  }

  function buildPanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="qol-rm-header">
        <div class="qol-rm-header-copy"><span class="qol-rm-header-icon">↪</span><div><strong>Roadmaps</strong><small>Guide profiles and build routes</small></div></div>
        <div class="qol-rm-close" role="button" tabindex="0" aria-label="Close Roadmaps">×</div>
      </div>
      <div class="qol-rm-workspace">
        <aside class="qol-rm-sidebar"><div class="qol-rm-sidebar-title">Roadmap Hub</div><div class="qol-rm-library"></div></aside>
        <main class="qol-rm-main"></main>
      </div>
      <div class="qol-rm-resize-grip" aria-hidden="true"></div>`;
    document.body.appendChild(panel);
    applyWindowState();
    makeDraggable();
    makeResizable();
    panel.querySelector('.qol-rm-close').addEventListener('click', close);
    panel.addEventListener('click', event => {
      const select = event.target.closest('[data-roadmap-select]');
      if (select) {
        saveSelected(select.dataset.roadmapSelect);
        render();
        return;
      }
      const action = event.target.closest('[data-roadmap-action]');
      if (action) handleAction(action.dataset.roadmapAction);
    });
    panel.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"]')) {
        event.preventDefault();
        event.target.click();
      }
    });
    render();
    return panel;
  }

  function open() {
    buildPanel();
    window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'roadmaps' } }));
    render();
    panel.classList.add('qol-rm-open');
    panel.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(clampWindow);
  }

  function close() {
    panel?.classList.remove('qol-rm-open');
    panel?.setAttribute('aria-hidden', 'true');
    closeDialog();
  }

  function toggle(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (panel?.classList.contains('qol-rm-open')) close(); else open();
  }

  function positionLauncher() {
    if (!launcher) return;
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) {
      launcher.style.setProperty('right', '12px', 'important');
      launcher.style.setProperty('top', '76px', 'important');
      launcher.style.setProperty('display', 'flex', 'important');
      return;
    }
    const rect = toolbar.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 && getComputedStyle(toolbar).display !== 'none';
    if (!visible) {
      launcher.style.setProperty('display', 'none', 'important');
      return;
    }
    const size = Math.max(28, Math.min(30, rect.height || 30));
    let left = rect.right + 6;
    if (left + size > window.innerWidth - 8) left = Math.max(8, rect.left - size - 6);
    launcher.style.setProperty('--qol-rm-launcher-size', `${size}px`);
    launcher.style.setProperty('left', `${Math.round(left)}px`, 'important');
    launcher.style.setProperty('top', `${Math.round(rect.top)}px`, 'important');
    launcher.style.setProperty('right', 'auto', 'important');
    launcher.style.setProperty('display', 'flex', 'important');
  }

  function scheduleLauncherPosition() {
    if (launcherSyncQueued) return;
    launcherSyncQueued = true;
    requestAnimationFrame(() => {
      launcherSyncQueued = false;
      positionLauncher();
    });
  }

  function buildLauncher() {
    launcher = document.getElementById(BUTTON_ID);
    if (launcher) return;
    launcher = document.createElement('div');
    launcher.id = BUTTON_ID;
    launcher.className = 'qol-rm-launcher';
    launcher.setAttribute('role', 'button');
    launcher.setAttribute('tabindex', '0');
    launcher.setAttribute('aria-label', 'Open Roadmaps');
    launcher.title = 'Roadmaps';
    launcher.innerHTML = '<span aria-hidden="true">↪</span>';
    launcher.addEventListener('click', toggle);
    launcher.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') toggle(event);
    });
    document.body.appendChild(launcher);
    scheduleLauncherPosition();
  }

  function init() {
    buildLauncher();
    const observer = new MutationObserver(scheduleLauncherPosition);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', () => {
      scheduleLauncherPosition();
      if (panel?.classList.contains('qol-rm-open')) clampWindow();
    }, { passive: true });
    window.addEventListener('scroll', scheduleLauncherPosition, { passive: true });
    window.addEventListener('qol_close_others', event => {
      if (event.detail?.source !== 'roadmaps') close();
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (document.getElementById(DIALOG_ID)) {
        closeDialog();
        event.stopImmediatePropagation();
        return;
      }
      if (panel?.classList.contains('qol-rm-open')) {
        close();
        event.stopImmediatePropagation();
      }
    }, true);
    window.APES = window.APES || {};
    window.APES.roadmaps = Object.freeze({ open, close, toggle, getAllRoadmaps });
    setTimeout(scheduleLauncherPosition, 200);
    setTimeout(scheduleLauncherPosition, 900);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
