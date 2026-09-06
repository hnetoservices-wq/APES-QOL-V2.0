(() => {
  'use strict';

  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const OFFICIAL_IDS = new Set(['x3_speedsettle', 'x1_support_500cp']);

  let installed = false;
  let installTimer = null;
  let rootObserver = null;
  let hubObserver = null;
  let decorateQueued = false;

  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();

  function step(id, payload) {
    return { id, ...payload };
  }

  function instruction(id, text) {
    return step(id, { type: 'instruction', text });
  }

  function checkpoint(id, text) {
    return instruction(id, `[Checkpoint] ${text}`);
  }

  function resource(id, group, level) {
    return instruction(id, `${group} → Level ${level}`);
  }

  function building(id, name, buildingId, level, extra = {}) {
    return step(id, {
      type: 'building',
      building: name,
      buildingId,
      level,
      ...extra
    });
  }

  function addBuildingThrough(route, prefix, name, buildingId, from, through, extra = {}) {
    for (let level = from; level <= through; level += 1) {
      route.push(building(`${prefix}-lv${level}`, name, buildingId, level, extra));
    }
  }

  function addResourceThrough(route, prefix, group, from, through) {
    for (let level = from; level <= through; level += 1) {
      route.push(resource(`${prefix}-lv${level}`, group, level));
    }
  }

  function buildX3Route() {
    const route = [];

    route.push(instruction('x3-tutorial', 'Finish the tutorial. Do not skip it; attack the furthest hideout first during the tutorial.'));
    route.push(checkpoint('x3-queue-five-units', 'Queue 5 units, then continue.'));
    route.push(instruction('x3-first-hideout', 'Attack the closest hideout until it is empty. Keep sending the hero on adventures continuously.'));

    addBuildingThrough(route, 'x3-warehouse', 'Warehouse', 10, 1, 3);
    addBuildingThrough(route, 'x3-granary', 'Granary', 11, 1, 3);
    route.push(building('x3-embassy-lv1', 'Embassy', 18, 1));
    route.push(checkpoint('x3-oasis', 'Annex an oasis if possible. If no suitable oasis is available, Skip this checkpoint.'));
    route.push(building('x3-marketplace-lv1', 'Marketplace', 17, 1));
    route.push(building('x3-cranny1-lv1', 'Cranny', 23, 1, { instance: 1 }));

    addResourceThrough(route, 'x3-crop', 'All Crop Fields', 1, 3);
    route.push(checkpoint('x3-optional-all-fields-lv2', 'Optional spawn-demolition route: upgrade all resource fields to Level 2. Complete this checkpoint when done, or Skip if you are not using this route.'));

    addBuildingThrough(route, 'x3-main-building', 'Main Building', 15, 1, 7);
    route.push(building('x3-residence-lv1', 'Residence', 25, 1));
    route.push(checkpoint('x3-gold-bonuses', 'Activate Gold Club, Travian Plus, Resource Bonus and Crop Bonus.'));

    addBuildingThrough(route, 'x3-warehouse', 'Warehouse', 10, 4, 5);
    addBuildingThrough(route, 'x3-residence', 'Residence', 25, 2, 5);
    route.push(instruction('x3-free-quests', 'Complete free quests such as renaming the village, changing hero production and healing the hero.'));
    route.push(instruction('x3-card-games', 'If affordable, play card games for an extra adventure point and chests.'));
    route.push(checkpoint('x3-residence-five-reward', 'After Residence Level 5 finishes, collect its quest reward before continuing.'));

    addBuildingThrough(route, 'x3-residence', 'Residence', 25, 6, 10);
    route.push(checkpoint('x3-settler-one', 'Queue the first Settler.'));
    route.push(checkpoint('x3-settler-two-hideouts', 'Queue the second Settler as soon as possible. Clear the first two hideouts, sell stolen goods and use the seventh hero adventure for more resources.'));
    route.push(checkpoint('x3-catch-animals', 'After the seventh adventure, catch animals in a nearby oasis for the quest reward.'));
    route.push(instruction('x3-wait-hideouts-three-four', 'Wait for the third and fourth hideouts. They should spawn roughly 1h27m after clearing the first two.'));
    route.push(checkpoint('x3-clear-hideouts-three-four', 'Use the first Settler to empty the third and fourth hideouts. Send extra troops so the Settler survives.'));
    route.push(checkpoint('x3-settler-three', 'Queue the third Settler. Use resource or crop chests if necessary.'));

    addBuildingThrough(route, 'x3-main-building', 'Main Building', 15, 8, 10);
    route.push(checkpoint('x3-demolish-residence', 'Demolish the Residence, timing demolition to finish a few seconds after the third Settler completes.'));

    addBuildingThrough(route, 'x3-barracks', 'Barracks', 19, 1, 3);
    addBuildingThrough(route, 'x3-academy', 'Academy', 22, 1, 10);
    route.push(building('x3-town-hall-lv1', 'Town Hall', 24, 1));
    route.push(building('x3-workshop-lv1', 'Workshop', 21, 1));
    addBuildingThrough(route, 'x3-granary', 'Granary', 11, 4, 7);

    route.push(checkpoint('x3-celebration-relocate', 'Start a Small Celebration, relocate and send the Settlers.'));
    route.push(instruction('x3-thanks-ruben', 'Thank Ruben from Triangles for the guide.'));

    return route;
  }

  function buildX1SupportRoute() {
    const route = [];

    addBuildingThrough(route, 'x1-main-building', 'Main Building', 15, 1, 5);
    addBuildingThrough(route, 'x1-warehouse', 'Warehouse', 10, 1, 3);
    addBuildingThrough(route, 'x1-granary', 'Granary', 11, 1, 3);
    addResourceThrough(route, 'x1-all-fields', 'All Resource Fields', 1, 3);

    addBuildingThrough(route, 'x1-warehouse', 'Warehouse', 10, 4, 6);
    addBuildingThrough(route, 'x1-granary', 'Granary', 11, 4, 6);
    addResourceThrough(route, 'x1-all-fields', 'All Resource Fields', 4, 6);

    route.push(building('x1-marketplace-lv1', 'Marketplace', 17, 1));
    route.push(building('x1-residence-lv1', 'Residence', 25, 1));

    addBuildingThrough(route, 'x1-warehouse', 'Warehouse', 10, 7, 9);
    addBuildingThrough(route, 'x1-granary', 'Granary', 11, 7, 9);
    addResourceThrough(route, 'x1-all-fields', 'All Resource Fields', 7, 8);

    addBuildingThrough(route, 'x1-warehouse', 'Warehouse', 10, 10, 12);
    addBuildingThrough(route, 'x1-granary', 'Granary', 11, 10, 12);
    addResourceThrough(route, 'x1-all-fields', 'All Resource Fields', 9, 10);

    addBuildingThrough(route, 'x1-sawmill', 'Sawmill', 5, 1, 5);
    addBuildingThrough(route, 'x1-brickyard', 'Brickyard', 6, 1, 5);
    addBuildingThrough(route, 'x1-iron-foundry', 'Iron Foundry', 7, 1, 5);
    addBuildingThrough(route, 'x1-grain-mill', 'Grain Mill', 8, 1, 5);
    addBuildingThrough(route, 'x1-bakery', 'Bakery', 9, 1, 5);

    addBuildingThrough(route, 'x1-residence', 'Residence', 25, 2, 10);
    addBuildingThrough(route, 'x1-marketplace', 'Marketplace', 17, 2, 20);

    addBuildingThrough(route, 'x1-barracks', 'Barracks', 19, 1, 3);
    addBuildingThrough(route, 'x1-academy', 'Academy', 22, 1, 5);
    addBuildingThrough(route, 'x1-smithy', 'Smithy', 12, 1, 3);
    addBuildingThrough(route, 'x1-stable', 'Stable', 20, 1, 10);
    addBuildingThrough(route, 'x1-trade-office', 'Trade Office', 28, 1, 5);

    addBuildingThrough(route, 'x1-main-building', 'Main Building', 15, 6, 10);
    addBuildingThrough(route, 'x1-academy', 'Academy', 22, 6, 10);
    route.push(building('x1-town-hall-lv1', 'Town Hall', 24, 1));

    addBuildingThrough(route, 'x1-main-building', 'Main Building', 15, 11, 20);
    addBuildingThrough(route, 'x1-academy', 'Academy', 22, 11, 17);
    addBuildingThrough(route, 'x1-smithy', 'Smithy', 12, 4, 6);
    addBuildingThrough(route, 'x1-embassy', 'Embassy', 18, 1, 3);
    addBuildingThrough(route, 'x1-rally-point', 'Rally Point', 16, 1, 7);
    addBuildingThrough(route, 'x1-tribe-wall', 'Tribe Wall', null, 1, 15, { tribeWall: true });
    addBuildingThrough(route, 'x1-cranny1', 'Cranny', 23, 1, 10, { instance: 1 });
    addBuildingThrough(route, 'x1-cranny2', 'Cranny', 23, 1, 10, { instance: 2 });

    route.push(checkpoint('x1-final-target', 'Verify the final village target: 500 passive CP/day on x1 with one normal building slot left free.'));
    route.push(instruction('x1-thanks', 'Go thank Barrbara from DT, Ruben from Triangles and Requinte from APES for this guide.'));

    return route;
  }

  const DEFINITIONS = Object.freeze({
    x3_speedsettle: {
      name: 'x3 Speed Settle',
      description: 'A chronological APES settlement route for x3 servers. Building and resource objectives use automatic detection when enabled; tactical decisions and game actions remain manual checkpoints.',
      meta: {
        official: true,
        version: '1.0',
        speed: 'x3',
        villageType: 'Spawn village',
        author: 'Ruben · Triangles',
        maintainedBy: 'APES QoL',
        contributors: ['Ruben · Triangles'],
        goal: 'Settle as quickly as possible using the established APES x3 route.'
      },
      steps: buildX3Route()
    },
    x1_support_500cp: {
      name: 'x1 Support Village — 500 CP/day',
      description: 'A chronological build route for a normal non-city support village on x1. It stages storage, resource fields, production buildings and CP-efficient infrastructure toward the established 500 passive CP/day target while preserving one normal building slot.',
      meta: {
        official: true,
        version: '1.0',
        speed: 'x1',
        villageType: 'Normal support village',
        author: 'APES QoL',
        maintainedBy: 'APES QoL',
        contributors: ['Barrbara · DT', 'Ruben · Triangles', 'Requinte · APES'],
        goal: '500 passive CP/day with one normal building slot left free.'
      },
      steps: buildX1SupportRoute()
    }
  });

  function applyCatalog() {
    const api = window.APES?.roadmaps;
    if (!api?.getAllRoadmaps) return false;
    const all = api.getAllRoadmaps();
    for (const [id, definition] of Object.entries(DEFINITIONS)) {
      const target = all?.[id];
      if (!target) continue;
      target.name = definition.name;
      target.description = definition.description;
      target.meta = { ...definition.meta, contributors: [...definition.meta.contributors] };
      target.steps = definition.steps.map(item => ({ ...item }));
    }
    installed = true;
    window.APES.roadmapsOfficialGuides = Object.freeze({
      version: 1,
      getDefinition: id => DEFINITIONS[id] ? JSON.parse(JSON.stringify(DEFINITIONS[id])) : null,
      ids: Object.freeze([...OFFICIAL_IDS])
    });
    window.APES?.roadmapsStableIds?.syncNow?.();
    scheduleDecorate();
    return true;
  }

  function selectedId() {
    try {
      return clean(localStorage.getItem(SELECTED_KEY));
    } catch (_) {
      return '';
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

  function metadataMarkup(meta) {
    const chips = [
      'APES Official',
      `v${clean(meta.version)}`,
      clean(meta.speed),
      clean(meta.villageType)
    ].filter(Boolean);
    const details = [];
    if (clean(meta.author)) details.push(`<strong>Author:</strong> ${escapeHtml(meta.author)}`);
    if (Array.isArray(meta.contributors) && meta.contributors.length) {
      details.push(`<strong>Contributors:</strong> ${meta.contributors.map(escapeHtml).join(', ')}`);
    }
    if (clean(meta.goal)) details.push(`<strong>Goal:</strong> ${escapeHtml(meta.goal)}`);
    return `
      <div class="qol-rmog-chips">${chips.map(chip => `<span>${escapeHtml(chip)}</span>`).join('')}</div>
      <div class="qol-rmog-details">${details.join('<span class="qol-rmog-sep">·</span>')}</div>`;
  }

  function decorateHub() {
    decorateQueued = false;
    const hub = document.getElementById(HUB_ID);
    if (!hub) return;

    for (const [id, definition] of Object.entries(DEFINITIONS)) {
      const item = hub.querySelector(`[data-roadmap-select="${CSS.escape(id)}"]`);
      const small = item?.querySelector('small');
      if (small) small.textContent = `APES Official · ${definition.meta.speed} · v${definition.meta.version}`;
    }

    const id = selectedId();
    const definition = DEFINITIONS[id];
    const head = hub.querySelector('.qol-rm-main-head');
    if (!head) return;

    hub.querySelector('.qol-rmog-meta')?.remove();
    if (!definition) return;

    const badge = head.querySelector('.qol-rm-badge');
    if (badge) badge.textContent = 'APES Official';

    const meta = document.createElement('div');
    meta.className = 'qol-rmog-meta';
    meta.dataset.roadmapId = id;
    meta.innerHTML = metadataMarkup(definition.meta);
    head.insertAdjacentElement('afterend', meta);

    const routeHead = hub.querySelector('.qol-rm-route-head span');
    if (routeHead) routeHead.textContent = 'Exact authored order. Automatic detection advances only supported building and resource objectives.';
  }

  function scheduleDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(decorateHub);
  }

  function observeHub() {
    const hub = document.getElementById(HUB_ID);
    if (!hub) return false;
    if (hubObserver) return true;
    hubObserver = new MutationObserver(scheduleDecorate);
    hubObserver.observe(hub, { childList: true, subtree: true });
    scheduleDecorate();
    return true;
  }

  function startObservers() {
    if (observeHub()) return;
    rootObserver = new MutationObserver(() => {
      if (!observeHub()) return;
      rootObserver?.disconnect();
      rootObserver = null;
    });
    rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    if (!applyCatalog()) {
      installTimer = window.setInterval(() => {
        if (!applyCatalog()) return;
        window.clearInterval(installTimer);
        installTimer = null;
      }, 50);
    }
    startObservers();
    document.addEventListener('click', event => {
      if (event.target.closest?.(`#${HUB_ID}`)) setTimeout(scheduleDecorate, 0);
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
