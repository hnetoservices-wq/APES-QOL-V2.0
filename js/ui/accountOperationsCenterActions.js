(() => {
  'use strict';

  const A = window.APES_AOC_INTERNAL;
  const D = A?.data;
  if (!D) return;

  const X = A.actions = {};
  const TOOLS = [
    ['qol-rally-point-toggle-btn', 'rallyPointParser', 'Rally Point Scanner'],
    ['qol-roadmaps-toggle-btn', 'roadmaps', 'Roadmaps'],
    ['qol-building-alarm-toggle-btn', 'buildingAlarm', 'Building Alarms'],
    ['qol-npc-calc-toggle-btn', 'npcCalculator', 'NPC Calculator'],
    ['qol-resource-planner-toggle-btn', 'resourceUpgradePlanner', 'Resource Upgrade Planner'],
    ['qol-distance-calc-toggle-btn', 'distanceCalculator', 'Distance & Arrival Calculator'],
    ['qol-watchlist-toggle', 'watchlist', 'Watchlists'],
    ['qol-report-archive-toggle', 'reportArchive', 'Report Archive'],
    ['qol-cp-toggle-btn', 'cpManager', 'CP Manager'],
    ['qol-oasis-toggle-btn', 'oasisScanner', 'Oasis Scanner'],
    ['qol-ss-scanner-toggle-btn', 'secretSocietyScanner', 'Secret Society Scanner']
  ].map(([id, key, label]) => ({ id, key, label }));

  let dragged = '';
  const featureEnabled = key => typeof window.isQolEnabled === 'function'
    ? window.isQolEnabled(key) === true
    : localStorage.getItem(`qol_${key}`) !== 'false';
  const orderKey = () => `apes_aoc_tool_order:${location.hostname}`;

  function order() {
    const ids = TOOLS.map(tool => tool.id);
    try {
      const persisted = JSON.parse(localStorage.getItem(orderKey()) || '[]');
      return Array.isArray(persisted)
        ? [...persisted.filter(id => ids.includes(id)), ...ids.filter(id => !persisted.includes(id))]
        : ids;
    } catch (_) {
      return ids;
    }
  }

  function save(ids) {
    try { localStorage.setItem(orderKey(), JSON.stringify(ids)); } catch (_) {}
  }

  X.renderTools = () => {
    const target = document.querySelector(`#${D.OVERLAY_ID} .apes-aoc2-tools-list`);
    if (!target) return;
    const map = new Map(TOOLS.map(tool => [tool.id, tool]));
    const tools = order().map(id => map.get(id)).filter(tool => tool && featureEnabled(tool.key) && document.getElementById(tool.id));
    target.innerHTML = tools.length
      ? tools.map(tool => `<div class="apes-aoc2-tool apes-aoc2-control" role="button" tabindex="0" draggable="true" data-tool-id="${D.esc(tool.id)}"><i>⋮⋮</i><span>${D.esc(tool.label)}</span><b>›</b></div>`).join('')
      : '<span class="apes-aoc2-side-empty">No enabled toolbar tools detected.</span>';
  };

  function reorder(from, to) {
    if (!from || !to || from === to) return;
    const ids = order().filter(id => id !== from);
    const index = ids.indexOf(to);
    ids.splice(index < 0 ? ids.length : index, 0, from);
    save(ids);
    X.renderTools();
  }

  function route(extra) {
    const id = D.currentVillageId();
    return `#/page:village${/^\d+$/.test(id) ? `/villId:${id}` : ''}${extra ? `/${extra}` : ''}`;
  }

  function clickNative(selectors, words = []) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        element.click();
        return true;
      }
    }
    const query = words.map(word => word.toLowerCase());
    const element = [...document.querySelectorAll('a,button,[role="button"],[clickable],[ng-click]')].find(candidate => {
      if (candidate.closest(`#${D.OVERLAY_ID}`)) return false;
      const rect = candidate.getBoundingClientRect();
      const text = [
        candidate.textContent,
        candidate.title,
        candidate.getAttribute('aria-label'),
        candidate.getAttribute('tooltip'),
        candidate.getAttribute('tooltip-translate'),
        candidate.getAttribute('clickable'),
        candidate.id,
        candidate.className
      ].filter(Boolean).join(' ').toLowerCase();
      return rect.width > 0 && rect.height > 0 && query.some(word => text.includes(word));
    });
    if (element) {
      element.click();
      return true;
    }
    return false;
  }

  X.quick = action => {
    // Quick Access is navigation, not a stacked APES tool. Close the AOC first so
    // the destination is immediately visible and native Travian controls can open cleanly.
    A.controller?.close?.();

    if (action === 'hero') location.hash = route('window:hero/herotab:Inventory');
    else if (action === 'rally') location.hash = route('location:32/window:building/cp:1');
    else if (action === 'chat') clickNative(['#jsQuestButtonIgm'], ['igm', 'chat', 'message']);
    else if (action === 'statistics') clickNative(['#jsQuestButtonStatistics'], ['statistics']);
    else if (action === 'auction') clickNative(['#subNavigation a.silver.subButton', '[clickable*="Auctions" i]'], ['auctions', 'silver']);
    else if (action === 'quests') clickNative(['#jsQuestButtonQuestbook'], ['questbook', 'quest book']);
  };

  X.bind = overlay => {
    overlay.querySelector('.apes-aoc2-close').onclick = () => A.controller?.close?.();
    overlay.querySelector('.apes-aoc2-refresh').onclick = () => {
      D.captureCurrent();
      A.controller?.request?.();
    };

    overlay.onclick = event => {
      if (event.target === overlay) return A.controller?.close?.();

      const quick = event.target.closest('[data-quick]');
      if (quick) return X.quick(quick.dataset.quick);

      const eventItem = event.target.closest('[data-event-village-id]');
      if (eventItem) return A.controller?.openVillage?.(eventItem.dataset.eventVillageId);

      const building = event.target.closest('[data-building-village-id]');
      if (building) return A.controller?.openBuilding?.(building.dataset.buildingVillageId, building.dataset.buildingLocation);

      const village = event.target.closest('[data-village-id]');
      if (village) return A.controller?.openVillage?.(village.dataset.villageId);

      const tool = event.target.closest('[data-tool-id]');
      if (tool) return document.getElementById(tool.dataset.toolId)?.click();

      const expand = event.target.closest('[data-expand-village-id]');
      if (expand) return A.rendering?.toggleExpanded?.(expand.dataset.expandVillageId);

      const row = event.target.closest('[data-row-village-id]');
      if (row && !event.target.closest('input,select')) return A.rendering?.toggleExpanded?.(row.dataset.rowVillageId);
    };

    overlay.addEventListener('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      const control = event.target.closest?.('.apes-aoc2-control,[data-event-village-id]');
      if (!control) return;
      event.preventDefault();
      control.click();
    });

    overlay.ondragstart = event => {
      const tool = event.target.closest('[data-tool-id]');
      if (!tool) return;
      dragged = tool.dataset.toolId;
      tool.classList.add('dragging');
      event.dataTransfer?.setData('text/plain', dragged);
    };

    overlay.ondragend = event => {
      event.target.closest('[data-tool-id]')?.classList.remove('dragging');
      dragged = '';
    };

    overlay.ondragover = event => {
      if (event.target.closest('[data-tool-id]')) event.preventDefault();
    };

    overlay.ondrop = event => {
      const tool = event.target.closest('[data-tool-id]');
      if (!tool) return;
      event.preventDefault();
      reorder(dragged || event.dataTransfer?.getData('text/plain'), tool.dataset.toolId);
    };
  };
})();
