/**
 * APES QoL — Building Alarm
 *
 * Travian's native construction clock is the alarm control.
 * Red = no alarm, green = alarm set.
 *
 * This file owns the complete feature: clock state, alarm storage, sound,
 * Instant Finish/cancel cleanup, toolbar button, panel, ready/upcoming layout,
 * scrolling and styling.
 */
function initBuildingAlarm() {
    'use strict';

    const FEATURE_KEY = 'buildingAlarm';
    const STORAGE_KEY = 'qol_building_alarms';
    const PANEL_ID = 'qol-building-alarm-panel';
    const TOOLBAR_BUTTON_ID = 'qol-building-alarm-toggle-btn';
    const STYLE_ID = 'qol-building-alarm-styles';
    const CLOCK_CLASS = 'qol-building-alarm-native-clock';
    const WARNING_SECONDS = 5 * 60;
    const REFRESH_MS = 500;

    let audioContext = null;

    function isEnabled() {
        if (typeof window.isQolEnabled === 'function') {
            return window.isQolEnabled(FEATURE_KEY) === true;
        }
        try {
            return localStorage.getItem(`qol_${FEATURE_KEY}`) !== 'false';
        } catch (_) {
            return true;
        }
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
        const value = Number(serverClock?.getAttribute('i18ndt'));
        return Number.isFinite(value) ? value : Date.now() / 1000;
    }

    function getVillageData() {
        const villageElement =
            document.querySelector('.currentVillageName .selectedItem .villageEntry') ||
            document.querySelector('.villageEntry.active') ||
            document.querySelector('.active .villageEntry') ||
            document.querySelector('.currentVillageName .villageEntry');
        const villageIdMatch = String(location.hash || '').match(/villId:(\d+)/i);

        return {
            id: villageIdMatch?.[1] || '',
            name: villageElement?.textContent?.replace(/\s+/g, ' ').trim() || 'Current village'
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
        const exactIndex = alarms.findIndex(alarm => alarm.id === exactId);
        if (exactIndex >= 0) return exactIndex;

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
        const secs = total % 60;
        return [hours, minutes, secs]
            .map(value => String(value).padStart(2, '0'))
            .join(':');
    }

    function getLevelTransition(alarm) {
        const name = String(alarm.buildingName || 'Construction').trim();
        const levels = String(alarm.levelText || '').match(/\d+/g) || [];

        if (levels.length >= 2) {
            return {
                from: `${name} ${levels[0]}`,
                to: `${name} ${levels.at(-1)}`
            };
        }
        if (levels.length === 1) {
            return { from: name, to: `${name} ${levels[0]}` };
        }
        return { from: name, to: 'Complete' };
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
            const master = audioContext.createGain();
            master.gain.setValueAtTime(0.9, now);
            master.connect(audioContext.destination);

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
                gain.connect(master);
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
            body.qol-building-alarm-enabled .queueContainer .detailsContent .detailsTime > i.symbol_clock_small_flat_black.duration.${CLOCK_CLASS}{cursor:pointer!important;filter:invert(20%) sepia(35%) saturate(1800%) hue-rotate(325deg) brightness(83%) contrast(91%)!important;transition:filter .12s ease,transform .12s ease!important}
            body.qol-building-alarm-enabled .queueContainer .detailsContent .detailsTime > i.symbol_clock_small_flat_black.duration.${CLOCK_CLASS}:hover{transform:scale(1.08)!important}
            body.qol-building-alarm-enabled .queueContainer .detailsContent .detailsTime > i.symbol_clock_small_flat_black.duration.${CLOCK_CLASS}.active{filter:invert(38%) sepia(28%) saturate(1030%) hue-rotate(46deg) brightness(84%) contrast(86%)!important}

            #${TOOLBAR_BUTTON_ID}{position:fixed!important;display:none;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;margin:0!important;padding:0!important;box-sizing:border-box!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;z-index:9999!important}
            #${TOOLBAR_BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${TOOLBAR_BUTTON_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}

            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;right:18px!important;top:120px!important;z-index:1000000!important;display:none;width:590px!important;max-width:calc(100vw - 24px)!important;max-height:calc(100vh - 140px)!important;border:2px solid var(--qol-border)!important;border-radius:5px!important;background:#f7f5f0!important;box-shadow:0 10px 28px rgba(0,0,0,.4)!important;overflow:hidden!important;color:#3e3021!important}
            .qol-building-alarm-header{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:36px!important;padding:6px 9px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-dark))!important;color:#fffaf0!important;font-size:12px!important;font-weight:bold!important;cursor:move!important;user-select:none!important}
            .qol-building-alarm-heading{display:flex!important;align-items:baseline!important;gap:8px!important;min-width:0!important}.qol-building-alarm-summary{color:#d9c9ad!important;font-size:9px!important;font-weight:normal!important}
            .qol-building-alarm-close{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;border-radius:3px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:19px!important;cursor:pointer!important}

            .qol-building-alarm-list{display:flex!important;flex-direction:column!important;height:min(390px,calc(100vh - 190px))!important;max-height:min(390px,calc(100vh - 190px))!important;min-height:0!important;padding:10px!important;gap:10px!important;overflow:hidden!important;overscroll-behavior:contain!important}
            .qol-building-alarm-section{overflow:hidden!important;border:1px solid #d7ccbc!important;border-radius:4px!important;background:#fff!important}
            .qol-building-alarm-section.ready{flex:0 1 auto!important;max-height:68%!important;overflow-y:auto!important;overflow-x:hidden!important;scrollbar-width:thin!important;scrollbar-color:var(--qol-scroll-thumb,#8a765e) #e7ded1!important}
            .qol-building-alarm-section:not(.ready){flex:1 1 auto!important;min-height:72px!important;overflow-y:auto!important;overflow-x:hidden!important;overscroll-behavior:contain!important;scrollbar-width:thin!important;scrollbar-color:var(--qol-scroll-thumb,#8a765e) #e7ded1!important}
            .qol-building-alarm-section::-webkit-scrollbar{width:8px!important}
            .qol-building-alarm-section::-webkit-scrollbar-track{background:#e7ded1!important}
            .qol-building-alarm-section::-webkit-scrollbar-thumb{border:2px solid #e7ded1!important;border-radius:5px!important;background:var(--qol-scroll-thumb,#8a765e)!important}

            .qol-building-alarm-section-title{position:sticky!important;top:0!important;z-index:2!important;display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:30px!important;padding:6px 9px!important;border-bottom:1px solid #d7ccbc!important;background:#eee6da!important;color:#5e4a31!important;font-size:10px!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.25px!important}
            .qol-building-alarm-section.ready .qol-building-alarm-section-title{background:#eaf2df!important;color:#416923!important}
            .qol-building-alarm-count{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:19px!important;height:19px!important;padding:0 5px!important;border-radius:10px!important;background:rgba(90,66,39,.12)!important;color:inherit!important;font-size:9px!important}
            .qol-building-alarm-row{display:grid!important;grid-template-columns:minmax(92px,1fr) minmax(200px,1.8fr) minmax(120px,.9fr) 24px!important;align-items:center!important;gap:8px!important;min-height:46px!important;padding:7px 8px!important;border-bottom:1px solid #e3dbd0!important;background:#fff!important}
            .qol-building-alarm-row:last-child{border-bottom:0!important}.qol-building-alarm-row.ready{background:#f5faef!important}
            .qol-building-alarm-village{overflow:hidden!important;color:#5a4227!important;font-size:10px!important;font-weight:bold!important;text-overflow:ellipsis!important;white-space:nowrap!important;cursor:pointer!important}.qol-building-alarm-village:hover{text-decoration:underline!important}
            .qol-building-alarm-building{color:#4a3b2a!important;font-size:10px!important}.qol-building-alarm-time{text-align:center!important;color:#6b5942!important;font-family:Consolas,monospace!important;font-size:9px!important;line-height:1.35!important}.qol-building-alarm-row.ready .qol-building-alarm-time{color:#416923!important;font-weight:bold!important}
            .qol-building-alarm-remove{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:22px!important;height:22px!important;border-radius:3px!important;color:#9a3b32!important;font-size:17px!important;cursor:pointer!important}.qol-building-alarm-remove:hover{background:#f5dfdc!important}
            .qol-building-alarm-empty{padding:16px 12px!important;color:#83725d!important;font-size:10px!important;text-align:center!important;background:#fff!important}
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function makeDraggable(panel, handle) {
        if (!panel || !handle || handle.dataset.qolDragBound === 'true') return;
        handle.dataset.qolDragBound = 'true';

        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0 || event.target.closest('.qol-building-alarm-close')) return;
            event.preventDefault();

            const rect = panel.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;

            const move = moveEvent => {
                const left = Math.max(8, Math.min(
                    moveEvent.clientX - offsetX,
                    window.innerWidth - panel.offsetWidth - 8
                ));
                const top = Math.max(8, Math.min(
                    moveEvent.clientY - offsetY,
                    window.innerHeight - panel.offsetHeight - 8
                ));
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
                <span class="qol-building-alarm-close" role="button" tabindex="0" aria-label="Close">&times;</span>
            </div>
            <div class="qol-building-alarm-list"></div>
        `;
        document.body.appendChild(panel);

        makeDraggable(panel, panel.querySelector('.qol-building-alarm-header'));

        const close = panel.querySelector('.qol-building-alarm-close');
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
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="7"></circle><path d="M12 9v4l2.7 1.6M7 3 4 6m13-3 3 3M9 21h6"></path></svg>`;

        const activate = event => {
            event.preventDefault();
            event.stopPropagation();
            const panel = mountPanel();
            const hidden = getComputedStyle(panel).display === 'none';

            if (hidden) {
                window.dispatchEvent(new CustomEvent(
                    'qol_close_others',
                    { detail: { source: FEATURE_KEY } }
                ));
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

    function renderAlarmRows(alarms, now, ready) {
        if (!alarms.length) {
            return `<div class="qol-building-alarm-empty">${
                ready
                    ? 'No buildings are currently available for free instant finish.'
                    : 'No upcoming building alarms are set.'
            }</div>`;
        }

        return alarms.map(alarm => {
            const transition = getLevelTransition(alarm);
            const relative = ready
                ? `Finishes in ${formatCountdown(Number(alarm.finishAt) - now)}`
                : `Alarm in ${formatCountdown(Number(alarm.alarmAt) - now)}`;

            return `
                <div class="qol-building-alarm-row${ready ? ' ready' : ''}" data-alarm-id="${escapeHtml(alarm.id)}">
                    <span class="qol-building-alarm-village" data-village-id="${escapeHtml(alarm.villageId)}" title="Open ${escapeHtml(alarm.villageName)}">${escapeHtml(alarm.villageName)}</span>
                    <span class="qol-building-alarm-building">${escapeHtml(transition.from)} → ${escapeHtml(transition.to)}</span>
                    <span class="qol-building-alarm-time">${ready ? 'Ready' : escapeHtml(formatServerTime(alarm.alarmAt))}<br>${escapeHtml(relative)}</span>
                    <span class="qol-building-alarm-remove" role="button" tabindex="0" title="Remove alarm">&times;</span>
                </div>
            `;
        }).join('');
    }

    function bindPanelRows(list) {
        list.querySelectorAll('.qol-building-alarm-village').forEach(element => {
            element.addEventListener('click', () => {
                const id = element.dataset.villageId;
                if (id) location.hash = `#/page:village/villId:${id}`;
            });
        });

        list.querySelectorAll('.qol-building-alarm-remove').forEach(element => {
            element.addEventListener('click', () => {
                const id = element.closest('[data-alarm-id]')?.dataset.alarmId;
                if (!id) return;
                saveAlarms(readAlarms().filter(alarm => alarm.id !== id));
                renderPanel();
                syncClockStates();
            });
        });
    }

    function renderPanel(open = false) {
        const panel = mountPanel();
        const list = panel.querySelector('.qol-building-alarm-list');
        const summary = panel.querySelector('.qol-building-alarm-summary');
        const now = getServerTimestamp();

        const alarms = readAlarms()
            .filter(alarm => now < Number(alarm.finishAt))
            .sort((a, b) => Number(a.alarmAt) - Number(b.alarmAt));

        const readyAlarms = alarms.filter(alarm =>
            alarm.triggered === true || now >= Number(alarm.alarmAt)
        );
        const upcomingAlarms = alarms.filter(alarm =>
            !readyAlarms.includes(alarm)
        );

        summary.textContent = alarms.length
            ? `${alarms.length} active · ${readyAlarms.length} ready`
            : 'No alarms set';

        list.innerHTML = `
            <section class="qol-building-alarm-section ready">
                <div class="qol-building-alarm-section-title">
                    <span>Available for Instant Finish</span>
                    <span class="qol-building-alarm-count">${readyAlarms.length}</span>
                </div>
                ${renderAlarmRows(readyAlarms, now, true)}
            </section>
            <section class="qol-building-alarm-section">
                <div class="qol-building-alarm-section-title">
                    <span>Set Alarms</span>
                    <span class="qol-building-alarm-count">${upcomingAlarms.length}</span>
                </div>
                ${renderAlarmRows(upcomingAlarms, now, false)}
            </section>
        `;

        bindPanelRows(list);

        if (open) {
            window.dispatchEvent(new CustomEvent(
                'qol_close_others',
                { detail: { source: FEATURE_KEY } }
            ));
            panel.style.setProperty('display', 'block', 'important');
        }
    }

    function toggleAlarmForRow(contentRow) {
        const construction = getConstructionData(contentRow);
        if (!construction) return;

        const village = getVillageData();
        const alarms = readAlarms();
        const existingIndex = matchingAlarmIndex(alarms, village, construction);
        let added = false;

        if (existingIndex >= 0) {
            alarms.splice(existingIndex, 1);
        } else {
            alarms.push({
                id: alarmId(village, construction),
                villageId: village.id,
                villageName: village.name,
                buildingName: construction.buildingName,
                levelText: construction.levelText,
                finishAt: construction.finishAt,
                alarmAt: construction.finishAt - WARNING_SECONDS,
                createdAt: getServerTimestamp(),
                triggered: false
            });
            added = true;
            primeAudio();
        }

        saveAlarms(alarms);
        syncClockStates();
        renderPanel(added);
    }

    function syncClockStates() {
        if (!isEnabled()) return;

        const alarms = readAlarms();
        const village = getVillageData();

        document.querySelectorAll('.queueContainer .detailsContent').forEach(contentRow => {
            const construction = getConstructionData(contentRow);
            const clock = contentRow.querySelector(
                '.detailsTime > i.symbol_clock_small_flat_black.duration'
            );
            if (!construction || !clock) return;

            clock.classList.add(CLOCK_CLASS);
            const active = matchingAlarmIndex(alarms, village, construction) >= 0;
            clock.classList.toggle('active', active);
            clock.setAttribute('role', 'button');
            clock.setAttribute('tabindex', '0');
            clock.setAttribute(
                'aria-label',
                active
                    ? `Remove alarm for ${construction.buildingName}`
                    : `Set alarm for ${construction.buildingName}`
            );
            clock.title = active
                ? `Alarm set for ${construction.buildingName} — click to remove`
                : `Set alarm for ${construction.buildingName} five minutes before completion`;
        });
    }

    function clearClockEnhancements() {
        document.querySelectorAll(`.${CLOCK_CLASS}`).forEach(clock => {
            clock.classList.remove(CLOCK_CLASS, 'active');
            clock.removeAttribute('role');
            clock.removeAttribute('tabindex');
            clock.removeAttribute('aria-label');
            clock.removeAttribute('title');
        });
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
            syncClockStates();
        }
    }

    function removeCapturedConstructionAlarm(captured, onlyIfReady = false) {
        if (!captured?.finishAt) return;

        const now = getServerTimestamp();
        const alarms = readAlarms();
        const remaining = alarms.filter(alarm => {
            const matches =
                String(alarm.villageId || '') === String(captured.villageId || '') &&
                Number(alarm.finishAt) === Number(captured.finishAt);

            if (!matches) return true;
            if (onlyIfReady && now < Number(alarm.alarmAt)) return true;
            return false;
        });

        if (remaining.length !== alarms.length) {
            saveAlarms(remaining);
            renderPanel();
            syncClockStates();
        }
    }

    function handleClick(event) {
        if (!isEnabled()) return;

        const clock = event.target?.closest?.(
            '.detailsTime > i.symbol_clock_small_flat_black.duration'
        );
        if (clock) {
            const contentRow = clock.closest('.detailsContent');
            if (!getConstructionData(contentRow)) return;
            event.preventDefault();
            event.stopPropagation();
            toggleAlarmForRow(contentRow);
            return;
        }

        const finishButton = event.target?.closest?.(
            'button[premium-feature="finishNow"]'
        );
        const cancelButton = event.target?.closest?.('.cancelBuilding');
        if (!finishButton && !cancelButton) return;

        const contentRow = (finishButton || cancelButton).closest('.detailsContent');
        const construction = getConstructionData(contentRow);
        if (!construction) return;

        // Capture identity before Travian removes/rebuilds the queue row.
        const village = getVillageData();
        const captured = {
            villageId: village.id,
            finishAt: construction.finishAt
        };
        const onlyIfReady = Boolean(finishButton);

        window.setTimeout(
            () => removeCapturedConstructionAlarm(captured, onlyIfReady),
            650
        );
    }

    function handleKeydown(event) {
        if (!isEnabled() || !['Enter', ' '].includes(event.key)) return;

        const clock = event.target?.closest?.(`.${CLOCK_CLASS}`);
        if (!clock) return;

        const contentRow = clock.closest('.detailsContent');
        if (!getConstructionData(contentRow)) return;

        event.preventDefault();
        event.stopPropagation();
        toggleAlarmForRow(contentRow);
    }

    function refresh() {
        if (!document.body) return;

        injectStyles();

        if (!isEnabled()) {
            document.body.classList.remove('qol-building-alarm-enabled');
            clearClockEnhancements();
            document.getElementById(PANEL_ID)?.remove();

            const toolbar = document.getElementById(TOOLBAR_BUTTON_ID);
            if (toolbar) {
                toolbar.remove();
                window.qolRepositionAllButtons?.();
            }
            return;
        }

        document.body.classList.add('qol-building-alarm-enabled');
        mountToolbarButton();
        mountPanel();
        syncClockStates();
        processAlarms();
    }

    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown, true);

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key === FEATURE_KEY) refresh();
    });

    window.addEventListener('qol_close_others', event => {
        if (event.detail?.source !== FEATURE_KEY) {
            document
                .getElementById(PANEL_ID)
                ?.style.setProperty('display', 'none', 'important');
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refresh, { once: true });
    } else {
        refresh();
    }

    window.setInterval(refresh, REFRESH_MS);
}

initBuildingAlarm();
