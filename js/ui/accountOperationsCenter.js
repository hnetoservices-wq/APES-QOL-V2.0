(() => {
  'use strict';

  const APES = window.APES;
  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  const R = A?.rendering;
  if (!APES?.ui || !A || !D || !R) return;

  const REFRESH_MS = 2500;
  const COUNTDOWN_MS = 1000;
  let refreshTimer = null;
  let countdownTimer = null;
  let captureTimer = null;
  let pendingRender = false;
  let suspendDepth = 0;

  function enabled() {
    try {
      return localStorage.getItem(`qol_${D.SETTING_KEY}`) !== 'false';
    } catch (_) {
      return true;
    }
  }

  function isSuspended() {
    return suspendDepth > 0;
  }

  function requestSnapshot() {
    if (isSuspended()) return;
    window.postMessage({ source: D.UI_SOURCE, type: D.REQUEST_TYPE }, location.origin);
  }

  function isOpen() {
    return document.getElementById(D.OVERLAY_ID)?.classList.contains('open') || false;
  }

  function tableIsBeingUsed() {
    const table = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-table-scroll`);
    return Boolean(table?.matches?.(':hover'));
  }

  function renderOrDefer() {
    if (!isOpen() || isSuspended()) return;
    if (tableIsBeingUsed()) {
      pendingRender = true;
      R.updateCountdowns?.();
      return;
    }
    pendingRender = false;
    R.render();
  }

  function flushDeferredRender() {
    if (!isOpen() || isSuspended() || !pendingRender || tableIsBeingUsed()) return;
    pendingRender = false;
    R.render();
  }

  function bindInteractionGuard() {
    const table = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-table-scroll`);
    if (!table || table.dataset.apesAocRefreshGuard === '1') return;
    table.dataset.apesAocRefreshGuard = '1';
    table.addEventListener('pointerleave', () => {
      if (!pendingRender) return;
      requestAnimationFrame(flushDeferredRender);
    });
  }

  function stopTimers() {
    if (refreshTimer !== null) clearInterval(refreshTimer);
    if (countdownTimer !== null) clearInterval(countdownTimer);
    refreshTimer = null;
    countdownTimer = null;
  }

  function startTimers() {
    stopTimers();
    if (isSuspended()) return;
    refreshTimer = window.setInterval(requestSnapshot, REFRESH_MS);
    countdownTimer = window.setInterval(() => R.updateCountdowns?.(), COUNTDOWN_MS);
  }

  function scheduleCapture(delay = 450) {
    if (isSuspended()) return;
    if (captureTimer !== null) clearTimeout(captureTimer);
    captureTimer = window.setTimeout(() => {
      captureTimer = null;
      if (isSuspended()) return;
      D.captureCurrent?.();
      renderOrDefer();
    }, delay);
  }

  function suspend() {
    suspendDepth += 1;
    stopTimers();
    if (captureTimer !== null) clearTimeout(captureTimer);
    captureTimer = null;
    pendingRender = false;
    return suspendDepth;
  }

  function resume() {
    if (suspendDepth > 0) suspendDepth -= 1;
    if (suspendDepth > 0) return suspendDepth;
    suspendDepth = 0;
    if (isOpen()) {
      window.postMessage({ source: D.UI_SOURCE, type: D.REQUEST_TYPE }, location.origin);
      scheduleCapture(180);
      R.render();
      bindInteractionGuard();
      startTimers();
    }
    return 0;
  }

  function open() {
    if (!enabled()) return;
    APES.ui.closeOtherTools?.('accountOperationsCenter');
    const overlay = R.mount();
    bindInteractionGuard();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    if (!isSuspended()) {
      requestSnapshot();
      scheduleCapture(200);
      R.render();
      startTimers();
    }
  }

  function close() {
    stopTimers();
    pendingRender = false;
    const overlay = document.getElementById(D.OVERLAY_ID);
    overlay?.classList.remove('open');
    overlay?.setAttribute('aria-hidden', 'true');
  }

  function toggle() {
    isOpen() ? close() : open();
  }

  function openVillage(villageId) {
    const id = String(villageId || '');
    if (!/^\d+$/.test(id)) return;
    close();
    location.hash = `#/page:village/villId:${id}`;
  }

  function openBuilding(villageId, locationId) {
    const village = String(villageId || '');
    const location = String(locationId || '');
    if (!/^\d+$/.test(village) || !/^\d+$/.test(location)) return;
    close();
    location.hash = `#/page:village/villId:${village}/location:${location}/window:building`;
  }

  function syncMenuLabel() {
    const checkbox = document.getElementById('qol-chk-village-palette');
    const row = checkbox?.closest('.qol-keybind-item');
    const label = row?.querySelector('.qol-keybind-action');
    if (label && label.textContent !== 'Account Operations Center') {
      label.textContent = 'Account Operations Center';
    }
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== D.BRIDGE_SOURCE || event.data?.type !== D.RESPONSE_TYPE) return;
    if (!event.data?.payload || typeof event.data.payload !== 'object') return;

    const previousPlayer = D.snapshot?.playerId;
    D.snapshot = event.data.payload;
    if (String(previousPlayer ?? '') !== String(D.snapshot?.playerId ?? '')) D.resetScanCache?.();
    if (isSuspended()) return;
    scheduleCapture(180);
    renderOrDefer();
  });

  window.addEventListener('keydown', event => {
    const isH = event.code === 'KeyH' || String(event.key || '').toLowerCase() === 'h';
    if (!isH || !enabled() || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
    if (APES.ui.isTypingTarget?.(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) toggle();
  }, true);

  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);

  window.addEventListener('hashchange', () => {
    if (isSuspended()) return;
    requestSnapshot();
    scheduleCapture(650);
  });

  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === D.SETTING_KEY && !event.detail?.enabled) close();
    if (isOpen() && !isSuspended()) {
      A.actions?.renderTools?.();
      renderOrDefer();
    }
  });

  const menuObserver = new MutationObserver(syncMenuLabel);
  menuObserver.observe(document.documentElement, { childList: true, subtree: true });

  const api = Object.freeze({
    open,
    close,
    toggle,
    refresh: requestSnapshot,
    request: requestSnapshot,
    suspend,
    resume,
    isSuspended,
    captureCurrentVillage: () => D.captureCurrent?.(),
    openVillage,
    openBuilding,
    getVillages: () => (D.snapshot?.villages || []).map(village => ({ ...village }))
  });

  A.controller = api;
  window.APES_ACCOUNT_OPERATIONS_CENTER = api;
  window.APES_VILLAGE_PALETTE = api;

  R.mount();
  bindInteractionGuard();
  syncMenuLabel();
  requestSnapshot();
  scheduleCapture(900);
})();
