(() => {
  'use strict';

  const OVERLAY_ID = 'apes-v2-village-overlay';
  const SORT_LABELS = Object.freeze({
    order: 'Village order',
    attention: 'Needs attention',
    nextEvent: 'Next event',
    construction: 'Construction finish',
    storage: 'Storage risk',
    population: 'Population',
    alphabetical: 'Alphabetical'
  });
  const DENSITY_LABELS = Object.freeze({
    comfortable: 'Comfortable',
    compact: 'Compact'
  });
  let reopenRequested = false;
  let transformTimer = null;

  function settingsApi() {
    return window.APES_AOC_SETTINGS;
  }

  function currentConfig() {
    try { return settingsApi()?.get?.() || {}; } catch (_) { return {}; }
  }

  function backdrop() {
    return document.querySelector(`#${OVERLAY_ID} [data-aoc-settings-backdrop]`);
  }

  function keepPanelOpen() {
    reopenRequested = true;
    [0, 40, 120].forEach(delay => setTimeout(() => {
      transformPanel();
      if (reopenRequested) backdrop()?.classList.add('open');
    }, delay));
    setTimeout(() => { reopenRequested = false; }, 180);
  }

  function commit(patch) {
    const wasOpen = backdrop()?.classList.contains('open');
    try { settingsApi()?.set?.(patch); } catch (error) { console.warn('[APES AOC] Could not save settings.', error); }
    if (wasOpen) keepPanelOpen();
  }

  function switchMarkup(label, checked, attrs) {
    return `<div class="apes-aoc-settings-switch-row" role="switch" tabindex="0" aria-checked="${checked ? 'true' : 'false'}" ${attrs}>
      <span class="apes-aoc-settings-switch-track" aria-hidden="true"><i></i></span>
      <b>${label}</b>
    </div>`;
  }

  function transformSwitches(panel) {
    panel.querySelectorAll('.apes-aoc-settings-check').forEach(label => {
      const input = label.querySelector('input');
      if (!input) return;
      const text = String(label.querySelector('b')?.textContent || label.textContent || '').replace(/\s+/g, ' ').trim();
      const setting = input.getAttribute('data-aoc-setting');
      const tracked = input.getAttribute('data-aoc-tracked-building');
      const checked = input.checked === true;
      let attrs = '';
      if (setting) attrs = `data-aoc-fixed-setting="${setting}"`;
      else if (tracked) attrs = `data-aoc-fixed-tracked="${tracked}"`;
      else return;
      const wrapper = document.createElement('div');
      wrapper.innerHTML = switchMarkup(text, checked, attrs);
      label.replaceWith(wrapper.firstElementChild);
    });
  }

  function pickerMarkup(name, label, value, options) {
    const valueLabel = options[value] || value;
    const items = Object.entries(options).map(([key, text]) => `<div class="apes-aoc-settings-picker-option${key === value ? ' selected' : ''}" role="option" tabindex="0" aria-selected="${key === value ? 'true' : 'false'}" data-aoc-fixed-option="${key}">${text}</div>`).join('');
    return `<div class="apes-aoc-settings-picker-field" data-aoc-picker-field="${name}">
      <span class="apes-aoc-settings-picker-label">${label}</span>
      <div class="apes-aoc-settings-picker-wrap">
        <div class="apes-aoc-settings-picker" role="button" tabindex="0" aria-expanded="false" data-aoc-fixed-picker="${name}" data-value="${value}"><span>${valueLabel}</span><b>▾</b></div>
        <div class="apes-aoc-settings-picker-menu" role="listbox">${items}</div>
      </div>
    </div>`;
  }

  function transformPickers(panel) {
    panel.querySelectorAll('.apes-aoc-settings-field').forEach(field => {
      const select = field.querySelector('select[data-aoc-setting-select]');
      if (!select) return;
      const name = select.getAttribute('data-aoc-setting-select');
      const label = String(field.querySelector(':scope > span')?.textContent || '').replace(/\s+/g, ' ').trim();
      const value = select.value;
      const options = name === 'density' ? DENSITY_LABELS : name === 'defaultSort' ? SORT_LABELS : Object.fromEntries([...select.options].map(option => [option.value, option.textContent]));
      const wrapper = document.createElement('div');
      wrapper.innerHTML = pickerMarkup(name, label, value, options);
      field.replaceWith(wrapper.firstElementChild);
    });
  }

  function transformPanel() {
    transformTimer = null;
    const panel = document.querySelector(`#${OVERLAY_ID} .apes-aoc-settings-panel`);
    if (!panel) return;
    transformSwitches(panel);
    transformPickers(panel);
    panel.dataset.apesAocNativeControlsRemoved = '1';
  }

  function scheduleTransform() {
    if (transformTimer !== null) clearTimeout(transformTimer);
    transformTimer = setTimeout(transformPanel, 0);
  }

  function setSwitch(node) {
    const setting = node.getAttribute('data-aoc-fixed-setting');
    const tracked = Number(node.getAttribute('data-aoc-fixed-tracked'));
    const config = currentConfig();
    const nextChecked = node.getAttribute('aria-checked') !== 'true';
    node.setAttribute('aria-checked', nextChecked ? 'true' : 'false');

    if (setting) {
      commit({ [setting]: nextChecked });
      return;
    }

    if (Number.isFinite(tracked)) {
      const selected = new Set((config.trackedBuildingTypes || []).map(Number));
      if (nextChecked) selected.add(tracked); else selected.delete(tracked);
      commit({ trackedBuildingTypes: [...selected] });
      window.APES_ACCOUNT_OPERATIONS_CENTER?.captureCurrentVillage?.();
    }
  }

  function closeAllPickers(except = null) {
    document.querySelectorAll(`#${OVERLAY_ID} .apes-aoc-settings-picker-field.open`).forEach(field => {
      if (field === except) return;
      field.classList.remove('open');
      field.querySelector('.apes-aoc-settings-picker')?.setAttribute('aria-expanded', 'false');
    });
  }

  function togglePicker(node) {
    const field = node.closest('.apes-aoc-settings-picker-field');
    if (!field) return;
    const open = !field.classList.contains('open');
    closeAllPickers(field);
    field.classList.toggle('open', open);
    node.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function chooseOption(node) {
    const field = node.closest('.apes-aoc-settings-picker-field');
    const picker = field?.querySelector('.apes-aoc-settings-picker');
    const name = field?.getAttribute('data-aoc-picker-field');
    const value = node.getAttribute('data-aoc-fixed-option');
    if (!field || !picker || !name || value == null) return;

    field.querySelectorAll('.apes-aoc-settings-picker-option').forEach(option => {
      const selected = option === node;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    picker.dataset.value = value;
    picker.querySelector('span').textContent = node.textContent.trim();
    field.classList.remove('open');
    picker.setAttribute('aria-expanded', 'false');
    commit({ [name]: value });

    if (name === 'defaultSort') {
      try { localStorage.setItem(`apes_aoc_sort:${location.hostname}`, value); } catch (_) {}
      setTimeout(() => {
        const mainSort = document.querySelector(`#${OVERLAY_ID} .apes-aoc2-sort`);
        if (!mainSort) return;
        mainSort.value = value;
        mainSort.dispatchEvent(new Event('change', { bubbles: true }));
      }, 30);
    }
  }

  document.addEventListener('click', event => {
    const switchNode = event.target.closest?.(`#${OVERLAY_ID} .apes-aoc-settings-switch-row`);
    if (switchNode) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSwitch(switchNode);
      return;
    }

    const option = event.target.closest?.(`#${OVERLAY_ID} .apes-aoc-settings-picker-option`);
    if (option) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      chooseOption(option);
      return;
    }

    const picker = event.target.closest?.(`#${OVERLAY_ID} .apes-aoc-settings-picker`);
    if (picker) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      togglePicker(picker);
      return;
    }

    if (!event.target.closest?.(`#${OVERLAY_ID} .apes-aoc-settings-picker-field`)) closeAllPickers();
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const control = event.target.closest?.(`#${OVERLAY_ID} .apes-aoc-settings-switch-row, #${OVERLAY_ID} .apes-aoc-settings-picker, #${OVERLAY_ID} .apes-aoc-settings-picker-option`);
    if (!control) return;
    event.preventDefault();
    event.stopPropagation();
    control.click();
  }, true);

  const observer = new MutationObserver(scheduleTransform);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleTransform();
})();
