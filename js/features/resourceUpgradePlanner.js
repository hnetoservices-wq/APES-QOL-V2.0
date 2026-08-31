(() => {
  'use strict';

  const APES = window.APES;
  const FEATURE_KEY = 'resourceUpgradePlanner';
  const BUTTON_ID = 'qol-resource-planner-toggle-btn';
  const PANEL_ID = 'qol-resource-upgrade-planner-overlay';
  const STYLE_ID = 'qol-resource-upgrade-planner-styles';
  const SCAN_LOCK_ID = 'qol-resource-upgrade-planner-scan-lock';
  const FALLBACK_STORAGE_KEY = `apes_resource_upgrade_planner_v2_${window.location.hostname}`;
  const STORAGE_OPTIONS = Object.freeze({
    feature: FEATURE_KEY,
    key: 'plannerState',
    scope: 'player'
  });
  const RESOURCE_TYPE_MAP = Object.freeze({
    1: 'wood',
    2: 'clay',
    3: 'iron',
    4: 'crop'
  });
  const PRODUCTION_BUILDING_MAP = Object.freeze({
    5: 'sawmill',
    6: 'brickyard',
    7: 'foundry',
    8: 'mill',
    9: 'bakery',
    18: 'embassy'
  });
  const RESOURCE_KEYS = Object.freeze(['wood', 'clay', 'iron', 'crop']);
  const RESOURCE_LABELS = Object.freeze({
    wood: 'Wood',
    clay: 'Clay',
    iron: 'Iron',
    crop: 'Crop'
  });
  const RESOURCE_ICON_CLASSES = Object.freeze({
    wood: 'unit_wood_small_illu resType1',
    clay: 'unit_clay_small_illu resType2',
    iron: 'unit_iron_small_illu resType3',
    crop: 'unit_crop_small_illu resType4'
  });
  const WORLD_SPEED_VALUES = Object.freeze([1, 2, 3, 5]);
  const LAYOUTS = Object.freeze({
    '4-4-4-6': [4, 4, 4, 6],
    '3-3-3-9': [3, 3, 3, 9],
    '1-1-1-15': [1, 1, 1, 15],
    '3-4-5-6': [3, 4, 5, 6],
    '3-5-4-6': [3, 5, 4, 6],
    '4-3-5-6': [4, 3, 5, 6],
    '4-5-3-6': [4, 5, 3, 6],
    '5-3-4-6': [5, 3, 4, 6],
    '5-4-3-6': [5, 4, 3, 6],
    '3-4-4-7': [3, 4, 4, 7],
    '4-3-4-7': [4, 3, 4, 7],
    '4-4-3-7': [4, 4, 3, 7]
  });
  const FIELD_PRODUCTION = Object.freeze([2, 5, 9, 15, 22, 33, 50, 70, 100, 145, 200, 280, 375, 495, 635, 800, 1000, 1300, 1600, 2000, 2450]);
  const FIELD_COSTS = Object.freeze({
    wood: [null, [40, 100, 50, 60], [65, 165, 85, 100], [110, 280, 140, 165], [185, 465, 235, 280], [310, 780, 390, 465], [520, 1300, 650, 780], [870, 2170, 1085, 1300], [1450, 3625, 1810, 2175], [2420, 6050, 3025, 3630], [4040, 10105, 5050, 6060], [6750, 16870, 8435, 10125], [11270, 28175, 14090, 16905], [18820, 47055, 23525, 28230], [31430, 78580, 39290, 47150], [52490, 131230, 65615, 78740], [87660, 219155, 109575, 131490], [146395, 365985, 182995, 219590], [244480, 611195, 305600, 366715], [408280, 1020695, 510350, 612420], [681825, 1704565, 852280, 1022740]],
    clay: [null, [80, 40, 80, 50], [135, 65, 135, 85], [225, 110, 225, 140], [375, 185, 375, 235], [620, 310, 620, 390], [1040, 520, 1040, 650], [1735, 870, 1735, 1085], [2900, 1450, 2900, 1810], [4840, 2420, 4840, 3025], [8080, 4040, 8080, 5050], [13500, 6750, 13500, 8435], [22540, 11270, 22540, 14090], [37645, 18820, 37645, 23525], [62865, 31430, 62865, 39290], [104985, 52490, 104985, 65615], [175320, 87660, 175320, 109575], [292790, 146395, 292790, 182995], [488955, 244480, 488955, 305600], [816555, 408280, 816555, 510350], [1363650, 681825, 1363650, 852280]],
    iron: [null, [100, 80, 30, 60], [165, 135, 50, 100], [280, 225, 85, 165], [465, 375, 140, 280], [780, 620, 235, 465], [1300, 1040, 390, 780], [2170, 1735, 650, 1300], [3625, 2900, 1085, 2175], [6050, 4840, 1815, 3630], [10105, 8080, 3030, 6060], [16870, 13500, 5060, 10125], [28175, 22540, 8455, 16905], [47055, 37645, 14115, 28230], [78580, 62865, 23575, 47150], [131230, 104985, 39370, 78740], [219155, 175320, 65745, 131490], [365985, 292790, 109795, 219590], [611195, 488955, 183360, 366715], [1020695, 816555, 306210, 612420], [1704565, 1363650, 511370, 1022740]],
    crop: [null, [75, 90, 85, 0], [125, 150, 140, 0], [210, 250, 235, 0], [350, 420, 395, 0], [585, 700, 660, 0], [975, 1170, 1105, 0], [1625, 1950, 1845, 0], [2715, 3260, 3080, 0], [4535, 5445, 5140, 0], [7575, 9095, 8590, 0], [12655, 15185, 14340, 0], [21130, 25360, 23950, 0], [35290, 42350, 39995, 0], [58935, 70720, 66795, 0], [98420, 118105, 111545, 0], [164365, 197240, 186280, 0], [274490, 329385, 311085, 0], [458395, 550075, 519515, 0], [765520, 918625, 867590, 0], [1278420, 1534105, 1448880, 0]]
  });
  const BUILDINGS = Object.freeze({
    sawmill: {
      label: 'Sawmill',
      resource: 'wood',
      max: 5,
      prerequisite: state => maxField(state, 'wood') >= 10,
      costs: [null, [520, 380, 290, 90], [935, 685, 520, 160], [1685, 1230, 940, 290], [3035, 2215, 1690, 525], [5460, 3990, 3045, 945]]
    },
    brickyard: {
      label: 'Brickyard',
      resource: 'clay',
      max: 5,
      prerequisite: state => maxField(state, 'clay') >= 10,
      costs: [null, [440, 480, 320, 50], [790, 865, 575, 90], [1425, 1555, 1035, 160], [2565, 2800, 1865, 290], [4620, 5040, 3360, 525]]
    },
    foundry: {
      label: 'Iron Foundry',
      resource: 'iron',
      max: 5,
      prerequisite: state => maxField(state, 'iron') >= 10,
      costs: [null, [200, 450, 510, 120], [360, 810, 920, 215], [650, 1460, 1650, 390], [1165, 2625, 2975, 700], [2100, 4725, 5355, 1260]]
    },
    mill: {
      label: 'Grain Mill',
      resource: 'crop',
      max: 5,
      prerequisite: state => maxField(state, 'crop') >= 5,
      costs: [null, [500, 440, 380, 1240], [900, 790, 685, 2230], [1620, 1425, 1230, 4020], [2915, 2565, 2215, 7230], [5250, 4620, 3990, 13015]]
    },
    bakery: {
      label: 'Bakery',
      resource: 'crop',
      max: 5,
      prerequisite: state => maxField(state, 'crop') >= 10 && Number(state.buildings.mill || 0) >= 5,
      costs: [null, [1200, 1480, 870, 1600], [2160, 2665, 1565, 2880], [3890, 4795, 2820, 5185], [7000, 8630, 5075, 9330], [12595, 15535, 9135, 16795]]
    }
  });
  const OASIS_PRESETS = Object.freeze({
    none: {
      label: 'No bonus',
      values: [0, 0, 0, 0]
    },
    wood25: {
      label: 'Wood +25%',
      values: [25, 0, 0, 0]
    },
    woodCrop: {
      label: 'Wood +25% / Crop +25%',
      values: [25, 0, 0, 25]
    },
    clay25: {
      label: 'Clay +25%',
      values: [0, 25, 0, 0]
    },
    clayCrop: {
      label: 'Clay +25% / Crop +25%',
      values: [0, 25, 0, 25]
    },
    iron25: {
      label: 'Iron +25%',
      values: [0, 0, 25, 0]
    },
    ironCrop: {
      label: 'Iron +25% / Crop +25%',
      values: [0, 0, 25, 25]
    },
    crop25: {
      label: 'Crop +25%',
      values: [0, 0, 0, 25]
    },
    crop50: {
      label: 'Crop +50%',
      values: [0, 0, 0, 50]
    },
    custom: {
      label: 'Custom / partial bonus',
      values: null
    }
  });
  const DEFAULT_STATE = Object.freeze({
    layout: '4-4-4-6',
    maxLevel: 10,
    speed: 1,
    steps: 15,
    goldBoost: false,
    fields: {
      wood: [0, 0, 0, 0],
      clay: [0, 0, 0, 0],
      iron: [0, 0, 0, 0],
      crop: [0, 0, 0, 0, 0, 0]
    },
    buildings: {
      sawmill: 0,
      brickyard: 0,
      foundry: 0,
      mill: 0,
      bakery: 0,
      embassy: 0
    },
    oases: [{
      state: 'none',
      preset: 'none',
      bonuses: [0, 0, 0, 0]
    }, {
      state: 'none',
      preset: 'none',
      bonuses: [0, 0, 0, 0]
    }, {
      state: 'none',
      preset: 'none',
      bonuses: [0, 0, 0, 0]
    }],
    completionPlanKey: '',
    completedSteps: []
  });
  let state = normalizeState(null);
  let stateLoaded = false;
  let loadPromise = null;
  let resultMeta = null;
  let scanToken = 0;
  let isScanning = false;
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function clamp(value, min, max, fallback = min) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  }
  function enabled() {
    return typeof window.isQolEnabled !== 'function' || window.isQolEnabled(FEATURE_KEY) === true;
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function getLayoutCounts(layout) {
    return LAYOUTS[layout] || LAYOUTS['4-4-4-6'];
  }
  function maxField(current, resource) {
    return Math.max(0, ...(current.fields?.[resource] || [0]));
  }
  function productionTotal(values) {
    return values.reduce((sum, value) => sum + Number(value || 0), 0);
  }
  function totalCost(cost) {
    return productionTotal(cost);
  }
  function speedFromText(value) {
    const text = String(value || '').toLowerCase();
    const match = text.match(/x\s*([1235])(?=[.\s_:/-]|$)|(?:speed|world)[\s_:/-]*x?\s*([1235])(?=[.\s_:/-]|$)/i);
    const speed = Number(match?.[1] || match?.[2]);
    return WORLD_SPEED_VALUES.includes(speed) ? speed : null;
  }
  function detectWorldSpeed() {
    const hostnameSpeed = speedFromText(window.location.hostname);
    if (hostnameSpeed) return {
      speed: hostnameSpeed,
      detected: true,
      source: 'server name'
    };
    const titleSpeed = speedFromText(document.title);
    if (titleSpeed) return {
      speed: titleSpeed,
      detected: true,
      source: 'page title'
    };
    const selectors = ['[data-world-speed]', '[data-game-speed]', '[data-server-speed]', 'meta[name="world-speed"]', 'meta[name="game-speed"]', 'meta[name="server-speed"]'];
    for (const element of document.querySelectorAll(selectors.join(','))) {
      const raw = element.getAttribute('data-world-speed') || element.getAttribute('data-game-speed') || element.getAttribute('data-server-speed') || element.getAttribute('content') || element.textContent;
      const numeric = Number(raw);
      const speed = WORLD_SPEED_VALUES.includes(numeric) ? numeric : speedFromText(raw);
      if (speed) return {
        speed,
        detected: true,
        source: 'game data'
      };
    }
    return {
      speed: 1,
      detected: false,
      source: 'x1 fallback'
    };
  }
  function applyDetectedWorldSpeed() {
    const detection = detectWorldSpeed();
    if (detection.detected) state.speed = detection.speed;
    return detection;
  }
  function normalizeFields(fields, layout, maxLevel) {
    const counts = getLayoutCounts(layout);
    return Object.fromEntries(RESOURCE_KEYS.map((resource, index) => {
      const source = Array.isArray(fields?.[resource]) ? fields[resource] : [];
      return [resource, Array.from({
        length: counts[index]
      }, (_, fieldIndex) => clamp(source[fieldIndex] ?? 0, 0, maxLevel, 0))];
    }));
  }
  function normalizeOasis(oasis) {
    const status = ['none', 'available', 'annexed'].includes(oasis?.state) ? oasis.state : 'none';
    const preset = Object.hasOwn(OASIS_PRESETS, oasis?.preset) ? oasis.preset : 'custom';
    const bonuses = Array.from({
      length: 4
    }, (_, index) => clamp(oasis?.bonuses?.[index] ?? 0, 0, 150, 0));
    return {
      state: status,
      preset,
      bonuses
    };
  }
  function normalizeState(raw) {
    const next = clone(DEFAULT_STATE);
    if (raw && typeof raw === 'object') {
      next.layout = Object.hasOwn(LAYOUTS, raw.layout) ? raw.layout : next.layout;
      next.maxLevel = [10, 12, 20].includes(Number(raw.maxLevel)) ? Number(raw.maxLevel) : 10;
      next.speed = [1, 2, 3, 5].includes(Number(raw.speed)) ? Number(raw.speed) : 1;
      next.steps = clamp(raw.steps, 15, 100, 15);
      next.goldBoost = raw.goldBoost === true;
      next.fields = normalizeFields(raw.fields, next.layout, next.maxLevel);
      Object.keys(next.buildings).forEach(key => {
        next.buildings[key] = clamp(raw.buildings?.[key] ?? 0, 0, key === 'embassy' ? 20 : 5, 0);
      });
      next.oases = Array.from({
        length: 3
      }, (_, index) => normalizeOasis(raw.oases?.[index]));
      next.completionPlanKey = typeof raw.completionPlanKey === 'string' ? raw.completionPlanKey : '';
      next.completedSteps = Array.isArray(raw.completedSteps) ? [...new Set(raw.completedSteps.map(Number).filter(step => Number.isInteger(step) && step > 0 && step <= 100))] : [];
    }
    const detectedSpeed = detectWorldSpeed();
    if (detectedSpeed.detected) next.speed = detectedSpeed.speed;
    next.fields = normalizeFields(next.fields, next.layout, next.maxLevel);
    return next;
  }
  async function loadState() {
    if (stateLoaded) return state;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      let saved = null;
      try {
        if (APES?.storage?.get) saved = await APES.storage.get(STORAGE_OPTIONS, null);
      } catch (error) {
        console.warn('[APES Resource Planner] v2 storage read failed:', error);
      }
      if (!saved) {
        try {
          saved = JSON.parse(localStorage.getItem(FALLBACK_STORAGE_KEY) || 'null');
        } catch (_) {}
      }
      state = normalizeState(saved);
      stateLoaded = true;
      renderInputState();
      return state;
    })();
    return loadPromise;
  }
  async function saveState() {
    const snapshot = clone(state);
    try {
      if (APES?.storage?.set) {
        await APES.storage.set(STORAGE_OPTIONS, snapshot);
        return;
      }
    } catch (error) {
      console.warn('[APES Resource Planner] v2 storage write failed:', error);
    }
    try {
      localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (_) {}
  }
  function sleep(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
  }
  function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }
  function parseNumber(value) {
    const cleaned = String(value ?? '').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[^\d,.-]/g, '').replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function currentVillageIdentity() {
    const contextName = APES?.context?.getVillageName?.();
    const domName = document.querySelector('.currentVillageName .dropdownHead .selectedItem .villageEntry, ' + '#villageList .dropdownHead .selectedItem .villageEntry, ' + '.dropdownHead .selectedItem .villageEntry')?.textContent;
    const villageName = normalizeText(contextName && contextName !== 'Unknown village' ? contextName : domName);
    const hashVillageId = String(window.location.hash || '').match(/(?:^|\/)villId:(\d+)/i)?.[1];
    const contextVillageId = APES?.context?.getVillageId?.();
    const villageId = /^\d+$/.test(String(hashVillageId || contextVillageId || '')) ? String(hashVillageId || contextVillageId) : '';
    return {
      villageName,
      villageId
    };
  }
  function villageRoute(page, villageId, extras = []) {
    return [`page:${page}`, villageId ? `villId:${villageId}` : '', ...extras].filter(Boolean);
  }
  function navigateTo(parts) {
    const target = `#/${parts.filter(Boolean).join('/')}`;
    if (window.location.hash !== target) window.location.hash = target;
    return target;
  }
  function scanIsCurrent(token) {
    return token === scanToken && enabled();
  }
  async function waitForStableRead(reader, isReady, token, timeout = 9000) {
    const started = performance.now();
    let lastSignature = '';
    let stableReads = 0;
    while (performance.now() - started < timeout) {
      if (!scanIsCurrent(token)) throw new Error('Scan cancelled.');
      const value = reader();
      if (isReady(value)) {
        const signature = JSON.stringify(value);
        if (signature === lastSignature) stableReads += 1;else {
          lastSignature = signature;
          stableReads = 1;
        }
        if (stableReads >= 3) return value;
      } else {
        lastSignature = '';
        stableReads = 0;
      }
      await sleep(140);
    }
    return null;
  }
  function elementClassNumber(element, expression) {
    const match = String(element?.className || '').match(expression);
    return match ? Number(match[1]) : null;
  }
  function readVillageBuildings() {
    const root = document.querySelector('.mainContentBackground.villageBackground #villageView, #villageView:not(#villageViewRes)');
    if (!root) return null;
    const buildings = {};
    let embassyLocation = null;
    root.querySelectorAll('building-location').forEach(wrapper => {
      const marker = wrapper.querySelector('[class*="buildingId"], .buildingStatusButton[class*="type_"]');
      const buildingId = elementClassNumber(marker, /(?:buildingId|type_)(\d+)/i);
      const key = PRODUCTION_BUILDING_MAP[buildingId];
      if (!key) return;
      const level = Math.max(0, Math.round(parseNumber(wrapper.querySelector('.buildingLevel')?.textContent)));
      buildings[key] = level;
      if (buildingId === 18) {
        embassyLocation = elementClassNumber(wrapper, /buildingLocation(\d+)/i) ?? elementClassNumber(wrapper.querySelector('.buildingStatusButton'), /location_(\d+)/i);
      }
    });
    Object.values(PRODUCTION_BUILDING_MAP).forEach(key => {
      if (!Object.hasOwn(buildings, key)) buildings[key] = 0;
    });
    return {
      buildings,
      embassyLocation
    };
  }
  function oasisPresetFor(bonuses) {
    return Object.entries(OASIS_PRESETS).find(([key, preset]) => key !== 'custom' && preset.values?.every((value, index) => value === bonuses[index]))?.[0] || 'custom';
  }
  function readAssignedOases(villageName, villageId) {
    const root = document.querySelector('.contentBox.oasisInRange');
    if (!root) return null;
    const normalizedVillageName = normalizeText(villageName).toLocaleLowerCase();
    const oases = [];
    root.querySelectorAll('tr[ng-repeat*="oasis"], tbody tr').forEach(row => {
      const villageLink = row.querySelector('td.village .villageLink');
      if (!villageLink) return;
      const assignedVillageId = villageLink.getAttribute('villageid') || '';
      const assignedVillageName = normalizeText(villageLink.textContent).toLocaleLowerCase();
      const idMatches = villageId && assignedVillageId === villageId;
      const nameMatches = normalizedVillageName && assignedVillageName === normalizedVillageName;
      if (!idMatches && !nameMatches) return;
      const bonuses = RESOURCE_KEYS.map(resource => Math.max(0, parseNumber(row.querySelector(`td.resources .${resource}Value .resourceValue`)?.textContent)));
      if (!productionTotal(bonuses)) return;
      oases.push({
        state: 'annexed',
        preset: oasisPresetFor(bonuses),
        bonuses
      });
    });
    return {
      ready: true,
      oases: oases.slice(0, 3)
    };
  }
  function readResourceFields() {
    const root = document.querySelector('#villageViewRes');
    if (!root) return null;
    const fields = {
      wood: [],
      clay: [],
      iron: [],
      crop: []
    };
    const seenLocations = new Set();
    root.querySelectorAll('building-location').forEach(wrapper => {
      const location = elementClassNumber(wrapper, /buildingLocation(\d+)/i);
      if (!Number.isInteger(location) || location < 1 || location > 18 || seenLocations.has(location)) return;
      const status = wrapper.querySelector('.buildingStatusButton[class*="type_"]');
      const type = elementClassNumber(status, /type_(\d+)/i);
      const resource = RESOURCE_TYPE_MAP[type];
      if (!resource) return;
      const levelNode = wrapper.querySelector('.buildingLevel');
      if (!levelNode) return;
      seenLocations.add(location);
      fields[resource].push({
        location,
        level: Math.max(0, Math.round(parseNumber(levelNode.textContent)))
      });
    });
    RESOURCE_KEYS.forEach(resource => fields[resource].sort((a, b) => a.location - b.location));
    const counts = RESOURCE_KEYS.map(resource => fields[resource].length);
    const layout = counts.join('-');
    return {
      ready: seenLocations.size === 18 && Object.hasOwn(LAYOUTS, layout),
      layout,
      fields: Object.fromEntries(RESOURCE_KEYS.map(resource => [resource, fields[resource].map(field => field.level)]))
    };
  }
  function setScanStatus(message, tone = 'neutral') {
    const status = document.querySelector(`#${PANEL_ID} [data-scan-status]`);
    if (status) {
      status.textContent = message;
      status.dataset.tone = tone;
    }
    const lockStatus = document.querySelector(`#${SCAN_LOCK_ID} [data-lock-status]`);
    if (lockStatus) lockStatus.textContent = message;
  }
  function showScanLock() {
    document.getElementById(SCAN_LOCK_ID)?.remove();
    const lock = document.createElement('div');
    lock.id = SCAN_LOCK_ID;
    lock.setAttribute('role', 'status');
    lock.setAttribute('aria-live', 'polite');
    lock.innerHTML = `
            <div class="qol-rup-scan-lock-card">
                <strong>Scanning village development…</strong>
                <span data-lock-status>Preparing village scan…</span>
            </div>
        `;
    document.body.appendChild(lock);
  }
  function removeScanLock() {
    document.getElementById(SCAN_LOCK_ID)?.remove();
  }
  function setScanBusy(busy) {
    isScanning = busy;
    const button = document.querySelector(`#${PANEL_ID} [data-action="scan"]`);
    button?.classList.toggle('qol-disabled', busy);
    button?.setAttribute('aria-disabled', busy ? 'true' : 'false');
    if (button) button.textContent = busy ? 'Scanning…' : 'Scan village';
  }
  async function scanCurrentVillage() {
    if (isScanning) return;
    const token = ++scanToken;
    const identity = currentVillageIdentity();
    if (!identity.villageName) {
      showError('APES could not identify the active village. Close the village dropdown and try again.');
      return;
    }
    hideError();
    setScanBusy(true);
    showScanLock();
    const warnings = [];
    const speedInfo = applyDetectedWorldSpeed();
    try {
      setScanStatus(`Opening ${identity.villageName}…`);
      navigateTo(villageRoute('village', identity.villageId));
      const village = await waitForStableRead(readVillageBuildings, value => Boolean(value), token);
      if (!village) throw new Error('The village building view did not finish loading.');
      state.buildings = {
        ...state.buildings,
        ...village.buildings
      };
      if (village.embassyLocation && village.buildings.embassy > 0) {
        setScanStatus('Checking Embassy oasis assignments…');
        navigateTo(villageRoute('village', identity.villageId, [`location:${village.embassyLocation}`, 'window:building', 'tab:Oases']));
        const oasisResult = await waitForStableRead(() => readAssignedOases(identity.villageName, identity.villageId), value => value?.ready === true, token);
        if (oasisResult) {
          state.oases = Array.from({
            length: 3
          }, (_, index) => oasisResult.oases[index] || normalizeOasis(null));
        } else {
          warnings.push('Embassy oases could not be read');
        }
      } else {
        state.buildings.embassy = 0;
        state.oases = Array.from({
          length: 3
        }, () => normalizeOasis(null));
      }
      setScanStatus('Reading all 18 resource fields…');
      navigateTo(villageRoute('resources', identity.villageId));
      const resourceResult = await waitForStableRead(readResourceFields, value => value?.ready === true, token);
      if (!resourceResult) throw new Error('APES could not read all 18 resource fields.');
      const highestLevel = Math.max(...RESOURCE_KEYS.flatMap(resource => resourceResult.fields[resource]));
      if (highestLevel > 12) state.maxLevel = 20;else if (highestLevel > 10 && state.maxLevel < 12) state.maxLevel = 12;
      state.layout = resourceResult.layout;
      state.fields = resourceResult.fields;
      stateLoaded = true;
      resultMeta = null;
      await saveState();
      renderInputState();
      runCalculation();
      setInputSectionsCollapsed(true);
      const annexed = state.oases.filter(oasis => oasis.state === 'annexed').length;
      const suffix = warnings.length ? ` (${warnings.join('; ')}.)` : '';
      const speedText = speedInfo.detected ? `x${state.speed} world detected from ${speedInfo.source}` : `x${state.speed} world`;
      setScanStatus(`Scanned ${identity.villageName}: ${state.layout}, 18 fields, ${annexed} assigned oasis${annexed === 1 ? '' : 'es'}, ${speedText}.${suffix}`, warnings.length ? 'warning' : 'success');
    } catch (error) {
      if (scanIsCurrent(token)) {
        const message = error?.message || String(error);
        showError(message);
        setScanStatus(message, 'error');
      }
    } finally {
      if (token === scanToken) {
        setScanBusy(false);
        removeScanLock();
      }
    }
  }
  function getOasisBonusTotals(current, annexedOnly = true) {
    const totals = [0, 0, 0, 0];
    current.oases.forEach(oasis => {
      if (oasis.state === 'none' || annexedOnly && oasis.state !== 'annexed') return;
      oasis.bonuses.forEach((value, index) => {
        totals[index] += Number(value || 0);
      });
    });
    return totals;
  }
  function computeProduction(current) {
    const base = RESOURCE_KEYS.map(resource => current.fields[resource].reduce((sum, level) => sum + FIELD_PRODUCTION[clamp(level, 0, 20, 0)], 0) * current.speed);
    const oasis = getOasisBonusTotals(current, true);
    const buildingBonus = [Number(current.buildings.sawmill || 0) * 5, Number(current.buildings.brickyard || 0) * 5, Number(current.buildings.foundry || 0) * 5, (Number(current.buildings.mill || 0) + Number(current.buildings.bakery || 0)) * 5];
    const gold = current.goldBoost ? 1.25 : 1;
    return base.map((value, index) => value * (1 + (oasis[index] + buildingBonus[index]) / 100) * gold);
  }
  function availableOasisSlots(embassyLevel) {
    if (embassyLevel >= 20) return 3;
    if (embassyLevel >= 10) return 2;
    if (embassyLevel >= 1) return 1;
    return 0;
  }
  function generateCandidates(current) {
    const candidates = [];
    RESOURCE_KEYS.forEach(resource => {
      current.fields[resource].forEach((level, index) => {
        const toLevel = Number(level) + 1;
        if (toLevel <= current.maxLevel && FIELD_COSTS[resource][toLevel]) {
          candidates.push({
            kind: 'field',
            resource,
            index,
            fromLevel: Number(level),
            toLevel,
            cost: FIELD_COSTS[resource][toLevel].slice(),
            label: `${RESOURCE_LABELS[resource]} field ${index + 1}: ${level} → ${toLevel}`
          });
        }
      });
    });
    Object.entries(BUILDINGS).forEach(([key, building]) => {
      const fromLevel = Number(current.buildings[key] || 0);
      const toLevel = fromLevel + 1;
      if (toLevel <= building.max && building.prerequisite(current) && building.costs[toLevel]) {
        candidates.push({
          kind: 'building',
          building: key,
          fromLevel,
          toLevel,
          cost: building.costs[toLevel].slice(),
          label: `${building.label}: ${fromLevel} → ${toLevel}`
        });
      }
    });
    return candidates;
  }
  function applyCandidate(current, candidate) {
    if (candidate.kind === 'field') current.fields[candidate.resource][candidate.index] = candidate.toLevel;
    if (candidate.kind === 'building') current.buildings[candidate.building] = candidate.toLevel;
  }
  function timeToAfford(cost, balance, production) {
    let wait = 0;
    for (let index = 0; index < 4; index += 1) {
      const deficit = Math.max(0, Number(cost[index] || 0) - Number(balance[index] || 0));
      if (!deficit) continue;
      if (production[index] <= 0) return Infinity;
      wait = Math.max(wait, deficit / production[index]);
    }
    return wait;
  }
  function evaluateCandidate(current, candidate, balance, production) {
    const test = clone(current);
    applyCandidate(test, candidate);
    const after = computeProduction(test);
    const gain = after.map((value, index) => value - production[index]);
    const gainTotal = productionTotal(gain);
    if (gainTotal <= 1e-7) return null;
    const costTotal = totalCost(candidate.cost);
    const waitHours = timeToAfford(candidate.cost, balance, production);
    if (!Number.isFinite(waitHours)) return null;
    return {
      after,
      gain,
      gainTotal,
      costTotal,
      waitHours,
      roiHours: costTotal === 0 ? 0 : costTotal / gainTotal
    };
  }
  function validateState(current) {
    const annexed = current.oases.filter(oasis => oasis.state === 'annexed').length;
    const slots = availableOasisSlots(current.buildings.embassy);
    if (annexed > slots) {
      return `${annexed} oases are marked annexed, but Embassy level ${current.buildings.embassy} supports only ${slots}.`;
    }
    if (current.buildings.bakery > 0 && current.buildings.mill < 5) return 'Bakery requires Grain Mill level 5.';
    return '';
  }
  function calculatePlan(input) {
    const current = normalizeState(clone(input));
    const validation = validateState(current);
    if (validation) throw new Error(validation);
    const startState = clone(current);
    const startProduction = computeProduction(current);
    let production = startProduction.slice();
    let balance = [0, 0, 0, 0];
    let elapsedHours = 0;
    const results = [];
    for (let step = 1; step <= current.steps; step += 1) {
      const ranked = generateCandidates(current).map(candidate => ({
        candidate,
        metrics: evaluateCandidate(current, candidate, balance, production)
      })).filter(entry => entry.metrics).sort((a, b) => {
        const roi = a.metrics.roiHours - b.metrics.roiHours;
        if (Math.abs(roi) > 1e-9) return roi;
        const wait = a.metrics.waitHours - b.metrics.waitHours;
        if (Math.abs(wait) > 1e-9) return wait;
        const gain = b.metrics.gainTotal - a.metrics.gainTotal;
        if (Math.abs(gain) > 1e-9) return gain;
        return a.metrics.costTotal - b.metrics.costTotal;
      });
      if (!ranked.length) break;
      const chosen = ranked[0];
      const before = production.slice();
      const wait = chosen.metrics.waitHours;
      for (let index = 0; index < 4; index += 1) {
        balance[index] += before[index] * wait;
        balance[index] = Math.max(0, balance[index] - Number(chosen.candidate.cost[index] || 0));
      }
      elapsedHours += wait;
      applyCandidate(current, chosen.candidate);
      production = chosen.metrics.after.slice();
      results.push({
        step,
        ...clone(chosen.candidate),
        productionBefore: before,
        productionAfter: production.slice(),
        gain: chosen.metrics.gain.slice(),
        gainTotal: chosen.metrics.gainTotal,
        costTotal: chosen.metrics.costTotal,
        saveHours: wait,
        roiHours: chosen.metrics.roiHours,
        elapsedHours,
        balanceAfter: balance.slice(),
        fieldsAfter: clone(current.fields),
        buildingsAfter: clone(current.buildings),
        oasesAfter: clone(current.oases)
      });
    }
    return {
      results,
      startState,
      endState: clone(current),
      startProduction,
      endProduction: production,
      elapsedHours
    };
  }
  function formatNumber(value, digits = 0) {
    return Number(value || 0).toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: 0
    });
  }
  function formatHours(hours) {
    if (!Number.isFinite(hours)) return '—';
    if (hours < 1 / 60) return '<1m';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 48) {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return m ? `${h}h ${m}m` : `${h}h`;
    }
    const days = Math.floor(hours / 24);
    const h = Math.round(hours - days * 24);
    return h ? `${days}d ${h}h` : `${days}d`;
  }
  function resourceIcon(resource, extraClass = '') {
    const label = RESOURCE_LABELS[resource] || 'Resource';
    return `<i class="qol-rup-game-resource-icon ${RESOURCE_ICON_CLASSES[resource] || ''} ${extraClass}" title="${label}" aria-label="${label}" role="img"></i>`;
  }
  function formatResourceLine(values, digits = 0) {
    return RESOURCE_KEYS.map((key, index) => `<span class="qol-rup-res" title="${RESOURCE_LABELS[key]}">${resourceIcon(key)}<strong>${formatNumber(values[index], digits)}</strong></span>`).join('');
  }
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
            #${BUTTON_ID},#${BUTTON_ID} *{box-sizing:border-box!important}
            #${BUTTON_ID}{position:fixed!important;display:flex;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;padding:0!important;margin:0!important;border:2px solid var(--qol-accent)!important;border-radius:50%!important;background:var(--qol-accent-soft)!important;color:var(--qol-accent-ink)!important;box-shadow:0 2px 4px rgba(0,0,0,.22)!important;cursor:pointer!important;z-index:9999!important;user-select:none!important}
            #${BUTTON_ID}:hover{transform:scale(1.08)!important;background:#f7f5f0!important}
            #${BUTTON_ID} svg{width:17px!important;height:17px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;pointer-events:none!important}
            #${SCAN_LOCK_ID},#${SCAN_LOCK_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${SCAN_LOCK_ID}{position:fixed!important;inset:0!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:20px!important;background:rgba(13,12,10,.78)!important;cursor:wait!important;pointer-events:auto!important;user-select:none!important}
            #${SCAN_LOCK_ID} .qol-rup-scan-lock-card{display:flex!important;flex-direction:column!important;align-items:center!important;gap:7px!important;width:min(430px,90vw)!important;padding:18px 22px!important;border:2px solid var(--qol-border)!important;border-radius:6px!important;background:#302616!important;color:#fff8e9!important;box-shadow:0 16px 48px rgba(0,0,0,.55)!important;text-align:center!important}
            #${SCAN_LOCK_ID} strong{font-size:14px!important;color:#fff!important}#${SCAN_LOCK_ID} span{font-size:10px!important;color:#f1d895!important}#${SCAN_LOCK_ID} small{font-size:8px!important;line-height:1.4!important;color:#cbbda6!important}
            #${PANEL_ID},#${PANEL_ID} *{box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;text-shadow:none!important}
            #${PANEL_ID}{position:fixed!important;inset:0!important;display:none!important;align-items:center!important;justify-content:center!important;padding:18px!important;background:rgba(18,16,13,.76)!important;z-index:2147483644!important}
            #${PANEL_ID}.qol-open{display:flex!important}
            #${PANEL_ID} .qol-rup-window{display:flex!important;flex-direction:column!important;width:min(1120px,96vw)!important;max-height:94vh!important;border:3px solid var(--qol-border)!important;border-radius:7px!important;background:#f7f5f0!important;color:#332719!important;box-shadow:0 24px 64px rgba(0,0,0,.52)!important;overflow:hidden!important}
            #${PANEL_ID} .qol-rup-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;min-height:52px!important;padding:8px 14px!important;background:linear-gradient(to bottom,var(--qol-accent-mid),var(--qol-accent-deep))!important;color:#f8f0df!important;border-bottom:1px solid var(--qol-accent-outline)!important}
            #${PANEL_ID} .qol-rup-title-wrap{display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important}
            #${PANEL_ID} .qol-rup-title-icon{display:flex!important;align-items:center!important;justify-content:center!important;width:37px!important;height:37px!important;border:1px solid rgba(255,255,255,.2)!important;border-radius:7px!important;background:rgba(0,0,0,.16)!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-rup-title-icon svg{width:23px!important;height:23px!important;fill:none!important;stroke:#fff2d7!important;stroke-width:1.7!important}
            #${PANEL_ID} .qol-rup-title{margin:0!important;color:#fffaf0!important;font-size:16px!important;font-weight:800!important;line-height:1.2!important}
            #${PANEL_ID} .qol-rup-close{display:flex!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;border:0!important;border-radius:5px!important;background:rgba(0,0,0,.2)!important;color:#fff!important;font-size:22px!important;font-weight:700!important;cursor:pointer!important}
            #${PANEL_ID} .qol-rup-close:hover{background:rgba(255,255,255,.14)!important}
            #${PANEL_ID} .qol-rup-body{overflow:auto!important;padding:11px!important;background:#ede5d7!important}
            #${PANEL_ID} .qol-rup-section{margin-bottom:9px!important;border:1px solid #cbbb9f!important;border-radius:5px!important;background:#f8f4ec!important;overflow:hidden!important}
            #${PANEL_ID} .qol-rup-section-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;padding:7px 9px!important;background:#e6dac6!important;border-bottom:1px solid #cbbb9f!important}
            #${PANEL_ID} .qol-rup-section-head[data-section-toggle]{cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-rup-section-head[data-section-toggle]:hover{background:#ddcfb8!important}
            #${PANEL_ID} .qol-rup-section-title{color:var(--qol-accent-deep)!important;font-size:10px!important;font-weight:800!important;text-transform:uppercase!important;letter-spacing:.35px!important}
            #${PANEL_ID} .qol-rup-section-chevron{display:block!important;width:9px!important;height:9px!important;margin:0 4px 4px 0!important;border-right:2px solid var(--qol-accent-deep)!important;border-bottom:2px solid var(--qol-accent-deep)!important;transform:rotate(45deg)!important;transition:transform .15s ease,margin .15s ease!important;flex:0 0 auto!important}
            #${PANEL_ID} .qol-rup-section.qol-collapsed>.qol-rup-section-head{border-bottom:0!important}
            #${PANEL_ID} .qol-rup-section.qol-collapsed>.qol-rup-section-head .qol-rup-section-chevron{margin:0 3px 0 0!important;transform:rotate(-45deg)!important}
            #${PANEL_ID} .qol-rup-section.qol-collapsed>.qol-rup-section-body{display:none!important}
            #${PANEL_ID} .qol-rup-section-body{padding:9px!important}
            #${PANEL_ID} .qol-rup-settings{display:grid!important;grid-template-columns:repeat(5,minmax(120px,1fr))!important;gap:8px!important;align-items:end!important}
            #${PANEL_ID} .qol-rup-control{display:flex!important;flex-direction:column!important;gap:3px!important;min-width:0!important}
            #${PANEL_ID} .qol-rup-control>label{color:#66513a!important;font-size:9px!important;font-weight:700!important}
            #${PANEL_ID} select,#${PANEL_ID} input[type=number]{width:100%!important;height:30px!important;padding:3px 7px!important;border:1px solid #ad9b7d!important;border-radius:3px!important;background:#fffdf8!important;color:#382b1d!important;font-size:10px!important;outline:none!important}
            #${PANEL_ID} select:focus,#${PANEL_ID} input[type=number]:focus{border-color:var(--qol-accent)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--qol-accent) 16%,transparent)!important}
            #${PANEL_ID} .qol-rup-check{display:flex!important;align-items:center!important;gap:7px!important;min-height:30px!important;padding:4px 8px!important;border:1px solid #c9baa0!important;border-radius:3px!important;background:#f1eadf!important;color:#59452e!important;font-size:9px!important;font-weight:700!important;cursor:pointer!important}
            #${PANEL_ID} .qol-rup-check input{margin:0!important}
            #${PANEL_ID} .qol-rup-fields-grid{overflow-x:auto!important;border:1px solid #d2c4ac!important;border-radius:4px!important;background:#fffdf8!important}
            #${PANEL_ID} .qol-rup-fields-table{width:100%!important}
            #${PANEL_ID} .qol-rup-fields-head,#${PANEL_ID} .qol-rup-fields-row{display:grid!important;align-items:center!important;gap:4px!important;padding:4px 6px!important}
            #${PANEL_ID} .qol-rup-fields-head{background:#eee4d3!important;border-bottom:1px solid #d2c4ac!important;color:#8b765b!important;font-size:8px!important;font-weight:800!important;text-align:center!important}
            #${PANEL_ID} .qol-rup-fields-row{border-bottom:1px solid #eee5d6!important}.qol-rup-fields-row:last-child{border-bottom:0!important}
            #${PANEL_ID} .qol-rup-fields-row input{height:29px!important;padding:2px 4px!important;text-align:center!important}
            #${PANEL_ID} .qol-rup-field-resource{display:inline-flex!important;align-items:center!important;gap:6px!important;color:#5b452d!important;font-size:10px!important}
            #${PANEL_ID} .qol-rup-field-empty{height:29px!important}
            #${PANEL_ID} .qol-rup-buildings{display:grid!important;grid-template-columns:repeat(6,minmax(130px,1fr))!important;gap:7px!important}
            #${PANEL_ID} .qol-rup-building-level{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:6px!important;min-height:34px!important;padding:4px 7px!important;border:1px solid #d2c4ac!important;border-radius:4px!important;background:#fffdf8!important;color:#59452e!important;font-size:9px!important;font-weight:800!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-rup-building-level select{width:44px!important;height:26px!important;padding:2px 4px!important;text-align:center!important}
            #${PANEL_ID} .qol-rup-oasis-summary{display:grid!important;grid-template-columns:minmax(130px,1.1fr) repeat(4,minmax(120px,1fr))!important;gap:7px!important}
            #${PANEL_ID} .qol-rup-oasis-count,#${PANEL_ID} .qol-rup-oasis-total{display:flex!important;align-items:center!important;gap:6px!important;min-height:36px!important;padding:4px 7px!important;border:1px solid #d2c4ac!important;border-radius:4px!important;background:#fffdf8!important;color:#59452e!important;font-size:9px!important;font-weight:800!important;white-space:nowrap!important}
            #${PANEL_ID} .qol-rup-oasis-count{justify-content:space-between!important}#${PANEL_ID} .qol-rup-oasis-count select{width:48px!important;height:27px!important}
            #${PANEL_ID} .qol-rup-oasis-total input{min-width:42px!important;height:27px!important;padding:2px 4px!important;text-align:center!important}
            #${PANEL_ID} .qol-rup-actions{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;flex-wrap:wrap!important;margin:2px 0 9px!important}
            #${PANEL_ID} .qol-rup-actions-top{padding:8px!important;border:1px solid #cbbb9f!important;border-radius:5px!important;background:#f8f4ec!important}
            #${PANEL_ID} .qol-rup-action-left{display:flex!important;align-items:center!important;gap:7px!important}
            #${PANEL_ID} .qol-rup-action-control{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:104px!important;height:30px!important;padding:0 13px!important;border:1px solid var(--qol-action-border)!important;border-radius:4px!important;background:linear-gradient(var(--qol-accent),var(--qol-accent-gradient-end))!important;color:#fff8eb!important;font-size:9px!important;font-weight:800!important;line-height:1!important;white-space:nowrap!important;cursor:pointer!important;user-select:none!important;box-shadow:0 1px 2px rgba(0,0,0,.18)!important}
            #${PANEL_ID} .qol-rup-action-control:hover{filter:brightness(1.08)!important}
            #${PANEL_ID} .qol-rup-action-control.qol-secondary{min-width:72px!important;background:#eee5d6!important;color:var(--qol-accent-deep)!important;border-color:#ad9b7d!important;box-shadow:none!important}
            #${PANEL_ID} .qol-rup-action-control.qol-disabled{opacity:.55!important;filter:grayscale(.25)!important;cursor:wait!important;pointer-events:none!important}
            #${PANEL_ID} .qol-rup-scan-status{min-width:170px!important;color:#7e6b53!important;font-size:8px!important;font-weight:700!important;line-height:1.35!important}
            #${PANEL_ID} .qol-rup-scan-status[data-tone="success"]{color:#496f27!important}#${PANEL_ID} .qol-rup-scan-status[data-tone="warning"]{color:#916618!important}#${PANEL_ID} .qol-rup-scan-status[data-tone="error"]{color:#8b332a!important}
            #${PANEL_ID} .qol-rup-error{display:none!important;margin-bottom:9px!important;padding:7px 9px!important;border:1px solid #9b4b3f!important;border-radius:4px!important;background:#f5dfd9!important;color:#713329!important;font-size:9px!important;font-weight:700!important}
            #${PANEL_ID} .qol-rup-error.show{display:block!important}
            #${PANEL_ID} .qol-rup-results{display:none!important}
            #${PANEL_ID} .qol-rup-results.show{display:block!important}
            #${PANEL_ID} .qol-rup-summary{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:5px!important;margin-bottom:7px!important}
            #${PANEL_ID} .qol-rup-stat{padding:6px 7px!important;border:1px solid #d2c4ac!important;border-radius:4px!important;background:#fffdf8!important}
            #${PANEL_ID} .qol-rup-stat-label{color:#927f64!important;font-size:7px!important;font-weight:700!important;text-transform:uppercase!important}
            #${PANEL_ID} .qol-rup-stat-value{margin-top:3px!important;color:#4f3922!important;font-size:10px!important;font-weight:800!important;line-height:1.3!important}
            #${PANEL_ID} .qol-rup-production-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;column-gap:10px!important;row-gap:2px!important}
            #${PANEL_ID} .qol-rup-res{display:inline-flex!important;align-items:center!important;gap:4px!important;margin-right:9px!important;white-space:nowrap!important;font-size:9px!important;line-height:18px!important}
            #${PANEL_ID} .qol-rup-res strong{color:#4f3922!important;font-size:inherit!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-game-resource-icon{display:inline-block!important;width:16px!important;height:16px!important;min-width:16px!important;margin:0!important;padding:0!important;vertical-align:middle!important;flex:0 0 16px!important}
            #${PANEL_ID} .qol-rup-field-resource .qol-rup-game-resource-icon{width:18px!important;height:18px!important;min-width:18px!important;flex-basis:18px!important}
            #${PANEL_ID} .qol-rup-gain{color:#4c7620!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-gain .qol-rup-res strong{color:#4c7620!important}
            #${PANEL_ID} .qol-rup-tabs{display:flex!important;gap:4px!important;margin-bottom:6px!important}
            #${PANEL_ID} .qol-rup-tab{display:inline-flex!important;align-items:center!important;justify-content:center!important;height:27px!important;padding:0 10px!important;border:1px solid #b5a487!important;border-radius:4px!important;background:#eee5d6!important;color:#604a31!important;font-size:8px!important;font-weight:800!important;cursor:pointer!important;user-select:none!important}
            #${PANEL_ID} .qol-rup-tab.active{background:var(--qol-accent)!important;color:#fff!important;border-color:var(--qol-accent-dark)!important}
            #${PANEL_ID} .qol-rup-view{display:none!important}
            #${PANEL_ID} .qol-rup-view.active{display:block!important}
            #${PANEL_ID} .qol-rup-table-wrap{overflow:auto!important;border:1px solid #c8b99f!important;border-radius:4px!important;background:#fffdf8!important}
            #${PANEL_ID} table{width:100%!important;border-collapse:collapse!important;color:#44321f!important;font-size:9px!important}
            #${PANEL_ID} th{position:sticky!important;top:0!important;z-index:1!important;padding:6px!important;background:#ded0b9!important;color:var(--qol-accent-deep)!important;border-bottom:1px solid #b9a78a!important;text-align:left!important;white-space:nowrap!important;font-size:8px!important;text-transform:uppercase!important}
            #${PANEL_ID} td{padding:5px!important;border-bottom:1px solid #eee5d6!important;vertical-align:top!important;white-space:nowrap!important}
            #${PANEL_ID} tr:last-child td{border-bottom:0!important}
            #${PANEL_ID} .qol-rup-step{color:#8a765c!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-action-name{color:#49351f!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-done-column{width:48px!important;text-align:center!important}
            #${PANEL_ID} tr.qol-rup-completed td{background:#dddcd8!important}
            #${PANEL_ID} .qol-rup-completed td,#${PANEL_ID} .qol-rup-completed .qol-rup-step,#${PANEL_ID} .qol-rup-completed .qol-rup-action-name,#${PANEL_ID} .qol-rup-completed .qol-rup-res strong,#${PANEL_ID} .qol-rup-completed .qol-rup-gain{color:#777!important}
            #${PANEL_ID} .qol-rup-completed .qol-rup-game-resource-icon{filter:grayscale(1)!important;opacity:.55!important}
            #${PANEL_ID} .qol-rup-step-check{position:relative!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;width:22px!important;height:22px!important;margin:0!important;cursor:pointer!important}
            #${PANEL_ID} .qol-rup-step-check input{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;opacity:0!important;pointer-events:none!important}
            #${PANEL_ID} .qol-rup-step-check-box{display:flex!important;align-items:center!important;justify-content:center!important;width:16px!important;height:16px!important;border:1px solid #9f8a69!important;border-radius:3px!important;background:#fffdf8!important;color:#fff!important;font-size:12px!important;font-weight:900!important;line-height:1!important;box-shadow:inset 0 1px 1px rgba(0,0,0,.08)!important;transition:background .12s ease,border-color .12s ease!important}
            #${PANEL_ID} .qol-rup-step-check:hover .qol-rup-step-check-box{border-color:var(--qol-accent)!important}
            #${PANEL_ID} .qol-rup-step-check input:focus-visible+.qol-rup-step-check-box{outline:2px solid var(--qol-accent)!important;outline-offset:2px!important}
            #${PANEL_ID} .qol-rup-step-check input:checked+.qol-rup-step-check-box{border-color:#54752d!important;background:#658d36!important}
            #${PANEL_ID} .qol-rup-step-check input:checked+.qol-rup-step-check-box::after{content:'✓'!important}
            #${PANEL_ID} .qol-rup-compact-list{display:grid!important;gap:4px!important}
            #${PANEL_ID} .qol-rup-compact-row{display:grid!important;grid-template-columns:72px minmax(190px,1.35fr) minmax(230px,1.6fr) 100px 110px 40px!important;align-items:center!important;gap:6px!important;padding:7px 8px!important;border:1px solid #d5c8b3!important;border-radius:4px!important;background:#fffdf8!important;color:#5b4933!important;font-size:9px!important}
            #${PANEL_ID} .qol-rup-compact-row.qol-rup-completed{background:#dddcd8!important;color:#777!important;border-color:#c6c4bf!important}
            #${PANEL_ID} .qol-rup-compact-row.qol-rup-completed .qol-rup-level{border-color:#c7c5c0!important;background:#d3d2ce!important;color:#777!important}
            #${PANEL_ID} .qol-rup-compact-done{display:flex!important;align-items:center!important;justify-content:center!important}
            #${PANEL_ID} .qol-rup-compact-step{color:var(--qol-accent)!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-levels{display:flex!important;align-items:center!important;gap:3px!important;flex-wrap:wrap!important}
            #${PANEL_ID} .qol-rup-level{padding:2px 4px!important;border:1px solid #dfd4c4!important;border-radius:3px!important;background:#f5efe6!important;color:#7b6b56!important}
            #${PANEL_ID} .qol-rup-level.changed{border-color:#9bb37d!important;background:#edf4e5!important;color:#49682d!important;font-weight:800!important}
            #${PANEL_ID} .qol-rup-empty{padding:14px!important;border:1px dashed #c4b59c!important;border-radius:4px!important;background:#fffdf8!important;color:#7d6b55!important;text-align:center!important;font-size:9px!important}
            @media(max-width:900px){#${PANEL_ID} .qol-rup-settings{grid-template-columns:repeat(3,minmax(110px,1fr))!important}#${PANEL_ID} .qol-rup-buildings{grid-template-columns:repeat(3,minmax(130px,1fr))!important}#${PANEL_ID} .qol-rup-oasis-summary{grid-template-columns:repeat(2,minmax(130px,1fr))!important}#${PANEL_ID} .qol-rup-oasis-count{grid-column:1/-1!important}#${PANEL_ID} .qol-rup-compact-row{grid-template-columns:55px minmax(160px,1fr) minmax(180px,1.2fr) 40px!important}#${PANEL_ID} .qol-rup-compact-row>*:nth-last-child(2),#${PANEL_ID} .qol-rup-compact-row>*:nth-last-child(3){display:none!important}}
            @media(max-width:620px){#${PANEL_ID}{padding:5px!important}#${PANEL_ID} .qol-rup-settings,#${PANEL_ID} .qol-rup-buildings{grid-template-columns:repeat(2,minmax(120px,1fr))!important}#${PANEL_ID} .qol-rup-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
        `;
    document.head.appendChild(style);
  }
  function iconSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19h16M6 16v-5M10 16V7M14 16v-3M18 16V4"></path><path d="m5 8 4-4 4 3 6-5"></path></svg>';
  }
  function renderFields() {
    const panel = document.getElementById(PANEL_ID);
    const root = panel?.querySelector('[data-rup-fields]');
    if (!root) return;
    const columns = Math.max(...RESOURCE_KEYS.map(resource => state.fields[resource].length));
    const template = `110px repeat(${columns}, minmax(48px, 1fr))`;
    root.innerHTML = `
            <div class="qol-rup-fields-table" style="--qol-rup-field-columns:${template};min-width:${110 + columns * 50}px">
                <div class="qol-rup-fields-head" style="grid-template-columns:${template}"><span></span>${Array.from({
      length: columns
    }, (_, index) => `<span>#${index + 1}</span>`).join('')}</div>
                ${RESOURCE_KEYS.map(resource => `
                    <div class="qol-rup-fields-row" style="grid-template-columns:${template}">
                        <span class="qol-rup-field-resource">${resourceIcon(resource)}<strong>${RESOURCE_LABELS[resource]}</strong></span>
                        ${Array.from({
      length: columns
    }, (_, index) => index < state.fields[resource].length ? `<input type="number" min="0" max="${state.maxLevel}" step="1" value="${state.fields[resource][index]}" data-rup-field="${resource}" data-index="${index}" aria-label="${RESOURCE_LABELS[resource]} field ${index + 1} level">` : '<span class="qol-rup-field-empty"></span>').join('')}
                    </div>
                `).join('')}
            </div>`;
  }
  function combinedOasisState() {
    const annexed = state.oases.filter(oasis => oasis.state === 'annexed');
    return {
      count: annexed.length,
      bonuses: RESOURCE_KEYS.map((_, resourceIndex) => annexed.reduce((total, oasis) => total + Number(oasis.bonuses[resourceIndex] || 0), 0))
    };
  }
  function setCombinedOasisState(count, bonuses) {
    const normalizedCount = clamp(count, 0, 3, 0);
    const totals = Array.from({
      length: 4
    }, (_, index) => clamp(bonuses[index], 0, 150, 0));
    state.oases = Array.from({
      length: 3
    }, (_, index) => ({
      state: index < normalizedCount ? 'annexed' : 'none',
      preset: index === 0 && normalizedCount > 0 ? 'custom' : 'none',
      bonuses: index === 0 && normalizedCount > 0 ? totals.slice() : [0, 0, 0, 0]
    }));
  }
  function renderOases() {
    const panel = document.getElementById(PANEL_ID);
    const root = panel?.querySelector('[data-rup-oases]');
    if (!root) return;
    const combined = combinedOasisState();
    root.innerHTML = `
            <div class="qol-rup-oasis-summary">
                <label class="qol-rup-oasis-count"><span>Assigned oases</span><select data-rup-oasis-count aria-label="Number of assigned oases">${Array.from({
      length: 4
    }, (_, count) => `<option value="${count}"${combined.count === count ? ' selected' : ''}>${count}</option>`).join('')}</select></label>
                ${RESOURCE_KEYS.map((resource, resourceIndex) => `<label class="qol-rup-oasis-total" title="${RESOURCE_LABELS[resource]} oasis bonus">${resourceIcon(resource)}<span>${RESOURCE_LABELS[resource]}</span><input type="number" min="0" max="150" step="1" value="${combined.bonuses[resourceIndex]}" data-rup-oasis-total="${resourceIndex}" aria-label="Total ${RESOURCE_LABELS[resource]} oasis bonus percent"><b>%</b></label>`).join('')}
            </div>`;
  }
  function renderInputState() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || !stateLoaded) return;
    const speedInfo = detectWorldSpeed();
    const setValue = (selector, value) => {
      const control = panel.querySelector(selector);
      if (control) control.value = String(value);
    };
    setValue('[data-rup="layout"]', state.layout);
    setValue('[data-rup="maxLevel"]', state.maxLevel);
    setValue('[data-rup="speed"]', state.speed);
    setValue('[data-rup="steps"]', state.steps);
    const gold = panel.querySelector('[data-rup="goldBoost"]');
    if (gold) gold.checked = state.goldBoost;
    const speedLabel = panel.querySelector('[data-rup-speed-label]');
    if (speedLabel) speedLabel.textContent = speedInfo.detected ? `World speed · x${speedInfo.speed} detected` : 'World speed';
    const speedSelect = panel.querySelector('[data-rup="speed"]');
    if (speedSelect) speedSelect.title = speedInfo.detected ? `Detected from ${speedInfo.source}` : 'Server speed could not be identified automatically; choose it here.';
    Object.entries(state.buildings).forEach(([key, value]) => setValue(`[data-rup-building="${key}"]`, value));
    renderFields();
    renderOases();
  }
  function buildPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;
    injectStyles();
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
            <div class="qol-rup-window" role="dialog" aria-modal="true" aria-label="Resource Upgrade Planner">
                <div class="qol-rup-header">
                    <div class="qol-rup-title-wrap"><span class="qol-rup-title-icon">${iconSvg()}</span><h2 class="qol-rup-title">Resource Upgrade Planner</h2></div>
                    <div class="qol-rup-close" data-close role="button" tabindex="0" aria-label="Close">×</div>
                </div>
                <div class="qol-rup-body">
                    <div class="qol-rup-actions qol-rup-actions-top"><div class="qol-rup-action-left"><div class="qol-rup-action-control" data-action="scan" role="button" tabindex="0">Scan village</div><div class="qol-rup-action-control" data-action="calculate" role="button" tabindex="0">Calculate order</div><div class="qol-rup-action-control qol-secondary" data-action="reset" role="button" tabindex="0">Reset</div><span class="qol-rup-scan-status" data-scan-status aria-live="polite">Ready.</span></div></div>
                    <section class="qol-rup-section" data-rup-section="settings">
                        <div class="qol-rup-section-head" data-section-toggle role="button" tabindex="0" aria-expanded="true"><span class="qol-rup-section-title">Planner settings</span><span class="qol-rup-section-chevron" aria-hidden="true"></span></div>
                        <div class="qol-rup-section-body qol-rup-settings">
                            <div class="qol-rup-control"><label>Resource layout</label><select data-rup="layout">${Object.keys(LAYOUTS).map(name => `<option value="${name}">${name}</option>`).join('')}</select></div>
                            <div class="qol-rup-control"><label>Village type</label><select data-rup="maxLevel"><option value="10">Village · fields to 10</option><option value="12">City · fields to 12</option><option value="20">Capital · fields to 20</option></select></div>
                            <div class="qol-rup-control"><label data-rup-speed-label>World speed</label><select data-rup="speed"><option value="1">x1</option><option value="2">x2</option><option value="3">x3</option><option value="5">x5</option></select></div>
                            <div class="qol-rup-control"><label>Future steps</label><input data-rup="steps" type="number" min="15" max="100" step="1"></div>
                            <label class="qol-rup-check"><input data-rup="goldBoost" type="checkbox"> +25% Gold production</label>
                        </div>
                    </section>
                    <section class="qol-rup-section" data-rup-section="fields">
                        <div class="qol-rup-section-head" data-section-toggle role="button" tabindex="0" aria-expanded="true"><span class="qol-rup-section-title">Current resource fields</span><span class="qol-rup-section-chevron" aria-hidden="true"></span></div>
                        <div class="qol-rup-section-body"><div class="qol-rup-fields-grid" data-rup-fields></div></div>
                    </section>
                    <section class="qol-rup-section" data-rup-section="buildings">
                        <div class="qol-rup-section-head" data-section-toggle role="button" tabindex="0" aria-expanded="true"><span class="qol-rup-section-title">Production buildings</span><span class="qol-rup-section-chevron" aria-hidden="true"></span></div>
                        <div class="qol-rup-section-body qol-rup-buildings">
                            ${Object.entries(BUILDINGS).map(([key, building]) => `<label class="qol-rup-building-level"><span>${escapeHtml(building.label)} —</span><select data-rup-building="${key}" aria-label="${escapeHtml(building.label)} level">${Array.from({
      length: 6
    }, (_, level) => `<option value="${level}">${level}</option>`).join('')}</select></label>`).join('')}
                            <label class="qol-rup-building-level"><span>Embassy —</span><select data-rup-building="embassy" aria-label="Embassy level">${Array.from({
      length: 21
    }, (_, level) => `<option value="${level}">${level}</option>`).join('')}</select></label>
                        </div>
                    </section>
                    <section class="qol-rup-section" data-rup-section="oases">
                        <div class="qol-rup-section-head" data-section-toggle role="button" tabindex="0" aria-expanded="true"><span class="qol-rup-section-title">Oases</span><span class="qol-rup-section-chevron" aria-hidden="true"></span></div>
                        <div class="qol-rup-section-body"><div class="qol-rup-oases" data-rup-oases></div></div>
                    </section>
                    <div class="qol-rup-error" data-error></div>
                    <section class="qol-rup-results" data-results></section>
                </div>
            </div>
        `;
    document.body.appendChild(panel);
    bindPanel(panel);
    renderInputState();
    return panel;
  }
  function hideError() {
    const error = document.querySelector(`#${PANEL_ID} [data-error]`);
    error?.classList.remove('show');
    if (error) error.textContent = '';
  }
  function showError(message) {
    const error = document.querySelector(`#${PANEL_ID} [data-error]`);
    if (!error) return;
    error.textContent = String(message || 'Unable to calculate this setup.');
    error.classList.add('show');
  }
  function updateFromControl(target) {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
    const setting = target.dataset.rup;
    if (setting === 'layout') {
      state.layout = target.value;
      state.fields = normalizeFields(state.fields, state.layout, state.maxLevel);
      renderFields();
    } else if (setting === 'maxLevel') {
      state.maxLevel = Number(target.value);
      state.fields = normalizeFields(state.fields, state.layout, state.maxLevel);
      renderFields();
    } else if (setting === 'speed') state.speed = Number(target.value);else if (setting === 'steps') state.steps = clamp(target.value, 15, 100, 15);else if (setting === 'goldBoost') state.goldBoost = target.checked === true;
    if (target.dataset.rupBuilding) {
      const key = target.dataset.rupBuilding;
      state.buildings[key] = clamp(target.value, 0, key === 'embassy' ? 20 : 5, 0);
    }
    if (target.dataset.rupField) {
      const resource = target.dataset.rupField;
      const index = Number(target.dataset.index);
      const value = clamp(target.value, 0, state.maxLevel, 0);
      for (let cursor = index; cursor < state.fields[resource].length; cursor += 1) state.fields[resource][cursor] = value;
      renderFields();
    }
    if (target.dataset.rupOasisCount !== undefined) {
      const combined = combinedOasisState();
      setCombinedOasisState(target.value, combined.bonuses);
      renderOases();
    }
    if (target.dataset.rupOasisTotal !== undefined) {
      const combined = combinedOasisState();
      combined.bonuses[Number(target.dataset.rupOasisTotal)] = clamp(target.value, 0, 150, 0);
      setCombinedOasisState(combined.count, combined.bonuses);
    }
    void saveState();
  }
  function renderLevelChips(before, after) {
    return after.map((level, index) => {
      const changed = Number(before?.[index] ?? level) !== Number(level);
      return `<span class="qol-rup-level${changed ? ' changed' : ''}">#${index + 1} <b>${level}</b></span>`;
    }).join('');
  }
  function getCompletionPlanKey(results) {
    return results.map(row => [row.kind, row.resource || row.building || '', row.index ?? '', row.fromLevel, row.toLevel].join(':')).join('|');
  }
  function completedStepSet() {
    return new Set(state.completedSteps || []);
  }
  function stepsAreCompleted(steps) {
    const completed = completedStepSet();
    return steps.length > 0 && steps.every(step => completed.has(step));
  }
  function completionCheckbox(steps, label) {
    const normalized = steps.map(Number).filter(Number.isInteger);
    const checked = stepsAreCompleted(normalized) ? ' checked' : '';
    return `<label class="qol-rup-step-check" title="${escapeHtml(label)}"><input type="checkbox" data-rup-complete="${normalized.join(',')}" aria-label="${escapeHtml(label)}"${checked}><span class="qol-rup-step-check-box" aria-hidden="true"></span></label>`;
  }
  function syncCompletionPlan(results) {
    const key = getCompletionPlanKey(results);
    if (state.completionPlanKey === key) return false;
    state.completionPlanKey = key;
    state.completedSteps = [];
    return true;
  }
  function setStepsCompleted(steps, completed) {
    const next = completedStepSet();
    steps.forEach(step => {
      if (completed) next.add(step);else next.delete(step);
    });
    state.completedSteps = [...next].sort((a, b) => a - b);
    syncCompletionUI();
    void saveState();
  }
  function syncCompletionUI() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.querySelectorAll('[data-rup-result-steps]').forEach(row => {
      const steps = String(row.dataset.rupResultSteps || '').split(',').map(Number).filter(Number.isInteger);
      row.classList.toggle('qol-rup-completed', stepsAreCompleted(steps));
    });
    panel.querySelectorAll('[data-rup-complete]').forEach(input => {
      const steps = String(input.dataset.rupComplete || '').split(',').map(Number).filter(Number.isInteger);
      input.checked = stepsAreCompleted(steps);
    });
  }
  function buildCompactGroups(results) {
    const groups = [];
    let active = null;
    results.forEach(row => {
      if (row.kind !== 'field') {
        if (active) groups.push(active);
        active = null;
        groups.push({
          kind: row.kind,
          rows: [row],
          firstStep: row.step,
          lastStep: row.step
        });
        return;
      }
      if (!active || active.resource !== row.resource) {
        if (active) groups.push(active);
        const previousFields = row.step === 1 ? resultMeta.startState.fields : results[row.step - 2].fieldsAfter;
        active = {
          kind: 'field',
          resource: row.resource,
          rows: [row],
          firstStep: row.step,
          lastStep: row.step,
          startFields: previousFields,
          endFields: row.fieldsAfter
        };
      } else {
        active.rows.push(row);
        active.lastStep = row.step;
        active.endFields = row.fieldsAfter;
      }
    });
    if (active) groups.push(active);
    return groups;
  }
  function renderCompact(results) {
    if (!results.length) return '<div class="qol-rup-empty">No further production-improving action is available.</div>';
    return `<div class="qol-rup-compact-list">${buildCompactGroups(results).map(group => {
      const first = group.rows[0];
      const last = group.rows.at(-1);
      const step = group.firstStep === group.lastStep ? `#${group.firstStep}` : `#${group.firstStep}–${group.lastStep}`;
      const groupSteps = group.rows.map(row => row.step);
      const completedClass = stepsAreCompleted(groupSteps) ? ' qol-rup-completed' : '';
      const done = `<div class="qol-rup-compact-done">${completionCheckbox(groupSteps, `Mark ${step} complete`)}</div>`;
      if (group.kind === 'field') {
        return `<div class="qol-rup-compact-row${completedClass}" data-rup-result-steps="${groupSteps.join(',')}"><div class="qol-rup-compact-step">${step}</div><div class="qol-rup-action-name">Upgrade ${RESOURCE_LABELS[group.resource]} fields ×${group.rows.length}</div><div class="qol-rup-levels">${renderLevelChips(group.startFields[group.resource], group.endFields[group.resource])}</div><div>Avg ROI ${formatHours(group.rows.reduce((sum, row) => sum + row.roiHours, 0) / group.rows.length)}</div><div>Total ${formatHours(last.elapsedHours)}</div>${done}</div>`;
      }
      return `<div class="qol-rup-compact-row${completedClass}" data-rup-result-steps="${groupSteps.join(',')}"><div class="qol-rup-compact-step">${step}</div><div class="qol-rup-action-name">${escapeHtml(first.label)}</div><div>${formatResourceLine(first.productionAfter)}</div><div>ROI ${formatHours(first.roiHours)}</div><div>Total ${formatHours(first.elapsedHours)}</div>${done}</div>`;
    }).join('')}</div>`;
  }
  function renderDetail(results) {
    if (!results.length) return '<div class="qol-rup-empty">No further production-improving action is available.</div>';
    return `<div class="qol-rup-table-wrap"><table><thead><tr><th>#</th><th>Upgrade</th><th>Cost</th><th>Production before / h</th><th>Production after / h</th><th>Gain / h</th><th>Save time</th><th>ROI</th><th>Total time</th><th class="qol-rup-done-column" title="Completed">Done</th></tr></thead><tbody>${results.map(row => `<tr class="${stepsAreCompleted([row.step]) ? 'qol-rup-completed' : ''}" data-rup-result-steps="${row.step}"><td class="qol-rup-step">${row.step}</td><td class="qol-rup-action-name">${escapeHtml(row.label)}</td><td>${formatResourceLine(row.cost)}</td><td>${formatResourceLine(row.productionBefore)}</td><td>${formatResourceLine(row.productionAfter)}</td><td class="qol-rup-gain">+${formatNumber(row.gainTotal, 1)}</td><td>${formatHours(row.saveHours)}</td><td>${formatHours(row.roiHours)}</td><td>${formatHours(row.elapsedHours)}</td><td class="qol-rup-done-column">${completionCheckbox([row.step], `Mark step ${row.step} complete`)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function setSectionCollapsed(section, collapsed) {
    if (!section) return;
    section.classList.toggle('qol-collapsed', collapsed);
    const toggle = section.querySelector(':scope > [data-section-toggle]');
    toggle?.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
  function setInputSectionsCollapsed(collapsed) {
    document.querySelectorAll(`#${PANEL_ID} [data-rup-section]`).forEach(section => setSectionCollapsed(section, collapsed));
  }
  function renderResults() {
    const root = document.querySelector(`#${PANEL_ID} [data-results]`);
    if (!root || !resultMeta) return;
    const gain = resultMeta.endProduction.map((value, index) => value - resultMeta.startProduction[index]);
    root.innerHTML = `
            <div class="qol-rup-summary">
                <div class="qol-rup-stat"><div class="qol-rup-stat-label">Steps</div><div class="qol-rup-stat-value">${resultMeta.results.length}</div></div>
                <div class="qol-rup-stat"><div class="qol-rup-stat-label">Start production / h</div><div class="qol-rup-stat-value qol-rup-production-grid">${formatResourceLine(resultMeta.startProduction)}</div></div>
                <div class="qol-rup-stat"><div class="qol-rup-stat-label">End production / h</div><div class="qol-rup-stat-value qol-rup-production-grid">${formatResourceLine(resultMeta.endProduction)}</div></div>
                <div class="qol-rup-stat"><div class="qol-rup-stat-label">Gain / h</div><div class="qol-rup-stat-value qol-rup-production-grid qol-rup-gain">${formatResourceLine(gain)}</div></div>
            </div>
            <div class="qol-rup-tabs"><div class="qol-rup-tab" data-tab="compact" role="button" tabindex="0">Compact view</div><div class="qol-rup-tab active" data-tab="detail" role="button" tabindex="0">Detail view</div></div>
            <div class="qol-rup-view" data-view="compact">${renderCompact(resultMeta.results)}</div>
            <div class="qol-rup-view active" data-view="detail">${renderDetail(resultMeta.results)}</div>
        `;
    root.classList.add('show');
  }
  function switchTab(tab) {
    const panel = document.getElementById(PANEL_ID);
    panel?.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    panel?.querySelectorAll('[data-view]').forEach(view => view.classList.toggle('active', view.dataset.view === tab));
  }
  function runCalculation() {
    hideError();
    try {
      resultMeta = calculatePlan(state);
      if (syncCompletionPlan(resultMeta.results)) void saveState();
      renderResults();
    } catch (error) {
      showError(error?.message || String(error));
    }
  }
  function resetState() {
    state = normalizeState(null);
    stateLoaded = true;
    resultMeta = null;
    void saveState();
    renderInputState();
    setInputSectionsCollapsed(false);
    hideError();
    const root = document.querySelector(`#${PANEL_ID} [data-results]`);
    root?.classList.remove('show');
    if (root) root.innerHTML = '';
  }
  function bindPanel(panel) {
    if (panel.dataset.rupBound === 'true') return;
    panel.dataset.rupBound = 'true';
    panel.addEventListener('click', event => {
      if (event.target === panel || event.target.closest('[data-close]')) {
        closePanel();
        return;
      }
      const sectionToggle = event.target.closest('[data-section-toggle]');
      if (sectionToggle) {
        const section = sectionToggle.closest('[data-rup-section]');
        setSectionCollapsed(section, !section?.classList.contains('qol-collapsed'));
        return;
      }
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'scan') void scanCurrentVillage();
      if (action === 'calculate') runCalculation();
      if (action === 'reset') resetState();
      const tab = event.target.closest('[data-tab]')?.dataset.tab;
      if (tab) switchTab(tab);
    });
    panel.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const control = event.target.closest('[role="button"]');
      if (!control || !panel.contains(control)) return;
      event.preventDefault();
      control.click();
    });
    panel.addEventListener('change', event => {
      const completion = event.target.closest?.('[data-rup-complete]');
      if (completion) {
        const steps = String(completion.dataset.rupComplete || '').split(',').map(Number).filter(Number.isInteger);
        setStepsCompleted(steps, completion.checked === true);
        return;
      }
      updateFromControl(event.target);
    });
  }
  function mountButton() {
    if (!enabled()) return null;
    injectStyles();
    let button = document.getElementById(BUTTON_ID);
    if (button) return button;
    button = document.createElement('div');
    button.id = BUTTON_ID;
    button.title = 'Resource Upgrade Planner';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.setAttribute('aria-label', 'Open Resource Upgrade Planner');
    button.innerHTML = iconSvg();
    const activate = event => {
      event.preventDefault();
      event.stopPropagation();
      const panel = document.getElementById(PANEL_ID);
      if (panel?.classList.contains('qol-open')) closePanel();else void openPanel();
    };
    button.addEventListener('click', activate);
    button.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') activate(event);
    });
    document.body.appendChild(button);
    window.qolRepositionAllButtons?.();
    return button;
  }
  async function openPanel() {
    if (!enabled()) return;
    await loadState();
    applyDetectedWorldSpeed();
    const panel = buildPanel();
    renderInputState();
    APES?.ui?.closeOtherTools?.(FEATURE_KEY);
    panel.classList.add('qol-open');
    panel.setAttribute('aria-hidden', 'false');
  }
  function closePanel() {
    const panel = document.getElementById(PANEL_ID);
    panel?.classList.remove('qol-open');
    panel?.setAttribute('aria-hidden', 'true');
  }
  window.addEventListener('qol_close_others', event => {
    if (event.detail?.source !== FEATURE_KEY) closePanel();
  });
  window.addEventListener('qol_setting_changed', event => {
    if (event.detail?.key !== FEATURE_KEY) return;
    if (event.detail.enabled) {
      mountButton();
      void loadState();
    } else {
      scanToken += 1;
      isScanning = false;
      removeScanLock();
      closePanel();
      document.getElementById(BUTTON_ID)?.remove();
    }
    window.qolRepositionAllButtons?.();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById(PANEL_ID)?.classList.contains('qol-open')) {
      event.preventDefault();
      if (isScanning) return;
      closePanel();
    }
  }, true);
  window.APES_RESOURCE_UPGRADE_PLANNER = Object.freeze({
    open: openPanel,
    close: closePanel,
    scan: scanCurrentVillage,
    calculate: () => calculatePlan(state),
    getState: () => clone(state),
    setState: async value => {
      state = normalizeState(value);
      stateLoaded = true;
      await saveState();
      renderInputState();
      return clone(state);
    }
  });
  const begin = () => {
    if (enabled()) mountButton();
    void loadState();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, {
    once: true
  });else begin();
})();
