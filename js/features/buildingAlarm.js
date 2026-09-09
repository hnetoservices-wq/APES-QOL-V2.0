function initBuildingAlarm() {
  'use strict';

  const FEATURE_KEY = 'buildingAlarm';
  const STORAGE_KEY = 'qol_building_alarms';
  const STATUS_ID = 'qol-building-alarm-status';
  const LEGACY_PANEL_ID = 'qol-building-alarm-panel';
  const LEGACY_TOOLBAR_BUTTON_ID = 'qol-building-alarm-toggle-btn';
  const STYLE_ID = 'qol-building-alarm-styles';
  const CLOCK_CLASS = 'qol-building-alarm-native-clock';
  const WARNING_SECONDS = 5 * 60;
  const REFRESH_MS = 500;
  let audioContext = null;

  function isEnabled() {
    if (typeof window.isQolEnabled === 'function') return window.isQolEnabled(FEATURE_KEY) === true;
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
    const serverClock = document.querySelector('span[i18ndt][full="true"]') || document.querySelector('#servertime[i18ndt], #servertime');
    const value = Number(serverClock?.getAttribute('i18ndt'));
    return Number.isFinite(value) ? value : Date.now() / 1000;
  }

  function getVillageData() {
    const villageElement = document.querySelector('.currentVillageName .selectedItem .villageEntry')
      || document.querySelector('.villageEntry.active')
      || document.querySelector('.active .villageEntry')
      || document.querySelector('.currentVillageName .villageEntry');
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
    const finishAt = Number(countdown?.getAttribute('countdown') || progress?.getAttribute('finish-time'));
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
    return [village.id || village.name, construction.finishAt, construction.buildingName, construction.levelText].join(':');
  }

  function matchingAlarmIndex(alarms, village, construction) {
    const exactId = alarmId(village, construction);
    const exactIndex = alarms.findIndex(alarm => alarm.id === exactId);
    if (exactIndex >= 0) return exactIndex;
    return alarms.findIndex(alarm =>
      String(alarm.villageId || '') === String(village.id || '')
      && Number(alarm.finishAt) === Number(construction.finishAt)
    );
  }

  function formatCountdown(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return [hours, minutes, secs].map(value => String(value).padStart(2, '0')).join(':');
  }

  function formatHumanCountdown(seconds) {
    const total = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (total < 60) return 'less than a minute';
    if (total < 3600) {
      const minutes = Math.ceil(total / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
    if (total < 86400) {
      const hours = Math.floor(total / 3600);
      const minutes = Math.ceil((total % 3600) / 60);
      return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }

  function getLevelTransition(alarm) {
    const name = String(alarm.buildingName || 'Construction').trim();
    const levels = String(alarm.levelText || '').match(/\d+/g) || [];
    if (levels.length >= 2) {
      return { from: `${name} ${levels[0]}`, to: `${name} ${levels.at(-1)}` };
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

      #${STATUS_ID},#${STATUS_ID} *{box-sizing:border-box!important;font-family:Arial,sans-serif!important;text-shadow:none!important}
      #${STATUS_ID}{position:fixed!important;z-index:9998!important;display:none!important;width:176px!important;height:28px!important;color:#f8f2e7!important;user-select:none!important}
      #${STATUS_ID} .qol-building-alarm-status-main{display:flex!important;align-items:center!important;gap:6px!important;width:100%!important;height:28px!important;padding:0 8px!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:4px!important;background:linear-gradient(to bottom,#665137,#4b3927)!important;box-shadow:0 2px 5px rgba(0,0,0,.28)!important;cursor:default!important;outline:none!important}
      #${STATUS_ID}.idle .qol-building-alarm-status-main{background:linear-gradient(to bottom,#554a3c,#40382f)!important;color:#d7ccbd!important}
      #${STATUS_ID}.upcoming .qol-building-alarm-status-main{background:linear-gradient(to bottom,#766038,#594724)!important;color:#fff4cf!important}
      #${STATUS_ID}.ready .qol-building-alarm-status-main{background:linear-gradient(to bottom,#58723a,#3c5627)!important;color:#f1ffe5!important;box-shadow:0 0 0 1px rgba(150,190,98,.28),0 2px 5px rgba(0,0,0,.3)!important}
      #${STATUS_ID} .qol-building-alarm-status-icon{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 16px!important;width:16px!important;height:16px!important}
      #${STATUS_ID} .qol-building-alarm-status-icon svg{display:block!important;width:15px!important;height:15px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      #${STATUS_ID} .qol-building-alarm-status-text{overflow:hidden!important;flex:1 1 auto!important;font-size:9.5px!important;font-weight:bold!important;line-height:1!important;text-overflow:ellipsis!important;white-space:nowrap!important}

      #${STATUS_ID} .qol-building-alarm-popover{position:absolute!important;top:34px!important;right:0!important;width:430px!important;max-width:min(430px,calc(100vw - 16px))!important;max-height:min(360px,calc(100vh - 90px))!important;border:2px solid var(--qol-border,#6b5334)!important;border-radius:5px!important;background:#f7f5f0!important;box-shadow:0 10px 28px rgba(0,0,0,.42)!important;color:#3e3021!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateY(-4px)!important;transition:opacity .12s ease,transform .12s ease,visibility .12s ease!important;overflow:hidden!important}
      #${STATUS_ID}:hover .qol-building-alarm-popover,#${STATUS_ID}:focus-within .qol-building-alarm-popover{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:translateY(0)!important}
      #${STATUS_ID} .qol-building-alarm-popover-header{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:31px!important;padding:6px 9px!important;background:linear-gradient(to bottom,var(--qol-accent-mid,#705839),var(--qol-accent-dark,#4c3926))!important;color:#fffaf0!important;font-size:10px!important;font-weight:bold!important}
      #${STATUS_ID} .qol-building-alarm-popover-summary{color:#dbcdb9!important;font-size:8.5px!important;font-weight:normal!important}
      #${STATUS_ID} .qol-building-alarm-popover-body{max-height:325px!important;overflow-y:auto!important;overscroll-behavior:contain!important;scrollbar-width:thin!important;scrollbar-color:var(--qol-scroll-thumb,#8a765e) #e7ded1!important}
      #${STATUS_ID} .qol-building-alarm-popover-body::-webkit-scrollbar{width:8px!important}
      #${STATUS_ID} .qol-building-alarm-popover-body::-webkit-scrollbar-track{background:#e7ded1!important}
      #${STATUS_ID} .qol-building-alarm-popover-body::-webkit-scrollbar-thumb{border:2px solid #e7ded1!important;border-radius:5px!important;background:var(--qol-scroll-thumb,#8a765e)!important}
      #${STATUS_ID} .qol-building-alarm-group-title{display:flex!important;align-items:center!important;justify-content:space-between!important;min-height:26px!important;padding:5px 9px!important;border-top:1px solid #d7ccbc!important;border-bottom:1px solid #d7ccbc!important;background:#eee6da!important;color:#5e4a31!important;font-size:8.5px!important;font-weight:bold!important;text-transform:uppercase!important;letter-spacing:.25px!important}
      #${STATUS_ID} .qol-building-alarm-group-title.ready{background:#eaf2df!important;color:#416923!important}
      #${STATUS_ID} .qol-building-alarm-badge{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:18px!important;height:18px!important;padding:0 5px!important;border-radius:9px!important;background:rgba(90,66,39,.12)!important;color:inherit!important;font-size:8px!important}
      #${STATUS_ID} .qol-building-alarm-hover-row{display:grid!important;grid-template-columns:minmax(95px,1fr) minmax(145px,1.5fr) minmax(105px,.9fr) 20px!important;align-items:center!important;gap:7px!important;min-height:39px!important;padding:6px 8px!important;border-bottom:1px solid #e3dbd0!important;background:#fff!important}
      #${STATUS_ID} .qol-building-alarm-hover-row.ready{background:#f5faef!important}
      #${STATUS_ID} .qol-building-alarm-hover-row:last-child{border-bottom:0!important}
      #${STATUS_ID} .qol-building-alarm-hover-village{overflow:hidden!important;color:#5a4227!important;font-size:9px!important;font-weight:bold!important;text-overflow:ellipsis!important;white-space:nowrap!important;cursor:pointer!important}
      #${STATUS_ID} .qol-building-alarm-hover-village:hover{text-decoration:underline!important}
      #${STATUS_ID} .qol-building-alarm-hover-building{overflow:hidden!important;color:#4a3b2a!important;font-size:9px!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      #${STATUS_ID} .qol-building-alarm-hover-time{text-align:right!important;color:#6b5942!important;font-family:Consolas,monospace!important;font-size:8.5px!important;line-height:1.25!important}
      #${STATUS_ID} .qol-building-alarm-hover-row.ready .qol-building-alarm-hover-time{color:#416923!important;font-weight:bold!important}
      #${STATUS_ID} .qol-building-alarm-hover-remove{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:18px!important;height:18px!important;border-radius:3px!important;color:#9a3b32!important;font-size:15px!important;cursor:pointer!important}
      #${STATUS_ID} .qol-building-alarm-hover-remove:hover{background:#f5dfdc!important}
      #${STATUS_ID} .qol-building-alarm-hover-empty{padding:14px 10px!important;color:#83725d!important;background:#fff!important;font-size:9px!important;text-align:center!important}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function cleanupLegacyUi() {
    document.getElementById(LEGACY_PANEL_ID)?.remove();
    const toolbar = document.getElementById(LEGACY_TOOLBAR_BUTTON_ID);
    if (toolbar) {
      toolbar.remove();
      window.qolRepositionAllButtons?.();
    }
  }

  function mountStatusBox() {
    let root = document.getElementById(STATUS_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = STATUS_ID;
    root.className = 'idle';
    root.innerHTML = `
      <div class="qol-building-alarm-status-main" tabindex="0" role="status" aria-live="polite">
        <span class="qol-building-alarm-status-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7"></circle><path d="M12 9v4l2.7 1.6M7 3 4 6m13-3 3 3M9 21h6"></path></svg>
        </span>
        <span class="qol-building-alarm-status-text">No Free Finish Ready</span>
      </div>
      <div class="qol-building-alarm-popover" role="tooltip">
        <div class="qol-building-alarm-popover-header">
          <span>Building Alarms</span>
          <span class="qol-building-alarm-popover-summary">No alarms set</span>
        </div>
        <div class="qol-building-alarm-popover-body"></div>
      </div>
    `;

    root.addEventListener('click', event => {
      const remove = event.target.closest('.qol-building-alarm-hover-remove');
      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        const id = remove.closest('[data-alarm-id]')?.dataset.alarmId;
        if (!id) return;
        saveAlarms(readAlarms().filter(alarm => alarm.id !== id));
        syncClockStates();
        renderStatus();
        return;
      }

      const village = event.target.closest('.qol-building-alarm-hover-village');
      if (village) {
        event.preventDefault();
        event.stopPropagation();
        const id = village.dataset.villageId;
        if (id) location.hash = `#/page:village/villId:${id}`;
      }
    });

    document.body.appendChild(root);
    return root;
  }

  function positionStatusBox() {
    const root = document.getElementById(STATUS_ID);
    if (!root) return;
    const target = document.querySelector('#heroQuickInfo .heroStats');
    if (!target) {
      root.style.setProperty('display', 'none', 'important');
      return;
    }
    const rect = target.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      root.style.setProperty('display', 'none', 'important');
      return;
    }
    root.style.setProperty('display', 'block', 'important');
    const width = root.offsetWidth || 176;
    const left = Math.max(8, Math.round(rect.left - width - 8));
    const top = Math.max(8, Math.round(rect.top));
    root.style.setProperty('left', `${left}px`, 'important');
    root.style.setProperty('top', `${top}px`, 'important');
  }

  function renderHoverRows(alarms, now, ready) {
    if (!alarms.length) {
      return `<div class="qol-building-alarm-hover-empty">${ready ? 'No buildings are currently ready for free instant finish.' : 'No upcoming building alarms are set.'}</div>`;
    }
    return alarms.map(alarm => {
      const transition = getLevelTransition(alarm);
      const time = ready
        ? `Ready<br>${escapeHtml(formatCountdown(Number(alarm.finishAt) - now))} left`
        : `In ${escapeHtml(formatCountdown(Number(alarm.alarmAt) - now))}`;
      return `
        <div class="qol-building-alarm-hover-row${ready ? ' ready' : ''}" data-alarm-id="${escapeHtml(alarm.id)}">
          <span class="qol-building-alarm-hover-village" data-village-id="${escapeHtml(alarm.villageId)}" title="Open ${escapeHtml(alarm.villageName)}">${escapeHtml(alarm.villageName)}</span>
          <span class="qol-building-alarm-hover-building" title="${escapeHtml(transition.from)} → ${escapeHtml(transition.to)}">${escapeHtml(transition.from)} → ${escapeHtml(transition.to)}</span>
          <span class="qol-building-alarm-hover-time">${time}</span>
          <span class="qol-building-alarm-hover-remove" role="button" tabindex="0" title="Remove alarm">&times;</span>
        </div>
      `;
    }).join('');
  }

  function renderStatus() {
    const root = mountStatusBox();
    const now = getServerTimestamp();
    const alarms = readAlarms()
      .filter(alarm => now < Number(alarm.finishAt))
      .sort((a, b) => Number(a.alarmAt) - Number(b.alarmAt));
    const readyAlarms = alarms.filter(alarm => alarm.triggered === true || now >= Number(alarm.alarmAt));
    const upcomingAlarms = alarms.filter(alarm => !readyAlarms.includes(alarm));
    const text = root.querySelector('.qol-building-alarm-status-text');
    const summary = root.querySelector('.qol-building-alarm-popover-summary');
    const body = root.querySelector('.qol-building-alarm-popover-body');

    root.classList.remove('idle', 'upcoming', 'ready');
    if (readyAlarms.length) {
      root.classList.add('ready');
      text.textContent = `${readyAlarms.length} Free Finish${readyAlarms.length === 1 ? '' : 'es'} Ready!`;
    } else if (upcomingAlarms.length) {
      root.classList.add('upcoming');
      const nextSeconds = Number(upcomingAlarms[0].alarmAt) - now;
      text.textContent = `1 Free Finish in ${formatHumanCountdown(nextSeconds)}!`;
    } else {
      root.classList.add('idle');
      text.textContent = 'No Free Finish Ready';
    }

    summary.textContent = alarms.length
      ? `${alarms.length} active · ${readyAlarms.length} ready`
      : 'No alarms set';

    body.innerHTML = `
      <div class="qol-building-alarm-group-title ready">
        <span>Ready for Free Finish</span>
        <span class="qol-building-alarm-badge">${readyAlarms.length}</span>
      </div>
      ${renderHoverRows(readyAlarms, now, true)}
      <div class="qol-building-alarm-group-title">
        <span>Set Alarms</span>
        <span class="qol-building-alarm-badge">${upcomingAlarms.length}</span>
      </div>
      ${renderHoverRows(upcomingAlarms, now, false)}
    `;

    positionStatusBox();
  }

  function toggleAlarmForRow(contentRow) {
    const construction = getConstructionData(contentRow);
    if (!construction) return;
    const village = getVillageData();
    const alarms = readAlarms();
    const existingIndex = matchingAlarmIndex(alarms, village, construction);
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
      primeAudio();
    }
    saveAlarms(alarms);
    syncClockStates();
    renderStatus();
  }

  function syncClockStates() {
    if (!isEnabled()) return;
    const alarms = readAlarms();
    const village = getVillageData();
    document.querySelectorAll('.queueContainer .detailsContent').forEach(contentRow => {
      const construction = getConstructionData(contentRow);
      const clock = contentRow.querySelector('.detailsTime > i.symbol_clock_small_flat_black.duration');
      if (!construction || !clock) return;
      clock.classList.add(CLOCK_CLASS);
      const active = matchingAlarmIndex(alarms, village, construction) >= 0;
      clock.classList.toggle('active', active);
      clock.setAttribute('role', 'button');
      clock.setAttribute('tabindex', '0');
      clock.setAttribute('aria-label', active ? `Remove alarm for ${construction.buildingName}` : `Set alarm for ${construction.buildingName}`);
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
      syncClockStates();
    }
  }

  function removeCapturedConstructionAlarm(captured, onlyIfReady = false) {
    if (!captured?.finishAt) return;
    const now = getServerTimestamp();
    const alarms = readAlarms();
    const remaining = alarms.filter(alarm => {
      const matches = String(alarm.villageId || '') === String(captured.villageId || '')
        && Number(alarm.finishAt) === Number(captured.finishAt);
      if (!matches) return true;
      if (onlyIfReady && now < Number(alarm.alarmAt)) return true;
      return false;
    });
    if (remaining.length !== alarms.length) {
      saveAlarms(remaining);
      syncClockStates();
      renderStatus();
    }
  }

  function handleClick(event) {
    if (!isEnabled()) return;
    const clock = event.target?.closest?.('.detailsTime > i.symbol_clock_small_flat_black.duration');
    if (clock) {
      const contentRow = clock.closest('.detailsContent');
      if (!getConstructionData(contentRow)) return;
      event.preventDefault();
      event.stopPropagation();
      toggleAlarmForRow(contentRow);
      return;
    }

    const finishButton = event.target?.closest?.('button[premium-feature="finishNow"]');
    const cancelButton = event.target?.closest?.('.cancelBuilding');
    if (!finishButton && !cancelButton) return;
    const contentRow = (finishButton || cancelButton).closest('.detailsContent');
    const construction = getConstructionData(contentRow);
    if (!construction) return;
    const village = getVillageData();
    const captured = { villageId: village.id, finishAt: construction.finishAt };
    const onlyIfReady = Boolean(finishButton);
    window.setTimeout(() => removeCapturedConstructionAlarm(captured, onlyIfReady), 650);
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

  function disableUi() {
    document.body?.classList.remove('qol-building-alarm-enabled');
    clearClockEnhancements();
    document.getElementById(STATUS_ID)?.remove();
    cleanupLegacyUi();
  }

  function refresh() {
    if (!document.body) return;
    injectStyles();
    cleanupLegacyUi();
    if (!isEnabled()) {
      disableUi();
      return;
    }
    document.body.classList.add('qol-building-alarm-enabled');
    mountStatusBox();
    syncClockStates();
    processAlarms();
    renderStatus();
  }

  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === FEATURE_KEY) refresh();
  });
  window.addEventListener('resize', positionStatusBox, { passive: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh, { once: true });
  } else {
    refresh();
  }

  window.setInterval(refresh, REFRESH_MS);
}

initBuildingAlarm();
