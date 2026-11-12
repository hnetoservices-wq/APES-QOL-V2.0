(() => {
  'use strict';

  const feature = 'marketplaceLayout';
  const presetKey = 'qol_marketplace_display_slot';
  const slotClass = /^buildingLocation(\d+)$/;
  const ordinarySlot = id => id >= 19 && id <= 40 && id !== 33;
  const shiftAttribute = 'data-qol-layout-shift';
  const coordinates = new Map();
  const shifted = new Set();
  let picker;
  let frame = 0;

  function getPreset() {
    try { return Number(localStorage.getItem(presetKey)); }
    catch { return 0; }
  }

  function pointList(value) {
    if (!value) return null;
    const points = value.split(',').map(Number);
    return points.length >= 6 && points.length % 2 === 0 && points.every(Number.isFinite) ? points : null;
  }

  function bounds(points, axis) {
    const values = points.filter((_, index) => index % 2 === axis);
    return [Math.min(...values), Math.max(...values)];
  }

  function readSlots(view) {
    const slots = new Map();
    for (const building of view.querySelectorAll(':scope > building-location')) {
      const marker = Array.from(building.classList).map(name => name.match(slotClass)).find(Boolean);
      const id = Number(marker?.[1]);
      if (!ordinarySlot(id) || building.querySelector('img.buildingWall, img.buildingId16')) continue;
      const areas = Array.from(view.querySelectorAll(`map#clickareasVillage area[location-id="${id}"][shape="poly"]`));
      const points = pointList(areas[0]?.getAttribute('tg-coords'));
      if (!points) continue;
      const [left, right] = bounds(points, 0);
      const [top, bottom] = bounds(points, 1);
      const status = building.querySelector('[building-status]');
      const statusX = Number.parseFloat(status?.style.left);
      const statusY = Number.parseFloat(status?.style.top);
      slots.set(id, {
        id, building, areas,
        x: Number.isFinite(statusX) ? statusX : (left + right) / 2,
        y: Number.isFinite(statusY) ? statusY : (top + bottom) / 2
      });
    }
    return slots;
  }

  function restoreArea(area, state) {
    if (area.getAttribute('coords') === state.applied) area.setAttribute('coords', state.original);
    coordinates.delete(area);
  }

  function restoreBuilding(building) {
    building.removeAttribute(shiftAttribute);
    building.style.removeProperty('--qol-layout-x');
    building.style.removeProperty('--qol-layout-y');
    shifted.delete(building);
  }

  function areaShift(area, x, y) {
    const current = area.getAttribute('coords');
    const previous = coordinates.get(area);
    // Travian can recompute coords on zoom or redraw. Always shift its latest unmodified polygon.
    const original = previous && current === previous.applied ? previous.original : current;
    const points = pointList(original);
    const template = pointList(area.getAttribute('tg-coords'));
    if (!points || !template || points.length !== template.length) return;
    const scale = [0, 1].map(axis => {
      const [start, end] = bounds(points, axis);
      const [baseStart, baseEnd] = bounds(template, axis);
      return (end - start) / (baseEnd - baseStart);
    });
    if (scale.some(value => !Number.isFinite(value) || value <= 0)) return;
    const offsets = [x * scale[0], y * scale[1]];
    const applied = points.map((value, index) => value + offsets[index % 2]).join(',');
    return { area, original, applied };
  }

  function planShift(slot, destination) {
    const x = destination.x - slot.x;
    const y = destination.y - slot.y;
    const areas = slot.areas.map(area => areaShift(area, x, y));
    return areas.every(Boolean) ? { building: slot.building, x, y, areas } : null;
  }

  function applyShift({ building, x, y, areas }) {
    building.style.setProperty('--qol-layout-x', `${x}px`);
    building.style.setProperty('--qol-layout-y', `${y}px`);
    building.setAttribute(shiftAttribute, '');
    shifted.add(building);
    for (const { area, original, applied } of areas) {
      coordinates.set(area, { original, applied });
      if (area.getAttribute('coords') !== applied) area.setAttribute('coords', applied);
    }
  }

  function getView() {
    const view = document.querySelector('#villageView:not(.wwVillage)');
    return view?.querySelector('img[usemap="#clickareasVillage"]') && !view.closest('.ng-hide') ? view : null;
  }

  function sync() {
    frame = 0;
    const enabled = window.isQolEnabled(feature);
    const view = enabled ? getView() : null;
    if (picker && picker.view !== view) closePicker();
    const preset = enabled ? getPreset() : 0;
    const slots = view && !picker && ordinarySlot(preset) ? readSlots(view) : new Map();
    const market = [...slots.values()].find(slot => slot.building.querySelector('img.location.buildingId17'));
    const target = slots.get(preset);
    const plans = market && target && market !== target
      ? [planShift(market, target), planShift(target, market)] : [];
    const pair = plans.every(Boolean) ? plans : [];
    for (const building of shifted) {
      if (!pair.some(slot => slot.building === building)) restoreBuilding(building);
    }
    for (const [area, state] of coordinates) {
      if (!pair.some(slot => slot.areas.some(entry => entry.area === area))) restoreArea(area, state);
    }
    pair.forEach(applyShift);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  function closePicker() {
    if (!picker) return;
    picker.markers.remove();
    picker.notice.remove();
    picker = null;
  }

  function openPicker(button) {
    if (!window.isQolEnabled(feature)) return;
    const view = getView();
    const feedback = button.parentElement.querySelector('[data-qol-marketplace-layout-feedback]');
    if (!view) {
      feedback.textContent = 'Open a desktop village view to choose a spot.';
      return;
    }
    const slots = readSlots(view);
    if (!slots.size) {
      feedback.textContent = 'Village slots are still loading. Try again in a moment.';
      return;
    }

    feedback.textContent = '';
    closePicker();
    const markers = document.createElement('div');
    markers.className = 'qol-marketplace-layout-markers';
    const notice = document.createElement('div');
    notice.className = 'qol-marketplace-layout-notice';
    notice.innerHTML = '<span>Choose the Marketplace’s display spot.</span>' +
      '<div class="qol-wl-action-btn secondary" role="button" tabindex="0" data-qol-layout-cancel>Cancel</div>';
    picker = { view, markers, notice };
    sync();

    for (const slot of slots.values()) {
      const marker = document.createElement('div');
      marker.className = 'qol-wl-action-btn primary qol-marketplace-layout-marker';
      marker.setAttribute('role', 'button');
      marker.tabIndex = 0;
      marker.setAttribute('aria-label', `Show Marketplace at spot ${slot.id}`);
      marker.dataset.qolLayoutSlot = slot.id;
      marker.style.left = `${slot.x}px`;
      marker.style.top = `${slot.y}px`;
      marker.textContent = slot.id;
      markers.append(marker);
    }
    view.append(markers);
    document.body.append(notice);
    document.querySelector('#qol-modal .qol-modal-close')?.click();
    markers.querySelector('[tabindex="0"]')?.focus({ preventScroll: true });
  }

  function onClick(event) {
    const control = event.target.closest?.('[data-qol-marketplace-layout], [data-qol-layout-slot], [data-qol-layout-cancel]');
    if (!control) return;
    if (control.hasAttribute('data-qol-marketplace-layout')) {
      openPicker(control);
    } else if (picker && control.hasAttribute('data-qol-layout-cancel')) {
      closePicker();
      schedule();
    } else if (picker?.markers.contains(control)) {
      try {
        localStorage.setItem(presetKey, control.dataset.qolLayoutSlot);
      } catch {
        picker.notice.querySelector('span').textContent = 'Could not save the display spot. Try again.';
        return;
      }
      closePicker();
      schedule();
    }
  }

  function onKeydown(event) {
    if (picker && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePicker();
      schedule();
      return;
    }
    const control = event.target.closest?.('[data-qol-marketplace-layout], [data-qol-layout-slot], [data-qol-layout-cancel]');
    if (!control || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) control.click();
  }

  const observer = new MutationObserver(records => {
    if (records.some(record =>
      (record.type === 'attributes'
        ? record.target.matches('#villageView, #villageView > building-location, #villageView building-location img.location, #clickareasVillage area') ||
          record.target === document.getElementById('villageView')?.closest('.villageBackground')
        : record.target.closest?.('#villageView')) ||
      [...record.addedNodes, ...record.removedNodes].some(node =>
        node.matches?.('#villageView') || node.querySelector?.('#villageView')))) schedule();
  });

  function applySetting() {
    observer.disconnect();
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeydown, true);
    if (window.isQolEnabled(feature)) {
      observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['coords', 'class'] });
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeydown, true);
    }
    schedule();
  }

  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key === feature) applySetting();
  });
  window.addEventListener('storage', event => {
    if (event.key === `qol_${feature}`) applySetting();
    else if (event.key === presetKey) schedule();
  });
  window.addEventListener('hashchange', () => {
    if (!window.isQolEnabled(feature)) return;
    closePicker();
    schedule();
  });
  applySetting();
})();
