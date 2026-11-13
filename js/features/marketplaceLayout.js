(() => {
  'use strict';

  const feature = 'marketplaceLayout';
  const presetKey = 'qol_village_layout_v1';
  const legacyKey = 'qol_marketplace_display_slot';
  const controls = '[data-qol-marketplace-layout], [data-qol-layout-slot], [data-qol-layout-action], [data-qol-layout-type]';
  const slotClass = /^buildingLocation(\d+)$/;
  const ordinarySlot = id => id >= 19 && id <= 40 && id !== 33;
  // Reference positions from the desktop village map, in its 1174 × 850 coordinate space.
  const mapPositions = [
    [245, 357], [382, 503], [188, 437], [182.5, 549], [449.5, 414],
    [396, 301], [509.5, 253], [655, 272], [605, 379], [790, 285],
    [846.5, 385], [893.5, 442], [961, 555], [728.5, 518], null,
    [855.5, 615], [548.5, 569], [262.5, 620], [363, 749], [660.5, 642],
    [770.5, 705], [530.5, 681]
  ];
  // Spot 37 borders the cliff. Keep the Marketplace footprint above the rim.
  const marketplaceClearance = new Map([[37, 36]]);
  const shiftAttribute = 'data-qol-layout-shift';
  const coordinates = new Map();
  const shifted = new Set();
  let picker;
  let frame = 0;

  function getPreset() {
    try {
      const saved = localStorage.getItem(presetKey);
      if (saved !== null) {
        const entries = JSON.parse(saved);
        return Array.isArray(entries) ? entries.filter(entry =>
          Array.isArray(entry) && ordinarySlot(entry[0]) && Number.isInteger(entry[1]) && entry[1] >= 0) : [];
      }
      const legacy = Number(localStorage.getItem(legacyKey));
      return ordinarySlot(legacy) ? [[legacy, 17]] : [];
    } catch { return []; }
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
      if (!ordinarySlot(id) || building.querySelector('img.buildingWall, img.buildingId16, img.buildingId40')) continue;
      const areas = Array.from(view.querySelectorAll(`map#clickareasVillage area[location-id="${id}"][shape="poly"]`));
      const points = pointList(areas[0]?.getAttribute('tg-coords'));
      if (!points) continue;
      const [left, right] = bounds(points, 0);
      const [, bottom] = bounds(points, 1);
      // Anchor to the ground edge of both polygons. A level badge and the
      // center of an empty plot sit at different heights above the ground.
      const image = building.querySelector('img.location[class*="buildingId"]');
      const type = Number(image?.className.match(/(?:^|\s)buildingId(\d+)(?:\s|$)/)?.[1]) || 0;
      if (!type && !building.classList.contains('free')) continue;
      slots.set(id, {
        id, building, areas, type, image: image?.getAttribute('src'),
        x: (left + right) / 2,
        y: bottom
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

  function planShift(slot, destination, clearance = 0) {
    const x = destination.x - slot.x;
    const y = destination.y - slot.y - clearance;
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

  function assignSlots(slots, preset) {
    const available = new Set(slots.values());
    const assignments = new Map();
    function assign(id, slot) {
      assignments.set(id, slot);
      available.delete(slot);
    }
    // Match existing occupants first, then assign additional copies in slot order.
    const requested = new Map(preset.filter(([id]) => slots.has(id)));
    for (const [id, type] of requested) {
      if (slots.get(id).type === type) assign(id, slots.get(id));
    }
    for (const [id, type] of requested) {
      if (assignments.has(id)) continue;
      const slot = [...available].find(candidate => candidate.type === type);
      if (slot) assign(id, slot);
    }
    for (const [id, type] of requested) {
      if (assignments.has(id)) continue;
      if (type === 0) continue;
      const current = slots.get(id);
      const empty = available.has(current) && current.type === 0
        ? current : [...available].find(candidate => candidate.type === 0 && !assignments.has(candidate.id));
      if (empty) assign(id, empty);
    }
    for (const slot of available) {
      if (!assignments.has(slot.id)) assign(slot.id, slot);
    }
    const remaining = available.values();
    for (const id of slots.keys()) {
      if (!assignments.has(id)) assign(id, remaining.next().value);
    }
    return assignments;
  }

  function sync() {
    frame = 0;
    const enabled = window.isQolEnabled(feature);
    const view = enabled ? getView() : null;
    if (!enabled) closePicker();
    const preset = enabled ? getPreset() : [];
    const slots = view && preset.length ? readSlots(view) : new Map();
    const plans = [...assignSlots(slots, preset)]
      .filter(([id, source]) => id !== source.id)
      .map(([id, source]) => planShift(source, slots.get(id),
        source.type === 17 ? marketplaceClearance.get(id) : 0));
    const validPlans = plans.every(Boolean) ? plans : [];
    for (const building of shifted) {
      if (!validPlans.some(slot => slot.building === building)) restoreBuilding(building);
    }
    for (const [area, state] of coordinates) {
      if (!validPlans.some(slot => slot.areas.some(entry => entry.area === area))) restoreArea(area, state);
    }
    validPlans.forEach(applyShift);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(sync);
  }

  function closePicker() {
    if (!picker) return;
    const { dialog, opener } = picker;
    picker = null;
    dialog.close();
    dialog.remove();
    opener.focus({ preventScroll: true });
  }

  function setDesignerArtwork(map, view) {
    // Let Travian's stylesheet choose the asset for this world and season.
    const probe = document.createElement('div');
    probe.className = 'viewBackground village';
    if (view?.closest('.village-water')) probe.classList.add('village-water');
    probe.hidden = true;
    document.body.append(probe);
    try {
      const artwork = getComputedStyle(probe).backgroundImage;
      if (artwork.startsWith('url(')) map.style.setProperty('--qol-village-art', artwork);
    } finally {
      probe.remove();
    }
  }

  function openPicker(button) {
    if (!window.isQolEnabled(feature)) return;
    const view = getView();
    const liveSlots = view ? readSlots(view) : new Map();
    const slots = new Map();
    mapPositions.forEach((position, index) => {
      if (!position) return;
      const id = 19 + index;
      const [x, y] = position;
      const live = liveSlots.get(id);
      slots.set(id, { id, x, y, type: live?.type ?? 0, image: live?.image });
    });
    closePicker();
    const dialog = document.createElement('dialog');
    dialog.className = 'qol-village-designer';
    dialog.setAttribute('aria-labelledby', 'qol-village-designer-title');
    dialog.innerHTML = '<h2 id="qol-village-designer-title">Village Designer</h2>' +
      '<div class="qol-village-designer-body"><section><h3>Building palette</h3>' +
      '<div class="qol-village-designer-palette"></div></section>' +
      '<div class="qol-village-designer-map-scroll"><div class="qol-marketplace-layout-markers" role="group" aria-label="Village map"></div></div></div>' +
      '<p role="status"></p><div class="qol-village-designer-actions">' +
      '<div class="qol-wl-action-btn secondary" role="button" tabindex="0" data-qol-layout-action="reset">Reset draft</div>' +
      '<div class="qol-wl-action-btn secondary" role="button" tabindex="0" data-qol-layout-action="cancel">Cancel</div>' +
      '<div class="qol-wl-action-btn primary" role="button" tabindex="0" data-qol-layout-action="save">Apply layout</div></div>';
    const markers = dialog.querySelector('.qol-marketplace-layout-markers');
    setDesignerArtwork(markers, view);
    const palette = dialog.querySelector('.qol-village-designer-palette');
    const preset = new Map(getPreset());
    picker = { dialog, opener: button, markers, palette, slots, preset, selected: null, type: null };
    const names = window.APES?.buildingNames || {};
    const types = new Set([...slots.values()].map(slot => slot.type));
    for (const type of Object.keys(names).map(Number)) {
      if (type >= 5 && ![16, 31, 32, 33, 40].includes(type)) types.add(type);
    }
    types.add(0);
    for (const type of [...types].sort((a, b) => buildingName(a).localeCompare(buildingName(b)))) {
      const item = document.createElement('div');
      item.className = 'qol-wl-action-btn secondary';
      item.setAttribute('role', 'button');
      item.tabIndex = 0;
      item.dataset.qolLayoutType = type;
      item.textContent = buildingName(type);
      palette.append(item);
    }
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closePicker();
    });
    renderPicker();
    dialog.showModal();
  }

  function buildingName(type) {
    return type ? window.APES?.buildingNames?.[type] || `Building ${type}` : 'Empty';
  }

  function renderPicker(focusId) {
    const { markers, dialog, palette, slots, preset, selected, type } = picker;
    const draft = assignSlots(slots, [...preset]);
    const images = new Map([...slots.values()].map(slot => [slot.type, slot.image]));
    markers.replaceChildren();
    for (const item of palette.children) {
      item.setAttribute('aria-pressed', String(Number(item.dataset.qolLayoutType) === type));
    }
    dialog.querySelector('[role="status"]').textContent = type !== null
      ? `Choose a spot for ${buildingName(type)}.`
      : selected === null ? 'Choose a building from the palette, or select two map spots to swap.'
        : 'Choose the second spot to swap.';
    for (const slot of slots.values()) {
      const occupantType = preset.get(slot.id) ?? draft.get(slot.id).type;
      const name = buildingName(occupantType);
      const marker = document.createElement('div');
      marker.className = 'qol-wl-action-btn primary qol-marketplace-layout-marker';
      marker.setAttribute('role', 'button');
      marker.tabIndex = 0;
      marker.setAttribute('aria-label', `Spot ${slot.id}: ${name}`);
      marker.setAttribute('aria-pressed', String(selected === slot.id));
      marker.dataset.qolLayoutSlot = slot.id;
      marker.style.left = `${slot.x / 1174 * 100}%`;
      marker.style.top = `${slot.y / 850 * 100}%`;
      const image = images.get(occupantType);
      if (image) {
        const thumbnail = document.createElement('img');
        thumbnail.src = image;
        thumbnail.alt = '';
        marker.append(thumbnail);
      }
      const label = document.createElement('span');
      label.textContent = name;
      marker.append(label);
      markers.append(marker);
      if (focusId === slot.id) marker.focus({ preventScroll: true });
    }
  }

  function swapDraft(id) {
    const { preset, slots, selected, type } = picker;
    if (type !== null) {
      preset.set(id, type);
      picker.type = null;
    } else if (selected === null) {
      picker.selected = id;
    } else {
      if (selected !== id) {
        const draft = assignSlots(slots, [...preset]);
        const source = preset.get(selected) ?? draft.get(selected).type;
        const target = preset.get(id) ?? draft.get(id).type;
        preset.set(selected, target);
        preset.set(id, source);
      }
      picker.selected = null;
    }
    renderPicker(id);
  }

  function onClick(event) {
    const control = event.target.closest?.(controls);
    if (!control) return;
    if (control.hasAttribute('data-qol-marketplace-layout')) {
      openPicker(control);
      return;
    }
    if (!picker?.dialog.contains(control)) return;
    if (picker.palette.contains(control)) {
      picker.type = Number(control.dataset.qolLayoutType);
      picker.selected = null;
      renderPicker();
      return;
    }
    if (picker.markers.contains(control)) {
      swapDraft(Number(control.dataset.qolLayoutSlot));
      return;
    }
    const action = control.dataset.qolLayoutAction;
    if (action === 'reset') {
      picker.preset.clear();
      picker.selected = null;
      picker.type = null;
      renderPicker();
      return;
    }
    if (action === 'save') {
      try {
        localStorage.setItem(presetKey, JSON.stringify([...picker.preset]));
      } catch {
        picker.dialog.querySelector('[role="status"]').textContent = 'Could not save the layout. Try again.';
        return;
      }
    }
    closePicker();
    schedule();
  }

  function onKeydown(event) {
    if (picker && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePicker();
      schedule();
      return;
    }
    const control = event.target.closest?.(controls);
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
        : record.target.closest?.('#villageView') && !picker?.markers.contains(record.target)) ||
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
    schedule();
  });
  applySetting();
})();
