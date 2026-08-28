/**
 * APES QoL - Building Alarm
 *
 * Non-Romans: replaces the shared construction-queue header icon with the
 * APES alarm timer.
 * Romans: leaves the shared header alone and replaces each construction row's
 * native duration clock with an independent APES alarm timer, so village and
 * resource-field constructions can be tracked separately.
 */
function initBuildingAlarm() {
    'use strict';

    const FEATURE_KEY = 'buildingAlarm';
    const STORAGE_KEY = 'qol_building_alarms';
    const PANEL_ID = 'qol-building-alarm-panel';
    const TOOLBAR_BUTTON_ID = 'qol-building-alarm-toggle-btn';
    const STYLE_ID = 'qol-building-alarm-styles';
    const HEADER_BUTTON_CLASS = 'qol-building-alarm-button';
    const ROW_BUTTON_CLASS = 'qol-building-alarm-row-clock';
    const ROMAN_CONTAINER_CLASS = 'qol-building-alarm-roman';
    const WARNING_SECONDS = 5 * 60;
    const REFRESH_MS = 500;

    let audioContext = null;
    let refreshTimer = null;

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY) === true
            : true;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function readAlarms() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
            return Array.isArray(parsed)
                ? parsed.filter(alarm => alarm && Number.isFinite(Number(alarm.alarmAt)))
                : [];
        } catch (_) {
            return [];
        }
    }

    function saveAlarms(alarms) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(alarms));
        } catch (error) {
            console.warn('[BuildingAlarm] Could not save alarms.', error);
        }
    }

    function getServerTimestamp() {
        const serverClock =
            document.querySelector('span[i18ndt][full="true"]') ||
            document.querySelector('#servertime[i18ndt], #servertime');
        const absoluteValue = Number(serverClock?.getAttribute('i18ndt'));
        return Number.isFinite(absoluteValue) ? absoluteValue : Date.now() / 1000;
    }

    function getVillageData() {
        const villageElement =
            document.querySelector('.currentVillageName .selectedItem .villageEntry') ||
            document.querySelector('.villageEntry.active') ||
            document.querySelector('.active .villageEntry') ||
            document.querySelector('.currentVillageName .villageEntry');
        const villageIdMatch = String(location.hash || '').match(/villId:(\d+)/i);
        return {
            name: villageElement?.textContent?.replace(/\s+/g, ' ').trim() || 'Current village',
            id: villageIdMatch ? villageIdMatch[1] : ''
        };
    }

    function getConstructionData(contentRow) {
        if (!contentRow) return null;
        const countdown = contentRow.querySelector('.detailsTime span[countdown]');
        const progress = contentRow.querySelector('.progressbar[finish-time]');
        const finishAt = Number(
            countdown?.getAttribute('countdown') ||
            progress?.getAttribute('finish-time')
        );
        if (!Number.isFinite(finishAt)) return null;

        const nameElement = contentRow.querySelector('.detailsInfo > div > span:first-child');
        const levelElement = contentRow.querySelector('.detailsInfo .levelText');
        return {
            finishAt,
            buildingName: nameElement?.textContent?.replace(/\s+/g, ' ').trim() || 'Construction',
            levelText: levelElement?.textContent?.replace(/\s+/g, ' ').trim() || ''
        };
    }

    function alarmId(village, construction) {
        return [
            village.id || village.name,
            construction.finishAt,
            construction.buildingName,
            construction.levelText
        ].join(':');
    }

    function matchingAlarmIndex(alarms, village, construction) {
        const exactId = alarmId(village, construction);
        const byId = alarms.findIndex(alarm => alarm.id === exactId);
        if (byId >= 0) return byId;
        return alarms.findIndex(alarm =>
            String(alarm.villageId || '') === String(village.id || '') &&
            Number(alarm.finishAt) === Number(construction.finishAt)
        );
    }

    function formatServerTime(timestamp) {
        const date = new Date(Number(timestamp) * 1000);
        return [date.getHours(), date.getMinutes(), date.getSeconds()]
            .map(value => String(value).padStart(2, '0'))
            .join(':');
    }

    function formatCountdown(seconds) {
        const total = Math.max(0, Math.ceil(Number(seconds) || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const remainingSeconds = total % 60;
        return [hours, minutes, remainingSeconds]
            .map(value => String(value).padStart(2, '0'))
            .join(':');
    }

    function getLevelTransition(alarm) {
        const buildingName = String(alarm.buildingName || 'Construction').trim();
        const levels = String(alarm.levelText || '').match(/\d+/g) || [];
        if (levels.length >= 2) {
            return { from: `${buildingName} ${levels[0]}`, to: `${buildingName} ${levels.at(-1)}` };
        }
        if (levels.length === 1) {
            return { from: buildingName, to: `${buildingName} ${levels[0]}` };
        }
        return { from: buildingName, to: 'Complete' };
    }

    function getAlarmProgress(alarm, now) {
        const start = Number(alarm.createdAt);
        const end = Number(alarm.alarmAt);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            return now >= end ? 100 : 0;
        }
        return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
    }

    function primeAudio() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            audioContext = audioContext || new AudioContextClass();
            audioContext.resume?.();
        } catch (_) {}
    }

    function playDing() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;
            audioContext = audioContext || new AudioContextClass();
            audioContext.resume?.();
            const now = audioContext.currentTime;
            const masterGain = audioContext.createGain();
            masterGain.gain.setValueAtTime(0.9, now);
            masterGain.connect(audioContext.destination);
            [
                { frequency: 1568, volume: 0.24, decay: 0.48 },
                { frequency: 3136, volume: 0.10, decay: 0.24 },
                { frequency: 4704, volume: 0.035, decay: 0.12 }
            ].forEach(partial => {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(partial.frequency, now);
                gain.gain.setValueAtTime(0.0001, now);
                gain.gain.exponentialRampToValueAtTime(partial.volume, now + 0.004);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);
                oscillator.connect(gain);
                gain.connect(masterGain);
                oscillator.start(now);
                oscillator.stop(now + partial.decay + 0.02);
            });
        } catch (error) {
            console.warn('[BuildingAlarm] Could not play ding.', error);
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${TOOLBAR_BUTTON_ID}{position:fixed!important;display:none;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;user-select:none!important;z-index:9999!important}
            #${TOOLBAR_BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${TOOLBAR_BUTTON_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}

            body.qol-building-alarm-enabled .queueContainer:not(.${ROMAN_CONTAINER_CLASS}) .detailsHeader .headerIcon.${HEADER_BUTTON_CLASS},
            body.qol-building-alarm-enabled .queueContainer.${ROMAN_CONTAINER_CLASS} .detailsTime .${ROW_BUTTON_CLASS}{position:relative!important;display:inline-block!important;margin:0!important;padding:0!important;border:0!important;background:none!important;background-image:none!important;box-shadow:none!important;color:#7d2924!important;cursor:pointer!important;transition:color .12s ease,transform .12s ease!important;vertical-align:middle!important}
            body.qol-building-alarm-enabled .queueContainer:not(.${ROMAN_CONTAINER_CLASS}) .detailsHeader .headerIcon.${HEADER_BUTTON_CLASS}::before,
            body.qol-building-alarm-enabled .queueContainer.${ROMAN_CONTAINER_CLASS} .detailsTime .${ROW_BUTTON_CLASS}::before{content:none!important;display:none!important}
            body.qol-building-alarm-enabled .queueContainer:not(.${ROMAN_CONTAINER_CLASS}) .detailsHeader .headerIcon.${HEADER_BUTTON_CLASS}::after,
            body.qol-building-alarm-enabled .queueContainer.${ROMAN_CONTAINER_CLASS} .detailsTime .${ROW_BUTTON_CLASS}::after{content:''!important;position:absolute!important;top:50%!important;left:50%!important;display:block!important;width:18px!important;height:18px!important;background-color:currentColor!important;-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='13' r='7'/%3E%3Cpath d='M12 9v4l2.7 1.6M7 3 4 6m13-3 3 3M9 21h6'/%3E%3C/g%3E%3C/svg%3E")!important;-webkit-mask-position:center!important;-webkit-mask-repeat:no-repeat!important;-webkit-mask-size:contain!important;mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cg fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='13' r='7'/%3E%3Cpath d='M12 9v4l2.7 1.6M7 3 4 6m13-3 3 3M9 21h6'/%3E%3C/g%3E%3C/svg%3E")!important;mask-position:center!important;mask-repeat:no-repeat!important;mask-size:contain!important;transform:translate(-50%,-50%)!important;pointer-events:none!important}
            body.qol-building-alarm-enabled .queueContainer.${ROMAN_CONTAINER_CLASS} .detailsTime .${ROW_BUTTON_CLASS}{width:18px!important;height:18px!important;min-width:18px!important;flex:0 0 18px!important}
            body.qol-building-alarm-enabled .${HEADER_BUTTON_CLASS}:hover,
            body.qol-building-alarm-enabled .${ROW_BUTTON_CLASS}:hover{color:#9a342d!important;transform:scale(1.08)!important}
            body.qol-building-alarm-enabled .${HEADER_BUTTON_CLASS}.active,
            body.qol-building-alarm-enabled .${ROW_BUTTON_CLASS}.active{color:#416923!important}
            body.qol-building-alarm-enabled .${HEADER_BUTTON_CLASS}.active:hover,
            body.qol-building-alarm-enabled .${ROW_BUTTON_CLASS}.active:hover{color:#527f2d!important}

            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:18px!important;top:120px!important;z-index:1000000!important;display:none;width:600px!important;height:min(390px,calc(100vh - 140px))!important;min-width:420px!important;min-height:220px!important;max-width:calc(100vw - 24px)!important;max-height:calc(100vh - 16px)!important;border:2px solid var(--qol-border)!important;border-radius:5px!important;background:#f7f5f0!important;box-shadow:0 10px 28px rgba(0,0,0,.4)!important;overflow:hidden!important;color:#3e3021!important}
            .qol-building-alarm-header{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:36px!important;padding:6px 9px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fffaf0!important;font-size:12px!important;font-weight:bold!important;cursor:move!important;user-select:none!important;touch-action:none!important}
            .qol-building-alarm-heading{display:flex!important;align-items:baseline!important;min-width:0!important;gap:8px!important}.qol-building-alarm-heading>strong{color:#fffaf0!important;font-size:12px!important}.qol-building-alarm-summary{overflow:hidden!important;color:#d9c9ad!important;font-size:9px!important;font-weight:normal!important;text-overflow:ellipsis!important;white-space:nowrap!important}
            .qol-building-alarm-close{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:19px!important;cursor:pointer!important}
            .qol-building-alarm-list{display:flex!important;flex-direction:column!important;width:100%!important;height:calc(100% - 36px)!important;min-height:0!important;padding:10px!important;gap:12px!important;overflow-y:auto!important;overscroll-behavior:contain!important;scrollbar-color:var(--qol-scroll-thumb) #e7ded1!important;scrollbar-width:thin!important}
            .qol-building-alarm-resize-handle{position:absolute!important;z-index:5!important;right:1px!important;bottom:1px!important;width:18px!important;height:18px!important;border-radius:0 0 3px 0!important;background:linear-gradient(135deg,transparent 0 48%,#9a7a50 49% 56%,transparent 57% 66%,#6f5332 67% 74%,transparent 75%)!important;cursor:nwse-resize!important;touch-action:none!important}
            .qol-building-alarm-section{display:flex!important;flex-direction:column!important;overflow:hidden!important;border:1px solid #d5c8b5!important;border-radius:4px!important;background:#fff!important}.qol-building-alarm-section-title{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:29px!important;padding:6px 9px!important;border-bottom:1px solid #d5c8b5!important;background:#eee6da!important;color:#5e4a31!important;font-size:10px!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.3px!important}.qol-building-alarm-section.ready .qol-building-alarm-section-title{background:#eaf2df!important;color:#416923!important}.qol-building-alarm-count{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:9px!important;background:rgba(90,66,39,.12)!important;color:inherit!important;font-size:9px!important}
            .qol-building-alarm-columns,.qol-building-alarm-row{display:grid!important;grid-template-columns:minmax(92px,1.05fr) minmax(82px,1fr) 22px minmax(82px,1fr) minmax(112px,.9fr) 26px!important;align-items:center!important;column-gap:7px!important}.qol-building-alarm-columns{min-height:28px!important;padding:5px 8px!important;border-bottom:1px solid #e0d7ca!important;background:#faf7f2!important;color:#786751!important;font-size:9px!important;font-weight:bold!important}.qol-building-alarm-columns-building{grid-column:2/5!important;text-align:center!important}.qol-building-alarm-columns-time{grid-column:5!important;text-align:center!important}
            .qol-building-alarm-row{position:relative!important;min-height:49px!important;padding:7px 8px 10px!important;border-bottom:1px solid #e4ddd2!important;background:#fff!important}.qol-building-alarm-row:last-child{border-bottom:0!important}.qol-building-alarm-row.ready{background:#f5faef!important}.qol-building-alarm-village,.qol-building-alarm-level{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}.qol-building-alarm-village{color:#5a4227!important;font-size:11px!important;font-weight:bold!important;cursor:pointer!important}.qol-building-alarm-village:hover{color:#8a5d24!important;text-decoration:underline!important}.qol-building-alarm-level{color:#4a3b2a!important;font-size:10px!important;text-align:center!important}.qol-building-alarm-arrow{color:#8a6b3e!important;font-size:17px!important;line-height:1!important;text-align:center!important}
            .qol-building-alarm-timing{display:flex!important;align-items:center!important;justify-content:center!important;flex-direction:column!important;min-width:0!important;gap:2px!important;text-align:center!important}.qol-building-alarm-time{color:#4c3a24!important;font-family:Consolas,monospace!important;font-size:10px!important;font-weight:bold!important;white-space:nowrap!important}.qol-building-alarm-relative{color:#87745c!important;font-family:Consolas,monospace!important;font-size:8px!important;white-space:nowrap!important}.qol-building-alarm-row.ready .qol-building-alarm-time{display:inline-flex!important;align-items:center!important;min-height:18px!important;padding:1px 6px!important;border-radius:9px!important;background:#dcebcf!important;color:#365b1d!important;font-family:Arial,sans-serif!important;font-size:8px!important;text-transform:uppercase!important}.qol-building-alarm-row.ready .qol-building-alarm-relative{color:#58723b!important}
            .qol-building-alarm-remove{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:22px!important;height:22px!important;border-radius:3px!important;color:#9a3b32!important;font-size:17px!important;cursor:pointer!important}.qol-building-alarm-remove:hover{background:#f5dfdc!important}.qol-building-alarm-progress{position:absolute!important;right:0!important;bottom:0!important;left:0!important;height:4px!important;overflow:hidden!important;background:#e8e2d9!important}.qol-building-alarm-progress>span{display:block!important;width:0;height:100%!important;background:linear-gradient(to right,#6eaa35,#8fc64e)!important;transition:width .45s linear!important}.qol-building-alarm-row.ready .qol-building-alarm-progress>span{background:#4f8b2d!important}.qol-building-alarm-empty{padding:20px 12px!important;color:#83725d!important;font-size:10px!important;text-align:center!important}
            @media(max-width:540px){#${PANEL_ID}{right:8px!important;width:calc(100vw - 16px)!important;min-width:280px!important;max-width:calc(100vw - 16px)!important}.qol-building-alarm-columns{display:none!important}.qol-building-alarm-row{grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr) minmax(84px,auto) 24px!important;row-gap:5px!important}.qol-building-alarm-village{grid-column:1/-1!important}}
        `;
        document.head.appendChild(style);
    }

    function makePanelDraggable(panel, handle) {
        if (!handle || handle.dataset.qolDragBound === 'true') return;
        handle.dataset.qolDragBound = 'true';
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-building-alarm-close')) return;
            event.preventDefault();
            const rectangle = panel.getBoundingClientRect();
            const offsetX = event.clientX - rectangle.left;
            const offsetY = event.clientY - rectangle.top;
            const move = moveEvent => {
                const maximumLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
                const maximumTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
                const left = Math.max(8, Math.min(moveEvent.clientX - offsetX, maximumLeft));
                const top = Math.max(8, Math.min(moveEvent.clientY - offsetY, maximumTop));
                panel.style.setProperty('left', `${left}px`, 'important');
                panel.style.setProperty('top', `${top}px`, 'important');
                panel.style.setProperty('right', 'auto', 'important');
            };
            const stop = () => {
                window.removeEventListener('pointermove', move, true);
                window.removeEventListener('pointerup', stop, true);
                window.removeEventListener('pointercancel', stop, true);
            };
            window.addEventListener('pointermove', move, true);
            window.addEventListener('pointerup', stop, true);
            window.addEventListener('pointercancel', stop, true);
        });
    }

    function makePanelResizable(panel, handle) {
        if (!handle || handle.dataset.qolResizeBound === 'true') return;
        handle.dataset.qolResizeBound = 'true';
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            const rectangle = panel.getBoundingClientRect();
            const startX = event.clientX;
            const startY = event.clientY;
            const startWidth = rectangle.width;
            const startHeight = rectangle.height;
            panel.style.setProperty('left', `${rectangle.left}px`, 'important');
            panel.style.setProperty('right', 'auto', 'important');
            const move = moveEvent => {
                const minimumWidth = Math.min(window.innerWidth <= 540 ? 280 : 420, window.innerWidth - 16);
                const maximumWidth = Math.max(minimumWidth, window.innerWidth - rectangle.left - 8);
                const minimumHeight = Math.min(220, window.innerHeight - 16);
                const maximumHeight = Math.max(minimumHeight, window.innerHeight - rectangle.top - 8);
                const width = Math.max(minimumWidth, Math.min(startWidth + moveEvent.clientX - startX, maximumWidth));
                const height = Math.max(minimumHeight, Math.min(startHeight + moveEvent.clientY - startY, maximumHeight));
                panel.style.setProperty('width', `${width}px`, 'important');
                panel.style.setProperty('height', `${height}px`, 'important');
            };
            const stop = () => {
                window.removeEventListener('pointermove', move, true);
                window.removeEventListener('pointerup', stop, true);
                window.removeEventListener('pointercancel', stop, true);
            };
            window.addEventListener('pointermove', move, true);
            window.addEventListener('pointerup', stop, true);
            window.addEventListener('pointercancel', stop, true);
        });
    }

    function mountPanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;
        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="qol-building-alarm-header">
                <span class="qol-building-alarm-heading">
                    <strong>Building Alarms</strong>
                    <span class="qol-building-alarm-summary">No alarms set</span>
                </span>
                <span class="qol-building-alarm-close" role="button" tabindex="0" aria-label="Close Building Alarms">&times;</span>
            </div>
            <div class="qol-building-alarm-list"></div>
            <div class="qol-building-alarm-resize-handle" aria-hidden="true" title="Resize Building Alarms"></div>
        `;
        document.body.appendChild(panel);
        const close = panel.querySelector('.qol-building-alarm-close');
        const header = panel.querySelector('.qol-building-alarm-header');
        makePanelDraggable(panel, header);
        makePanelResizable(panel, panel.querySelector('.qol-building-alarm-resize-handle'));
        const closePanel = () => panel.style.setProperty('display', 'none', 'important');
        close.addEventListener('click', closePanel);
        close.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                closePanel();
            }
        });
        return panel;
    }

    function mountToolbarButton() {
        let button = document.getElementById(TOOLBAR_BUTTON_ID);
        if (button) return button;
        button = document.createElement('div');
        button.id = TOOLBAR_BUTTON_ID;
        button.title = 'Building Alarms';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', 'Open Building Alarms');
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"></circle><path d="M12 9v4l2.7 1.6M7 3 4 6m13-3 3 3M9 21h6"></path></svg>`;
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            const panel = mountPanel();
            const hidden = getComputedStyle(panel).display === 'none';
            if (hidden) {
                window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: FEATURE_KEY } }));
                renderPanel(true);
            } else {
                panel.style.setProperty('display', 'none', 'important');
            }
        };
        button.addEventListener('click', activate);
        button.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        });
        document.body.appendChild(button);
        window.qolRepositionAllButtons?.();
        return button;
    }

    function openVillage(villageId) {
        if (villageId) location.hash = `#/page:village/villId:${villageId}`;
    }

    function removeAlarm(alarmId) {
        saveAlarms(readAlarms().filter(alarm => alarm.id !== alarmId));
        renderPanel();
        injectClockButtons();
    }

    function renderPanel(open = false) {
        const panel = mountPanel();
        const list = panel.querySelector('.qol-building-alarm-list');
        const summary = panel.querySelector('.qol-building-alarm-summary');
        const alarms = readAlarms().sort((a, b) => Number(a.alarmAt) - Number(b.alarmAt));
        const now = getServerTimestamp();
        const readyAlarms = alarms.filter(alarm => alarm.triggered === true || now >= Number(alarm.alarmAt));
        const upcomingAlarms = alarms.filter(alarm => !readyAlarms.includes(alarm));
        summary.textContent = alarms.length === 0 ? 'No alarms set' : `${alarms.length} active · ${readyAlarms.length} ready`;

        const headings = `<div class="qol-building-alarm-columns" aria-hidden="true"><span>Village</span><span class="qol-building-alarm-columns-building">Building Upgrade</span><span class="qol-building-alarm-columns-time">Instant Finish Available</span></div>`;
        const rowsHtml = (section, ready = false) => section.map(alarm => {
            const transition = getLevelTransition(alarm);
            const progress = ready ? 100 : getAlarmProgress(alarm, now);
            const relative = ready
                ? `Finishes in ${formatCountdown(Number(alarm.finishAt) - now)}`
                : `in ${formatCountdown(Number(alarm.alarmAt) - now)}`;
            return `<div class="qol-building-alarm-row${ready ? ' ready' : ''}" data-alarm-id="${escapeHtml(alarm.id)}" data-alarm-at="${escapeHtml(alarm.alarmAt)}" data-finish-at="${escapeHtml(alarm.finishAt)}" data-created-at="${escapeHtml(alarm.createdAt)}">
                <span class="qol-building-alarm-village" data-village-id="${escapeHtml(alarm.villageId)}" role="button" tabindex="0" title="Open ${escapeHtml(alarm.villageName)}">${escapeHtml(alarm.villageName)}</span>
                <span class="qol-building-alarm-level">${escapeHtml(transition.from)}</span><span class="qol-building-alarm-arrow">→</span><span class="qol-building-alarm-level">${escapeHtml(transition.to)}</span>
                <span class="qol-building-alarm-timing"><strong class="qol-building-alarm-time">${ready ? 'Ready' : escapeHtml(formatServerTime(alarm.alarmAt))}</strong><small class="qol-building-alarm-relative">${escapeHtml(relative)}</small></span>
                <span class="qol-building-alarm-remove" role="button" tabindex="0" aria-label="Remove alarm" title="Remove alarm">&times;</span><span class="qol-building-alarm-progress"><span style="width:${progress.toFixed(1)}%"></span></span>
            </div>`;
        }).join('');

        if (!alarms.length) {
            list.innerHTML = '<div class="qol-building-alarm-empty">No building alarms are currently set.</div>';
        } else {
            list.innerHTML = `
                <section class="qol-building-alarm-section ready"><div class="qol-building-alarm-section-title"><span>Available for Instant Finish</span><span class="qol-building-alarm-count">${readyAlarms.length}</span></div>${headings}${readyAlarms.length ? rowsHtml(readyAlarms, true) : '<div class="qol-building-alarm-empty">No buildings are ready yet.</div>'}</section>
                <section class="qol-building-alarm-section"><div class="qol-building-alarm-section-title"><span>Upcoming Alarms</span><span class="qol-building-alarm-count">${upcomingAlarms.length}</span></div>${headings}${upcomingAlarms.length ? rowsHtml(upcomingAlarms) : '<div class="qol-building-alarm-empty">No upcoming alarms.</div>'}</section>`;
        }
        panel.dataset.qolAlarmRendered = 'true';
        list.querySelectorAll('.qol-building-alarm-village').forEach(element => {
            const activate = () => openVillage(element.dataset.villageId);
            element.addEventListener('click', activate);
            element.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
            });
        });
        list.querySelectorAll('.qol-building-alarm-remove').forEach(element => {
            const activate = () => removeAlarm(element.closest('[data-alarm-id]')?.dataset.alarmId);
            element.addEventListener('click', activate);
            element.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
            });
        });
        if (open) panel.style.setProperty('display', 'block', 'important');
    }

    function updatePanelLiveState() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        const now = getServerTimestamp();
        panel.querySelectorAll('.qol-building-alarm-row').forEach(row => {
            const alarmAt = Number(row.dataset.alarmAt);
            const finishAt = Number(row.dataset.finishAt);
            const createdAt = Number(row.dataset.createdAt);
            const ready = row.classList.contains('ready') || now >= alarmAt;
            const time = row.querySelector('.qol-building-alarm-time');
            const relative = row.querySelector('.qol-building-alarm-relative');
            const progress = row.querySelector('.qol-building-alarm-progress > span');
            if (time) time.textContent = ready ? 'Ready' : formatServerTime(alarmAt);
            if (relative) relative.textContent = ready ? `Finishes in ${formatCountdown(finishAt - now)}` : `in ${formatCountdown(alarmAt - now)}`;
            if (progress) {
                const percent = ready ? 100 : getAlarmProgress({ createdAt, alarmAt }, now);
                progress.style.setProperty('width', `${percent.toFixed(1)}%`);
            }
        });
    }

    function setAlarm(contentRow, button) {
        const construction = getConstructionData(contentRow);
        if (!construction) return;
        const village = getVillageData();
        const alarms = readAlarms();
        const existingIndex = matchingAlarmIndex(alarms, village, construction);
        const alarmAt = construction.finishAt - WARNING_SECONDS;
        const alarm = {
            id: alarmId(village, construction),
            villageId: village.id,
            villageName: village.name,
            buildingName: construction.buildingName,
            levelText: construction.levelText,
            finishAt: construction.finishAt,
            alarmAt,
            createdAt: getServerTimestamp(),
            triggered: existingIndex >= 0 ? alarms[existingIndex].triggered === true : false
        };
        if (existingIndex >= 0) alarms[existingIndex] = alarm;
        else alarms.push(alarm);
        saveAlarms(alarms);
        button?.classList.add('active');
        if (button) button.title = `Alarm set for ${formatServerTime(alarmAt)}`;
        primeAudio();
        renderPanel(true);
        processAlarms();
    }

    function bindControl(control, contentRow) {
        if (!control || control.dataset.qolBuildingAlarmBound === 'true') return;
        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            setAlarm(contentRow, control);
        };
        const keyActivate = event => {
            if (event.key === 'Enter' || event.key === ' ') activate(event);
        };
        control.addEventListener('click', activate);
        control.addEventListener('keydown', keyActivate);
        control.qolBuildingAlarmActivate = activate;
        control.qolBuildingAlarmKeyActivate = keyActivate;
        control.dataset.qolBuildingAlarmBound = 'true';
    }

    function unbindControl(control) {
        if (!control) return;
        if (control.qolBuildingAlarmActivate) control.removeEventListener('click', control.qolBuildingAlarmActivate);
        if (control.qolBuildingAlarmKeyActivate) control.removeEventListener('keydown', control.qolBuildingAlarmKeyActivate);
        delete control.qolBuildingAlarmActivate;
        delete control.qolBuildingAlarmKeyActivate;
        delete control.dataset.qolBuildingAlarmBound;
    }

    function restoreHeaderIcon(headerIcon) {
        if (!headerIcon) return;
        unbindControl(headerIcon);
        const originalClass = headerIcon.dataset.qolBuildingAlarmOriginalClass;
        if (originalClass) headerIcon.className = originalClass;
        else headerIcon.classList.remove(HEADER_BUTTON_CLASS, 'active');
        headerIcon.innerHTML = headerIcon.dataset.qolBuildingAlarmOriginalHtml || '';
        headerIcon.removeAttribute('role');
        headerIcon.removeAttribute('tabindex');
        headerIcon.removeAttribute('aria-label');
        headerIcon.removeAttribute('title');
        delete headerIcon.dataset.qolBuildingAlarmOriginalClass;
        delete headerIcon.dataset.qolBuildingAlarmOriginalHtml;
    }

    function restoreRowClock(clock) {
        if (!clock) return;
        unbindControl(clock);
        const originalClass = clock.dataset.qolBuildingAlarmOriginalClass;
        if (originalClass) clock.className = originalClass;
        else clock.classList.remove(ROW_BUTTON_CLASS, 'active');
        clock.innerHTML = clock.dataset.qolBuildingAlarmOriginalHtml || '';
        clock.removeAttribute('role');
        clock.removeAttribute('tabindex');
        clock.removeAttribute('aria-label');
        clock.removeAttribute('title');
        delete clock.dataset.qolBuildingAlarmOriginalClass;
        delete clock.dataset.qolBuildingAlarmOriginalHtml;
    }

    function isRomanContainer(queueContainer, contentRows) {
        return contentRows.some(row =>
            row.querySelector('.buildingSlotImage.tribeId1, .buildingMini.tribeId1')
        );
    }

    function prepareHeaderAlarm(queueContainer, contentRows, alarms) {
        queueContainer.classList.remove(ROMAN_CONTAINER_CLASS);
        queueContainer.querySelectorAll(`.${ROW_BUTTON_CLASS}`).forEach(restoreRowClock);
        const headerIcon = queueContainer.querySelector('.detailsHeader .headerIcon');
        if (!headerIcon || !contentRows.length) return;
        if (!headerIcon.dataset.qolBuildingAlarmOriginalClass) {
            headerIcon.dataset.qolBuildingAlarmOriginalClass = headerIcon.className;
            headerIcon.dataset.qolBuildingAlarmOriginalHtml = headerIcon.innerHTML;
        }
        headerIcon.classList.add(HEADER_BUTTON_CLASS);
        headerIcon.setAttribute('role', 'button');
        headerIcon.setAttribute('tabindex', '0');
        headerIcon.setAttribute('aria-label', 'Set building alarm');
        headerIcon.innerHTML = '';
        bindControl(headerIcon, contentRows[0]);
        const village = getVillageData();
        const hasAlarm = contentRows.some(row => {
            const construction = getConstructionData(row);
            return construction && matchingAlarmIndex(alarms, village, construction) >= 0;
        });
        headerIcon.classList.toggle('active', hasAlarm);
        headerIcon.title = hasAlarm ? 'Building alarm is set' : 'Set alarm for five minutes before completion';
    }

    function prepareRomanRowAlarms(queueContainer, contentRows, alarms) {
        queueContainer.classList.add(ROMAN_CONTAINER_CLASS);
        restoreHeaderIcon(queueContainer.querySelector(`.detailsHeader .${HEADER_BUTTON_CLASS}`));
        const village = getVillageData();
        contentRows.forEach(contentRow => {
            const construction = getConstructionData(contentRow);
            if (!construction) return;
            const clock = contentRow.querySelector('.detailsTime i.duration');
            if (!clock) return;
            if (!clock.dataset.qolBuildingAlarmOriginalClass) {
                clock.dataset.qolBuildingAlarmOriginalClass = clock.className;
                clock.dataset.qolBuildingAlarmOriginalHtml = clock.innerHTML;
            }
            Array.from(clock.classList).forEach(className => {
                if (/^symbol_clock_small_flat/i.test(className)) clock.classList.remove(className);
            });
            clock.classList.add(ROW_BUTTON_CLASS);
            clock.setAttribute('role', 'button');
            clock.setAttribute('tabindex', '0');
            clock.setAttribute('aria-label', `Set alarm for ${construction.buildingName}`);
            clock.innerHTML = '';
            bindControl(clock, contentRow);
            const hasAlarm = matchingAlarmIndex(alarms, village, construction) >= 0;
            clock.classList.toggle('active', hasAlarm);
            clock.title = hasAlarm
                ? `Alarm set for ${construction.buildingName}`
                : `Set alarm for ${construction.buildingName} five minutes before completion`;
        });
    }

    function injectClockButtons() {
        if (!isEnabled()) return;
        const alarms = readAlarms();
        document.querySelectorAll('.queueContainer').forEach(queueContainer => {
            const contentRows = Array.from(queueContainer.querySelectorAll('.detailsContent'))
                .filter(row => Boolean(getConstructionData(row)));
            if (!contentRows.length) return;
            if (isRomanContainer(queueContainer, contentRows)) {
                prepareRomanRowAlarms(queueContainer, contentRows, alarms);
            } else {
                prepareHeaderAlarm(queueContainer, contentRows, alarms);
            }
        });
    }

    function restoreOriginalButtons() {
        document.querySelectorAll(`.${HEADER_BUTTON_CLASS}`).forEach(restoreHeaderIcon);
        document.querySelectorAll(`.${ROW_BUTTON_CLASS}`).forEach(restoreRowClock);
        document.querySelectorAll(`.${ROMAN_CONTAINER_CLASS}`).forEach(container => container.classList.remove(ROMAN_CONTAINER_CLASS));
    }

    function processAlarms() {
        if (!isEnabled()) return;
        const now = getServerTimestamp();
        const alarms = readAlarms();
        const active = [];
        let changed = false;
        alarms.forEach(alarm => {
            if (now >= Number(alarm.finishAt)) {
                changed = true;
                return;
            }
            if (now >= Number(alarm.alarmAt) && alarm.triggered !== true) {
                playDing();
                alarm.triggered = true;
                alarm.triggeredAt = now;
                changed = true;
            }
            active.push(alarm);
        });
        if (changed) {
            saveAlarms(active);
            renderPanel();
            injectClockButtons();
        }
    }

    function removeMatchingConstructionAlarm(contentRow, onlyIfReady = false) {
        const construction = getConstructionData(contentRow);
        if (!construction) return;
        const village = getVillageData();
        const now = getServerTimestamp();
        const alarms = readAlarms();
        const remaining = alarms.filter(alarm => {
            const matches =
                String(alarm.villageId || '') === String(village.id || '') &&
                Number(alarm.finishAt) === Number(construction.finishAt);
            if (!matches) return true;
            if (onlyIfReady && now < Number(alarm.alarmAt)) return true;
            return false;
        });
        if (remaining.length !== alarms.length) {
            saveAlarms(remaining);
            renderPanel();
            injectClockButtons();
        }
    }

    function handleConstructionActionClick(event) {
        if (!isEnabled()) return;
        const finishButton = event.target?.closest?.('button[premium-feature="finishNow"]');
        const cancelButton = event.target?.closest?.('.cancelBuilding');
        if (!finishButton && !cancelButton) return;
        const contentRow = (finishButton || cancelButton).closest('.detailsContent');
        if (!getConstructionData(contentRow)) return;
        const onlyIfReady = Boolean(finishButton);
        window.setTimeout(() => removeMatchingConstructionAlarm(contentRow, onlyIfReady), 600);
    }

    function refresh() {
        if (!document.body) return;
        injectStyles();
        if (!isEnabled()) {
            document.body.classList.remove('qol-building-alarm-enabled');
            restoreOriginalButtons();
            document.getElementById(PANEL_ID)?.remove();
            const toolbarButton = document.getElementById(TOOLBAR_BUTTON_ID);
            if (toolbarButton) {
                toolbarButton.remove();
                window.qolRepositionAllButtons?.();
            }
            return;
        }
        document.body.classList.add('qol-building-alarm-enabled');
        mountToolbarButton();
        const panel = mountPanel();
        if (panel.dataset.qolAlarmRendered !== 'true') renderPanel();
        injectClockButtons();
        processAlarms();
        updatePanelLiveState();
    }

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key === FEATURE_KEY) refresh();
    });
    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== FEATURE_KEY) {
            document.getElementById(PANEL_ID)?.style.setProperty('display', 'none', 'important');
        }
    });
    document.addEventListener('click', handleConstructionActionClick, true);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    } else {
        refresh();
    }
    refreshTimer = window.setInterval(refresh, REFRESH_MS);
}

initBuildingAlarm();
