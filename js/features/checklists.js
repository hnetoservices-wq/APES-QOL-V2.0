(() => {
  'use strict';

  const FEATURE_KEY = 'checklists';
  const PROGRESS_STORAGE_KEY = 'qol_checklist_progress';
  const CUSTOM_STORAGE_KEY = 'qol_custom_checklists';
  const SELECTED_STORAGE_KEY = 'qol_checklist_selected';
  const WINDOW_STORAGE_KEY = 'qol_checklist_window_state';
  const BUTTON_ID = 'qol-checklist-toggle-btn';
  const PANEL_ID = 'qol-checklist-container';
  const STYLE_ID = 'qol-checklist-workspace-styles';
  const DIALOG_ID = 'qol-checklist-dialog-layer';
  const BUILTIN_CHECKLISTS = Object.freeze({
    x3_speedsettle: {
      name: 'x3 Speed Settle',
      pretext: 'This guide assumes you are using gold to settle as quickly as possible. Spend hero points in resources and change hero production before opening resource or crop chests.',
      steps: ['Finish the tutorial. Do not skip it; attack the furthest hideout first during the tutorial.', 'Queue 5 units.', 'Attack the closest hideout until it is empty. Send the hero on adventures continuously.', 'Upgrade the Warehouse and Granary to level 3.', 'Build the Embassy to level 1 and annex an oasis if possible.', 'Build the Marketplace and Cranny to level 1.', 'Upgrade every crop field to level 2, then every crop field to level 3.', 'Optional when demolishing the spawn village: upgrade every resource field to level 2.', 'Upgrade the Main Building to level 7.', 'Build the Residence to level 1.', 'Activate Gold Club, Travian Plus, Resource Bonus and Crop Bonus.', 'Upgrade the Warehouse to level 5 so it can hold the quest rewards.', 'Upgrade the Residence to level 5.', 'Complete free quests such as renaming the village, changing hero production and healing the hero.', 'If affordable, play card games for an extra adventure point and chests.', 'After Residence level 5 finishes, collect the quest reward, upgrade it to level 10 and queue the first Settler.', 'Queue the second Settler as soon as possible. Clear the first two hideouts, sell stolen goods and use the seventh hero adventure for more resources.', 'Catch animals in a nearby oasis after the seventh adventure for the quest reward.', 'Wait for the third and fourth hideouts. They should spawn roughly 1h27m after clearing the first two.', 'Use the first Settler to empty the third and fourth hideouts. Send extra troops so the Settler survives.', 'Queue the third Settler. Use resource or crop chests if necessary.', 'Upgrade the Main Building to level 10.', 'Demolish the Residence, timing completion for a few seconds after the third Settler completes.', 'Upgrade Barracks to level 3, Academy to level 10, Town Hall to level 1 and Workshop to level 1.', 'Upgrade the Granary to level 7.', 'Start a Small Celebration, relocate and send the Settlers.', 'Thank Ruben from Triangles for the guide.']
    }
  });
  let panel = null;
  let toolbarButton = null;
  let selectedChecklistId = '';
  let taskFilter = 'all';
  let taskSearch = '';
  function isEnabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }
  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value == null ? fallback : value;
    } catch (_) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`[APES Checklists] Could not save ${key}:`, error);
      return false;
    }
  }
  function cleanText(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }
  function normalizedText(value) {
    return cleanText(value).toLocaleLowerCase();
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function normalizeChecklist(value, fallbackName = 'Untitled Checklist') {
    const source = value && typeof value === 'object' ? value : {};
    return {
      name: cleanText(source.name) || fallbackName,
      pretext: cleanText(source.pretext || source.description),
      steps: Array.isArray(source.steps) ? source.steps.map(cleanText).filter(Boolean) : []
    };
  }
  function getCustomChecklists() {
    const stored = readJson(CUSTOM_STORAGE_KEY, {});
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).map(([id, checklist]) => [id, normalizeChecklist(checklist)]));
  }
  function saveCustomChecklists(custom) {
    return writeJson(CUSTOM_STORAGE_KEY, custom);
  }
  function getAllChecklists() {
    return {
      ...BUILTIN_CHECKLISTS,
      ...getCustomChecklists()
    };
  }
  function isCustomChecklist(id) {
    return Object.prototype.hasOwnProperty.call(getCustomChecklists(), id);
  }
  function getProgressMap() {
    const stored = readJson(PROGRESS_STORAGE_KEY, {});
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).map(([id, indices]) => [id, Array.isArray(indices) ? [...new Set(indices.map(Number).filter(index => Number.isInteger(index) && index >= 0))] : []]));
  }
  function saveProgressMap(progress) {
    return writeJson(PROGRESS_STORAGE_KEY, progress);
  }
  function getCompletedSet(id, stepCount = Number.MAX_SAFE_INTEGER) {
    return new Set((getProgressMap()[id] || []).filter(index => index < stepCount));
  }
  function setCompletedSet(id, completed) {
    const progress = getProgressMap();
    const indices = [...completed].sort((left, right) => left - right);
    if (indices.length) progress[id] = indices;else delete progress[id];
    saveProgressMap(progress);
  }
  function progressStats(id, checklist) {
    const total = checklist?.steps?.length || 0;
    const done = getCompletedSet(id, total).size;
    return {
      done,
      total,
      open: Math.max(0, total - done),
      percent: total ? Math.round(done / total * 100) : 0
    };
  }
  function resolveSelectedChecklist() {
    const all = getAllChecklists();
    const saved = cleanText(localStorage.getItem(SELECTED_STORAGE_KEY));
    const firstId = Object.keys(all)[0] || '';
    selectedChecklistId = all[selectedChecklistId] ? selectedChecklistId : all[saved] ? saved : firstId;
    return selectedChecklistId;
  }
  function selectChecklist(id) {
    const all = getAllChecklists();
    if (!all[id]) return;
    selectedChecklistId = id;
    taskFilter = 'all';
    taskSearch = '';
    try {
      localStorage.setItem(SELECTED_STORAGE_KEY, id);
    } catch (_) {}
    renderWorkspace();
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:18px!important;top:76px!important;z-index:1000002!important;display:none!important;flex-direction:column!important;width:min(820px,calc(100vw - 28px))!important;min-width:min(580px,calc(100vw - 16px))!important;height:min(590px,calc(100vh - 92px))!important;min-height:min(390px,calc(100vh - 16px))!important;max-width:calc(100vw - 16px)!important;max-height:calc(100vh - 16px)!important;overflow:hidden!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;color:#3e2d1d!important;box-shadow:0 18px 46px rgba(0,0,0,.52)!important}
            #${PANEL_ID}.qol-cl-open{display:flex!important}
            #${PANEL_ID} .qol-cl-header{display:flex!important;align-items:center!important;justify-content:space-between!important;flex:0 0 auto!important;min-height:43px!important;padding:0 9px 0 12px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important;cursor:move!important;user-select:none!important;touch-action:none!important}
            #${PANEL_ID} .qol-cl-header-copy{display:flex!important;align-items:center!important;gap:9px!important;min-width:0!important}
            #${PANEL_ID} .qol-cl-header-icon{display:flex!important;align-items:center!important;justify-content:center!important;width:25px!important;height:25px!important;border:1px solid rgba(255,255,255,.24)!important;border-radius:5px!important;background:rgba(0,0,0,.18)!important}
            #${PANEL_ID} .qol-cl-header-icon svg{width:15px!important;height:15px!important;fill:none!important;stroke:#fffaf0!important;stroke-width:2!important;stroke-linecap:round!important;stroke-linejoin:round!important}
            #${PANEL_ID} .qol-cl-header-title{font-size:13px!important;font-weight:700!important}
            #${PANEL_ID} .qol-cl-header-subtitle{margin-left:6px!important;color:#d9ccb5!important;font-size:8.5px!important;font-weight:400!important}
            #${PANEL_ID} .qol-cl-close{display:flex!important;align-items:center!important;justify-content:center!important;width:25px!important;height:25px!important;border-radius:4px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:20px!important;line-height:1!important;cursor:pointer!important}
            #${PANEL_ID} .qol-cl-workspace{display:grid!important;grid-template-columns:220px minmax(0,1fr)!important;flex:1 1 auto!important;min-height:0!important;overflow:hidden!important}
            #${PANEL_ID} .qol-cl-sidebar{display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;border-right:1px solid #cdbb9d!important;background:#eee5d6!important}
            #${PANEL_ID} .qol-cl-sidebar-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:7px!important;padding:10px!important;border-bottom:1px solid #d2c2aa!important}
            #${PANEL_ID} .qol-cl-sidebar-title{color:var(--qol-accent-deep)!important;font-size:9px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.35px!important}
            #${PANEL_ID} .qol-cl-library{flex:1 1 auto!important;min-height:0!important;padding:8px!important;overflow-y:auto!important;scrollbar-width:thin!important;scrollbar-color:var(--qol-scroll-thumb) #e7ded1!important}
            #${PANEL_ID} .qol-cl-group-title{margin:8px 4px 5px!important;color:#86745d!important;font-size:8px!important;font-weight:700!important;text-transform:uppercase!important;letter-spacing:.4px!important}
            #${PANEL_ID} .qol-cl-group-title:first-child{margin-top:1px!important}
            #${PANEL_ID} .qol-cl-library-empty{margin:4px!important;padding:8px!important;border:1px dashed #c9b89c!important;border-radius:4px!important;color:#88765e!important;font-size:8.5px!important;line-height:1.4!important;text-align:center!important}
            #${PANEL_ID} .qol-cl-nav-item{display:flex!important;flex-direction:column!important;gap:5px!important;margin-bottom:5px!important;padding:8px!important;border:1px solid #cab99f!important;border-radius:5px!important;background:#fffaf0!important;color:#4c3824!important;cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-cl-nav-item:hover{border-color:var(--qol-accent)!important;background:#fff!important}
            #${PANEL_ID} .qol-cl-nav-item.qol-active{border-color:var(--qol-accent)!important;background:var(--qol-accent-soft)!important;box-shadow:inset 3px 0 0 var(--qol-accent)!important}
            #${PANEL_ID} .qol-cl-nav-top{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:7px!important}
            #${PANEL_ID} .qol-cl-nav-name{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;color:#4c3824!important;font-size:10px!important;font-weight:700!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-cl-nav-count{flex:0 0 auto!important;color:#79654c!important;font-size:8px!important;font-weight:700!important}
            #${PANEL_ID} .qol-cl-mini-progress{height:4px!important;overflow:hidden!important;border-radius:3px!important;background:#ded3c1!important}
            #${PANEL_ID} .qol-cl-mini-progress span{display:block!important;height:100%!important;border-radius:3px!important;background:#648b2c!important}
            #${PANEL_ID} .qol-cl-main{display:flex!important;flex-direction:column!important;min-width:0!important;min-height:0!important;background:#f7f5f0!important}
            #${PANEL_ID} .qol-cl-main-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:14px!important;padding:12px 14px 9px!important;border-bottom:1px solid #ddd0bc!important;background:#fffaf0!important}
            #${PANEL_ID} .qol-cl-title-wrap{min-width:0!important}
            #${PANEL_ID} .qol-cl-title-row{display:flex!important;align-items:center!important;gap:7px!important;min-width:0!important}
            #${PANEL_ID} .qol-cl-title{margin:0!important;overflow:hidden!important;color:var(--qol-accent-deep)!important;font-size:15px!important;font-weight:700!important;text-overflow:ellipsis!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-cl-badge{display:inline-flex!important;align-items:center!important;min-height:17px!important;padding:2px 6px!important;border:1px solid #c8b591!important;border-radius:9px!important;background:#efe4d1!important;color:#735a3b!important;font-size:7.5px!important;font-weight:700!important;text-transform:uppercase!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-cl-description{max-width:560px!important;margin:5px 0 0!important;color:#725f48!important;font-size:9px!important;line-height:1.4!important}
            #${PANEL_ID} .qol-cl-progress-summary{flex:0 0 auto!important;min-width:82px!important;text-align:right!important}
            #${PANEL_ID} .qol-cl-progress-value{color:var(--qol-accent-deep)!important;font-size:17px!important;font-weight:700!important}
            #${PANEL_ID} .qol-cl-progress-label{color:#87745c!important;font-size:8px!important}
            #${PANEL_ID} .qol-cl-progress-track{flex:0 0 auto!important;height:7px!important;margin:0 14px!important;overflow:hidden!important;border-radius:4px!important;background:#ded3c1!important}
            #${PANEL_ID} .qol-cl-progress-track span{display:block!important;height:100%!important;border-radius:4px!important;background:linear-gradient(90deg,#739d36,#4e7621)!important;transition:width .22s ease!important}
            #${PANEL_ID} .qol-cl-tools{display:flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important;padding:9px 14px!important;border-bottom:1px solid #ddd0bc!important;background:#f3ecdf!important}
            #${PANEL_ID} .qol-cl-search{flex:1 1 auto!important;min-width:100px!important;height:28px!important;padding:4px 8px!important;border:1px solid #bca789!important;border-radius:4px!important;background:#fff!important;color:#3e2d1d!important;font-size:9.5px!important;outline:none!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${PANEL_ID} .qol-cl-search:focus{border-color:var(--qol-accent)!important;box-shadow:0 0 0 1px var(--qol-accent-soft)!important}
            #${PANEL_ID} .qol-cl-filters{display:flex!important;align-items:center!important;padding:2px!important;border:1px solid #c3b194!important;border-radius:4px!important;background:#e6dccb!important}
            #${PANEL_ID} .qol-cl-filter{display:flex!important;align-items:center!important;justify-content:center!important;min-height:22px!important;padding:3px 7px!important;border-radius:3px!important;color:#725e46!important;font-size:8px!important;font-weight:700!important;cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-cl-filter.qol-active{background:#fff!important;color:var(--qol-accent-deep)!important;box-shadow:0 1px 2px rgba(0,0,0,.14)!important}
            #${PANEL_ID} .qol-cl-actions{display:flex!important;align-items:center!important;gap:5px!important;flex-wrap:wrap!important}
            #${PANEL_ID} .qol-cl-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:26px!important;padding:4px 9px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8e9!important;font-size:8.5px!important;font-weight:700!important;cursor:pointer!important;user-select:none!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-cl-action.qol-secondary{border-color:#a9906d!important;background:linear-gradient(#fffaf0,#e8d6b6)!important;color:#4d351d!important}
            #${PANEL_ID} .qol-cl-action.qol-danger{border-color:#8f3e31!important;background:linear-gradient(#b65c4c,#8f382d)!important;color:#fff!important}
            #${PANEL_ID} .qol-cl-action.qol-compact{min-height:23px!important;padding:3px 7px!important;font-size:8px!important}
            #${PANEL_ID} .qol-cl-action[aria-disabled="true"]{opacity:.5!important;pointer-events:none!important;cursor:not-allowed!important}
            #${PANEL_ID} .qol-cl-task-scroll{flex:1 1 auto!important;min-height:0!important;padding:10px 14px 14px!important;overflow-y:auto!important;scrollbar-width:thin!important;scrollbar-color:var(--qol-scroll-thumb) #e7ded1!important}
            #${PANEL_ID} .qol-cl-complete-banner{display:flex!important;align-items:center!important;gap:8px!important;margin-bottom:8px!important;padding:8px 10px!important;border:1px solid #91ad68!important;border-radius:5px!important;background:#edf5df!important;color:#46651f!important;font-size:9px!important;font-weight:700!important}
            #${PANEL_ID} .qol-cl-task-list{display:flex!important;flex-direction:column!important;gap:6px!important}
            #${PANEL_ID} .qol-cl-task{display:grid!important;grid-template-columns:22px minmax(0,1fr) auto!important;align-items:start!important;gap:8px!important;padding:8px 9px!important;border:1px solid #dbcfbd!important;border-radius:5px!important;background:#fff!important;transition:opacity .16s ease,background .16s ease!important}
            #${PANEL_ID} .qol-cl-task:hover{border-color:#c5b292!important;background:#fffaf0!important}
            #${PANEL_ID} .qol-cl-task.qol-completed{background:#f0eee9!important;opacity:.67!important}
            #${PANEL_ID} .qol-cl-task.qol-completed .qol-cl-task-text{text-decoration:line-through!important;color:#7b7268!important}
            #${PANEL_ID} .qol-cl-check{display:flex!important;align-items:center!important;justify-content:center!important;width:19px!important;height:19px!important;margin-top:1px!important;border:1px solid #8e7656!important;border-radius:4px!important;background:#fff!important;color:#fff!important;cursor:pointer!important;user-select:none!important;outline:none!important}
            #${PANEL_ID} .qol-cl-check:hover,#${PANEL_ID} .qol-cl-check:focus-visible{border-color:var(--qol-accent)!important;box-shadow:0 0 0 1px var(--qol-accent-soft)!important}
            #${PANEL_ID} .qol-cl-check[aria-checked="true"]{border-color:#46651f!important;background:#648b2c!important}
            #${PANEL_ID} .qol-cl-check[aria-checked="true"]::after{content:"✓"!important;font-size:13px!important;font-weight:700!important;line-height:1!important}
            #${PANEL_ID} .qol-cl-task-copy{display:flex!important;align-items:flex-start!important;gap:7px!important;min-width:0!important}
            #${PANEL_ID} .qol-cl-task-number{flex:0 0 auto!important;min-width:17px!important;color:#9a876e!important;font-size:8px!important;font-weight:700!important;line-height:1.5!important}
            #${PANEL_ID} .qol-cl-task-text{color:#4b3825!important;font-size:9.5px!important;line-height:1.45!important;overflow-wrap:anywhere!important}
            #${PANEL_ID} .qol-cl-task-actions{display:flex!important;align-items:center!important;gap:2px!important;opacity:.3!important;transition:opacity .15s ease!important}
            #${PANEL_ID} .qol-cl-task:hover .qol-cl-task-actions{opacity:1!important}
            #${PANEL_ID} .qol-cl-icon-action{display:flex!important;align-items:center!important;justify-content:center!important;width:21px!important;height:21px!important;border-radius:3px!important;color:#795f43!important;font-size:10px!important;font-weight:700!important;cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-cl-icon-action:hover{background:#e9dcc8!important;color:var(--qol-accent-deep)!important}
            #${PANEL_ID} .qol-cl-icon-action.qol-danger:hover{background:#f3d7d1!important;color:#9a352b!important}
            #${PANEL_ID} .qol-cl-empty{padding:30px 14px!important;border:1px dashed #c9b89c!important;border-radius:5px!important;background:#fffaf0!important;color:#85735b!important;font-size:10px!important;line-height:1.5!important;text-align:center!important}
            #${PANEL_ID} .qol-cl-add-row{display:flex!important;align-items:center!important;gap:6px!important;margin-top:8px!important;padding:8px!important;border:1px solid #d5c6af!important;border-radius:5px!important;background:#f2eadd!important}
            #${PANEL_ID} .qol-cl-add-input{flex:1 1 auto!important;min-width:0!important;height:27px!important;padding:4px 8px!important;border:1px solid #bca789!important;border-radius:4px!important;background:#fff!important;color:#3e2d1d!important;font-size:9.5px!important;outline:none!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${PANEL_ID} .qol-cl-resize-grip{position:absolute!important;right:0!important;bottom:0!important;width:17px!important;height:17px!important;z-index:4!important;background:linear-gradient(135deg,transparent 0 52%,var(--qol-accent) 53% 61%,transparent 62% 68%,var(--qol-accent) 69% 77%,transparent 78%)!important;cursor:nwse-resize!important;touch-action:none!important}
            #${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${DIALOG_ID}{position:fixed!important;inset:0!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important;background:rgba(18,15,11,.68)!important}
            #${DIALOG_ID} .qol-cl-dialog{width:min(520px,calc(100vw - 32px))!important;max-height:calc(100vh - 32px)!important;overflow:hidden!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;color:#3e2d1d!important;box-shadow:0 18px 48px rgba(0,0,0,.55)!important}
            #${DIALOG_ID} .qol-cl-dialog-head{padding:11px 13px!important;background:linear-gradient(var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#fffaf0!important;font-size:12px!important;font-weight:700!important}
            #${DIALOG_ID} .qol-cl-dialog-body{display:flex!important;flex-direction:column!important;gap:9px!important;max-height:calc(100vh - 150px)!important;padding:13px!important;overflow-y:auto!important}
            #${DIALOG_ID} .qol-cl-field{display:flex!important;flex-direction:column!important;gap:4px!important}
            #${DIALOG_ID} .qol-cl-field label{color:#69543c!important;font-size:8.5px!important;font-weight:700!important;text-transform:uppercase!important}
            #${DIALOG_ID} input,#${DIALOG_ID} textarea{width:100%!important;padding:7px 8px!important;border:1px solid #bca789!important;border-radius:4px!important;background:#fff!important;color:#3e2d1d!important;font-size:10px!important;line-height:1.4!important;outline:none!important;appearance:auto!important;-webkit-appearance:auto!important}
            #${DIALOG_ID} textarea{min-height:150px!important;resize:vertical!important}
            #${DIALOG_ID} input:focus,#${DIALOG_ID} textarea:focus{border-color:var(--qol-accent)!important;box-shadow:0 0 0 1px var(--qol-accent-soft)!important}
            #${DIALOG_ID} .qol-cl-dialog-message{color:#66533d!important;font-size:10px!important;line-height:1.5!important;white-space:pre-line!important}
            #${DIALOG_ID} .qol-cl-dialog-status{min-height:14px!important;color:#9a352b!important;font-size:8.5px!important;font-weight:700!important}
            #${DIALOG_ID} .qol-cl-dialog-actions{display:flex!important;justify-content:flex-end!important;gap:7px!important;padding:0 13px 13px!important}
            #${DIALOG_ID} .qol-cl-action{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:27px!important;padding:4px 10px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8e9!important;font-size:8.5px!important;font-weight:700!important;cursor:pointer!important;user-select:none!important}
            #${DIALOG_ID} .qol-cl-action.qol-secondary{border-color:#a9906d!important;background:linear-gradient(#fffaf0,#e8d6b6)!important;color:#4d351d!important}
            #${DIALOG_ID} .qol-cl-action.qol-danger{border-color:#8f3e31!important;background:linear-gradient(#b65c4c,#8f382d)!important;color:#fff!important}
            .qol-cl-toast{position:fixed!important;left:50%!important;bottom:24px!important;z-index:2147483647!important;transform:translateX(-50%)!important;max-width:min(520px,84vw)!important;padding:9px 13px!important;border:1px solid #405f1e!important;border-radius:5px!important;background:#587d27!important;color:#fff!important;box-shadow:0 7px 20px rgba(0,0,0,.35)!important;font:700 10px Arial,sans-serif!important;text-align:center!important}
            .qol-cl-toast.qol-error{border-color:#7f3027!important;background:#a44539!important}
            .qol-cl-toast.qol-info{border-color:var(--qol-action-border)!important;background:var(--qol-accent)!important}
            @media(max-width:700px){#${PANEL_ID}{min-width:calc(100vw - 16px)!important}#${PANEL_ID} .qol-cl-workspace{grid-template-columns:170px minmax(0,1fr)!important}#${PANEL_ID} .qol-cl-header-subtitle{display:none!important}#${PANEL_ID} .qol-cl-tools{align-items:stretch!important;flex-wrap:wrap!important}#${PANEL_ID} .qol-cl-search{flex-basis:100%!important}}
        `;
    document.head.appendChild(style);
  }
  function showToast(message, type = 'success') {
    document.querySelector('.qol-cl-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `qol-cl-toast${type === 'error' ? ' qol-error' : type === 'info' ? ' qol-info' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }
  function closeDialog() {
    document.getElementById(DIALOG_ID)?.remove();
  }
  function bindKeyboardActivation(root) {
    root.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[role="button"],[role="checkbox"]')) {
        event.preventDefault();
        event.target.click();
      }
    });
  }
  function showConfirm(title, message, confirmLabel, onConfirm) {
    closeDialog();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
            <div class="qol-cl-dialog" role="alertdialog" aria-modal="true">
                <div class="qol-cl-dialog-head"></div>
                <div class="qol-cl-dialog-body"><div class="qol-cl-dialog-message"></div></div>
                <div class="qol-cl-dialog-actions">
                    <div class="qol-cl-action qol-secondary" data-dialog-cancel role="button" tabindex="0">Cancel</div>
                    <div class="qol-cl-action qol-danger" data-dialog-confirm role="button" tabindex="0"></div>
                </div>
            </div>
        `;
    layer.querySelector('.qol-cl-dialog-head').textContent = title;
    layer.querySelector('.qol-cl-dialog-message').textContent = message;
    layer.querySelector('[data-dialog-confirm]').textContent = confirmLabel;
    layer.querySelector('[data-dialog-cancel]').addEventListener('click', closeDialog);
    layer.querySelector('[data-dialog-confirm]').addEventListener('click', () => {
      closeDialog();
      onConfirm?.();
    });
    layer.addEventListener('click', event => {
      if (event.target === layer) closeDialog();
    });
    bindKeyboardActivation(layer);
    document.body.appendChild(layer);
    layer.querySelector('[data-dialog-cancel]').focus();
  }
  function remapCompletedSteps(oldSteps, newSteps, completed) {
    const counts = new Map();
    [...completed].forEach(index => {
      const key = normalizedText(oldSteps[index]);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    const remapped = new Set();
    newSteps.forEach((step, index) => {
      const key = normalizedText(step);
      const remaining = counts.get(key) || 0;
      if (remaining > 0) {
        remapped.add(index);
        counts.set(key, remaining - 1);
      }
    });
    return remapped;
  }
  function openChecklistEditor(checklistId = '') {
    const custom = getCustomChecklists();
    const editing = Boolean(checklistId && custom[checklistId]);
    const source = editing ? custom[checklistId] : {
      name: '',
      pretext: '',
      steps: []
    };
    closeDialog();
    const layer = document.createElement('div');
    layer.id = DIALOG_ID;
    layer.innerHTML = `
            <div class="qol-cl-dialog" role="dialog" aria-modal="true">
                <div class="qol-cl-dialog-head">${editing ? 'Edit Checklist' : 'Create Checklist'}</div>
                <div class="qol-cl-dialog-body">
                    <div class="qol-cl-field"><label for="qol-cl-editor-title">Checklist title</label><input id="qol-cl-editor-title" type="text" maxlength="80" placeholder="e.g. Hammer launch preparation"></div>
                    <div class="qol-cl-field"><label for="qol-cl-editor-description">Description (optional)</label><input id="qol-cl-editor-description" type="text" maxlength="240" placeholder="What is this checklist for?"></div>
                    <div class="qol-cl-field"><label for="qol-cl-editor-steps">Tasks — one per line</label><textarea id="qol-cl-editor-steps" placeholder="Upgrade Workshop&#10;Queue Rams&#10;Confirm landing time"></textarea></div>
                    <div class="qol-cl-dialog-status" aria-live="polite"></div>
                </div>
                <div class="qol-cl-dialog-actions">
                    <div class="qol-cl-action qol-secondary" data-dialog-cancel role="button" tabindex="0">Cancel</div>
                    <div class="qol-cl-action" data-dialog-save role="button" tabindex="0">${editing ? 'Save Changes' : 'Create Checklist'}</div>
                </div>
            </div>
        `;
    const titleInput = layer.querySelector('#qol-cl-editor-title');
    const descriptionInput = layer.querySelector('#qol-cl-editor-description');
    const stepsInput = layer.querySelector('#qol-cl-editor-steps');
    const status = layer.querySelector('.qol-cl-dialog-status');
    titleInput.value = source.name;
    descriptionInput.value = source.pretext;
    stepsInput.value = source.steps.join('\n');
    const save = () => {
      const name = cleanText(titleInput.value);
      const pretext = cleanText(descriptionInput.value);
      const steps = stepsInput.value.split(/\r?\n/).map(cleanText).filter(Boolean);
      if (!name) {
        status.textContent = 'Enter a checklist title.';
        titleInput.focus();
        return;
      }
      if (!steps.length) {
        status.textContent = 'Add at least one task.';
        stepsInput.focus();
        return;
      }
      const currentCustom = getCustomChecklists();
      let id = checklistId;
      if (editing) {
        const oldChecklist = currentCustom[id];
        const oldCompleted = getCompletedSet(id, oldChecklist.steps.length);
        currentCustom[id] = {
          name,
          pretext,
          steps
        };
        setCompletedSet(id, remapCompletedSteps(oldChecklist.steps, steps, oldCompleted));
      } else {
        id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        currentCustom[id] = {
          name,
          pretext,
          steps
        };
      }
      saveCustomChecklists(currentCustom);
      closeDialog();
      selectedChecklistId = id;
      try {
        localStorage.setItem(SELECTED_STORAGE_KEY, id);
      } catch (_) {}
      taskFilter = 'all';
      taskSearch = '';
      renderWorkspace();
      showToast(editing ? 'Checklist updated.' : 'Checklist created.');
    };
    layer.querySelector('[data-dialog-cancel]').addEventListener('click', closeDialog);
    layer.querySelector('[data-dialog-save]').addEventListener('click', save);
    layer.addEventListener('click', event => {
      if (event.target === layer) closeDialog();
    });
    bindKeyboardActivation(layer);
    document.body.appendChild(layer);
    titleInput.focus();
  }
  function renderSidebar() {
    if (!panel) return;
    const library = panel.querySelector('.qol-cl-library');
    const custom = getCustomChecklists();
    const itemHtml = (id, checklist) => {
      const stats = progressStats(id, checklist);
      return `<div class="qol-cl-nav-item${id === selectedChecklistId ? ' qol-active' : ''}" data-action="select" data-checklist-id="${escapeHtml(id)}" role="button" tabindex="0"><div class="qol-cl-nav-top"><span class="qol-cl-nav-name">${escapeHtml(checklist.name)}</span><span class="qol-cl-nav-count">${stats.done}/${stats.total}</span></div><div class="qol-cl-mini-progress"><span style="width:${stats.percent}%"></span></div></div>`;
    };
    const builtinHtml = Object.entries(BUILTIN_CHECKLISTS).map(([id, checklist]) => itemHtml(id, checklist)).join('');
    const customHtml = Object.entries(custom).map(([id, checklist]) => itemHtml(id, checklist)).join('');
    library.innerHTML = `<div class="qol-cl-group-title">APES Guides</div>${builtinHtml || '<div class="qol-cl-library-empty">No built-in guides.</div>'}<div class="qol-cl-group-title">My Checklists</div>${customHtml || '<div class="qol-cl-library-empty">Create a checklist for daily tasks, launches or personal goals.</div>'}`;
  }
  function taskMatchesFilter(index, step, completed) {
    const isDone = completed.has(index);
    if (taskFilter === 'open' && isDone) return false;
    if (taskFilter === 'done' && !isDone) return false;
    return !taskSearch || normalizedText(step).includes(normalizedText(taskSearch));
  }
  function renderTaskList() {
    if (!panel) return;
    const checklist = getAllChecklists()[selectedChecklistId];
    const list = panel.querySelector('.qol-cl-task-list');
    if (!checklist || !list) return;
    const custom = isCustomChecklist(selectedChecklistId);
    const completed = getCompletedSet(selectedChecklistId, checklist.steps.length);
    const visible = checklist.steps.map((step, index) => ({
      step,
      index
    })).filter(item => taskMatchesFilter(item.index, item.step, completed));
    list.innerHTML = visible.length ? visible.map(({
      step,
      index
    }) => `
            <div class="qol-cl-task${completed.has(index) ? ' qol-completed' : ''}" data-task-index="${index}">
                <div class="qol-cl-check" data-action="toggle-task" data-index="${index}" role="checkbox" tabindex="0" aria-label="Toggle task ${index + 1}" aria-checked="${completed.has(index)}"></div>
                <div class="qol-cl-task-copy"><span class="qol-cl-task-number">${index + 1}.</span><span class="qol-cl-task-text">${escapeHtml(step)}</span></div>
                ${custom ? `<div class="qol-cl-task-actions"><div class="qol-cl-icon-action" data-action="move-up" data-index="${index}" role="button" tabindex="0" title="Move up">↑</div><div class="qol-cl-icon-action" data-action="move-down" data-index="${index}" role="button" tabindex="0" title="Move down">↓</div><div class="qol-cl-icon-action qol-danger" data-action="delete-task" data-index="${index}" role="button" tabindex="0" title="Delete task">×</div></div>` : '<span></span>'}
            </div>
        `).join('') : '<div class="qol-cl-empty">No tasks match this view.<br>Try another filter or clear the search.</div>';
  }
  function renderMain() {
    if (!panel) return;
    const main = panel.querySelector('.qol-cl-main');
    const checklist = getAllChecklists()[selectedChecklistId];
    if (!checklist) {
      main.innerHTML = '<div class="qol-cl-empty" style="margin:14px!important">No checklist is available.</div>';
      return;
    }
    const custom = isCustomChecklist(selectedChecklistId);
    const stats = progressStats(selectedChecklistId, checklist);
    main.innerHTML = `
            <div class="qol-cl-main-head"><div class="qol-cl-title-wrap"><div class="qol-cl-title-row"><h2 class="qol-cl-title">${escapeHtml(checklist.name)}</h2><span class="qol-cl-badge">${custom ? 'Custom' : 'APES Guide'}</span></div>${checklist.pretext ? `<p class="qol-cl-description">${escapeHtml(checklist.pretext)}</p>` : ''}</div><div class="qol-cl-progress-summary"><div class="qol-cl-progress-value">${stats.percent}%</div><div class="qol-cl-progress-label">${stats.done} of ${stats.total} complete</div></div></div>
            <div class="qol-cl-progress-track"><span style="width:${stats.percent}%"></span></div>
            <div class="qol-cl-tools">
                <input class="qol-cl-search" type="search" value="${escapeHtml(taskSearch)}" placeholder="Search tasks…" aria-label="Search checklist tasks">
                <div class="qol-cl-filters" aria-label="Task filter">${['all', 'open', 'done'].map(filter => `<div class="qol-cl-filter${taskFilter === filter ? ' qol-active' : ''}" data-action="filter" data-filter="${filter}" role="button" tabindex="0">${filter[0].toUpperCase() + filter.slice(1)}</div>`).join('')}</div>
                <div class="qol-cl-actions">${stats.open ? '<div class="qol-cl-action qol-secondary qol-compact" data-action="complete-all" role="button" tabindex="0">Complete All</div>' : ''}${stats.done ? '<div class="qol-cl-action qol-secondary qol-compact" data-action="reset" role="button" tabindex="0">Reset</div>' : ''}<div class="qol-cl-action qol-secondary qol-compact" data-action="duplicate" role="button" tabindex="0">Duplicate</div>${custom ? '<div class="qol-cl-action qol-secondary qol-compact" data-action="edit" role="button" tabindex="0">Edit</div><div class="qol-cl-action qol-danger qol-compact" data-action="delete-list" role="button" tabindex="0">Delete</div>' : ''}</div>
            </div>
            <div class="qol-cl-task-scroll">${stats.total && stats.done === stats.total ? '<div class="qol-cl-complete-banner"><span>✓</span><span>Checklist complete — nicely done.</span></div>' : ''}<div class="qol-cl-task-list"></div>${custom ? '<div class="qol-cl-add-row"><input class="qol-cl-add-input" type="text" maxlength="300" placeholder="Add another task…" aria-label="New checklist task"><div class="qol-cl-action qol-compact" data-action="add-task" role="button" tabindex="0">Add Task</div></div>' : ''}</div>
        `;
    renderTaskList();
  }
  function renderWorkspace() {
    if (!panel) return;
    resolveSelectedChecklist();
    renderSidebar();
    renderMain();
  }
  function toggleTask(index) {
    const checklist = getAllChecklists()[selectedChecklistId];
    if (!checklist || index < 0 || index >= checklist.steps.length) return;
    const completed = getCompletedSet(selectedChecklistId, checklist.steps.length);
    if (completed.has(index)) completed.delete(index);else completed.add(index);
    setCompletedSet(selectedChecklistId, completed);
    renderSidebar();
    renderMain();
  }
  function addTask() {
    const input = panel?.querySelector('.qol-cl-add-input');
    const text = cleanText(input?.value);
    if (!text || !isCustomChecklist(selectedChecklistId)) return;
    const custom = getCustomChecklists();
    custom[selectedChecklistId].steps.push(text);
    saveCustomChecklists(custom);
    renderWorkspace();
    panel?.querySelector('.qol-cl-add-input')?.focus();
    showToast('Task added.');
  }
  function deleteTask(index) {
    const custom = getCustomChecklists();
    const checklist = custom[selectedChecklistId];
    if (!checklist || index < 0 || index >= checklist.steps.length) return;
    const completed = getCompletedSet(selectedChecklistId, checklist.steps.length);
    checklist.steps.splice(index, 1);
    const adjusted = new Set([...completed].filter(item => item !== index).map(item => item > index ? item - 1 : item));
    saveCustomChecklists(custom);
    setCompletedSet(selectedChecklistId, adjusted);
    renderWorkspace();
    showToast('Task removed.', 'info');
  }
  function moveTask(index, direction) {
    const custom = getCustomChecklists();
    const checklist = custom[selectedChecklistId];
    const target = index + direction;
    if (!checklist || target < 0 || target >= checklist.steps.length) return;
    const completed = getCompletedSet(selectedChecklistId, checklist.steps.length);
    [checklist.steps[index], checklist.steps[target]] = [checklist.steps[target], checklist.steps[index]];
    const indexDone = completed.has(index);
    const targetDone = completed.has(target);
    completed.delete(index);
    completed.delete(target);
    if (indexDone) completed.add(target);
    if (targetDone) completed.add(index);
    saveCustomChecklists(custom);
    setCompletedSet(selectedChecklistId, completed);
    renderWorkspace();
  }
  function duplicateSelectedChecklist() {
    const source = getAllChecklists()[selectedChecklistId];
    if (!source) return;
    const custom = getCustomChecklists();
    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    let name = `${source.name} Copy`;
    const names = new Set(Object.values(custom).map(item => normalizedText(item.name)));
    let suffix = 2;
    while (names.has(normalizedText(name))) name = `${source.name} Copy ${suffix++}`;
    custom[id] = {
      name,
      pretext: source.pretext,
      steps: [...source.steps]
    };
    saveCustomChecklists(custom);
    selectedChecklistId = id;
    try {
      localStorage.setItem(SELECTED_STORAGE_KEY, id);
    } catch (_) {}
    taskFilter = 'all';
    taskSearch = '';
    renderWorkspace();
    showToast('Editable checklist copy created.');
  }
  function deleteSelectedChecklist() {
    const custom = getCustomChecklists();
    const checklist = custom[selectedChecklistId];
    if (!checklist) return;
    showConfirm('Delete Checklist?', `Delete “${checklist.name}” and its saved progress? This cannot be undone.`, 'Delete Checklist', () => {
      const deletedId = selectedChecklistId;
      delete custom[deletedId];
      saveCustomChecklists(custom);
      const progress = getProgressMap();
      delete progress[deletedId];
      saveProgressMap(progress);
      selectedChecklistId = Object.keys(BUILTIN_CHECKLISTS)[0] || Object.keys(custom)[0] || '';
      try {
        localStorage.setItem(SELECTED_STORAGE_KEY, selectedChecklistId);
      } catch (_) {}
      taskFilter = 'all';
      taskSearch = '';
      renderWorkspace();
      showToast('Checklist deleted.', 'info');
    });
  }
  function handlePanelAction(actionElement) {
    const action = actionElement.dataset.action;
    const checklist = getAllChecklists()[selectedChecklistId];
    if (action === 'select') return selectChecklist(actionElement.dataset.checklistId);
    if (action === 'new') return openChecklistEditor();
    if (action === 'filter') {
      taskFilter = actionElement.dataset.filter || 'all';
      panel.querySelectorAll('.qol-cl-filter').forEach(item => item.classList.toggle('qol-active', item.dataset.filter === taskFilter));
      return renderTaskList();
    }
    if (action === 'toggle-task') return toggleTask(Number(actionElement.dataset.index));
    if (action === 'add-task') return addTask();
    if (action === 'delete-task') return deleteTask(Number(actionElement.dataset.index));
    if (action === 'move-up') return moveTask(Number(actionElement.dataset.index), -1);
    if (action === 'move-down') return moveTask(Number(actionElement.dataset.index), 1);
    if (action === 'duplicate') return duplicateSelectedChecklist();
    if (action === 'edit' && isCustomChecklist(selectedChecklistId)) return openChecklistEditor(selectedChecklistId);
    if (action === 'delete-list') return deleteSelectedChecklist();
    if (action === 'complete-all' && checklist) {
      setCompletedSet(selectedChecklistId, new Set(checklist.steps.map((_, index) => index)));
      renderWorkspace();
      return showToast('Every task marked complete.');
    }
    if (action === 'reset' && checklist) {
      return showConfirm('Reset Progress?', `Clear every completed task in “${checklist.name}”?`, 'Reset Progress', () => {
        setCompletedSet(selectedChecklistId, new Set());
        renderWorkspace();
        showToast('Progress reset.', 'info');
      });
    }
  }
  function saveWindowState() {
    if (!panel || !panel.classList.contains('qol-cl-open')) return;
    const rect = panel.getBoundingClientRect();
    writeJson(WINDOW_STORAGE_KEY, {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    });
  }
  function clampWindowToViewport() {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const width = Math.min(rect.width, window.innerWidth - 16);
    const height = Math.min(rect.height, window.innerHeight - 16);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8));
    panel.style.setProperty('width', `${width}px`, 'important');
    panel.style.setProperty('height', `${height}px`, 'important');
    panel.style.setProperty('left', `${left}px`, 'important');
    panel.style.setProperty('top', `${top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
  }
  function applySavedWindowState() {
    if (!panel) return;
    const state = readJson(WINDOW_STORAGE_KEY, null);
    if (!state || ![state.left, state.top, state.width, state.height].every(Number.isFinite)) return;
    panel.style.setProperty('left', `${state.left}px`, 'important');
    panel.style.setProperty('top', `${state.top}px`, 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('width', `${state.width}px`, 'important');
    panel.style.setProperty('height', `${state.height}px`, 'important');
  }
  function makeDraggable() {
    const handle = panel.querySelector('.qol-cl-header');
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || event.target.closest('.qol-cl-close')) return;
      event.preventDefault();
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      handle.setPointerCapture?.(event.pointerId);
      const move = moveEvent => {
        const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
        const left = Math.min(maxLeft, Math.max(8, rect.left + moveEvent.clientX - startX));
        const top = Math.min(maxTop, Math.max(8, rect.top + moveEvent.clientY - startY));
        panel.style.setProperty('left', `${left}px`, 'important');
        panel.style.setProperty('top', `${top}px`, 'important');
        panel.style.setProperty('right', 'auto', 'important');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
        saveWindowState();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
  }
  function makeResizable() {
    const grip = panel.querySelector('.qol-cl-resize-grip');
    grip.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      grip.setPointerCapture?.(event.pointerId);
      const move = moveEvent => {
        const minWidth = Math.min(580, window.innerWidth - 16);
        const minHeight = Math.min(390, window.innerHeight - 16);
        const maxWidth = Math.max(minWidth, window.innerWidth - rect.left - 8);
        const maxHeight = Math.max(minHeight, window.innerHeight - rect.top - 8);
        const width = Math.min(maxWidth, Math.max(minWidth, rect.width + moveEvent.clientX - startX));
        const height = Math.min(maxHeight, Math.max(minHeight, rect.height + moveEvent.clientY - startY));
        panel.style.setProperty('width', `${width}px`, 'important');
        panel.style.setProperty('height', `${height}px`, 'important');
      };
      const stop = () => {
        window.removeEventListener('pointermove', move, true);
        window.removeEventListener('pointerup', stop, true);
        window.removeEventListener('pointercancel', stop, true);
        saveWindowState();
      };
      window.addEventListener('pointermove', move, true);
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
    });
  }
  function closeWindow() {
    closeDialog();
    panel?.classList.remove('qol-cl-open');
  }
  function openWindow() {
    if (!panel) buildUI();
    if (!panel) return;
    window.dispatchEvent(new CustomEvent('qol_close_others', {
      detail: {
        source: 'checklists'
      }
    }));
    renderWorkspace();
    panel.classList.add('qol-cl-open');
    window.requestAnimationFrame(clampWindowToViewport);
  }
  function toggleWindow(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (panel?.classList.contains('qol-cl-open')) closeWindow();else openWindow();
  }
  function buildUI() {
    if (!isEnabled()) return;
    injectStyles();
    toolbarButton = document.getElementById(BUTTON_ID);
    if (!toolbarButton) {
      toolbarButton = document.createElement('div');
      toolbarButton.id = BUTTON_ID;
      toolbarButton.title = 'Checklists';
      toolbarButton.setAttribute('role', 'button');
      toolbarButton.setAttribute('tabindex', '0');
      toolbarButton.setAttribute('aria-label', 'Open Checklists');
      toolbarButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><path d="m9 8 1.5 1.5L14 6M9 13h6M9 17h6"></path></svg>';
      toolbarButton.addEventListener('click', toggleWindow);
      toolbarButton.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') toggleWindow(event);
      });
      document.body.appendChild(toolbarButton);
    }
    panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.innerHTML = `
                <div class="qol-cl-header"><div class="qol-cl-header-copy"><span class="qol-cl-header-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3h14v18H5z"></path><path d="m8 8 1.5 1.5L12 7M8 14h8M8 18h6"></path></svg></span><span class="qol-cl-header-title">Checklists <span class="qol-cl-header-subtitle">Guides, routines and personal plans</span></span></div><div class="qol-cl-close" role="button" tabindex="0" aria-label="Close Checklists">×</div></div>
                <div class="qol-cl-workspace"><aside class="qol-cl-sidebar"><div class="qol-cl-sidebar-head"><span class="qol-cl-sidebar-title">Checklist Library</span><div class="qol-cl-action qol-compact" data-action="new" role="button" tabindex="0">+ New</div></div><div class="qol-cl-library"></div></aside><main class="qol-cl-main"></main></div>
                <div class="qol-cl-resize-grip" aria-hidden="true"></div>
            `;
      document.body.appendChild(panel);
      applySavedWindowState();
      makeDraggable();
      makeResizable();
      bindKeyboardActivation(panel);
      panel.querySelector('.qol-cl-close').addEventListener('click', closeWindow);
      panel.addEventListener('click', event => {
        const action = event.target.closest('[data-action]');
        if (action && panel.contains(action)) handlePanelAction(action);
      });
      panel.addEventListener('input', event => {
        if (!event.target.matches('.qol-cl-search')) return;
        taskSearch = event.target.value;
        renderTaskList();
      });
      panel.addEventListener('keydown', event => {
        if (event.key === 'Enter' && event.target.matches('.qol-cl-add-input')) {
          event.preventDefault();
          addTask();
        }
      });
    }
    resolveSelectedChecklist();
    renderWorkspace();
    window.qolRepositionAllButtons?.();
  }
  function destroyUI() {
    closeDialog();
    document.querySelector('.qol-cl-toast')?.remove();
    document.getElementById(PANEL_ID)?.remove();
    document.getElementById(BUTTON_ID)?.remove();
    panel = null;
    toolbarButton = null;
    window.qolRepositionAllButtons?.();
  }
  function initialize() {
    if (isEnabled()) buildUI();else destroyUI();
  }
  window.addEventListener('qol_close_others', event => {
    if (event.detail?.source !== 'checklists') closeWindow();
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === FEATURE_KEY) initialize();
  });
  window.addEventListener('resize', () => {
    if (panel?.classList.contains('qol-cl-open')) {
      clampWindowToViewport();
      saveWindowState();
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.getElementById(DIALOG_ID)) {
      closeDialog();
      event.stopImmediatePropagation();
      return;
    }
    if (panel?.classList.contains('qol-cl-open')) {
      closeWindow();
      event.stopImmediatePropagation();
    }
  }, true);
  window.qolOpenChecklists = openWindow;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, {
    once: true
  });else initialize();
})();
