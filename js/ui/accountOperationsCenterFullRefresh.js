(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  if (!A || !D || A.__fullRefreshV1) return;
  A.__fullRefreshV1 = true;

  const LOCK_ID = 'apes-aoc-full-refresh-lock';
  const VILLAGE_TIMEOUT_MS = 7000;
  const SETTLE_MS = 280;
  let scanning = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function currentSnapshotVillage(id) {
    return (D.snapshot?.villages || []).find(village => String(village?.villageId || '') === String(id)) || null;
  }

  function esc(value) {
    return D.esc ? D.esc(value) : String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  }

  function ensureLock() {
    let lock = document.getElementById(LOCK_ID);
    if (lock) return lock;

    lock = document.createElement('div');
    lock.id = LOCK_ID;
    lock.setAttribute('role', 'status');
    lock.setAttribute('aria-live', 'polite');
    lock.setAttribute('aria-busy', 'true');
    lock.innerHTML = `
      <div class="apes-aoc-refresh-card">
        <div class="apes-aoc-refresh-spinner"></div>
        <strong>Refreshing Account Operations Center</strong>
        <span class="apes-aoc-refresh-status">Preparing account scan…</span>
        <small class="apes-aoc-refresh-progress"></small>
      </div>
    `;

    const style = document.createElement('style');
    style.id = `${LOCK_ID}-styles`;
    style.textContent = `
      #${LOCK_ID}{position:fixed!important;inset:0!important;z-index:2147483646!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(0,0,0,.76)!important;backdrop-filter:blur(2px)!important;cursor:wait!important;user-select:none!important;pointer-events:auto!important;font-family:Arial,sans-serif!important}
      #${LOCK_ID} .apes-aoc-refresh-card{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:8px!important;min-width:310px!important;max-width:min(520px,80vw)!important;padding:22px 28px!important;border:1px solid rgba(207,176,91,.7)!important;border-radius:7px!important;background:linear-gradient(180deg,rgba(43,50,32,.99),rgba(18,23,17,.995))!important;box-shadow:0 18px 60px rgba(0,0,0,.65)!important;color:#f5e8bf!important;text-align:center!important}
      #${LOCK_ID} .apes-aoc-refresh-spinner{width:28px!important;height:28px!important;border:3px solid rgba(230,213,161,.22)!important;border-top-color:#d5bd70!important;border-radius:50%!important;animation:apesAocRefreshSpin .8s linear infinite!important}
      #${LOCK_ID} strong{font-size:14px!important;color:#fff0c5!important}
      #${LOCK_ID} .apes-aoc-refresh-status{font-size:11px!important;font-weight:700!important;color:#e0d5b8!important}
      #${LOCK_ID} .apes-aoc-refresh-progress{font-size:9px!important;color:rgba(233,224,197,.62)!important}
      @keyframes apesAocRefreshSpin{to{transform:rotate(360deg)}}
    `;
    if (!document.getElementById(style.id)) document.head.appendChild(style);

    const block = event => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    ['pointerdown','pointermove','pointerup','mousedown','mouseup','click','dblclick','contextmenu','wheel','touchstart','touchmove','touchend','keydown'].forEach(name => {
      lock.addEventListener(name, block, { capture: true, passive: false });
    });

    document.body.appendChild(lock);
    return lock;
  }

  function updateLock(status, current = 0, total = 0, detail = '') {
    const lock = ensureLock();
    const statusNode = lock.querySelector('.apes-aoc-refresh-status');
    const progressNode = lock.querySelector('.apes-aoc-refresh-progress');
    if (statusNode) statusNode.textContent = status;
    if (progressNode) progressNode.textContent = total ? `${current} / ${total}${detail ? ` · ${detail}` : ''}` : detail;
  }

  function hideLock() {
    document.getElementById(LOCK_ID)?.remove();
  }

  function resourceBarReady() {
    return Boolean(
      document.querySelector('#resourceBar .stockContainer.wood .progressbar') &&
      document.querySelector('#resourceBar .stockContainer.crop .progressbar')
    );
  }

  async function waitForVillage(id, timeout = VILLAGE_TIMEOUT_MS) {
    const started = Date.now();
    let matchedAt = 0;

    while (Date.now() - started < timeout) {
      A.controller?.request?.();
      const active = String(D.snapshot?.activeVillageId || '');
      const hashVillage = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
      const ready = active === String(id) && hashVillage === String(id) && resourceBarReady();

      if (ready) {
        if (!matchedAt) matchedAt = Date.now();
        if (Date.now() - matchedAt >= SETTLE_MS) return true;
      } else {
        matchedAt = 0;
      }
      await sleep(90);
    }
    return false;
  }

  async function visitVillage(village, index, total) {
    const id = String(village?.villageId || '');
    if (!/^\d+$/.test(id)) return false;

    updateLock(`Scanning ${village?.name || `Village ${index + 1}`}…`, index + 1, total, 'Resources · buildings · training state');

    const target = `#/page:village/villId:${id}`;
    const currentActive = String(D.snapshot?.activeVillageId || '');
    const currentHashVillage = String(location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1] || '';
    if (currentActive !== id || currentHashVillage !== id || !document.getElementById('villageView')) {
      location.hash = target;
    }

    const ready = await waitForVillage(id);
    if (!ready) return false;

    // Capture twice: the first pass records the rendered village immediately; the
    // second catches late quick-link/building DOM updates without adding much delay.
    D.captureCurrent?.();
    A.controller?.request?.();
    await sleep(170);
    D.captureCurrent?.();
    return true;
  }

  async function fullRefresh() {
    if (scanning) return;
    scanning = true;

    const button = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-refresh`);
    const originalText = button?.textContent || 'Refresh';
    const originalHash = String(location.hash || '');
    const villages = [...(D.snapshot?.villages || [])];
    let completed = 0;
    let failed = 0;

    try {
      if (!villages.length) {
        updateLock('Reading account villages…');
        A.controller?.request?.();
        await sleep(500);
        villages.push(...(D.snapshot?.villages || []));
      }

      if (!villages.length) throw new Error('No villages found in the current account snapshot.');

      if (button) {
        button.textContent = 'Scanning…';
        button.setAttribute('aria-disabled', 'true');
      }

      ensureLock();
      for (let index = 0; index < villages.length; index += 1) {
        const ok = await visitVillage(villages[index], index, villages.length);
        if (ok) completed += 1;
        else failed += 1;
      }

      updateLock('Finalizing account data…', villages.length, villages.length, failed ? `${failed} village${failed === 1 ? '' : 's'} timed out` : 'All villages captured');
      A.controller?.request?.();
      await sleep(250);

      if (originalHash && location.hash !== originalHash) {
        location.hash = originalHash;
        await sleep(220);
        A.controller?.request?.();
      }

      D.captureCurrent?.();
      A.rendering?.forceRender?.('full-account-refresh');
      A.rendering?.render?.(true);
      await sleep(350);

      if (button?.isConnected) button.textContent = failed ? `Refreshed ${completed}/${villages.length}` : `Refreshed ${completed}`;
      await sleep(900);
    } catch (error) {
      console.warn('[APES AOC] Full account refresh failed.', error);
      updateLock('Refresh stopped', completed, villages.length, error?.message || 'Unexpected error');
      await sleep(1100);
    } finally {
      hideLock();
      if (button?.isConnected) {
        button.textContent = originalText;
        button.removeAttribute('aria-disabled');
      }
      scanning = false;
      A.controller?.request?.();
      A.rendering?.forceRender?.('full-account-refresh-finished');
    }
  }

  function normalizeLabel(text) {
    return String(text || '').toLowerCase().replace(/\b\d+\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  }

  function inferredBuildingType(node) {
    const text = normalizeLabel(node?.textContent);
    if (!text) return null;
    const aliases = [
      ...(D.TRACKED || []),
      ...Object.entries(D.BUILDINGS || {}).map(([type, label]) => ({ type: Number(type), label }))
    ];
    const match = aliases.find(entry => {
      const label = normalizeLabel(entry.label);
      return label && (text === label || text.startsWith(label) || label.startsWith(text));
    });
    return match ? Number(match.type) : null;
  }

  function resolveBuildingLocation(node) {
    const villageId = String(node?.dataset?.buildingVillageId || '');
    const direct = Number(node?.dataset?.buildingLocation);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const type = inferredBuildingType(node);
    const scan = D.scanFor?.(villageId);
    if (Number.isFinite(type)) {
      const scanned = (scan?.buildings || []).find(entry => Number(entry?.type) === type);
      const scannedLocation = Number(scanned?.location);
      if (Number.isFinite(scannedLocation) && scannedLocation > 0) return scannedLocation;

      const village = currentSnapshotVillage(villageId);
      const model = (village?.buildings || []).find(entry => Number(entry?.buildingType) === type);
      const modelLocation = Number(model?.locationId);
      if (Number.isFinite(modelLocation) && modelLocation > 0) return modelLocation;
    }

    // Final fallback: match by visible label in the scan, useful for custom tracked lists.
    const label = normalizeLabel(node?.textContent);
    const scannedByLabel = (scan?.buildings || []).find(entry => normalizeLabel(entry?.label) && label.startsWith(normalizeLabel(entry.label)));
    const fallback = Number(scannedByLabel?.location);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : null;
  }

  function openBuildingFromNode(node) {
    const villageId = String(node?.dataset?.buildingVillageId || '');
    if (!/^\d+$/.test(villageId)) return false;
    const locationId = resolveBuildingLocation(node);
    if (!Number.isFinite(locationId)) {
      console.warn('[APES AOC] Could not resolve building location for shortcut.', { villageId, text: node?.textContent });
      return false;
    }

    A.controller?.close?.();
    location.hash = `#/page:village/villId:${villageId}/location:${locationId}/window:building`;
    return true;
  }

  document.addEventListener('click', event => {
    const overlay = event.target.closest?.(`#${D.OVERLAY_ID}`);
    if (!overlay) return;

    const refresh = event.target.closest?.('.apes-aoc2-refresh');
    if (refresh) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      fullRefresh();
      return;
    }

    const building = event.target.closest?.('[data-building-village-id]');
    if (building) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openBuildingFromNode(building);
    }
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const refresh = event.target.closest?.(`#${D.OVERLAY_ID} .apes-aoc2-refresh`);
    const building = event.target.closest?.(`#${D.OVERLAY_ID} [data-building-village-id]`);
    if (!refresh && !building) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (refresh) fullRefresh();
    else openBuildingFromNode(building);
  }, true);

  window.APES_AOC_FULL_REFRESH = Object.freeze({
    version: 1,
    run: fullRefresh,
    isRunning: () => scanning,
    resolveBuildingLocation
  });
})();
