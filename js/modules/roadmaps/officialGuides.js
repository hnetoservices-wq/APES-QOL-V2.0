(() => {
  'use strict';

  const SELECTED_KEY = 'qol_roadmap_selected_v1';
  const HUB_ID = 'qol-roadmaps-container';
  const OFFICIAL_IDS = new Set(['x1_speedsettle', 'x2_speedsettle', 'x3_speedsettle', 'x5_speedsettle']);

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

  function buildX1SpeedsettleRoute() {
    // Like x3: every building level is a distinct, automatically detectable
    // step, while game actions, decisions and field groups stay manual.
    // Keep step IDs stable between guide updates.
    const route = [];

    route.push(instruction('x1-speedsettle-tutorial', 'Finish the tutorial. Do not skip it.'));
    route.push(checkpoint('x1-speedsettle-queue-five-units', 'Queue 5 units, then continue.'));
    route.push(instruction('x1-speedsettle-first-hideouts', 'Attack the closest hideout repeatedly until it is empty and keep adventuring non-stop. Switch to the second hideout when the first is empty.'));

    addBuildingThrough(route, 'x1-speedsettle-warehouse', 'Warehouse', 10, 1, 3, { exact: true });
    addBuildingThrough(route, 'x1-speedsettle-granary', 'Granary', 11, 1, 3, { exact: true });

    route.push(building('x1-speedsettle-embassy-lv1', 'Embassy', 18, 1, { exact: true }));
    route.push(checkpoint('x1-speedsettle-oasis', 'Annex an oasis if possible. Skip this checkpoint if no suitable oasis is available.'));
    route.push(building('x1-speedsettle-marketplace-lv1', 'Marketplace', 17, 1, { exact: true }));
    route.push(building('x1-speedsettle-cranny-lv1', 'Cranny', 23, 1, { instance: 1, exact: true }));

    addResourceThrough(route, 'x1-speedsettle-crop', 'All Crop Fields', 1, 3);
    route.push(checkpoint('x1-speedsettle-optional-resource-fields', 'Optional: upgrade all resource fields to Level 2. Do not do this if you plan on demolishing your spawn village; Skip this checkpoint instead.'));

    route.push(building('x1-speedsettle-residence-lv1', 'Residence', 25, 1, { exact: true }));
    route.push(checkpoint('x1-speedsettle-gold-bonuses', 'Buy gold and activate Travian Plus, Resource Boost, and Crop Boost.'));

    // Storage for Residence quest reward: continue from the earlier levels.
    addBuildingThrough(route, 'x1-speedsettle-warehouse', 'Warehouse', 10, 4, 5, { exact: true });
    addBuildingThrough(route, 'x1-speedsettle-granary', 'Granary', 11, 4, 5, { exact: true });
    addBuildingThrough(route, 'x1-speedsettle-residence', 'Residence', 25, 2, 5, { exact: true });

    route.push(instruction('x1-speedsettle-free-quests', 'While waiting, complete free quests: village name, hero production, auction bid, heal the hero, and any other free quests.'));
    route.push(instruction('x1-speedsettle-card-games', 'Play card games now for an extra adventure point and golden resource/crop chests.'));
    route.push(checkpoint('x1-speedsettle-residence-five-reward', 'When Residence Level 5 finishes, collect the quest reward for Level 10.'));
    route.push(checkpoint('x1-speedsettle-settler-one', 'Queue the first Settler.'));
    route.push(checkpoint('x1-speedsettle-settler-two', 'Queue the second Settler using resources from fully clearing the first two hideouts, selling stolen goods (SGs), and the 7th adventure.'));
    route.push(checkpoint('x1-speedsettle-catch-animals', 'Catch animals in a nearby oasis after the 7th adventure for the quest reward. If possible, annex that oasis for the extra quest reward if you have not already annexed one.'));
    route.push(instruction('x1-speedsettle-wait-hideouts-three-four', 'Wait for the third and fourth hideouts to spawn, 2 hours after clearing the first and second respectively. Keep adventuring in case another resource adventure appears.'));
    route.push(checkpoint('x1-speedsettle-settler-hideout-help', 'If possible, use a Settler to empty the hideouts faster. Make sure the Settler survives.'));
    route.push(checkpoint('x1-speedsettle-settler-three', 'Queue the third Settler. Use resource or crop chests if necessary.'));

    route.push(building('x1-speedsettle-warehouse-lv6', 'Warehouse', 10, 6, { exact: true }));
    route.push(checkpoint('x1-speedsettle-settler-reward', 'Collect the Settler quest reward after upgrading Warehouse to Level 6.'));
    addBuildingThrough(route, 'x1-speedsettle-main-building', 'Main Building', 15, 1, 10, { exact: true });

    route.push(checkpoint('x1-speedsettle-demolish-residence', 'Demolish the Residence, but only after all three Settlers have finished training. Residence demolition takes 4h20min on x1.'));
    route.push(checkpoint('x1-speedsettle-hideouts-five-six', 'Clear the fifth and sixth hideouts while waiting for Residence demolition, roughly 4–5 hours after clearing the third and fourth hideouts.'));

    route.push(building('x1-speedsettle-warehouse-lv7', 'Warehouse', 10, 7, { exact: true }));
    route.push(checkpoint('x1-speedsettle-warehouse-rubble', 'Make sure Warehouse Level 7 can hold the resources recovered from the rubble.'));

    addBuildingThrough(route, 'x1-speedsettle-barracks', 'Barracks', 19, 1, 3, { exact: true });
    addBuildingThrough(route, 'x1-speedsettle-academy', 'Academy', 22, 1, 10, { exact: true });
    route.push(building('x1-speedsettle-town-hall-lv1', 'Town Hall', 24, 1, { exact: true }));
    route.push(building('x1-speedsettle-workshop-lv1', 'Workshop', 21, 1, { exact: true }));
    addBuildingThrough(route, 'x1-speedsettle-granary', 'Granary', 11, 6, 8, { exact: true });

    route.push(checkpoint('x1-speedsettle-remaining-chests', 'Use resource or crop chests now if you have not already.'));
    route.push(checkpoint('x1-speedsettle-demolish-workshop-academy', 'Demolish the Workshop and Academy, and the Main Building too if you are short on resources.'));
    route.push(checkpoint('x1-speedsettle-small-party', 'Start a Small Party.'));
    route.push(checkpoint('x1-speedsettle-relocate', 'Relocate close to your intended settling direction.'));
    route.push(checkpoint('x1-speedsettle-send-settlers', 'Send the Settlers.'));

    return route;
  }

  function addSpeedsettlingOpening(route, speed) {
    // Common first ten objectives for x2 and x5, without changing x1/x3.
    const prefix = speed + '-speedsettle';
    route.push(instruction(prefix + '-tutorial', 'Finish the tutorial. Do not skip it.'));
    route.push(checkpoint(prefix + '-queue-five-units', 'Queue 5 units.'));
    route.push(instruction(prefix + '-first-hideouts', 'Attack the closest hideout repeatedly until it is empty and keep adventuring non-stop. Switch to the second hideout when the first is empty.'));

    addBuildingThrough(route, prefix + '-warehouse', 'Warehouse', 10, 1, 3, { exact: true });
    addBuildingThrough(route, prefix + '-granary', 'Granary', 11, 1, 3, { exact: true });
    route.push(building(prefix + '-embassy-lv1', 'Embassy', 18, 1, { exact: true }));
    route.push(checkpoint(prefix + '-annex-oasis', 'Annex an oasis if possible. Skip this checkpoint if no suitable oasis is available.'));
    route.push(building(prefix + '-marketplace-lv1', 'Marketplace', 17, 1, { exact: true }));
    route.push(building(prefix + '-cranny-lv1', 'Cranny', 23, 1, { exact: true, instance: 1 }));

    addResourceThrough(route, prefix + '-crop', 'All Crop Fields', 1, 3);
    route.push(checkpoint(prefix + '-optional-resource-fields', 'Optional: upgrade all resource fields to Level 2. Do not do this if you plan to demolish the spawn village; Skip this checkpoint instead.'));
  }

  function addSpeedsettlingSettlerPhase(route, speed, options) {
    const prefix = speed + '-speedsettle';
    route.push(instruction(prefix + '-free-quests', 'During the waiting time, complete free quests: change the village name, change hero production, heal the hero, and other available free quests.' +
      (options.auctionBid ? ' Place an auction bid.' : '')));
    route.push(instruction(prefix + '-card-games', 'Play card games at this point for an extra adventure point and golden resource/crop chests.'));
    route.push(checkpoint(prefix + '-residence-five-reward', 'When Residence Level 5 is done, collect the quest reward for Level 10.'));
    route.push(checkpoint(prefix + '-settler-one', 'Queue the first Settler.'));
    route.push(checkpoint(prefix + '-settler-two', 'Queue the second Settler using resources from clearing the first two hideouts completely, selling stolen goods (SGs), and completing the 7th adventure.'));
    route.push(checkpoint(prefix + '-catch-animals', 'Catch animals in a nearby oasis after the 7th adventure for its quest reward. If you have not annexed an oasis, try to annex this one for the additional quest reward.'));
    route.push(instruction(prefix + '-wait-hideouts-three-four', options.hideoutWait));
    route.push(checkpoint(prefix + '-clear-hideouts-three-four', 'Use one Settler to empty the third and fourth hideouts. Make sure the Settler does not die in the hideout.'));
    route.push(checkpoint(prefix + '-settler-three', 'Queue the third Settler. Use a resource or crop chest if necessary.'));
  }

  function addSpeedsettlingFinalBuildings(route, speed, granaryFrom, granaryThrough) {
    const prefix = speed + '-speedsettle';
    addBuildingThrough(route, prefix + '-barracks', 'Barracks', 19, 1, 3, { exact: true });
    addBuildingThrough(route, prefix + '-academy', 'Academy', 22, 1, 10, { exact: true });
    route.push(building(prefix + '-town-hall-lv1', 'Town Hall', 24, 1, { exact: true }));
    route.push(building(prefix + '-workshop-lv1', 'Workshop', 21, 1, { exact: true }));
    addBuildingThrough(route, prefix + '-granary', 'Granary', 11, granaryFrom, granaryThrough, { exact: true });
    route.push(checkpoint(prefix + '-remaining-chests', 'Use a resource or crop chest now if you have not already.'));
    route.push(checkpoint(prefix + '-demolish-workshop', 'Demolish the Workshop. Demolish the Academy or other buildings too if you are short on resources.'));
    route.push(checkpoint(prefix + '-small-party', 'Start a Small Party.'));
    route.push(checkpoint(prefix + '-relocate', 'Relocate close to your intended settling direction.'));
    route.push(checkpoint(prefix + '-send-settlers', 'Send the Settlers.'));
  }

  function buildX2SpeedsettleRoute() {
    const route = [];
    const prefix = 'x2-speedsettle';
    addSpeedsettlingOpening(route, 'x2');

    // x2 uniquely requires Main Building 7 before the Residence.
    addBuildingThrough(route, prefix + '-main-building', 'Main Building', 15, 1, 7, { exact: true });
    route.push(building(prefix + '-residence-lv1', 'Residence', 25, 1, { exact: true }));
    route.push(checkpoint(prefix + '-gold-bonuses', 'Buy gold and activate Travian Plus, Resource Boost, and Crop Boost.'));

    // x2 needs both Warehouse and Granary Level 5 before Residence Level 5.
    addBuildingThrough(route, prefix + '-warehouse', 'Warehouse', 10, 4, 5, { exact: true });
    addBuildingThrough(route, prefix + '-granary', 'Granary', 11, 4, 5, { exact: true });
    addBuildingThrough(route, prefix + '-residence', 'Residence', 25, 2, 5, { exact: true });
    addSpeedsettlingSettlerPhase(route, 'x2', {
      auctionBid: true,
      hideoutWait: 'Wait for the third and fourth hideouts to spawn, 1h40m after clearing the first and second respectively. Keep adventuring for the possibility of another resource adventure.'
    });

    addBuildingThrough(route, prefix + '-main-building', 'Main Building', 15, 8, 10, { exact: true });
    route.push(checkpoint(prefix + '-demolish-residence', 'Demolish the Residence, but only after all Settlers have finished training. Residence demolition takes 2h10min on x2.'));

    addSpeedsettlingFinalBuildings(route, 'x2', 6, 7);
    return route;
  }

  function buildX5SpeedsettleRoute() {
    const route = [];
    const prefix = 'x5-speedsettle';
    addSpeedsettlingOpening(route, 'x5');

    // x5 Main Building reaches Level 5 first; warehouse upgrade to Level 5
    // is intentionally postponed until AFTER Residence demolition.
    addBuildingThrough(route, prefix + '-main-building', 'Main Building', 15, 1, 5, { exact: true });
    route.push(building(prefix + '-residence-lv1', 'Residence', 25, 1, { exact: true }));
    route.push(checkpoint(prefix + '-gold-bonuses', 'Buy gold and activate Travian Plus, Resource Boost, and Crop Boost.'));
    addBuildingThrough(route, prefix + '-residence', 'Residence', 25, 2, 5, { exact: true });
    addSpeedsettlingSettlerPhase(route, 'x5', {
      auctionBid: false,
      hideoutWait: 'Wait for the third and fourth hideouts to spawn. This takes 1h15m on x5. Keep adventuring for the possibility of another resource adventure.'
    });

    addBuildingThrough(route, prefix + '-main-building', 'Main Building', 15, 6, 10, { exact: true });
    route.push(checkpoint(prefix + '-demolish-residence', 'Demolish the Residence, but only after all Settlers have finished training. Residence demolition takes 51 minutes on x5.'));

    // Level 4 fits the rubble; Level 5 unlocks additional quest resources.
    addBuildingThrough(route, prefix + '-warehouse', 'Warehouse', 10, 4, 5, { exact: true });
    route.push(checkpoint(prefix + '-warehouse-quest-reward', 'Warehouse Level 4 is sufficient for Residence rubble, but Level 5 fully accommodates it and unlocks an extra quest reward. Collect that reward.'));

    addSpeedsettlingFinalBuildings(route, 'x5', 4, 5);
    return route;
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

    route.push(instruction('x3-residence-ten-reward', 'Collect Level 10 Residence Quest Reward'));
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

  const DEFINITIONS = Object.freeze({
    x1_speedsettle: {
      name: 'x1 Speedsettling',
      description: 'An APES x1 speedsettling route from the tutorial through hideouts, settler training, Residence demolition, a Small Party, relocation and settling.',
      meta: {
        official: true,
        version: '1.0',
        speed: 'x1',
        villageType: 'Spawn village',
        author: 'APES QoL',
        maintainedBy: 'APES QoL',
        contributors: [],
        goal: 'Follow the 36-step x1 Speedsettling guide to send settlers.'
      },
      steps: buildX1SpeedsettleRoute()
    },
    x2_speedsettle: {
      name: 'x2 Speedsettling',
      description: 'A chronological APES x2 speedsettling route, including 1h40m hideout respawns, a 2h10min Residence demolition and a Small Party before settling.',
      meta: {
        official: true,
        version: '1.0',
        speed: 'x2',
        villageType: 'Spawn village',
        author: 'APES QoL',
        maintainedBy: 'APES QoL',
        contributors: [],
        goal: 'Follow the x2 Speedsettling guide to send three settlers.'
      },
      steps: buildX2SpeedsettleRoute()
    },
    x5_speedsettle: {
      name: 'x5 Speedsettling',
      description: 'A chronological APES x5 speedsettling route, including 1h15m hideout respawns, a 51-minute Residence demolition and Warehouse Level 5 after demolition.',
      meta: {
        official: true,
        version: '1.0',
        speed: 'x5',
        villageType: 'Spawn village',
        author: 'APES QoL',
        maintainedBy: 'APES QoL',
        contributors: [],
        goal: 'Follow the x5 Speedsettling guide to send three settlers.'
      },
      steps: buildX5SpeedsettleRoute()
    },
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

  function metadataSignature(id, meta) {
    return [id, clean(meta.version), clean(meta.speed), clean(meta.villageType), clean(meta.author), clean(meta.goal), ...(meta.contributors || []).map(clean)].join('|');
  }

  function decorateHub() {
    decorateQueued = false;
    const hub = document.getElementById(HUB_ID);
    if (!hub) return;

    for (const [id, definition] of Object.entries(DEFINITIONS)) {
      const item = hub.querySelector(`[data-roadmap-select="${CSS.escape(id)}"]`);
      const small = item?.querySelector('small');
      const desired = `APES Official · ${definition.meta.speed} · v${definition.meta.version}`;
      if (small && small.textContent !== desired) small.textContent = desired;
    }

    const id = selectedId();
    const definition = DEFINITIONS[id];
    const head = hub.querySelector('.qol-rm-main-head');
    if (!head) return;

    const currentMeta = hub.querySelector('.qol-rmog-meta');
    if (!definition) {
      currentMeta?.remove();
      return;
    }

    const badge = head.querySelector('.qol-rm-badge');
    if (badge && badge.textContent !== 'APES Official') badge.textContent = 'APES Official';

    const signature = metadataSignature(id, definition.meta);
    let meta = currentMeta;
    if (!meta || meta.dataset.roadmapId !== id) {
      currentMeta?.remove();
      meta = document.createElement('div');
      meta.className = 'qol-rmog-meta';
      meta.dataset.roadmapId = id;
      meta.dataset.signature = signature;
      meta.innerHTML = metadataMarkup(definition.meta);
      head.insertAdjacentElement('afterend', meta);
    } else if (meta.dataset.signature !== signature) {
      meta.dataset.signature = signature;
      meta.innerHTML = metadataMarkup(definition.meta);
    }

    const routeHead = hub.querySelector('.qol-rm-route-head span');
    const routeHint = 'Exact order followed by the runner.';
    if (routeHead && routeHead.textContent !== routeHint) routeHead.textContent = routeHint;
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
