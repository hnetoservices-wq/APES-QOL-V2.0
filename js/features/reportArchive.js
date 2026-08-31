(function () {
  'use strict';

  const FEATURE_KEY = 'reportArchive';
  const STORAGE_KEY = `qol_report_archive_${window.location.hostname}`;
  const ALL_FOLDER_ID = '__all__';
  const DEFAULT_FOLDER_ID = '__unfiled__';
  const STYLE_ID = 'qol-report-archive-styles';
  let archive = createEmptyArchive();
  let toolbarButton = null;
  let archivePanel = null;
  let reportObserver = null;
  let integrationObserver = null;
  let integrationScheduled = false;
  let scanScheduled = false;
  let activeFolderId = ALL_FOLDER_ID;
  let activeReportId = null;
  let pendingReportId = null;
  let featureStarted = false;
  let draggedFolderId = null;
  let suppressFolderClick = false;
  let searchMode = 'name';
  let searchQuery = '';
  function createEmptyArchive() {
    return {
      version: 2,
      updatedAt: 0,
      folders: [],
      reports: []
    };
  }
  function isEnabled() {
    return !window.isQolEnabled || window.isQolEnabled(FEATURE_KEY);
  }
  function bindControl(element, callback) {
    if (!element) return;
    element.addEventListener('click', callback);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      callback(event);
    });
  }
  function ensureMenuIntegration() {
    const checkbox = document.querySelector('#qol-advanced-feature-grid #qol-chk-report-archive');
    if (checkbox) checkbox.checked = isEnabled();
  }
  function installToolbarPositionHook() {
    if (window.__qolReportArchivePositionHooked) {
      return;
    }
    if (typeof window.qolRepositionAllButtons !== 'function') {
      return;
    }
    const originalReposition = window.qolRepositionAllButtons;
    window.qolRepositionAllButtons = function (...args) {
      const result = originalReposition.apply(this, args);
      requestAnimationFrame(positionToolbarButton);
      return result;
    };
    window.__qolReportArchivePositionHooked = true;
  }
  function positionToolbarButton() {
    const button = document.getElementById('qol-report-archive-toggle');
    if (!button) return;
    const villageList = document.getElementById('villageList');
    if (!villageList || !isEnabled()) {
      button.style.setProperty('display', 'none', 'important');
      return;
    }
    const villageRect = villageList.getBoundingClientRect();
    if (villageRect.width <= 0 || villageRect.height <= 0) {
      button.style.setProperty('display', 'none', 'important');
      return;
    }
    const otherButtonIds = ['qol-cog-btn', 'qol-help-toggle-btn', 'qol-rally-point-toggle-btn', 'qol-watchlist-toggle', 'qol-checklist-toggle-btn', 'qol-npc-calc-toggle-btn', 'qol-oasis-toggle-btn'];
    let nextLeft = villageRect.right + 20;
    otherButtonIds.forEach(id => {
      const candidate = document.getElementById(id);
      if (!candidate || window.getComputedStyle(candidate).display === 'none') {
        return;
      }
      const rect = candidate.getBoundingClientRect();
      if (rect.width > 0) {
        nextLeft = Math.max(nextLeft, rect.right + 6);
      }
    });
    const importantStyles = {
      position: 'fixed',
      left: `${nextLeft}px`,
      top: `${villageRect.top + 4}px`,
      width: '30px',
      height: '30px',
      display: 'flex',
      'z-index': '9999'
    };
    Object.entries(importantStyles).forEach(([property, value]) => {
      button.style.setProperty(property, value, 'important');
    });
  }
  function scheduleIntegration() {
    if (integrationScheduled) {
      return;
    }
    integrationScheduled = true;
    requestAnimationFrame(() => {
      integrationScheduled = false;
      ensureMenuIntegration();
      installToolbarPositionHook();
      positionToolbarButton();
    });
  }
  function makeId(prefix) {
    return `${prefix}_` + `${Date.now().toString(36)}_` + `${Math.random().toString(36).slice(2, 9)}`;
  }
  function normalizeArchive(value) {
    const source = value && typeof value === 'object' ? value : createEmptyArchive();
    return {
      version: 2,
      updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : 0,
      folders: Array.isArray(source.folders) ? source.folders : [],
      reports: Array.isArray(source.reports) ? source.reports : []
    };
  }
  function getArchiveFreshness(value) {
    const normalized = normalizeArchive(value);
    const folderTimes = normalized.folders.flatMap(folder => [Number(folder.createdAt) || 0, Number(folder.updatedAt) || 0]);
    const reportTimes = normalized.reports.flatMap(report => [Number(report.savedAt) || 0, Number(report.updatedAt) || 0]);
    return Math.max(Number(normalized.updatedAt) || 0, 0, ...folderTimes, ...reportTimes);
  }
  function selectNewestArchive(extensionArchive, fallbackArchive) {
    const extensionValue = normalizeArchive(extensionArchive);
    const fallbackValue = normalizeArchive(fallbackArchive);
    return getArchiveFreshness(fallbackValue) > getArchiveFreshness(extensionValue) ? fallbackValue : extensionValue;
  }
  function canUseExtensionStorage() {
    try {
      return Boolean(typeof chrome !== 'undefined' && chrome.storage?.local && typeof chrome.storage.local.get === 'function' && typeof chrome.storage.local.set === 'function');
    } catch (error) {
      return false;
    }
  }
  function getExtensionRuntimeError() {
    try {
      return chrome.runtime?.lastError || null;
    } catch (error) {
      return error;
    }
  }
  function loadLocalFallback() {
    try {
      return normalizeArchive(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
    } catch (error) {
      console.warn('[APES Report Archive] ' + 'Could not load fallback storage:', error);
      return createEmptyArchive();
    }
  }
  function loadArchive() {
    return new Promise(resolve => {
      const fallbackArchive = loadLocalFallback();
      if (!canUseExtensionStorage()) {
        resolve(fallbackArchive);
        return;
      }
      try {
        chrome.storage.local.get([STORAGE_KEY], result => {
          const error = getExtensionRuntimeError();
          if (error) {
            console.warn('[APES Report Archive] ' + 'Could not load extension storage:', error.message);
            resolve(fallbackArchive);
            return;
          }
          resolve(selectNewestArchive(result?.[STORAGE_KEY], fallbackArchive));
        });
      } catch (error) {
        console.warn('[APES Report Archive] ' + 'Extension storage is unavailable; ' + 'using recovery copy:', error.message);
        resolve(fallbackArchive);
      }
    });
  }
  function saveArchive() {
    return new Promise((resolve, reject) => {
      archive.updatedAt = Date.now();
      let fallbackError = null;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(archive));
      } catch (error) {
        fallbackError = error;
        console.warn('[APES Report Archive] Could not update recovery copy:', error);
      }
      if (!canUseExtensionStorage()) {
        if (fallbackError) {
          reject(fallbackError);
        } else {
          resolve();
        }
        return;
      }
      try {
        chrome.storage.local.set({
          [STORAGE_KEY]: archive
        }, () => {
          const error = getExtensionRuntimeError();
          if (!error) {
            resolve();
            return;
          }
          if (!fallbackError) {
            console.warn('[APES Report Archive] ' + 'Extension storage unavailable; ' + 'change kept in recovery copy:', error.message);
            resolve();
            return;
          }
          reject(new Error(`${error.message}; ` + `recovery copy failed: ` + `${fallbackError.message}`));
        });
      } catch (error) {
        if (!fallbackError) {
          console.warn('[APES Report Archive] ' + 'Extension context unavailable; ' + 'change kept in recovery copy:', error.message);
          resolve();
          return;
        }
        reject(new Error(`${error.message}; ` + `recovery copy failed: ` + `${fallbackError.message}`));
      }
    });
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function normalizeText(value) {
    return String(value || '').replace(/[\u200e\u200f\u202a-\u202e]/g, '').replace(/\s+/g, ' ').trim();
  }
  function hashText(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }
  function toolbarIcon() {
    return `
            <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path
                    d="M3.5 7.5h6l2-2h9v14h-17z"
                ></path>

                <path
                    d="M3.5 9.5h17"
                ></path>

                <path
                    d="M12 12v4"
                ></path>

                <path
                    d="M10.3 14.3 12 16l1.7-1.7"
                ></path>
            </svg>
        `;
  }
  function reportSaveIcon(isArchived) {
    return isArchived ? `
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        d="M3.5 7h6l2-2h9v14h-17z"
                    ></path>

                    <path
                        d="m7.8 13 2.6 2.6 5.8-6"
                    ></path>
                </svg>
            ` : `
                <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                >
                    <path
                        d="M3.5 7h6l2-2h9v14h-17z"
                    ></path>

                    <path
                        d="M12 9.5v6"
                    ></path>

                    <path
                        d="m9.5 13 2.5 2.5 2.5-2.5"
                    ></path>
                </svg>
            `;
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
            #qol-report-archive-toggle {
                position:fixed!important;
                display:none;
                align-items:center!important;
                justify-content:center!important;
                width:30px!important;
                height:30px!important;
                margin:0!important;
                padding:0!important;
                box-sizing:border-box!important;
                border:2px solid var(--qol-accent)!important;
                border-radius:50%!important;
                background:var(--qol-accent-soft)!important;
                box-shadow:0 2px 4px rgba(0,0,0,.2)!important;
                cursor:pointer!important;
                user-select:none!important;
                transition:
                    transform .2s ease,
                    background-color .2s ease!important;
            }

            #qol-report-archive-toggle:hover {
                transform:scale(1.1)!important;
                background:#f7f5f0!important;
            }

            #qol-report-archive-toggle svg {
                width:16px!important;
                height:16px!important;
                fill:none!important;
                stroke:var(--qol-accent)!important;
                stroke-width:1.8!important;
                stroke-linecap:round!important;
                stroke-linejoin:round!important;
                pointer-events:none!important;
            }

            .qol-ra-report-save {
                position:absolute!important;
                top:0!important;
                right:52px!important;
                z-index:4!important;
                display:inline-flex!important;
                align-items:center!important;
                justify-content:center!important;
                flex:0 0 22px!important;
                width:22px!important;
                height:22px!important;
                margin:0!important;
                padding:0!important;
                box-sizing:border-box!important;
                border:1px solid var(--qol-border-strong)!important;
                border-radius:4px!important;
                background:
                    linear-gradient(
                        to bottom,
                        #f7efd9,
                        #d9c59e
                    )!important;
                box-shadow:
                    0 1px 2px
                    rgba(0,0,0,.25)!important;
                cursor:pointer!important;
                user-select:none!important;
                transition:
                    transform .15s ease,
                    filter .15s ease,
                    box-shadow .15s ease!important;
            }

            .qol-ra-report-save:hover {
                transform:
                    translateY(-1px)!important;
                filter:
                    brightness(1.06)!important;
            }

            .qol-ra-report-save svg {
                width:14px!important;
                height:14px!important;
                fill:none!important;
                stroke:var(--qol-accent-dark)!important;
                stroke-width:2!important;
                stroke-linecap:round!important;
                stroke-linejoin:round!important;
                pointer-events:none!important;
            }

            .qol-ra-report-save.qol-ra-archived {
                border-color:#264d24!important;
                background:
                    linear-gradient(
                        to bottom,
                        #79ad59,
                        #3e742f
                    )!important;
                box-shadow:
                    0 1px 2px
                        rgba(0,0,0,.28),
                    0 0 0 1px
                        rgba(255,255,255,.18)
                        inset!important;
            }

            .qol-ra-report-save.qol-ra-archived svg {
                stroke:#fff!important;
            }

            .qol-ra-report-save.qol-ra-just-saved {
                animation:
                    qol-ra-saved-pulse
                    .7s ease!important;
            }

            @keyframes qol-ra-saved-pulse {
                0% {
                    transform:scale(1);
                    box-shadow:
                        0 1px 2px
                            rgba(0,0,0,.28),
                        0 0 0 0
                            rgba(80,150,56,.7);
                }

                45% {
                    transform:scale(1.22);
                    box-shadow:
                        0 2px 5px
                            rgba(0,0,0,.32),
                        0 0 0 6px
                            rgba(80,150,56,.15);
                }

                100% {
                    transform:scale(1);
                    box-shadow:
                        0 1px 2px
                            rgba(0,0,0,.28),
                        0 0 0 9px
                            rgba(80,150,56,0);
                }
            }

            #qol-report-archive-panel {
                position:fixed!important;
                left:50%!important;
                top:50%!important;
                z-index:1000000!important;
                display:none;
                flex-direction:column!important;
                width:900px!important;
                max-width:
                    calc(100vw - 36px)!important;
                height:590px!important;
                max-height:
                    calc(100vh - 36px)!important;
                transform:
                    translate(-50%,-50%)!important;
                box-sizing:border-box!important;
                overflow:hidden!important;
                border:
                    3px solid var(--qol-border)!important;
                border-radius:6px!important;
                background:#f7f5f0!important;
                box-shadow:
                    0 12px 34px
                    rgba(0,0,0,.52)!important;
                color:#333!important;
                font:
                    11px Arial,
                    sans-serif!important;
            }

            .qol-ra-header {
                display:flex!important;
                align-items:center!important;
                justify-content:
                    space-between!important;
                flex:0 0 36px!important;
                height:36px!important;
                padding:0 10px!important;
                box-sizing:border-box!important;
                color:#f7f5f0!important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent-mid),
                        var(--qol-accent-dark)
                    )!important;
                cursor:move!important;
                user-select:none!important;
            }

            .qol-ra-header-title {
                display:flex!important;
                align-items:center!important;
                gap:7px!important;
                font-size:13px!important;
                font-weight:bold!important;
            }

            .qol-ra-header-title svg {
                width:16px!important;
                height:16px!important;
                fill:none!important;
                stroke:#f7f5f0!important;
                stroke-width:1.8!important;
            }

            .qol-ra-close {
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                min-width:24px!important;
                height:24px!important;
                border-radius:3px!important;
                background:
                    rgba(0,0,0,.18)!important;
                color:#fff!important;
                font-size:20px!important;
                font-weight:bold!important;
                line-height:1!important;
                cursor:pointer!important;
            }

            .qol-ra-close:hover {
                color:#ffcccc!important;
                background:
                    rgba(255,255,255,.16)!important;
            }

            .qol-ra-layout {
                min-height:0!important;
                display:grid!important;
                grid-template-columns:
                    205px minmax(0,1fr)!important;
                flex:1 1 auto!important;
                background:#f7f5f0!important;
            }

            .qol-ra-sidebar {
                min-width:0!important;
                min-height:0!important;
                display:flex!important;
                flex-direction:column!important;
                padding:10px!important;
                box-sizing:border-box!important;
                overflow:hidden!important;
                border-right:
                    1px solid #cbbd9f!important;
                background:#eee5d2!important;
            }

            .qol-ra-sidebar-heading,
            .qol-ra-main-heading {
                display:flex!important;
                align-items:center!important;
                justify-content:
                    space-between!important;
                gap:8px!important;
            }

            .qol-ra-sidebar-title,
            .qol-ra-main-title {
                color:var(--qol-accent-dark)!important;
                font-size:12px!important;
                font-weight:bold!important;
            }

            .qol-ra-main-subtitle {
                margin-top:3px!important;
                color:#766957!important;
                font-size:10.5px!important;
            }

            .qol-ra-control,
            .qol-ra-small-control,
            .qol-ra-row-action {
                display:inline-flex!important;
                align-items:center!important;
                justify-content:center!important;
                box-sizing:border-box!important;
                border:
                    1px solid var(--qol-accent-outline)!important;
                border-radius:4px!important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent),
                        var(--qol-accent-dark)
                    )!important;
                color:#fff!important;
                font:
                    700 11px/1.2
                    Arial,
                    sans-serif!important;
                text-align:center!important;
                cursor:pointer!important;
                user-select:none!important;
                box-shadow:
                    0 1px 2px
                    rgba(0,0,0,.18)!important;
            }

            .qol-ra-control:hover,
            .qol-ra-small-control:hover,
            .qol-ra-row-action:hover {
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent-hover),
                        var(--qol-accent-hover-dark)
                    )!important;
            }

            .qol-ra-control {
                min-height:28px!important;
                padding:5px 10px!important;
            }

            .qol-ra-control.qol-ra-secondary {
                border-color:#8d7b5d!important;
                background:
                    linear-gradient(
                        to bottom,
                        #fffdf8,
                        #e6dcc7
                    )!important;
                color:var(--qol-accent-dark)!important;
            }

            .qol-ra-control.qol-ra-danger,
            .qol-ra-row-action.qol-ra-danger {
                border-color:#6d2a24!important;
                background:
                    linear-gradient(
                        to bottom,
                        #a65348,
                        #71352e
                    )!important;
            }

            .qol-ra-control.qol-ra-disabled {
                opacity:.42!important;
                pointer-events:none!important;
            }

            .qol-ra-small-control {
                width:24px!important;
                height:24px!important;
                font-size:16px!important;
            }

            .qol-ra-folder-list {
                min-height:0!important;
                display:flex!important;
                flex:1 1 auto!important;
                flex-direction:column!important;
                gap:4px!important;
                margin-top:9px!important;
                padding-right:3px!important;
                overflow-y:auto!important;
                scrollbar-gutter:
                    stable!important;
            }

            .qol-ra-folder-row {
                display:flex!important;
                align-items:center!important;
                gap:6px!important;
                min-height:31px!important;
                padding:5px 6px!important;
                box-sizing:border-box!important;
                border:
                    1px solid transparent!important;
                border-radius:4px!important;
                color:#4a4034!important;
                cursor:pointer!important;
                user-select:none!important;
            }

            .qol-ra-folder-row:hover {
                border-color:#cfbea0!important;
                background:#f8f1e4!important;
            }

            .qol-ra-folder-row.qol-ra-active {
                border-color:var(--qol-border-strong)!important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent),
                        var(--qol-accent-dark)
                    )!important;
                color:#fff!important;
            }

            .qol-ra-folder-row[draggable="true"] {
                cursor:grab!important;
            }

            .qol-ra-folder-row[draggable="true"]:active {
                cursor:grabbing!important;
            }

            .qol-ra-folder-row.qol-ra-dragging {
                opacity:.45!important;
            }

            .qol-ra-folder-row.qol-ra-drop-before {
                box-shadow:
                    0 -3px 0 var(--qol-accent)!important;
            }

            .qol-ra-folder-row.qol-ra-drop-after {
                box-shadow:
                    0 3px 0 var(--qol-accent)!important;
            }

            .qol-ra-folder-icon {
                width:15px!important;
                flex:0 0 15px!important;
                font-size:13px!important;
            }

            .qol-ra-folder-name {
                min-width:0!important;
                flex:1 1 auto!important;
                overflow:hidden!important;
                text-overflow:
                    ellipsis!important;
                white-space:nowrap!important;
            }

            .qol-ra-folder-count {
                min-width:20px!important;
                padding:1px 5px!important;
                box-sizing:border-box!important;
                border-radius:10px!important;
                background:
                    rgba(0,0,0,.12)!important;
                text-align:center!important;
                font-size:10px!important;
            }

            .qol-ra-folder-tools {
                display:none!important;
                gap:3px!important;
            }

            .qol-ra-folder-row:hover
            .qol-ra-folder-tools,
            .qol-ra-folder-row.qol-ra-active
            .qol-ra-folder-tools {
                display:flex!important;
            }

            .qol-ra-folder-tool {
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                width:18px!important;
                height:18px!important;
                border-radius:3px!important;
                background:
                    rgba(255,255,255,.22)!important;
                color:inherit!important;
                font-size:11px!important;
                font-weight:bold!important;
                cursor:pointer!important;
            }

            .qol-ra-main {
                min-width:0!important;
                min-height:0!important;
                display:flex!important;
                flex-direction:column!important;
                padding:12px!important;
                box-sizing:border-box!important;
                background:#f7f5f0!important;
            }

            .qol-ra-search {
                display:grid!important;
                grid-template-columns:
                    auto
                    105px
                    minmax(170px,1fr)
                    auto!important;
                align-items:center!important;
                gap:6px!important;
                margin-top:10px!important;
                padding:8px!important;
                box-sizing:border-box!important;
                border:
                    1px solid #cbbd9f!important;
                border-radius:4px!important;
                background:#eee5d2!important;
            }

            .qol-ra-search-label {
                color:#65543d!important;
                font-size:10px!important;
                font-weight:bold!important;
                white-space:nowrap!important;
            }

            .qol-ra-search-mode,
            .qol-ra-search-input {
                width:100%!important;
                height:29px!important;
                margin:0!important;
                padding:4px 7px!important;
                box-sizing:border-box!important;
                border:
                    1px solid #9c8968!important;
                border-radius:4px!important;
                outline:none!important;
                background:#fff!important;
                color:#333!important;
                font:
                    11px Arial,
                    sans-serif!important;
            }

            .qol-ra-search-mode {
                cursor:pointer!important;
            }

            .qol-ra-search-input:focus,
            .qol-ra-search-mode:focus {
                border-color:var(--qol-border-strong)!important;
                box-shadow:
                    0 0 0 2px
                    rgba(125,99,66,.18)!important;
            }

            .qol-ra-search-input[type="date"] {
                color-scheme:light!important;
                cursor:pointer!important;
            }

            .qol-ra-search-clear {
                min-width:50px!important;
                height:29px!important;
                padding:4px 8px!important;
            }

            .qol-ra-search-clear.qol-ra-disabled {
                opacity:.42!important;
                pointer-events:none!important;
            }

            .qol-ra-report-list {
                min-height:0!important;
                flex:1 1 auto!important;
                margin-top:10px!important;
                overflow-y:auto!important;
                border:
                    1px solid #cbbd9f!important;
                border-radius:4px!important;
                background:#fff!important;
            }

            .qol-ra-report-row {
                display:grid!important;
                grid-template-columns:
                    minmax(0,1fr)
                    auto!important;
                align-items:center!important;
                gap:10px!important;
                min-height:58px!important;
                padding:8px 9px!important;
                box-sizing:border-box!important;
                border-bottom:
                    1px solid #e0d7c5!important;
            }

            .qol-ra-report-row:last-child {
                border-bottom:none!important;
            }

            .qol-ra-report-row:hover {
                background:#fbf7ef!important;
            }

            .qol-ra-report-copy {
                min-width:0!important;
            }

            .qol-ra-report-title {
                overflow:hidden!important;
                color:#493821!important;
                font-size:11.5px!important;
                font-weight:bold!important;
                text-overflow:
                    ellipsis!important;
                white-space:nowrap!important;
            }

            .qol-ra-report-meta {
                margin-top:4px!important;
                color:#786b58!important;
                font-size:10px!important;
            }

            .qol-ra-report-actions {
                display:flex!important;
                gap:5px!important;
            }

            .qol-ra-row-action {
                min-width:45px!important;
                height:25px!important;
                padding:3px 7px!important;
                font-size:10px!important;
            }

            .qol-ra-empty {
                min-height:190px!important;
                display:flex!important;
                flex-direction:column!important;
                align-items:center!important;
                justify-content:center!important;
                padding:24px!important;
                box-sizing:border-box!important;
                color:#766957!important;
                text-align:center!important;
                line-height:1.5!important;
            }

            .qol-ra-detail {
                position:absolute!important;
                inset:36px 0 0 0!important;
                z-index:5!important;
                display:none;
                flex-direction:column!important;
                background:#e2d7c0!important;
            }

            .qol-ra-detail-bar {
                display:flex!important;
                align-items:center!important;
                gap:9px!important;
                min-height:44px!important;
                padding:7px 10px!important;
                box-sizing:border-box!important;
                border-bottom:
                    1px solid #b9a98a!important;
                background:#f7f5f0!important;
            }

            .qol-ra-detail-title {
                min-width:0!important;
                flex:1 1 auto!important;
                overflow:hidden!important;
                color:var(--qol-accent-dark)!important;
                font-size:12px!important;
                font-weight:bold!important;
                text-overflow:
                    ellipsis!important;
                white-space:nowrap!important;
            }

            .qol-ra-detail-nav {
                display:flex!important;
                gap:5px!important;
            }

            .qol-ra-detail-nav
            .qol-ra-control {
                min-width:65px!important;
            }

            .qol-ra-snapshot-host {
                min-height:0!important;
                flex:1 1 auto!important;
                padding:16px!important;
                box-sizing:border-box!important;
                overflow:auto!important;
                background:
                    linear-gradient(
                        135deg,
                        #d8cbae,
                        #cbb997
                    )!important;
            }

            .qol-ra-snapshot-card {
                width:740px!important;
                max-width:100%!important;
                min-height:120px!important;
                margin:0 auto!important;
            }

            .qol-ra-compact-report {
                overflow:hidden!important;
                border:
                    2px solid #6d5335!important;
                border-radius:7px!important;
                background:#fffdf8!important;
                box-shadow:
                    0 5px 18px
                    rgba(0,0,0,.25)!important;
                color:#352b20!important;
            }

            .qol-ra-compact-top {
                display:grid!important;
                grid-template-columns:
                    minmax(0,1fr)
                    auto!important;
                align-items:center!important;
                gap:14px!important;
                padding:13px 15px!important;
                border-bottom:
                    1px solid #cdbd9f!important;
                background:
                    linear-gradient(
                        to bottom,
                        #fffdf8,
                        #eee2ca
                    )!important;
            }

            .qol-ra-compact-kicker {
                margin-bottom:3px!important;
                color:#8a775d!important;
                font-size:9px!important;
                font-weight:bold!important;
                letter-spacing:.08em!important;
                text-transform:
                    uppercase!important;
            }

            .qol-ra-compact-headline {
                margin:0!important;
                color:#4b3822!important;
                font:
                    700 15px/1.25
                    Georgia,
                    serif!important;
            }

            .qol-ra-date-block {
                display:flex!important;
                gap:6px!important;
            }

            .qol-ra-date-piece {
                min-width:74px!important;
                padding:6px 8px!important;
                border:
                    1px solid #c4b28f!important;
                border-radius:4px!important;
                background:#fff!important;
                text-align:center!important;
            }

            .qol-ra-date-label {
                display:block!important;
                margin-bottom:2px!important;
                color:#8a775d!important;
                font-size:8px!important;
                font-weight:bold!important;
                letter-spacing:.08em!important;
                text-transform:
                    uppercase!important;
            }

            .qol-ra-date-value {
                color:#4c3a24!important;
                font-size:11px!important;
                font-weight:bold!important;
            }

            .qol-ra-parties {
                display:grid!important;
                grid-template-columns:
                    minmax(0,1fr)
                    44px
                    minmax(0,1fr)!important;
                align-items:stretch!important;
                border-bottom:
                    1px solid #d9cdb5!important;
                background:#f8f2e7!important;
            }

            .qol-ra-party {
                min-width:0!important;
                padding:13px 15px!important;
            }

            .qol-ra-party:first-child {
                text-align:left!important;
            }

            .qol-ra-party:last-child {
                text-align:right!important;
            }

            .qol-ra-party-role {
                display:block!important;
                margin-bottom:4px!important;
                color:#927b5d!important;
                font-size:9px!important;
                font-weight:bold!important;
                letter-spacing:.08em!important;
                text-transform:
                    uppercase!important;
            }

            .qol-ra-party-player {
                overflow:hidden!important;
                color:#4b3822!important;
                font-size:13px!important;
                font-weight:bold!important;
                text-overflow:
                    ellipsis!important;
                white-space:nowrap!important;
            }

            .qol-ra-party-village {
                margin-top:3px!important;
                overflow:hidden!important;
                color:#756650!important;
                font-size:10px!important;
                text-overflow:
                    ellipsis!important;
                white-space:nowrap!important;
            }

            .qol-ra-direction {
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                color:var(--qol-scroll-thumb)!important;
                font-size:24px!important;
                font-weight:bold!important;
            }

            .qol-ra-body-section {
                padding:13px 15px 15px!important;
                background:#fffdf8!important;
            }

            .qol-ra-body-heading {
                display:flex!important;
                align-items:center!important;
                justify-content:
                    space-between!important;
                gap:10px!important;
                margin-bottom:9px!important;
            }

            .qol-ra-body-title {
                color:#5b472e!important;
                font-size:10px!important;
                font-weight:bold!important;
                letter-spacing:.06em!important;
                text-transform:
                    uppercase!important;
            }

            .qol-ra-outcome {
                max-width:60%!important;
                overflow:hidden!important;
                padding:4px 8px!important;
                border:
                    1px solid #9d8a68!important;
                border-radius:12px!important;
                background:#eee2ca!important;
                color:#57442c!important;
                font-size:9px!important;
                font-weight:bold!important;
                text-overflow:
                    ellipsis!important;
                white-space:nowrap!important;
            }

            .qol-ra-compact-body {
                max-width:100%!important;
                overflow-x:auto!important;
                padding:8px!important;
                box-sizing:border-box!important;
                border:
                    1px solid #d6c9b0!important;
                border-radius:5px!important;
                background:#fff!important;
            }

            .qol-ra-compact-body
            .reportBody {
                position:relative!important;
                inset:auto!important;
                width:100%!important;
                max-width:100%!important;
                height:auto!important;
                max-height:none!important;
                margin:0!important;
                transform:none!important;
                overflow:visible!important;
            }

            .qol-ra-compact-body
            .reportHeader,
            .qol-ra-compact-body
            .reportCaption,
            .qol-ra-compact-body
            .reportDate,
            .qol-ra-compact-body
            .controlPanel,
            .qol-ra-compact-body
            .inWindowPopupHeader {
                display:none!important;
            }

            .qol-ra-compact-body
            .scrollable,
            .qol-ra-compact-body
            .scrollContentOuterWrapper,
            .qol-ra-compact-body
            .scrollContent,
            .qol-ra-compact-body
            .scrollContentInnerWrapper {
                position:relative!important;
                inset:auto!important;
                width:auto!important;
                max-width:100%!important;
                height:auto!important;
                max-height:none!important;
                overflow:visible!important;
                transform:none!important;
            }

            .qol-ra-compact-body table {
                max-width:100%!important;
            }

            .qol-ra-compact-body canvas,
            .qol-ra-compact-body img {
                max-width:100%!important;
            }

            .qol-ra-compact-empty {
                padding:30px 15px!important;
                color:#80715e!important;
                text-align:center!important;
                line-height:1.45!important;
            }

            .qol-ra-compact-footer {
                display:flex!important;
                justify-content:
                    space-between!important;
                gap:12px!important;
                padding:8px 15px!important;
                border-top:
                    1px solid #d9cdb5!important;
                background:#f2eadb!important;
                color:#81715b!important;
                font-size:9px!important;
            }

            .qol-ra-dialog-layer {
                position:fixed!important;
                inset:0!important;
                z-index:1000002!important;
                display:flex!important;
                align-items:center!important;
                justify-content:center!important;
                padding:20px!important;
                box-sizing:border-box!important;
                background:
                    rgba(18,16,13,.68)!important;
            }

            .qol-ra-dialog {
                width:390px!important;
                max-width:100%!important;
                overflow:hidden!important;
                border:
                    3px solid var(--qol-border)!important;
                border-radius:5px!important;
                background:#f7f5f0!important;
                box-shadow:
                    0 10px 30px
                    rgba(0,0,0,.5)!important;
                color:#333!important;
                font:
                    11px Arial,
                    sans-serif!important;
            }

            .qol-ra-dialog-header {
                padding:8px 10px!important;
                color:#fff!important;
                background:
                    linear-gradient(
                        to bottom,
                        var(--qol-accent-mid),
                        var(--qol-accent-dark)
                    )!important;
                font-size:12px!important;
                font-weight:bold!important;
            }

            .qol-ra-dialog-body {
                padding:12px!important;
                line-height:1.45!important;
            }

            .qol-ra-dialog-actions {
                display:flex!important;
                justify-content:
                    flex-end!important;
                gap:7px!important;
                padding:0 12px 12px!important;
            }

            .qol-ra-input {
                width:100%!important;
                height:30px!important;
                margin-top:7px!important;
                padding:5px 7px!important;
                box-sizing:border-box!important;
                border:
                    1px solid #9c8968!important;
                border-radius:4px!important;
                outline:none!important;
                background:#fff!important;
                color:#333!important;
                font:
                    11px Arial,
                    sans-serif!important;
            }

            .qol-ra-input:focus {
                border-color:var(--qol-border-strong)!important;
                box-shadow:
                    0 0 0 2px
                    rgba(125,99,66,.18)!important;
            }

            .qol-ra-dialog-error {
                min-height:14px!important;
                margin-top:5px!important;
                color:#9b332a!important;
                font-size:10px!important;
            }

            .qol-ra-choice-list {
                max-height:260px!important;
                margin-top:8px!important;
                overflow-y:auto!important;
                border:
                    1px solid #cbbd9f!important;
                border-radius:4px!important;
                background:#fff!important;
            }

            .qol-ra-choice {
                display:flex!important;
                align-items:center!important;
                justify-content:
                    space-between!important;
                gap:8px!important;
                min-height:34px!important;
                padding:7px 9px!important;
                box-sizing:border-box!important;
                border-bottom:
                    1px solid #e0d7c5!important;
                cursor:pointer!important;
            }

            .qol-ra-choice:last-child {
                border-bottom:none!important;
            }

            .qol-ra-choice:hover,
            .qol-ra-choice.qol-ra-selected {
                background:#f0e6d2!important;
                color:var(--qol-accent-dark)!important;
            }

            .qol-ra-choice.qol-ra-selected::after {
                content:'Current';
                margin-left:auto;
                color:#6b8450;
                font-size:9px;
                font-weight:bold;
            }

            .qol-ra-toast {
                position:fixed!important;
                top:70px!important;
                left:50%!important;
                z-index:1000003!important;
                min-width:220px!important;
                max-width:440px!important;
                padding:9px 13px!important;
                box-sizing:border-box!important;
                transform:
                    translateX(-50%)!important;
                border:
                    1px solid #31592b!important;
                border-radius:4px!important;
                background:
                    linear-gradient(
                        to bottom,
                        #6c9d50,
                        #3d6f31
                    )!important;
                box-shadow:
                    0 4px 12px
                    rgba(0,0,0,.32)!important;
                color:#fff!important;
                font:
                    700 11px
                    Arial,
                    sans-serif!important;
                text-align:center!important;
                pointer-events:none!important;
            }

            .qol-ra-toast.qol-ra-toast-error {
                border-color:#6d2a24!important;
                background:
                    linear-gradient(
                        to bottom,
                        #a65348,
                        #71352e
                    )!important;
            }

            @media (max-width:700px) {
                .qol-ra-layout {
                    grid-template-columns:
                        150px
                        minmax(0,1fr)!important;
                }

                .qol-ra-search {
                    grid-template-columns:
                        85px
                        minmax(0,1fr)
                        auto!important;
                }

                .qol-ra-search-label {
                    display:none!important;
                }

                .qol-ra-report-row {
                    grid-template-columns:
                        1fr!important;
                }

                .qol-ra-report-actions {
                    justify-content:
                        flex-start!important;
                }

                .qol-ra-compact-top {
                    grid-template-columns:
                        1fr!important;
                }

                .qol-ra-parties {
                    grid-template-columns:
                        1fr!important;
                }

                .qol-ra-party,
                .qol-ra-party:last-child {
                    text-align:left!important;
                }

                .qol-ra-direction {
                    min-height:20px!important;
                    transform:
                        rotate(90deg)!important;
                }

                .qol-ra-detail-title {
                    display:none!important;
                }
            }
        `;
    document.head.appendChild(style);
  }
  function buildToolbarButton() {
    if (document.getElementById('qol-report-archive-toggle')) {
      return;
    }
    toolbarButton = document.createElement('div');
    toolbarButton.id = 'qol-report-archive-toggle';
    toolbarButton.setAttribute('role', 'button');
    toolbarButton.setAttribute('tabindex', '0');
    toolbarButton.setAttribute('aria-label', 'Open Report Archive');
    toolbarButton.title = 'Report Archive';
    toolbarButton.innerHTML = toolbarIcon();
    bindControl(toolbarButton, toggleArchivePanel);
    document.body.appendChild(toolbarButton);
  }
  function buildArchivePanel() {
    if (document.getElementById('qol-report-archive-panel')) {
      return;
    }
    archivePanel = document.createElement('div');
    archivePanel.id = 'qol-report-archive-panel';
    archivePanel.innerHTML = `
            <div class="qol-ra-header">
                <div class="qol-ra-header-title">
                    ${toolbarIcon()}
                    <span>Report Archive</span>
                </div>

                <div
                    class="qol-ra-close"
                    role="button"
                    tabindex="0"
                    title="Close Report Archive"
                >&times;</div>
            </div>

            <div class="qol-ra-layout">
                <aside class="qol-ra-sidebar">
                    <div class="qol-ra-sidebar-heading">
                        <span class="qol-ra-sidebar-title">
                            Folders
                        </span>

                        <div
                            class="
                                qol-ra-small-control
                                qol-ra-add-folder
                            "
                            role="button"
                            tabindex="0"
                            title="Create folder"
                        >+</div>
                    </div>

                    <div class="qol-ra-folder-list"></div>
                </aside>

                <main class="qol-ra-main">
                    <div class="qol-ra-main-heading">
                        <div>
                            <div class="qol-ra-main-title"></div>
                            <div class="qol-ra-main-subtitle"></div>
                        </div>
                    </div>

                    <div class="qol-ra-search">
                        <label
                            class="qol-ra-search-label"
                            for="qol-ra-search-mode"
                        >
                            Search by
                        </label>

                        <select
                            id="qol-ra-search-mode"
                            class="qol-ra-search-mode"
                            aria-label="Search reports by"
                        >
                            <option value="name">
                                Name
                            </option>

                            <option value="date">
                                Date
                            </option>
                        </select>

                        <input
                            class="qol-ra-search-input"
                            type="text"
                            placeholder="Type a name..."
                            autocomplete="off"
                            aria-label="Search reports by name"
                        >

                        <div
                            class="
                                qol-ra-control
                                qol-ra-secondary
                                qol-ra-search-clear
                                qol-ra-disabled
                            "
                            role="button"
                            tabindex="0"
                            aria-disabled="true"
                        >
                            Clear
                        </div>
                    </div>

                    <div class="qol-ra-report-list"></div>
                </main>
            </div>

            <div class="qol-ra-detail">
                <div class="qol-ra-detail-bar">
                    <div
                        class="
                            qol-ra-control
                            qol-ra-secondary
                            qol-ra-detail-back
                        "
                        role="button"
                        tabindex="0"
                    >
                        Back
                    </div>

                    <div class="qol-ra-detail-title"></div>

                    <div class="qol-ra-detail-nav">
                        <div
                            class="
                                qol-ra-control
                                qol-ra-secondary
                                qol-ra-detail-prev
                            "
                            role="button"
                            tabindex="0"
                        >
                            ‹ Previous
                        </div>

                        <div
                            class="
                                qol-ra-control
                                qol-ra-secondary
                                qol-ra-detail-next
                            "
                            role="button"
                            tabindex="0"
                        >
                            Next ›
                        </div>
                    </div>
                </div>

                <div class="qol-ra-snapshot-host">
                    <div class="qol-ra-snapshot-card"></div>
                </div>
            </div>
        `;
    document.body.appendChild(archivePanel);
    makeDraggable(archivePanel, archivePanel.querySelector('.qol-ra-header'));
    bindControl(archivePanel.querySelector('.qol-ra-close'), closeArchivePanel);
    bindControl(archivePanel.querySelector('.qol-ra-add-folder'), () => openFolderPrompt());
    bindControl(archivePanel.querySelector('.qol-ra-detail-back'), closeReportDetail);
    bindControl(archivePanel.querySelector('.qol-ra-detail-prev'), () => openAdjacentReport(-1));
    bindControl(archivePanel.querySelector('.qol-ra-detail-next'), () => openAdjacentReport(1));
    const searchModeControl = archivePanel.querySelector('.qol-ra-search-mode');
    const searchInput = archivePanel.querySelector('.qol-ra-search-input');
    const searchClear = archivePanel.querySelector('.qol-ra-search-clear');
    searchModeControl.value = searchMode;
    updateSearchControl();
    searchModeControl.addEventListener('change', event => {
      searchMode = event.target.value === 'date' ? 'date' : 'name';
      searchQuery = '';
      updateSearchControl();
      closeReportDetail();
      renderReports();
      searchInput.focus();
    });
    searchInput.addEventListener('input', event => {
      searchQuery = searchMode === 'date' ? event.target.value : normalizeText(event.target.value);
      updateSearchClearControl();
      closeReportDetail();
      renderReports();
    });
    bindControl(searchClear, () => {
      if (!searchQuery) return;
      searchQuery = '';
      searchInput.value = '';
      updateSearchClearControl();
      closeReportDetail();
      renderReports();
      searchInput.focus();
    });
    renderArchive();
  }
  function updateSearchControl() {
    if (!archivePanel) return;
    const input = archivePanel.querySelector('.qol-ra-search-input');
    if (!input) return;
    input.type = searchMode === 'date' ? 'date' : 'text';
    input.value = searchQuery;
    input.placeholder = searchMode === 'date' ? '' : 'Type a name...';
    input.setAttribute('aria-label', searchMode === 'date' ? 'Search reports by date' : 'Search reports by name');
    updateSearchClearControl();
  }
  function updateSearchClearControl() {
    if (!archivePanel) return;
    const control = archivePanel.querySelector('.qol-ra-search-clear');
    if (!control) return;
    const disabled = !searchQuery;
    control.classList.toggle('qol-ra-disabled', disabled);
    control.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  }
  function makeDraggable(element, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    handle.addEventListener('pointerdown', event => {
      if (event.target.closest('.qol-ra-close')) {
        return;
      }
      const rect = element.getBoundingClientRect();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      element.style.setProperty('left', `${rect.left}px`, 'important');
      element.style.setProperty('top', `${rect.top}px`, 'important');
      element.style.setProperty('transform', 'none', 'important');
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - element.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - element.offsetHeight);
      const nextLeft = Math.min(maxLeft, Math.max(0, startLeft + event.clientX - startX));
      const nextTop = Math.min(maxTop, Math.max(0, startTop + event.clientY - startY));
      element.style.setProperty('left', `${nextLeft}px`, 'important');
      element.style.setProperty('top', `${nextTop}px`, 'important');
    });
    const stopDragging = event => {
      if (!dragging) return;
      dragging = false;
      if (handle.hasPointerCapture(event.pointerId)) {
        handle.releasePointerCapture(event.pointerId);
      }
    };
    handle.addEventListener('pointerup', stopDragging);
    handle.addEventListener('pointercancel', stopDragging);
  }
  function toggleArchivePanel() {
    if (!archivePanel) return;
    if (window.getComputedStyle(archivePanel).display !== 'none') {
      closeArchivePanel();
    } else {
      openArchivePanel();
    }
  }
  function openArchivePanel() {
    if (!archivePanel) return;
    window.dispatchEvent(new CustomEvent('qol_close_others', {
      detail: {
        source: 'reportArchive'
      }
    }));
    closeReportDetail();
    renderArchive();
    archivePanel.style.setProperty('display', 'flex', 'important');
  }
  function closeArchivePanel() {
    if (archivePanel) {
      archivePanel.style.setProperty('display', 'none', 'important');
    }
    closeReportDetail();
  }
  function getFolderName(folderId) {
    if (folderId === ALL_FOLDER_ID) {
      return 'All Reports';
    }
    if (folderId === DEFAULT_FOLDER_ID || !folderId) {
      return 'Default';
    }
    return archive.folders.find(folder => {
      return folder.id === folderId;
    })?.name || 'Default';
  }
  function reportBelongsToFolder(report, folderId) {
    if (folderId === ALL_FOLDER_ID) {
      return true;
    }
    if (folderId === DEFAULT_FOLDER_ID) {
      return !report.folderId || !archive.folders.some(folder => {
        return folder.id === report.folderId;
      });
    }
    return report.folderId === folderId;
  }
  function countFolderReports(folderId) {
    return archive.reports.filter(report => {
      return reportBelongsToFolder(report, folderId);
    }).length;
  }
  function getVisibleReports() {
    return archive.reports.filter(report => {
      return reportBelongsToFolder(report, activeFolderId);
    });
  }
  function formatSearchDate(report) {
    const date = getReportDate(report);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-` + `${month}-` + `${day}`;
  }
  function reportMatchesSearch(report) {
    if (!searchQuery) {
      return true;
    }
    if (searchMode === 'date') {
      return formatSearchDate(report) === searchQuery;
    }
    const needle = searchQuery.toLocaleLowerCase();
    const searchableText = [report.title, report.headline, report.sourcePlayer, report.sourceVillage, report.destPlayer, report.destVillage].map(value => {
      return normalizeText(value).toLocaleLowerCase();
    }).join(' ');
    return searchableText.includes(needle);
  }
  function getSortedVisibleReports() {
    return getVisibleReports().filter(reportMatchesSearch).sort((a, b) => {
      return (b.savedAt || 0) - (a.savedAt || 0);
    });
  }
  function renderArchive() {
    if (!archivePanel) return;
    renderFolders();
    renderReports();
  }
  function renderFolders() {
    const list = archivePanel.querySelector('.qol-ra-folder-list');
    if (!list) return;
    const rows = [{
      id: ALL_FOLDER_ID,
      name: 'All Reports',
      icon: '▣'
    }, {
      id: DEFAULT_FOLDER_ID,
      name: 'Default',
      icon: '□'
    }, ...archive.folders.map(folder => ({
      ...folder,
      icon: '▰',
      custom: true
    }))];
    list.innerHTML = rows.map(row => {
      return `
                    <div
                        class="
                            qol-ra-folder-row
                            ${row.id === activeFolderId ? 'qol-ra-active' : ''}
                        "
                        data-folder-id="${escapeHtml(row.id)}"
                        data-custom-folder="${row.custom ? 'true' : 'false'}"
                        ${row.custom ? 'draggable="true" ' + 'title="Drag to reorder"' : ''}
                    >
                        <span class="qol-ra-folder-icon">
                            ${row.icon}
                        </span>

                        <span
                            class="qol-ra-folder-name"
                            title="${escapeHtml(row.name)}"
                        >
                            ${escapeHtml(row.name)}
                        </span>

                        ${row.custom ? `
                                    <span class="qol-ra-folder-tools">
                                        <span
                                            class="qol-ra-folder-tool"
                                            data-folder-action="rename"
                                            title="Rename folder"
                                        >✎</span>

                                        <span
                                            class="qol-ra-folder-tool"
                                            data-folder-action="delete"
                                            title="Delete folder"
                                        >×</span>
                                    </span>
                                ` : ''}

                        <span class="qol-ra-folder-count">
                            ${countFolderReports(row.id)}
                        </span>
                    </div>
                `;
    }).join('');
    list.querySelectorAll('.qol-ra-folder-row').forEach(row => {
      row.addEventListener('click', event => {
        if (suppressFolderClick) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const action = event.target.closest('[data-folder-action]');
        const folderId = row.dataset.folderId;
        if (action) {
          event.stopPropagation();
          if (action.dataset.folderAction === 'rename') {
            openFolderPrompt(folderId);
          }
          if (action.dataset.folderAction === 'delete') {
            requestFolderDeletion(folderId);
          }
          return;
        }
        activeFolderId = folderId;
        closeReportDetail();
        renderArchive();
      });
      if (row.dataset.customFolder !== 'true') {
        return;
      }
      row.addEventListener('dragstart', event => {
        if (event.target.closest('[data-folder-action]')) {
          event.preventDefault();
          return;
        }
        draggedFolderId = row.dataset.folderId;
        suppressFolderClick = true;
        row.classList.add('qol-ra-dragging');
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', draggedFolderId);
        }
      });
      row.addEventListener('dragover', event => {
        if (!draggedFolderId || draggedFolderId === row.dataset.folderId) {
          return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = 'move';
        }
        clearFolderDropMarkers(list);
        const rect = row.getBoundingClientRect();
        row.classList.add(event.clientY >= rect.top + rect.height / 2 ? 'qol-ra-drop-after' : 'qol-ra-drop-before');
      });
      row.addEventListener('drop', async event => {
        if (!draggedFolderId || draggedFolderId === row.dataset.folderId) {
          return;
        }
        event.preventDefault();
        const rect = row.getBoundingClientRect();
        const sourceFolderId = draggedFolderId;
        draggedFolderId = null;
        clearFolderDropMarkers(list);
        await reorderFolder(sourceFolderId, row.dataset.folderId, event.clientY >= rect.top + rect.height / 2);
      });
      row.addEventListener('dragend', () => {
        draggedFolderId = null;
        row.classList.remove('qol-ra-dragging');
        clearFolderDropMarkers(list);
        setTimeout(() => {
          suppressFolderClick = false;
        }, 0);
      });
    });
  }
  function clearFolderDropMarkers(list) {
    list.querySelectorAll('.qol-ra-drop-before,' + '.qol-ra-drop-after').forEach(row => {
      row.classList.remove('qol-ra-drop-before', 'qol-ra-drop-after');
    });
  }
  async function reorderFolder(sourceFolderId, targetFolderId, insertAfter) {
    const previousOrder = [...archive.folders];
    const sourceIndex = archive.folders.findIndex(folder => {
      return folder.id === sourceFolderId;
    });
    if (sourceIndex < 0) {
      return;
    }
    const [movedFolder] = archive.folders.splice(sourceIndex, 1);
    const targetIndex = archive.folders.findIndex(folder => {
      return folder.id === targetFolderId;
    });
    if (targetIndex < 0) {
      archive.folders = previousOrder;
      return;
    }
    archive.folders.splice(targetIndex + (insertAfter ? 1 : 0), 0, movedFolder);
    try {
      await saveArchive();
      renderArchive();
    } catch (error) {
      archive.folders = previousOrder;
      renderArchive();
      showToast(`Folder order could not be saved: ${error.message}`, 'error');
    }
  }
  function renderReports() {
    const title = archivePanel.querySelector('.qol-ra-main-title');
    const subtitle = archivePanel.querySelector('.qol-ra-main-subtitle');
    const list = archivePanel.querySelector('.qol-ra-report-list');
    const folderReports = getVisibleReports();
    const reports = getSortedVisibleReports();
    title.textContent = getFolderName(activeFolderId);
    subtitle.textContent = searchQuery ? `${reports.length} of ` + `${folderReports.length} ` + 'archived reports' : `${reports.length} ` + `archived report${reports.length === 1 ? '' : 's'}`;
    if (!reports.length) {
      list.innerHTML = `
                <div class="qol-ra-empty">
                    <div>
                        <strong>
                            ${searchQuery ? 'No matching reports found.' : 'No reports saved here yet.'}
                        </strong>
                    </div>

                    <div>
                        ${searchQuery ? `Try another ${searchMode === 'date' ? 'date' : 'name'} or clear the search.` : 'Open a Travian report and use ' + 'the APES folder button beside ' + 'its report controls.'}
                    </div>
                </div>
            `;
      return;
    }
    list.innerHTML = reports.map(report => {
      const titleText = report.title || report.headline || 'Report';
      return `
                    <div
                        class="qol-ra-report-row"
                        data-report-id="${escapeHtml(report.id)}"
                    >
                        <div class="qol-ra-report-copy">
                            <div
                                class="qol-ra-report-title"
                                title="${escapeHtml(titleText)}"
                            >
                                ${escapeHtml(titleText)}
                            </div>

                            <div class="qol-ra-report-meta">
                                ${escapeHtml(formatReportDate(report))}
                                ·
                                ${escapeHtml(getFolderName(report.folderId))}
                                ·
                                Saved
                                ${escapeHtml(formatSavedDate(report.savedAt))}
                            </div>
                        </div>

                        <div class="qol-ra-report-actions">
                            <div
                                class="qol-ra-row-action"
                                role="button"
                                tabindex="0"
                                data-report-action="view"
                            >
                                View
                            </div>

                            <div
                                class="qol-ra-row-action"
                                role="button"
                                tabindex="0"
                                data-report-action="move"
                            >
                                Move
                            </div>

                            <div
                                class="
                                    qol-ra-row-action
                                    qol-ra-danger
                                "
                                role="button"
                                tabindex="0"
                                data-report-action="delete"
                            >
                                Delete
                            </div>
                        </div>
                    </div>
                `;
    }).join('');
    list.querySelectorAll('[data-report-action]').forEach(control => {
      bindControl(control, event => {
        event.stopPropagation();
        const reportId = control.closest('[data-report-id]')?.dataset.reportId;
        const report = archive.reports.find(item => {
          return item.id === reportId;
        });
        if (!report) return;
        const action = control.dataset.reportAction;
        if (action === 'view') {
          openReportDetail(report);
        }
        if (action === 'move') {
          openFolderChooser(null, report);
        }
        if (action === 'delete') {
          requestReportDeletion(report);
        }
      });
    });
  }
  function getReportDate(report) {
    const timestamp = Number(report.reportTime);
    const date = timestamp ? new Date(timestamp * 1000) : new Date(report.savedAt);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatReportDate(report) {
    const date = getReportDate(report);
    if (!date) {
      return 'Unknown report date';
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
  function formatReportDateParts(report) {
    const date = getReportDate(report);
    if (!date) {
      return {
        date: 'Unknown',
        time: 'Unknown'
      };
    }
    return {
      date: new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date),
      time: new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date)
    };
  }
  function formatSavedDate(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
      return 'unknown';
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }
  function formatReportType(value) {
    const text = normalizeText(value || 'Report').replace(/^report/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
    if (!text) {
      return 'Battle report';
    }
    return text.replace(/\b\w/g, letter => {
      return letter.toUpperCase();
    });
  }
  function sanitizeStoredHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    sanitizeSnapshot(template.content);
    template.content.querySelectorAll('.reportHeader,' + '.reportCaption,' + '.reportDate,' + '.controlPanel,' + '.inWindowPopupHeader').forEach(element => {
      element.remove();
    });
    return template.innerHTML;
  }
  function extractCompactBodyHtml(root) {
    if (!root) return '';
    const reportBody = root.matches?.('.reportBody') ? root : root.querySelector?.('.reportBody');
    if (reportBody) {
      return sanitizeStoredHtml(reportBody.outerHTML);
    }
    const usefulSelectors = ['.troopDetails', '.troops', '.troopList', '.reportTroops', '.resources', '.reportResources', '.additionalInformation', '.reportInformation'];
    const usefulNodes = usefulSelectors.flatMap(selector => [...(root.querySelectorAll?.(selector) || [])]);
    const uniqueNodes = usefulNodes.filter((node, index, nodes) => {
      return !nodes.some((other, otherIndex) => {
        return otherIndex < index && other.contains(node);
      });
    });
    if (!uniqueNodes.length) {
      return '';
    }
    return sanitizeStoredHtml(uniqueNodes.map(node => {
      return node.outerHTML;
    }).join(''));
  }
  function getCompactBodyHtml(report) {
    if (report.bodyHtml) {
      return sanitizeStoredHtml(report.bodyHtml);
    }
    if (!report.snapshotHtml) {
      return '';
    }
    const template = document.createElement('template');
    template.innerHTML = report.snapshotHtml;
    const bodyHtml = extractCompactBodyHtml(template.content);
    if (bodyHtml) {
      report.bodyHtml = bodyHtml;
      report.updatedAt = Date.now();
      saveArchive().catch(error => {
        console.warn('[APES Report Archive] ' + 'Could not cache compact report body:', error);
      });
    }
    return bodyHtml;
  }
  function buildCompactReportHtml(report) {
    const dateParts = formatReportDateParts(report);
    const bodyHtml = getCompactBodyHtml(report);
    const headline = report.headline || 'Report';
    const result = report.resultText || headline;
    const sourcePlayer = report.sourcePlayer || 'Unknown attacker';
    const destPlayer = report.destPlayer || 'Unknown defender';
    return `
            <article class="qol-ra-compact-report">
                <header class="qol-ra-compact-top">
                    <div>
                        <div class="qol-ra-compact-kicker">
                            ${escapeHtml(formatReportType(report.reportType))}
                        </div>

                        <h2 class="qol-ra-compact-headline">
                            ${escapeHtml(headline)}
                        </h2>
                    </div>

                    <div class="qol-ra-date-block">
                        <div class="qol-ra-date-piece">
                            <span class="qol-ra-date-label">
                                Date
                            </span>

                            <span class="qol-ra-date-value">
                                ${escapeHtml(dateParts.date)}
                            </span>
                        </div>

                        <div class="qol-ra-date-piece">
                            <span class="qol-ra-date-label">
                                Time
                            </span>

                            <span class="qol-ra-date-value">
                                ${escapeHtml(dateParts.time)}
                            </span>
                        </div>
                    </div>
                </header>

                <section class="qol-ra-parties">
                    <div class="qol-ra-party">
                        <span class="qol-ra-party-role">
                            Attacker
                        </span>

                        <div
                            class="qol-ra-party-player"
                            title="${escapeHtml(sourcePlayer)}"
                        >
                            ${escapeHtml(sourcePlayer)}
                        </div>

                        <div
                            class="qol-ra-party-village"
                            title="${escapeHtml(report.sourceVillage || '')}"
                        >
                            ${escapeHtml(report.sourceVillage || 'Unknown village')}
                        </div>
                    </div>

                    <div
                        class="qol-ra-direction"
                        aria-hidden="true"
                    >→</div>

                    <div class="qol-ra-party">
                        <span class="qol-ra-party-role">
                            Defender
                        </span>

                        <div
                            class="qol-ra-party-player"
                            title="${escapeHtml(destPlayer)}"
                        >
                            ${escapeHtml(destPlayer)}
                        </div>

                        <div
                            class="qol-ra-party-village"
                            title="${escapeHtml(report.destVillage || '')}"
                        >
                            ${escapeHtml(report.destVillage || 'Unknown village')}
                        </div>
                    </div>
                </section>

                <section class="qol-ra-body-section">
                    <div class="qol-ra-body-heading">
                        <span class="qol-ra-body-title">
                            Troops and results
                        </span>

                        <span
                            class="qol-ra-outcome"
                            title="${escapeHtml(result)}"
                        >
                            ${escapeHtml(result)}
                        </span>
                    </div>

                    <div class="qol-ra-compact-body">
                        ${bodyHtml || `
                                <div class="qol-ra-compact-empty">
                                    This older archived report does
                                    not contain a reusable troop-and-loss
                                    body.
                                </div>
                            `}
                    </div>
                </section>

                <footer class="qol-ra-compact-footer">
                    <span>
                        Folder:
                        ${escapeHtml(getFolderName(report.folderId))}
                    </span>

                    <span>
                        Archived
                        ${escapeHtml(formatSavedDate(report.savedAt))}
                    </span>
                </footer>
            </article>
        `;
  }
  function openReportDetail(report) {
    if (!archivePanel || !report) {
      return;
    }
    activeReportId = report.id;
    const detail = archivePanel.querySelector('.qol-ra-detail');
    detail.querySelector('.qol-ra-detail-title').textContent = report.title || report.headline || 'Report';
    detail.querySelector('.qol-ra-snapshot-card').innerHTML = buildCompactReportHtml(report);
    updateDetailNavigation();
    detail.style.setProperty('display', 'flex', 'important');
    detail.querySelector('.qol-ra-snapshot-host').scrollTop = 0;
  }
  function updateDetailNavigation() {
    if (!archivePanel) return;
    const reports = getSortedVisibleReports();
    const index = reports.findIndex(report => {
      return report.id === activeReportId;
    });
    const previous = archivePanel.querySelector('.qol-ra-detail-prev');
    const next = archivePanel.querySelector('.qol-ra-detail-next');
    const previousDisabled = index <= 0;
    const nextDisabled = index < 0 || index >= reports.length - 1;
    previous.classList.toggle('qol-ra-disabled', previousDisabled);
    next.classList.toggle('qol-ra-disabled', nextDisabled);
    previous.setAttribute('aria-disabled', previousDisabled ? 'true' : 'false');
    next.setAttribute('aria-disabled', nextDisabled ? 'true' : 'false');
  }
  function openAdjacentReport(direction) {
    const reports = getSortedVisibleReports();
    const index = reports.findIndex(report => {
      return report.id === activeReportId;
    });
    const target = reports[index + direction];
    if (target) {
      openReportDetail(target);
    }
  }
  function closeReportDetail() {
    if (!archivePanel) return;
    const detail = archivePanel.querySelector('.qol-ra-detail');
    if (!detail) return;
    activeReportId = null;
    detail.style.setProperty('display', 'none', 'important');
    detail.querySelector('.qol-ra-snapshot-card').replaceChildren();
  }
  function createDialog(title, bodyHtml) {
    closeDialogs();
    const layer = document.createElement('div');
    layer.className = 'qol-ra-dialog-layer';
    layer.innerHTML = `
            <div
                class="qol-ra-dialog"
                role="dialog"
                aria-modal="true"
            >
                <div class="qol-ra-dialog-header">
                    ${escapeHtml(title)}
                </div>

                <div class="qol-ra-dialog-body">
                    ${bodyHtml}
                </div>

                <div class="qol-ra-dialog-actions"></div>
            </div>
        `;
    layer.addEventListener('mousedown', event => {
      if (event.target === layer) {
        closeDialogs();
      }
    });
    document.body.appendChild(layer);
    return layer;
  }
  function addDialogControl(layer, label, className, callback) {
    const control = document.createElement('div');
    control.className = `qol-ra-control ${className || ''}`.trim();
    control.setAttribute('role', 'button');
    control.setAttribute('tabindex', '0');
    control.textContent = label;
    bindControl(control, callback);
    layer.querySelector('.qol-ra-dialog-actions').appendChild(control);
    return control;
  }
  function closeDialogs() {
    document.querySelectorAll('.qol-ra-dialog-layer').forEach(layer => {
      layer.remove();
    });
  }
  function openFolderPrompt(folderId = null, afterCreate = null) {
    const existing = folderId ? archive.folders.find(folder => {
      return folder.id === folderId;
    }) : null;
    const layer = createDialog(existing ? 'Rename Folder' : 'Create Folder', `
                    <label>
                        ${existing ? 'Folder name' : 'Name the new report folder'}

                        <input
                            class="qol-ra-input"
                            type="text"
                            maxlength="60"
                            value="${escapeHtml(existing?.name || '')}"
                            autocomplete="off"
                        >
                    </label>

                    <div class="qol-ra-dialog-error"></div>
                `);
    const input = layer.querySelector('.qol-ra-input');
    const errorBox = layer.querySelector('.qol-ra-dialog-error');
    const submit = async () => {
      const name = normalizeText(input.value);
      if (!name) {
        errorBox.textContent = 'Enter a folder name.';
        input.focus();
        return;
      }
      const duplicate = archive.folders.some(folder => {
        return folder.id !== folderId && folder.name.toLowerCase() === name.toLowerCase();
      });
      if (duplicate) {
        errorBox.textContent = 'A folder with this name already exists.';
        input.focus();
        return;
      }
      let savedFolder;
      if (existing) {
        existing.name = name;
        existing.updatedAt = Date.now();
        savedFolder = existing;
      } else {
        savedFolder = {
          id: makeId('folder'),
          name,
          createdAt: Date.now()
        };
        archive.folders.unshift(savedFolder);
        activeFolderId = savedFolder.id;
      }
      try {
        await saveArchive();
        closeDialogs();
        renderArchive();
        if (typeof afterCreate === 'function') {
          afterCreate(savedFolder);
        }
      } catch (error) {
        errorBox.textContent = `Could not save: ${error.message}`;
      }
    };
    addDialogControl(layer, 'Cancel', 'qol-ra-secondary', closeDialogs);
    addDialogControl(layer, existing ? 'Save' : 'Create', '', submit);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        submit();
      }
      if (event.key === 'Escape') {
        closeDialogs();
      }
    });
    setTimeout(() => input.focus(), 0);
  }
  function requestFolderDeletion(folderId) {
    const folder = archive.folders.find(item => {
      return item.id === folderId;
    });
    if (!folder) return;
    const count = countFolderReports(folderId);
    const message = count ? `Delete “${escapeHtml(folder.name)}”? ` + `Its ${count} report${count === 1 ? '' : 's'} will be moved to Default.` : `Delete “${escapeHtml(folder.name)}”?`;
    const layer = createDialog('Delete Folder', `<div>${message}</div>`);
    addDialogControl(layer, 'Cancel', 'qol-ra-secondary', closeDialogs);
    addDialogControl(layer, 'Delete', 'qol-ra-danger', async () => {
      archive.reports.forEach(report => {
        if (report.folderId === folderId) {
          report.folderId = null;
        }
      });
      archive.folders = archive.folders.filter(item => {
        return item.id !== folderId;
      });
      if (activeFolderId === folderId) {
        activeFolderId = DEFAULT_FOLDER_ID;
      }
      try {
        await saveArchive();
        closeDialogs();
        renderArchive();
        refreshOpenReportButton();
      } catch (error) {
        showToast(`Folder could not be deleted: ${error.message}`, 'error');
      }
    });
  }
  function requestReportDeletion(report) {
    const title = report.title || report.headline || 'Report';
    const layer = createDialog('Delete Archived Report', `
                    <div>
                        Delete
                        <strong>
                            ${escapeHtml(title)}
                        </strong>
                        from the archive?
                    </div>

                    <div
                        style="
                            margin-top:6px!important;
                            color:#8f342c!important;
                        "
                    >
                        This cannot be undone.
                    </div>
                `);
    addDialogControl(layer, 'Cancel', 'qol-ra-secondary', closeDialogs);
    addDialogControl(layer, 'Delete', 'qol-ra-danger', async () => {
      archive.reports = archive.reports.filter(item => {
        return item.id !== report.id;
      });
      try {
        await saveArchive();
        closeDialogs();
        closeReportDetail();
        renderArchive();
        refreshOpenReportButton();
        showToast('Archived report deleted.');
      } catch (error) {
        showToast(`Report could not be deleted: ${error.message}`, 'error');
      }
    });
  }
  function openFolderChooser(capturedReport, existingReport = null) {
    const report = existingReport || capturedReport;
    if (!report) return;
    const layer = createDialog(existingReport ? 'Move or Refresh Report' : 'Save Report', `
                    <div>
                        ${existingReport ? 'Choose the destination folder. ' + 'Selecting a folder also refreshes ' + 'the saved report.' : 'Choose where this report ' + 'should be archived.'}
                    </div>

                    <div class="qol-ra-choice-list"></div>
                `);
    const choiceList = layer.querySelector('.qol-ra-choice-list');
    const currentFolderId = existingReport ? existingReport.folderId || DEFAULT_FOLDER_ID : null;
    const choices = [{
      id: DEFAULT_FOLDER_ID,
      name: 'Default'
    }, ...archive.folders.map(folder => ({
      id: folder.id,
      name: folder.name
    }))];
    choiceList.innerHTML = choices.map(folder => {
      return `
                    <div
                        class="
                            qol-ra-choice
                            ${folder.id === currentFolderId ? 'qol-ra-selected' : ''}
                        "
                        data-choice-id="${escapeHtml(folder.id)}"
                    >
                        <span>
                            ▰&nbsp;
                            ${escapeHtml(folder.name)}
                        </span>

                        <span>
                            ${countFolderReports(folder.id)}
                        </span>
                    </div>
                `;
    }).join('');
    choiceList.querySelectorAll('.qol-ra-choice').forEach(choice => {
      choice.setAttribute('role', 'button');
      choice.setAttribute('tabindex', '0');
      bindControl(choice, () => {
        saveReportToFolder(capturedReport, existingReport, choice.dataset.choiceId);
      });
    });
    addDialogControl(layer, 'New Folder', 'qol-ra-secondary', () => {
      openFolderPrompt(null, folder => {
        saveReportToFolder(capturedReport, existingReport, folder.id);
      });
    });
    addDialogControl(layer, 'Cancel', 'qol-ra-secondary', closeDialogs);
  }
  async function saveReportToFolder(capturedReport, existingReport, selectedFolderId) {
    const folderId = selectedFolderId === DEFAULT_FOLDER_ID ? null : selectedFolderId;
    if (existingReport) {
      existingReport.folderId = folderId;
      existingReport.updatedAt = Date.now();
      if (capturedReport) {
        refreshStoredReport(existingReport, capturedReport);
      }
    } else {
      const duplicate = findStoredReport(capturedReport);
      if (duplicate) {
        duplicate.folderId = folderId;
        duplicate.updatedAt = Date.now();
        refreshStoredReport(duplicate, capturedReport);
      } else {
        capturedReport.folderId = folderId;
        archive.reports.push(capturedReport);
      }
    }
    try {
      await saveArchive();
      closeDialogs();
      renderArchive();
      refreshOpenReportButton(true);
      showToast(existingReport ? `Report saved in ` + `${getFolderName(folderId)}.` : `Report archived in ` + `${getFolderName(folderId)}.`);
    } catch (error) {
      showToast(`Report could not be saved: ${error.message}`, 'error');
    }
  }
  function refreshStoredReport(stored, captured) {
    if (!stored || !captured) {
      return;
    }
    const fields = ['sourceReportId', 'fingerprint', 'title', 'headline', 'reportType', 'reportTime', 'sourcePlayer', 'sourceVillage', 'destPlayer', 'destVillage', 'resultText', 'world', 'bodyHtml', 'snapshotHtml'];
    fields.forEach(key => {
      if (captured[key] !== undefined && captured[key] !== null) {
        stored[key] = captured[key];
      }
    });
  }
  function showToast(message, type = 'success') {
    document.querySelectorAll('.qol-ra-toast').forEach(toast => {
      toast.remove();
    });
    const toast = document.createElement('div');
    toast.className = `qol-ra-toast ${type === 'error' ? 'qol-ra-toast-error' : ''}`.trim();
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }
  function getReportRoots() {
    return [...document.querySelectorAll('#reportSingle .singleReport,' + '#reportSingle.reportWithoutOverlay,' + '#reportSingle .reportWithoutOverlay,' + '.reportWindow .singleReport')].filter((reportRoot, index, roots) => {
      return roots.indexOf(reportRoot) === index && Boolean(reportRoot.querySelector('.reportHeader .controlPanel'));
    });
  }
  function isVisibleReportRoot(reportRoot) {
    if (!reportRoot.isConnected) {
      return false;
    }
    const rect = reportRoot.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(reportRoot).visibility !== 'hidden';
  }
  function getOpenReportRoot() {
    const roots = getReportRoots();
    const visibleRoots = roots.filter(isVisibleReportRoot);
    return visibleRoots[visibleRoots.length - 1] || roots[roots.length - 1] || null;
  }
  function getClosestReportRoot(element) {
    return element?.closest('.singleReport,' + '#reportSingle.reportWithoutOverlay,' + '.reportWithoutOverlay') || null;
  }
  function clearTrackedReportIds() {
    getReportRoots().forEach(reportRoot => {
      delete reportRoot.dataset.qolArchiveReportId;
    });
  }
  function trackReportOpening(event) {
    const reportLink = event.target.closest('[clickable*="reportSingle"]');
    if (reportLink) {
      const clickable = reportLink.getAttribute('clickable') || '';
      const match = clickable.match(/reportId['"]?\s*:\s*['"]([^'"]+)/i);
      pendingReportId = match ? match[1] : null;
      clearTrackedReportIds();
      return;
    }
    const reportNavigation = event.target.closest('#reportSingle ' + '[clickable*="changeReport"]');
    if (reportNavigation) {
      pendingReportId = null;
      const root = getClosestReportRoot(reportNavigation);
      if (root) {
        delete root.dataset.qolArchiveReportId;
      }
    }
  }
  function scheduleReportScan() {
    if (scanScheduled || !featureStarted) {
      return;
    }
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      ensureReportSaveButton();
    });
  }
  function ensureReportSaveButton() {
    if (!isEnabled()) return;
    const reportRoot = getOpenReportRoot();
    if (!reportRoot) return;
    if (pendingReportId && !reportRoot.dataset.qolArchiveReportId) {
      reportRoot.dataset.qolArchiveReportId = pendingReportId;
    }
    const controlPanel = reportRoot.querySelector('.reportHeader .controlPanel');
    if (!controlPanel) return;
    if (window.getComputedStyle(controlPanel).position === 'static') {
      controlPanel.style.setProperty('position', 'relative', 'important');
    }
    let control = controlPanel.querySelector('.qol-ra-report-save');
    if (!control) {
      control = document.createElement('div');
      control.className = 'qol-ra-report-save';
      control.setAttribute('role', 'button');
      control.setAttribute('tabindex', '0');
      bindControl(control, event => {
        event.preventDefault();
        event.stopPropagation();
        handleOpenReportSave(getClosestReportRoot(control) || reportRoot);
      });
    }
    if (control.parentElement !== controlPanel) {
      controlPanel.appendChild(control);
    }
    updateReportSaveControl(control, reportRoot);
    positionReportSaveControl(control, controlPanel);
  }
  function positionReportSaveControl(control, controlPanel) {
    requestAnimationFrame(() => {
      if (!control.isConnected || !controlPanel.isConnected) {
        return;
      }
      const panelRect = controlPanel.getBoundingClientRect();
      if (panelRect.width <= 0 || panelRect.height <= 0) {
        return;
      }
      const possibleControls = [...controlPanel.querySelectorAll('.iconButton,' + '[clickable],' + '[role="button"]')].filter(candidate => {
        if (candidate === control || control.contains(candidate) || candidate.contains(control) || candidate.classList.contains('favorite')) {
          return false;
        }
        const rect = candidate.getBoundingClientRect();
        return rect.width >= 16 && rect.width <= 42 && rect.height >= 16 && rect.height <= 32 && rect.left >= panelRect.left + panelRect.width * 0.55 && rect.right <= panelRect.right + 1;
      });
      const anchorLeft = possibleControls.length ? Math.min(...possibleControls.map(candidate => {
        return candidate.getBoundingClientRect().left;
      })) : panelRect.right - 48;
      const left = Math.max(0, Math.min(panelRect.width - 22, anchorLeft - panelRect.left - 26));
      const top = Math.max(0, Math.round((panelRect.height - 22) / 2));
      control.style.setProperty('left', `${Math.round(left)}px`, 'important');
      control.style.setProperty('right', 'auto', 'important');
      control.style.setProperty('top', `${top}px`, 'important');
    });
  }
  function refreshOpenReportButton(pulse = false) {
    const root = getOpenReportRoot();
    const control = root?.querySelector('.qol-ra-report-save');
    if (!root || !control) {
      return;
    }
    updateReportSaveControl(control, root);
    if (pulse && control.classList.contains('qol-ra-archived')) {
      control.classList.remove('qol-ra-just-saved');
      void control.offsetWidth;
      control.classList.add('qol-ra-just-saved');
      setTimeout(() => {
        control.classList.remove('qol-ra-just-saved');
      }, 750);
    }
  }
  function updateReportSaveControl(control, reportRoot) {
    const existing = findStoredReport(getReportIdentity(reportRoot));
    const archivedState = existing ? 'true' : 'false';
    control.classList.toggle('qol-ra-archived', Boolean(existing));
    control.title = existing ? `Archived in ` + `${getFolderName(existing.folderId)} ` + '— click to move or refresh' : 'Save report to APES ' + 'Report Archive';
    control.setAttribute('aria-label', control.title);
    if (control.dataset.archived !== archivedState) {
      control.dataset.archived = archivedState;
      control.innerHTML = reportSaveIcon(Boolean(existing));
    }
  }
  function handleOpenReportSave(reportRoot) {
    try {
      const captured = captureReport(reportRoot);
      const existing = findStoredReport(captured);
      openFolderChooser(captured, existing || null);
    } catch (error) {
      console.error('[APES Report Archive] Capture failed:', error);
      showToast(`This report could not be captured: ${error.message}`, 'error');
    }
  }
  function getReportIdentity(reportRoot) {
    const reportTimeNode = reportRoot.querySelector('.reportDate [i18ndt]');
    const reportTime = Number.parseInt(reportTimeNode?.getAttribute('i18ndt'), 10) || null;
    const sourcePlayer = normalizeText(reportRoot.querySelector('.playerBox.actionFrom ' + '.playerLink')?.textContent) || 'Unknown attacker';
    const sourceVillage = normalizeText(reportRoot.querySelector('.playerBox.actionFrom ' + '.villageLink')?.textContent) || '';
    const destPlayer = normalizeText(reportRoot.querySelector('.playerBox.actionTo ' + '.playerLink')?.textContent) || 'Unknown defender';
    const destVillage = normalizeText(reportRoot.querySelector('.playerBox.actionTo ' + '.villageLink')?.textContent) || '';
    const headline = normalizeText(reportRoot.querySelector('.reportCaption ' + '[ng-bind="reportHeadline"]')?.textContent) || normalizeText(reportRoot.querySelector('.reportCaption .content')?.textContent) || normalizeText(reportRoot.querySelector('.reportCaption')?.textContent) || 'Report';
    const reportBody = reportRoot.querySelector('.reportBody');
    const reportType = reportBody ? [...reportBody.classList].find(className => {
      return className !== 'reportBody';
    }) || 'report' : 'report';
    const resultText = getReportResultText(reportRoot, headline);
    const sourceReportId = reportRoot.dataset.qolArchiveReportId || null;
    const fingerprintSource = [reportTime || '', sourcePlayer, sourceVillage, destPlayer, destVillage, headline, normalizeText(reportBody?.textContent || '').slice(0, 4000)].join('|');
    return {
      sourceReportId,
      fingerprint: hashText(fingerprintSource),
      reportTime,
      sourcePlayer,
      sourceVillage,
      destPlayer,
      destVillage,
      headline,
      reportType,
      resultText
    };
  }
  function getReportResultText(reportRoot, fallback) {
    const selectors = ['.reportResult', '.resultText', '.reportOutcome', '[class*="reportResult"]', '[class*="outcome"]'];
    for (const selector of selectors) {
      const text = normalizeText(reportRoot.querySelector(selector)?.textContent);
      if (text && text.length <= 160) {
        return text;
      }
    }
    return fallback || 'Archived report';
  }
  function captureReport(reportRoot) {
    const identity = getReportIdentity(reportRoot);
    const clonedRoot = cloneReportWithCanvases(reportRoot);
    sanitizeSnapshot(clonedRoot);
    const direction = `${identity.sourcePlayer}${identity.sourceVillage ? ` (${identity.sourceVillage})` : ''} → ${identity.destPlayer}${identity.destVillage ? ` (${identity.destVillage})` : ''}`;
    return {
      id: makeId('report'),
      ...identity,
      title: `${identity.headline} — ${direction}`,
      world: window.location.hostname,
      savedAt: Date.now(),
      updatedAt: Date.now(),
      folderId: null,
      bodyHtml: extractCompactBodyHtml(clonedRoot),
      snapshotHtml: clonedRoot.outerHTML
    };
  }
  function cloneReportWithCanvases(reportRoot) {
    const clone = reportRoot.cloneNode(true);
    const originalCanvases = [...reportRoot.querySelectorAll('canvas')];
    const clonedCanvases = [...clone.querySelectorAll('canvas')];
    clonedCanvases.forEach((clonedCanvas, index) => {
      const originalCanvas = originalCanvases[index];
      if (!originalCanvas) {
        clonedCanvas.remove();
        return;
      }
      try {
        const image = document.createElement('img');
        image.src = originalCanvas.toDataURL('image/png');
        image.width = originalCanvas.width;
        image.height = originalCanvas.height;
        image.className = originalCanvas.className;
        image.alt = '';
        image.style.cssText = originalCanvas.style.cssText;
        clonedCanvas.replaceWith(image);
      } catch (error) {
        clonedCanvas.remove();
      }
    });
    return clone;
  }
  function sanitizeSnapshot(root) {
    if (!root?.querySelectorAll) {
      return;
    }
    root.querySelectorAll(`
            .inWindowPopupHeader,
            .controlPanel,
            .qol-ra-report-save,
            script,
            style,
            iframe,
            object,
            embed,
            input,
            textarea,
            select,
            button
        `).forEach(element => {
      element.remove();
    });
    const comments = [];
    const commentWalker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    while (commentWalker.nextNode()) {
      comments.push(commentWalker.currentNode);
    }
    comments.forEach(comment => {
      comment.remove();
    });
    const elements = [];
    if (root.nodeType === Node.ELEMENT_NODE) {
      elements.push(root);
    }
    elements.push(...root.querySelectorAll('*'));
    elements.forEach(element => {
      [...element.attributes].forEach(attribute => {
        const name = attribute.name.toLowerCase();
        const shouldRemove = name.startsWith('on') || name.startsWith('ng-') || name.startsWith('tooltip') || name.startsWith('data-qol') || name === 'clickable' || name === 'play-on-click' || name === 'player-link' || name === 'village-link' || name === 'href' || name === 'srcset';
        if (shouldRemove) {
          element.removeAttribute(attribute.name);
        }
      });
      element.classList.remove('clickable');
      if (element.tagName === 'A') {
        element.setAttribute('aria-disabled', 'true');
        element.style.setProperty('pointer-events', 'none');
      }
    });
  }
  function findStoredReport(candidate) {
    if (!candidate) return null;
    return archive.reports.find(report => {
      if (candidate.sourceReportId && report.sourceReportId) {
        return candidate.sourceReportId === report.sourceReportId;
      }
      return Boolean(candidate.fingerprint && candidate.fingerprint === report.fingerprint);
    }) || null;
  }
  function handleGlobalKeydown(event) {
    if (event.key !== 'Escape') {
      return;
    }
    if (document.querySelector('.qol-ra-dialog-layer')) {
      closeDialogs();
      return;
    }
    const detail = archivePanel?.querySelector('.qol-ra-detail');
    if (detail && window.getComputedStyle(detail).display !== 'none') {
      closeReportDetail();
      return;
    }
    if (archivePanel && window.getComputedStyle(archivePanel).display !== 'none') {
      closeArchivePanel();
    }
  }
  async function startFeature() {
    if (featureStarted || !isEnabled()) {
      return;
    }
    featureStarted = true;
    injectStyles();
    archive = await loadArchive();
    if (!featureStarted || !isEnabled()) {
      return;
    }
    buildToolbarButton();
    buildArchivePanel();
    document.addEventListener('click', trackReportOpening, true);
    document.addEventListener('keydown', handleGlobalKeydown, true);
    reportObserver = new MutationObserver(scheduleReportScan);
    reportObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    scheduleReportScan();
    if (typeof window.qolRepositionAllButtons === 'function') {
      window.qolRepositionAllButtons();
    }
  }
  function stopFeature() {
    featureStarted = false;
    pendingReportId = null;
    activeReportId = null;
    reportObserver?.disconnect();
    reportObserver = null;
    document.removeEventListener('click', trackReportOpening, true);
    document.removeEventListener('keydown', handleGlobalKeydown, true);
    document.querySelectorAll('.qol-ra-report-save').forEach(control => {
      control.remove();
    });
    closeDialogs();
    toolbarButton?.remove();
    archivePanel?.remove();
    toolbarButton = null;
    archivePanel = null;
    if (typeof window.qolRepositionAllButtons === 'function') {
      window.qolRepositionAllButtons();
    }
  }
  window.addEventListener('qol_setting_changed', event => {
    if (!event.detail || event.detail.key !== FEATURE_KEY) {
      return;
    }
    const checkbox = document.getElementById('qol-chk-report-archive');
    if (checkbox) {
      checkbox.checked = Boolean(event.detail.enabled);
    }
    if (event.detail.enabled) {
      startFeature();
    } else {
      stopFeature();
    }
    scheduleIntegration();
  });
  function initializeModule() {
    injectStyles();
    ensureMenuIntegration();
    installToolbarPositionHook();
    integrationObserver = new MutationObserver(scheduleIntegration);
    integrationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    window.addEventListener('resize', positionToolbarButton);
    window.addEventListener('resize', scheduleReportScan);
    window.addEventListener('scroll', positionToolbarButton);
    if (isEnabled()) {
      startFeature();
    }
    scheduleIntegration();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeModule, {
      once: true
    });
  } else {
    initializeModule();
  }
})();
