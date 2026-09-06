(() => {
  'use strict';

  const PANEL_ID = 'qol-roadmaps-container';
  const DIALOG_ID = 'qol-roadmap-sharing-dialog';
  const CUSTOM_STORAGE_KEY = 'qol_roadmap_profiles_v1';
  const SELECTED_STORAGE_KEY = 'qol_roadmap_selected_v1';
  const FORMAT = 'APES_QOL_ROADMAP';
  const VERSION = 1;
  const MAX_STEPS = 1000;

  let observer = null;
  let enhanceQueued = false;

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
      console.warn('[APES Roadmaps Sharing] Could not save data.', error);
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

  function getAllRoadmaps() {
    return window.APES?.roadmaps?.getAllRoadmaps?.() || {};
  }

  function getSelectedRoadmap() {
    const id = selectedId();
    const custom = readJson(CUSTOM_STORAGE_KEY, {});
    const rawCustom = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom[id] : null;
    return rawCustom || getAllRoadmaps()[id] || null;
  }

  function normalizedStep(step) {
    if (!step || typeof step !== 'object') throw new Error('A roadmap step is invalid.');

    if (step.type === 'building') {
      const building = clean(step.building);
      const level = Number(step.level);
      if (!building || !Number.isInteger(level) || level < 1) {
        throw new Error('A building step has an invalid building name or level.');
      }
      return {
        type: 'building',
        building,
        buildingId: Number.isFinite(Number(step.buildingId)) ? Number(step.buildingId) : null,
        level,
        ...(step.exact === true ? { exact: true } : {}),
        ...(Number.isInteger(Number(step.instance)) && Number(step.instance) > 0 ? { instance: Number(step.instance) } : {}),
        ...(step.tribeWall === true ? { tribeWall: true } : {})
      };
    }

    if (step.type === 'instruction') {
      const text = clean(step.text ?? step.label);
      if (!text) throw new Error('An instruction step is empty.');
      return { type: 'instruction', text };
    }

    throw new Error(`Unsupported roadmap step type: ${clean(step.type) || 'unknown'}.`);
  }

  function normalizedRoadmap(value) {
    const source = value && typeof value === 'object' ? value : null;
    if (!source) throw new Error('Roadmap data is missing.');

    const name = clean(source.name);
    if (!name) throw new Error('The roadmap has no name.');
    if (!Array.isArray(source.steps)) throw new Error('The roadmap has no valid step list.');
    if (source.steps.length > MAX_STEPS) throw new Error(`Roadmaps are limited to ${MAX_STEPS} steps.`);

    return {
      name,
      description: clean(source.description ?? source.pretext),
      steps: source.steps.map(normalizedStep)
    };
  }

  function exportEnvelope(roadmap) {
    return {
      format: FORMAT,
      version: VERSION,
      exportedAt: new Date().toISOString(),
      roadmap: normalizedRoadmap(roadmap)
    };
  }

  function parseImport(text) {
    let parsed;
    try {
      parsed = JSON.parse(String(text || '').trim());
    } catch (_) {
      throw new Error('That does not appear to be valid Roadmap JSON.');
    }

    if (parsed?.format) {
      if (parsed.format !== FORMAT) throw new Error('This is not an APES Roadmap export.');
      if (Number(parsed.version) !== VERSION) throw new Error(`Unsupported Roadmap format version: ${parsed.version}.`);
      return normalizedRoadmap(parsed.roadmap);
    }

    // Also accept a bare roadmap object for hand-authored or legacy sharing.
    return normalizedRoadmap(parsed?.roadmap || parsed);
  }

  function uniqueImportedName(name) {
    const used = new Set(Object.values(getAllRoadmaps()).map(item => clean(item?.name).toLocaleLowerCase()));
    if (!used.has(name.toLocaleLowerCase())) return name;

    const base = name.replace(/\s+-\s+Imported(?:\s+\d+)?$/i, '') || name;
    let candidate = `${base} - Imported`;
    let number = 2;
    while (used.has(candidate.toLocaleLowerCase())) candidate = `${base} - Imported ${number++}`;
    return candidate;
  }

  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove();
  }

  function showToast(message, type = 'success') {
    document.querySelector('.qol-rms-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-rms-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  function wireControl(element, handler) {
    if (!element) return;
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

  function buildDialog(title, bodyHtml) {
    closeDialog();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
      <div class="qol-rms-dialog" role="dialog" aria-modal="true">
        <div class="qol-rms-dialog-head">${escapeHtml(title)}</div>
        <div class="qol-rms-dialog-body">${bodyHtml}</div>
      </div>`;
    document.body.appendChild(layer);
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

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
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

  function openExport() {
    const roadmap = getSelectedRoadmap();
    if (!roadmap) {
      showToast('Select a roadmap first.', 'error');
      return;
    }

    let json;
    try {
      json = JSON.stringify(exportEnvelope(roadmap), null, 2);
    } catch (error) {
      showToast(error.message || 'Could not export this roadmap.', 'error');
      return;
    }

    const layer = buildDialog('Export Roadmap', `
      <p class="qol-rms-copy">This exports the guide only. Village assignments and progress are not included.</p>
      <textarea class="qol-rms-textarea" data-rms-export readonly spellcheck="false"></textarea>
      <div class="qol-rms-status" data-rms-status></div>
      <div class="qol-rms-actions">
        <div class="qol-rm-action qol-secondary" data-rms-close role="button" tabindex="0">Close</div>
        <div class="qol-rm-action" data-rms-copy role="button" tabindex="0">Copy to Clipboard</div>
      </div>`);

    const area = layer.querySelector('[data-rms-export]');
    const status = layer.querySelector('[data-rms-status]');
    area.value = json;
    area.focus();
    area.select();

    wireControl(layer.querySelector('[data-rms-close]'), closeDialog);
    wireControl(layer.querySelector('[data-rms-copy]'), async () => {
      const ok = await copyText(json);
      status.textContent = ok ? 'Copied. Paste this into Discord or send it to another APES user.' : 'Copy failed. Select the text and copy it manually.';
      status.classList.toggle('error', !ok);
    });
  }

  function openImport() {
    const layer = buildDialog('Import Roadmap', `
      <p class="qol-rms-copy">Paste an APES Roadmap export. Imported guides are added to <strong>My Roadmaps</strong> with fresh progress.</p>
      <textarea class="qol-rms-textarea" data-rms-import spellcheck="false" placeholder="Paste Roadmap JSON here..."></textarea>
      <div class="qol-rms-status" data-rms-status></div>
      <div class="qol-rms-actions">
        <div class="qol-rm-action qol-secondary" data-rms-close role="button" tabindex="0">Cancel</div>
        <div class="qol-rm-action" data-rms-import-confirm role="button" tabindex="0">Import Roadmap</div>
      </div>`);

    const area = layer.querySelector('[data-rms-import]');
    const status = layer.querySelector('[data-rms-status]');

    wireControl(layer.querySelector('[data-rms-close]'), closeDialog);
    wireControl(layer.querySelector('[data-rms-import-confirm]'), () => {
      let roadmap;
      try {
        roadmap = parseImport(area.value);
      } catch (error) {
        status.textContent = error.message || 'Could not import this roadmap.';
        status.classList.add('error');
        area.focus();
        return;
      }

      roadmap.name = uniqueImportedName(roadmap.name);
      const custom = readJson(CUSTOM_STORAGE_KEY, {});
      const store = custom && typeof custom === 'object' && !Array.isArray(custom) ? custom : {};
      const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      store[id] = roadmap;

      if (!writeJson(CUSTOM_STORAGE_KEY, store)) {
        status.textContent = 'Could not save the imported roadmap.';
        status.classList.add('error');
        return;
      }

      try { localStorage.setItem(SELECTED_STORAGE_KEY, id); } catch (_) {}
      closeDialog();
      window.APES?.roadmaps?.open?.();
      window.APES?.roadmapsRunner?.refresh?.();
      showToast(`Imported “${roadmap.name}”.`);
      scheduleEnhance();
    });

    area.focus();
  }

  function enhance() {
    enhanceQueued = false;
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    const actions = panel.querySelector('.qol-rm-actions');
    if (actions) {
      let exportControl = actions.querySelector('[data-rms-export-action]');
      if (!exportControl) {
        exportControl = document.createElement('div');
        exportControl.className = 'qol-rm-action qol-secondary qol-rms-export-action';
        exportControl.setAttribute('data-rms-export-action', '1');
        exportControl.setAttribute('role', 'button');
        exportControl.setAttribute('tabindex', '0');
        exportControl.textContent = 'Export';
        actions.appendChild(exportControl);
        wireControl(exportControl, openExport);
      }
    }

    const sidebarTitle = panel.querySelector('.qol-rm-sidebar-title');
    if (sidebarTitle && !panel.querySelector('[data-rms-import-action]')) {
      const importControl = document.createElement('div');
      importControl.className = 'qol-rms-import-action';
      importControl.setAttribute('data-rms-import-action', '1');
      importControl.setAttribute('role', 'button');
      importControl.setAttribute('tabindex', '0');
      importControl.textContent = '+ Import';
      sidebarTitle.appendChild(importControl);
      wireControl(importControl, openImport);
    }
  }

  function scheduleEnhance() {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(enhance);
  }

  function init() {
    scheduleEnhance();
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(scheduleEnhance, 250);
    setTimeout(scheduleEnhance, 900);

    window.APES = window.APES || {};
    window.APES.roadmapsSharing = Object.freeze({
      exportSelected: openExport,
      importRoadmap: openImport
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
