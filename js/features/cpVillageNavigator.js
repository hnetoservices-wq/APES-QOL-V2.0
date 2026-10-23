(function installCPVillageNavigator() {
  'use strict';
  const PALETTE = () => window.APES_VILLAGE_PALETTE;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const normal = value => String(value ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const validId = id => /^\d+$/.test(String(id || ''));
  const currentId = () => (window.location.hash || '').match(/(?:^|\/)villId:(\d+)/)?.[1] || '';
  const selectedName = () => {
    const selectors = [
      '#villageList .currentVillageName .selectedItem .villageEntry',
      '#villageList .currentVillageName .selectedItem',
      '#villageList .currentVillageName .dropdownHead .villageEntry'
    ];
    for (const selector of selectors) {
      const name = document.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
      if (name) return name;
    }
    return '';
  };
  const viewReady = () => Boolean(document.querySelector('#villageView building-location'));
  function snapshotVillages() {
    const villages = PALETTE()?.getVillages?.();
    if (!Array.isArray(villages)) return [];
    const unique = new Map();
    for (const entry of villages) {
      const id = String(entry?.villageId || '');
      if (!validId(id) || unique.has(id)) continue;
      unique.set(id, Object.freeze({
        id,
        name: String(entry?.name || '').trim(),
        // The Village model exposes this flag (not the CP founding window).
        isTown: entry?.isTown === true,
        playerId: entry?.playerId
      }));
    }
    return [...unique.values()];
  }
  async function getOwnedVillages(timeout = 8000) {
    const deadline = Date.now() + timeout;
    let requested = false;
    while (Date.now() < deadline) {
      const villages = snapshotVillages();
      if (villages.length && villages.every(village => village.name)) return villages;
      if (!requested || Date.now() + 1000 < deadline) PALETTE()?.refresh?.();
      requested = true;
      await sleep(175);
    }
    throw new Error('CP scan could not load a complete owned-village list from Village Dashboard. Refresh the game and retry.');
  }
  function selectedMatches(target, owned) {
    const actual = normal(selectedName());
    if (!actual || normal(target.name) !== actual) return false;
    // A repeated name is insufficient proof of which village is selected.
    const siblings = owned.filter(v => normal(v.name) === actual);
    if (siblings.length > 1) {
      const active = PALETTE()?.getVillages?.()?.filter(v => v.isActive === true);
      return Array.isArray(active) && active.length === 1 && String(active[0].villageId) === target.id;
    }
    return true;
  }
  async function waitForVillage(target, owned, timeout = 7500) {
    const deadline = Date.now() + timeout;
    let confirmed = 0;
    while (Date.now() < deadline) {
      const matches = currentId() === target.id &&
        /(?:^|\/)page:village(?:\/|$)/i.test(window.location.hash || '') &&
        selectedMatches(target, owned) && viewReady();
      confirmed = matches ? confirmed + 1 : 0;
      if (confirmed >= 2) return true;
      await sleep(120);
    }
    return false;
  }
  async function routeTo(target, owned) {
    window.location.hash = `#/page:village/villId:${target.id}`;
    PALETTE()?.refresh?.();
    return waitForVillage(target, owned, 7500);
  }
  function nextButton() {
    return document.querySelector('#villageList .currentVillageName a.navigation.next.clickable') ||
      document.querySelector('#villageList .navigation.next') ||
      document.querySelector('.currentVillageName.dropdown a.navigation.next.clickable');
  }
  async function nativeNext(owned) {
    const before = currentId();
    const beforeName = normal(selectedName());
    const button = nextButton();
    if (!button) return false;
    button.dispatchEvent(new MouseEvent('click', {
      view: window, bubbles: true, cancelable: true, composed: true, button: 0
    }));
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      const id = currentId();
      const landed = owned.find(village => village.id === id);
      // A failed URL-only route may already point to this ID while Travian
      // still shows the previous village. Confirm the selected-name change too.
      if (id && landed && (id !== before || normal(selectedName()) !== beforeName) &&
          await waitForVillage(landed, owned, 1000)) return true;
      await sleep(100);
    }
    return false;
  }
  async function navigate(target, owned, options = {}) {
    if (!target || !validId(target.id) || !owned.some(village => village.id === target.id))
      throw new Error('CP scan attempted to open an unknown village.');
    const errors = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (await routeTo(target, owned)) return { id: target.id, method: 'verified-route' };
      errors.push(`route attempt ${attempt}: game village header did not match`);
    }
    // Last resort: let Travian invoke its own village controller.
    // Never treat a URL-only change as a verified village transition.
    for (let step = 0; step < Math.min(owned.length, 100); step++) {
      if (!await nativeNext(owned)) { errors.push('native next-village navigation unavailable'); break; }
      if (currentId() === target.id && await waitForVillage(target, owned, 1500))
        return { id: target.id, method: 'verified-native' };
    }
    const name = target.name || target.id;
    throw new Error(`Could not verify village "${name}" (${target.id}). ${errors.join('; ')}.`);
  }
  window.APES_CP_VILLAGE_NAVIGATOR = Object.freeze({
    getOwnedVillages, currentId, selectedName, waitForVillage, navigate
  });
})();
