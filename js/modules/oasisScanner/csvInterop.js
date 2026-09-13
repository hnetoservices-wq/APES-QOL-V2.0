(() => {
  'use strict';

  const MIN_COORD = -69;
  const MAX_COORD = 69;
  const LOCATION_ID_SIZE = 32768;
  const LOCATION_ID_OFFSET = 16384;
  const HOST = window.location.hostname;

  const OASIS_STORAGE_KEY = `qol_oasis_scanner_${HOST}`;
  const CROPPER_STORAGE_KEY = `qol_cropper_scanner_${HOST}`;
  const TILE_STORAGE_KEY = `qol_tile_scanner_${HOST}`;
  const TAG_CONFIG_KEY = `qol_oasis_tag_team_${HOST}`;
  const CORE_SESSION_KEY = `qol_oasis_tag_team_session_${HOST}`;
  const EXT_SESSION_KEY = `qol_oasis_tag_team_session_scope69_${HOST}`;
  const IMPORT_FLASH_KEY = `apes_oasis_import_flash_${HOST}`;

  const LAYOUTS = Object.freeze({
    2: { columns: 2, rows: 1 },
    3: { columns: 3, rows: 1 },
    4: { columns: 2, rows: 2 },
    5: { columns: 5, rows: 1 },
    6: { columns: 3, rows: 2 }
  });

  const SECTIONS = Object.freeze([
    { id: 'A', name: 'Blue', rgb: '45, 125, 210', hex: '#2d7dd2' },
    { id: 'B', name: 'Orange', rgb: '242, 142, 43', hex: '#f28e2b' },
    { id: 'C', name: 'Purple', rgb: '143, 99, 199', hex: '#8f63c7' },
    { id: 'D', name: 'Green', rgb: '67, 160, 71', hex: '#43a047' },
    { id: 'E', name: 'Pink', rgb: '212, 80, 135', hex: '#d45087' },
    { id: 'F', name: 'Cyan', rgb: '23, 162, 184', hex: '#17a2b8' }
  ]);

  const EXPORT_HEADERS = Object.freeze([
    'Server',
    'X',
    'Y',
    'Coordinate',
    'Tile Type',
    'Field Combination',
    'Result Type',
    'Status',
    'Wood Bonus',
    'Clay Bonus',
    'Iron Bonus',
    'Crop Bonus',
    'Player ID',
    'Player Name',
    'Village Name',
    'Kingdom ID',
    'Oasis Status',
    'Location ID',
    'Scanned At',
    'Last Seen'
  ]);

  let overlayFrame = null;
  let lastRecordedCoordinate = '';

  function readJSON(key, fallback = {}) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[APES Oasis Scanner] Could not save imported/extended scan data.', error);
      return false;
    }
  }

  function parseInteger(value) {
    const parsed = Number.parseInt(String(value ?? '').trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function numberOrZero(value) {
    const parsed = Number(String(value ?? '').trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function timestampFrom(value, fallback = Date.now()) {
    if (value === null || value === undefined || value === '') return fallback;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 100000000000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function inScope(x, y) {
    return x >= MIN_COORD && x <= MAX_COORD && y >= MIN_COORD && y <= MAX_COORD;
  }

  function readConfig() {
    const raw = readJSON(TAG_CONFIG_KEY, {});
    const teamSize = Math.max(2, Math.min(6, parseInteger(raw.teamSize) || 2));
    const available = ['ALL', ...SECTIONS.slice(0, teamSize).map(section => section.id)];
    return {
      enabled: raw.enabled === true,
      teamSize,
      selectedSection: available.includes(raw.selectedSection) ? raw.selectedSection : 'A'
    };
  }

  function readCoreSession() {
    const session = readJSON(CORE_SESSION_KEY, {});
    if (!session.scannedTiles || typeof session.scannedTiles !== 'object' || Array.isArray(session.scannedTiles)) {
      session.scannedTiles = {};
    }
    session.id = String(session.id || '');
    return session;
  }

  function syncExtendedSession() {
    const core = readCoreSession();
    let extended = readJSON(EXT_SESSION_KEY, {});
    const coreId = core.id || 'no-session';

    if (!extended || extended.coreSessionId !== coreId || !extended.scannedTiles || typeof extended.scannedTiles !== 'object') {
      extended = {
        coreSessionId: coreId,
        scannedTiles: { ...core.scannedTiles }
      };
      writeJSON(EXT_SESSION_KEY, extended);
      return extended;
    }

    let changed = false;
    for (const [id, scannedAt] of Object.entries(core.scannedTiles)) {
      if (!extended.scannedTiles[id]) {
        extended.scannedTiles[id] = scannedAt;
        changed = true;
      }
    }
    if (changed) writeJSON(EXT_SESSION_KEY, extended);
    return extended;
  }

  function splitAxis(minimum, maximum, count) {
    const total = maximum - minimum + 1;
    const base = Math.floor(total / count);
    const remainder = total % count;
    const result = [];
    let cursor = minimum;
    for (let index = 0; index < count; index += 1) {
      const size = base + (index < remainder ? 1 : 0);
      result.push({ min: cursor, max: cursor + size - 1 });
      cursor += size;
    }
    return result;
  }

  function getSections(teamSize) {
    const layout = LAYOUTS[teamSize] || LAYOUTS[2];
    const xs = splitAxis(MIN_COORD, MAX_COORD, layout.columns);
    const ys = splitAxis(MIN_COORD, MAX_COORD, layout.rows);
    const sections = [];
    let index = 0;
    for (let row = 0; row < layout.rows; row += 1) {
      for (let column = 0; column < layout.columns; column += 1) {
        const meta = SECTIONS[index++];
        sections.push({
          ...meta,
          minX: xs[column].min,
          maxX: xs[column].max,
          minY: ys[row].min,
          maxY: ys[row].max
        });
      }
    }
    return sections;
  }

  function sectionFor(x, y, sections) {
    return sections.find(section => x >= section.minX && x <= section.maxX && y >= section.minY && y <= section.maxY) || null;
  }

  function scannedEntries() {
    const session = syncExtendedSession();
    return Object.entries(session.scannedTiles || {})
      .map(([id, scannedAt]) => {
        const [rawX, rawY] = id.split('|');
        const x = parseInteger(rawX);
        const y = parseInteger(rawY);
        if (x === null || y === null || !inScope(x, y)) return null;
        return { id, x, y, scannedAt: timestampFrom(scannedAt) };
      })
      .filter(Boolean);
  }

  function recordCurrentCoordinate() {
    const config = readConfig();
    if (!config.enabled || !window.location.hash.includes('page:map')) return;
    const wrapper = document.querySelector('#tileInformation .coordinateWrapper');
    if (!wrapper) return;
    const x = parseInteger(wrapper.getAttribute('x'));
    const y = parseInteger(wrapper.getAttribute('y'));
    if (x === null || y === null || !inScope(x, y)) return;

    const id = `${x}|${y}`;
    if (id === lastRecordedCoordinate) return;
    lastRecordedCoordinate = id;

    const extended = syncExtendedSession();
    if (!extended.scannedTiles[id]) {
      extended.scannedTiles[id] = Date.now();
      writeJSON(EXT_SESSION_KEY, extended);
    }
  }

  function formatPercent(value) {
    return `${Math.max(0, Math.min(100, value)).toFixed(1)}%`;
  }

  function patchTagTeamUI() {
    const panel = document.getElementById('qol-oasis-container');
    if (!panel) return;

    const description = panel.querySelector('.qol-oasis-description');
    if (description && /-59\s+to\s+59/.test(description.textContent || '')) {
      description.textContent = (description.textContent || '').replace(/-59\s+to\s+59/g, '-69 to 69');
    }

    const config = readConfig();
    const sections = getSections(config.teamSize);
    const sectionSelect = panel.querySelector('#qol-tag-team-section');
    if (sectionSelect) {
      const desired = ['<option value="ALL">All</option>', ...sections.map(section => `<option value="${section.id}">${section.id}</option>`)].join('');
      if (sectionSelect.innerHTML !== desired) {
        const selected = config.selectedSection;
        sectionSelect.innerHTML = desired;
        sectionSelect.value = selected;
      }
    }

    const summary = panel.querySelector('#qol-tag-team-setup-summary');
    if (summary && config.enabled) {
      if (config.selectedSection === 'ALL') summary.textContent = `All sections · ${config.teamSize} users`;
      else {
        const section = sections.find(item => item.id === config.selectedSection);
        summary.textContent = section ? `Section ${section.id} · ${section.name}` : `Section ${config.selectedSection}`;
      }
    }

    if (!config.enabled) return;

    const scanned = scannedEntries();
    const total = (MAX_COORD - MIN_COORD + 1) ** 2;
    const selectedSection = config.selectedSection === 'ALL' ? null : sections.find(section => section.id === config.selectedSection) || null;
    const assignedTotal = selectedSection
      ? (selectedSection.maxX - selectedSection.minX + 1) * (selectedSection.maxY - selectedSection.minY + 1)
      : total;
    const assignedScanned = selectedSection
      ? scanned.filter(item => item.x >= selectedSection.minX && item.x <= selectedSection.maxX && item.y >= selectedSection.minY && item.y <= selectedSection.maxY).length
      : scanned.length;

    const assignedPct = assignedTotal ? assignedScanned / assignedTotal * 100 : 0;
    const overallPct = total ? scanned.length / total * 100 : 0;
    const assignedText = panel.querySelector('#qol-tag-team-assigned-text');
    const overallText = panel.querySelector('#qol-tag-team-overall-text');
    const assignedBar = panel.querySelector('#qol-tag-team-assigned-bar');
    const overallBar = panel.querySelector('#qol-tag-team-overall-bar');

    if (assignedText) {
      assignedText.textContent = selectedSection
        ? `Section ${selectedSection.id}: ${assignedScanned.toLocaleString()} / ${assignedTotal.toLocaleString()} (${formatPercent(assignedPct)})`
        : `All sections: ${assignedScanned.toLocaleString()} / ${assignedTotal.toLocaleString()} (${formatPercent(assignedPct)})`;
    }
    if (overallText) overallText.textContent = `Full map: ${scanned.length.toLocaleString()} / ${total.toLocaleString()} (${formatPercent(overallPct)})`;
    if (assignedBar) {
      assignedBar.style.setProperty('width', formatPercent(assignedPct), 'important');
      assignedBar.style.backgroundColor = selectedSection?.hex || 'var(--qol-accent)';
    }
    if (overallBar) overallBar.style.setProperty('width', formatPercent(overallPct), 'important');
  }

  function locationIdToCoordinates(locationId) {
    const value = Number(locationId);
    if (!Number.isFinite(value) || value < 0) return null;
    const encodedY = Math.floor(value / LOCATION_ID_SIZE);
    const encodedX = value - encodedY * LOCATION_ID_SIZE;
    return { x: encodedX - LOCATION_ID_OFFSET, y: encodedY - LOCATION_ID_OFFSET };
  }

  function fallbackMetrics(mapOverlay) {
    if (mapOverlay.classList.contains('zoomLevel0')) return { halfWidth: 126, halfHeight: 68 };
    if (mapOverlay.classList.contains('zoomLevel2')) return { halfWidth: 31.5, halfHeight: 17 };
    return { halfWidth: 63, halfHeight: 34 };
  }

  function mapMetrics(mapOverlay) {
    const fallback = fallbackMetrics(mapOverlay);
    let halfWidth = null;
    let halfHeight = null;
    for (const marker of mapOverlay.querySelectorAll('.mainVillage[id^="mainVillage"]')) {
      const coordinates = locationIdToCoordinates(marker.id.replace(/^mainVillage/, ''));
      if (!coordinates) continue;
      const left = Number.parseFloat(marker.style.left);
      const top = Number.parseFloat(marker.style.top);
      const horizontal = coordinates.x + coordinates.y;
      const vertical = coordinates.x - coordinates.y;
      if (halfWidth === null && Number.isFinite(left) && horizontal !== 0) {
        const candidate = Math.abs(left / horizontal);
        if (candidate > 0) halfWidth = candidate;
      }
      if (halfHeight === null && Number.isFinite(top) && vertical !== 0) {
        const candidate = Math.abs(top / vertical);
        if (candidate > 0) halfHeight = candidate;
      }
      if (halfWidth !== null && halfHeight !== null) break;
    }
    return { halfWidth: halfWidth || fallback.halfWidth, halfHeight: halfHeight || fallback.halfHeight };
  }

  function screenToCoordinate(screenX, screenY, metrics, overlayLeft, overlayTop) {
    const horizontal = (screenX - overlayLeft) / metrics.halfWidth;
    const vertical = (screenY - overlayTop) / metrics.halfHeight;
    return { x: (horizontal + vertical) / 2, y: (horizontal - vertical) / 2 };
  }

  function removeScopeOverlay() {
    document.getElementById('apes-oasis-scope69-overlay')?.remove();
  }

  function renderScopeOverlay() {
    overlayFrame = null;
    const config = readConfig();
    const visualOn = document.getElementById('qol-oasis-visual-aid-toggle')?.classList.contains('is-active');
    if (!config.enabled || !visualOn || !window.location.hash.includes('page:map')) {
      document.body.classList.remove('apes-oasis-scope69-active');
      removeScopeOverlay();
      return;
    }

    const mapOverlay = document.getElementById('overlayMarkers');
    if (!mapOverlay) {
      removeScopeOverlay();
      return;
    }

    document.body.classList.add('apes-oasis-scope69-active');
    let overlay = document.getElementById('apes-oasis-scope69-overlay');
    if (!overlay || overlay.parentElement !== mapOverlay) {
      overlay?.remove();
      overlay = document.createElement('div');
      overlay.id = 'apes-oasis-scope69-overlay';
      overlay.setAttribute('aria-hidden', 'true');
      mapOverlay.appendChild(overlay);
    }

    const metrics = mapMetrics(mapOverlay);
    const tileWidth = metrics.halfWidth * 2;
    const tileHeight = metrics.halfHeight * 2;
    const overlayLeft = Number.parseFloat(mapOverlay.style.left) || 0;
    const overlayTop = Number.parseFloat(mapOverlay.style.top) || 0;
    const canvas = document.getElementById('canvasBorder');
    const viewportWidth = canvas?.clientWidth || Number.parseFloat(canvas?.style.width) || window.innerWidth;
    const viewportHeight = canvas?.clientHeight || Number.parseFloat(canvas?.style.height) || window.innerHeight;
    const padX = metrics.halfWidth * 3;
    const padY = metrics.halfHeight * 3;
    const corners = [
      screenToCoordinate(-padX, -padY, metrics, overlayLeft, overlayTop),
      screenToCoordinate(viewportWidth + padX, -padY, metrics, overlayLeft, overlayTop),
      screenToCoordinate(-padX, viewportHeight + padY, metrics, overlayLeft, overlayTop),
      screenToCoordinate(viewportWidth + padX, viewportHeight + padY, metrics, overlayLeft, overlayTop)
    ];
    const minX = Math.max(MIN_COORD, Math.floor(Math.min(...corners.map(corner => corner.x))) - 1);
    const maxX = Math.min(MAX_COORD, Math.ceil(Math.max(...corners.map(corner => corner.x))) + 1);
    const minY = Math.max(MIN_COORD, Math.floor(Math.min(...corners.map(corner => corner.y))) - 1);
    const maxY = Math.min(MAX_COORD, Math.ceil(Math.max(...corners.map(corner => corner.y))) + 1);
    const sections = getSections(config.teamSize);
    const scanned = new Set(scannedEntries().map(item => item.id));
    const showAll = config.selectedSection === 'ALL';
    const fragment = document.createDocumentFragment();

    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const left = (x + y) * metrics.halfWidth - metrics.halfWidth;
        const top = (x - y) * metrics.halfHeight - metrics.halfHeight;
        const screenLeft = left + overlayLeft;
        const screenTop = top + overlayTop;
        if (screenLeft < -tileWidth || screenTop < -tileHeight || screenLeft > viewportWidth || screenTop > viewportHeight) continue;

        const id = `${x}|${y}`;
        const isScanned = scanned.has(id);
        const section = sectionFor(x, y, sections);
        if (!isScanned && (!section || (!showAll && section.id !== config.selectedSection))) continue;

        const tile = document.createElement('span');
        tile.className = `apes-oasis-scope69-tile ${isScanned ? 'is-scanned' : 'is-section'}`;
        if (section) tile.style.setProperty('--apes-oasis-section-rgb', section.rgb);
        tile.style.left = `${left}px`;
        tile.style.top = `${top}px`;
        tile.style.width = `${tileWidth}px`;
        tile.style.height = `${tileHeight}px`;
        fragment.appendChild(tile);
      }
    }
    overlay.replaceChildren(fragment);
  }

  function scheduleScopeOverlay() {
    if (overlayFrame !== null) return;
    overlayFrame = requestAnimationFrame(renderScopeOverlay);
  }

  function escapeCSV(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function getStoredRecord(id, x, y) {
    const tiles = readJSON(TILE_STORAGE_KEY, {});
    const oases = readJSON(OASIS_STORAGE_KEY, {});
    const croppers = readJSON(CROPPER_STORAGE_KEY, {});
    const tile = { id, x, y, tileType: 'unknown', status: 'scanned', ...(tiles[id] || {}) };
    if (oases[id]) {
      const oasis = oases[id];
      return {
        ...tile,
        ...oasis,
        tileType: 'oasis',
        resultType: 'oasis',
        status: oasis.oasisStatus || tile.status || 'wild',
        bonus: oasis.bonus || tile.bonus || {}
      };
    }
    if (croppers[id]) {
      const cropper = croppers[id];
      return {
        ...tile,
        ...cropper,
        tileType: 'settlement',
        resultType: cropper.fieldType || 'cropper',
        status: cropper.isNatar ? 'natarian' : cropper.available ? 'available' : tile.status || 'occupied'
      };
    }
    return tile;
  }

  function fieldCombination(record) {
    if (record.fieldCombination) return String(record.fieldCombination);
    const distribution = record.distribution;
    if (!distribution) return '';
    return `${Number(distribution.wood) || 0}/${Number(distribution.clay) || 0}/${Number(distribution.iron) || 0}/${Number(distribution.crop) || 0}`;
  }

  function normaliseBonus(record) {
    const bonus = record?.bonus || {};
    return {
      wood: Number(bonus.wood ?? bonus['1']) || 0,
      clay: Number(bonus.clay ?? bonus['2']) || 0,
      iron: Number(bonus.iron ?? bonus['3']) || 0,
      crop: Number(bonus.crop ?? bonus['4']) || 0
    };
  }

  function downloadCSV(rows, filename) {
    const csv = rows.map(row => row.map(escapeCSV).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setStatus(message) {
    const status = document.getElementById('qol-oasis-status-message');
    if (status) status.textContent = message;
  }

  function exportReducedSession() {
    const config = readConfig();
    const scanned = scannedEntries().sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);
    if (!scanned.length) {
      setStatus('This Tag Team session has no scanned tiles to export.');
      return;
    }

    const rows = [Array.from(EXPORT_HEADERS)];
    for (const coordinate of scanned) {
      const record = getStoredRecord(coordinate.id, coordinate.x, coordinate.y);
      const bonus = normaliseBonus(record);
      rows.push([
        HOST,
        coordinate.x,
        coordinate.y,
        `${coordinate.x}|${coordinate.y}`,
        record.tileType || 'unknown',
        fieldCombination(record),
        record.resultType || record.fieldType || '',
        record.status || 'scanned',
        bonus.wood,
        bonus.clay,
        bonus.iron,
        bonus.crop,
        record.playerId || '',
        record.playerName || '',
        record.villageName || '',
        record.kingdomId || '',
        record.oasisStatus || '',
        record.locationId || '',
        new Date(coordinate.scannedAt).toISOString(),
        record.lastSeen ? new Date(timestampFrom(record.lastSeen)).toISOString() : ''
      ]);
    }

    const scope = config.selectedSection === 'ALL' ? 'all' : config.selectedSection.toLowerCase();
    downloadCSV(rows, `apes-oasis-scan-${HOST}-section-${scope}.csv`);
    setStatus(`Exported ${scanned.length.toLocaleString()} scanned tiles.`);
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const input = String(text || '').replace(/^\uFEFF/, '');

    for (let index = 0; index < input.length; index += 1) {
      const char = input[index];
      if (quoted) {
        if (char === '"' && input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else if (char === '"') {
          quoted = false;
        } else {
          field += char;
        }
        continue;
      }
      if (char === '"') {
        quoted = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field.replace(/\r$/, ''));
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    row.push(field.replace(/\r$/, ''));
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
  }

  function parseDistribution(value) {
    const parts = String(value || '').trim().split(/[\/|;:-]/).map(part => parseInteger(part));
    if (parts.length < 4 || parts.slice(0, 4).some(part => part === null)) return null;
    return { wood: parts[0], clay: parts[1], iron: parts[2], crop: parts[3] };
  }

  function cropperType(distribution) {
    if (!distribution) return '';
    if (distribution.wood === 3 && distribution.clay === 3 && distribution.iron === 3 && distribution.crop === 9) return '9c';
    if (distribution.wood === 1 && distribution.clay === 1 && distribution.iron === 1 && distribution.crop === 15) return '15c';
    return '';
  }

  function importCSVText(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('The CSV does not contain any data rows.');

    const headers = rows[0].map(header => String(header || '').trim().toLowerCase());
    const column = (...names) => {
      for (const name of names) {
        const index = headers.indexOf(String(name).toLowerCase());
        if (index >= 0) return index;
      }
      return -1;
    };
    const valueAt = (row, ...names) => {
      const index = column(...names);
      return index >= 0 ? String(row[index] ?? '').trim() : '';
    };

    if (column('X') < 0 && column('Coordinate') < 0) throw new Error('CSV must contain X/Y or Coordinate columns.');

    const tiles = readJSON(TILE_STORAGE_KEY, {});
    const oases = readJSON(OASIS_STORAGE_KEY, {});
    const croppers = readJSON(CROPPER_STORAGE_KEY, {});
    const core = readCoreSession();
    const extended = syncExtendedSession();
    let imported = 0;
    let skippedServer = 0;
    let skippedInvalid = 0;

    for (const row of rows.slice(1)) {
      const server = valueAt(row, 'Server');
      if (server && server !== HOST) {
        skippedServer += 1;
        continue;
      }

      let x = parseInteger(valueAt(row, 'X'));
      let y = parseInteger(valueAt(row, 'Y'));
      if (x === null || y === null) {
        const coordinate = valueAt(row, 'Coordinate').match(/(-?\d+)\s*\|\s*(-?\d+)/);
        if (coordinate) {
          x = parseInteger(coordinate[1]);
          y = parseInteger(coordinate[2]);
        }
      }
      if (x === null || y === null || !inScope(x, y)) {
        skippedInvalid += 1;
        continue;
      }

      const id = `${x}|${y}`;
      const tileTypeRaw = valueAt(row, 'Tile Type', 'Type').toLowerCase();
      const resultRaw = valueAt(row, 'Result Type', 'Type').toLowerCase();
      const combination = valueAt(row, 'Field Combination', 'Distribution');
      const distribution = parseDistribution(combination);
      const inferredCropper = cropperType(distribution);
      const resultType = resultRaw === '9c' || resultRaw === '15c' ? resultRaw : inferredCropper;
      const status = valueAt(row, 'Status') || 'scanned';
      const bonus = {
        wood: numberOrZero(valueAt(row, 'Wood Bonus')),
        clay: numberOrZero(valueAt(row, 'Clay Bonus')),
        iron: numberOrZero(valueAt(row, 'Iron Bonus')),
        crop: numberOrZero(valueAt(row, 'Crop Bonus'))
      };
      const scannedAt = timestampFrom(valueAt(row, 'Scanned At'), timestampFrom(valueAt(row, 'Last Seen'), Date.now()));
      const lastSeen = timestampFrom(valueAt(row, 'Last Seen'), scannedAt);
      const playerId = parseInteger(valueAt(row, 'Player ID')) || 0;
      const playerName = valueAt(row, 'Player Name');
      const villageName = valueAt(row, 'Village Name');
      const kingdomId = parseInteger(valueAt(row, 'Kingdom ID')) || 0;
      const oasisStatus = valueAt(row, 'Oasis Status');
      const locationId = valueAt(row, 'Location ID');
      const isOasis = tileTypeRaw === 'oasis' || resultRaw === 'oasis';
      const tileType = isOasis ? 'oasis' : (tileTypeRaw || (distribution ? 'settlement' : 'terrain'));

      const tile = {
        ...(tiles[id] || {}),
        id,
        x,
        y,
        tileType,
        status,
        lastSeen
      };
      if (combination) tile.fieldCombination = combination;
      if (distribution) tile.distribution = distribution;
      if (Object.values(bonus).some(value => value !== 0)) tile.bonus = bonus;
      if (playerId) tile.playerId = playerId;
      if (playerName) tile.playerName = playerName;
      if (villageName) tile.villageName = villageName;
      if (kingdomId) tile.kingdomId = kingdomId;
      if (oasisStatus) tile.oasisStatus = oasisStatus;
      if (locationId) tile.locationId = locationId;
      if (resultType) tile.fieldType = resultType;
      tiles[id] = tile;

      if (isOasis) {
        oases[id] = {
          ...(oases[id] || {}),
          id,
          x,
          y,
          locationId,
          oasisType: 'imported',
          oasisStatus: oasisStatus || status || 'wild',
          kingdomId,
          bonus,
          lastSeen
        };
      }

      if (resultType === '9c' || resultType === '15c') {
        const natar = /natar/i.test(`${status} ${playerName} ${villageName}`);
        croppers[id] = {
          ...(croppers[id] || {}),
          id,
          x,
          y,
          fieldType: resultType,
          distribution: distribution || (resultType === '9c'
            ? { wood: 3, clay: 3, iron: 3, crop: 9 }
            : { wood: 1, clay: 1, iron: 1, crop: 15 }),
          available: !natar && !/occupied/i.test(status),
          isNatar: natar,
          playerId,
          playerName,
          villageName,
          locationId,
          lastSeen
        };
      }

      core.scannedTiles[id] = scannedAt;
      extended.scannedTiles[id] = scannedAt;
      imported += 1;
    }

    if (!imported) {
      throw new Error(`No rows were imported${skippedServer ? `; ${skippedServer} belonged to another server` : ''}.`);
    }

    writeJSON(TILE_STORAGE_KEY, tiles);
    writeJSON(OASIS_STORAGE_KEY, oases);
    writeJSON(CROPPER_STORAGE_KEY, croppers);
    writeJSON(CORE_SESSION_KEY, core);
    writeJSON(EXT_SESSION_KEY, extended);

    return { imported, skippedServer, skippedInvalid };
  }

  function ensureImportButton() {
    const panel = document.getElementById('qol-oasis-container');
    const exportButton = panel?.querySelector('#qol-oasis-export');
    if (!panel || !exportButton || panel.querySelector('#qol-oasis-import')) return;

    const button = document.createElement('div');
    button.id = 'qol-oasis-import';
    button.className = 'qol-oasis-action-btn';
    button.textContent = 'Import CSV';
    button.title = 'Import an APES Oasis Scanner CSV export';
    exportButton.insertAdjacentElement('beforebegin', button);

    let input = panel.querySelector('#qol-oasis-import-file');
    if (!input) {
      input = document.createElement('input');
      input.id = 'qol-oasis-import-file';
      input.type = 'file';
      input.accept = '.csv,text/csv';
      input.hidden = true;
      panel.appendChild(input);
    }

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      input.value = '';
      input.click();
    });

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const result = importCSVText(await file.text());
        const extra = [
          result.skippedServer ? `${result.skippedServer} other-server rows skipped` : '',
          result.skippedInvalid ? `${result.skippedInvalid} invalid/out-of-scope rows skipped` : ''
        ].filter(Boolean).join(' · ');
        const message = `Imported ${result.imported.toLocaleString()} Oasis Scanner rows${extra ? ` · ${extra}` : ''}.`;
        sessionStorage.setItem(IMPORT_FLASH_KEY, message);
        setStatus(`${message} Reloading scanner data…`);
        window.setTimeout(() => window.location.reload(), 180);
      } catch (error) {
        console.error('[APES Oasis Scanner] CSV import failed.', error);
        setStatus(`Import failed: ${error?.message || error}`);
      }
    });
  }

  function restoreImportFlash() {
    const message = sessionStorage.getItem(IMPORT_FLASH_KEY);
    if (!message) return;
    const panel = document.getElementById('qol-oasis-container');
    const toggle = document.getElementById('qol-oasis-toggle-btn');
    if (!panel || !toggle) return;
    sessionStorage.removeItem(IMPORT_FLASH_KEY);
    if (getComputedStyle(panel).display === 'none') toggle.click();
    window.setTimeout(() => setStatus(message), 80);
  }

  function injectStyles() {
    if (document.getElementById('apes-oasis-scope69-styles')) return;
    const style = document.createElement('style');
    style.id = 'apes-oasis-scope69-styles';
    style.textContent = `
      body.apes-oasis-scope69-active #qol-oasis-scanned-overlay .qol-tag-team-tile {
        opacity: 0 !important;
      }
      #apes-oasis-scope69-overlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 0 !important;
        height: 0 !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 1 !important;
      }
      .apes-oasis-scope69-tile {
        position: absolute !important;
        display: block !important;
        box-sizing: border-box !important;
        pointer-events: none !important;
        clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%) !important;
        mix-blend-mode: multiply !important;
      }
      .apes-oasis-scope69-tile.is-section {
        background: rgba(var(--apes-oasis-section-rgb), .58) !important;
      }
      .apes-oasis-scope69-tile.is-scanned {
        background: rgba(167, 40, 40, .42) !important;
      }
      #qol-oasis-import-file {
        display: none !important;
      }
      #qol-oasis-container .qol-oasis-controls {
        grid-template-columns:
          minmax(105px, 1fr)
          minmax(105px, 1fr)
          minmax(130px, 1.3fr)
          minmax(100px, 1fr)
          auto auto auto auto auto auto auto
          !important;
      }
      @media (max-width: 1050px) {
        #qol-oasis-container .qol-oasis-controls {
          grid-template-columns: 1fr 1fr 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Replace the Tag Team export only. The non-Tag-Team result export remains unchanged.
  document.addEventListener('click', event => {
    const exportButton = event.target?.closest?.('#qol-oasis-export');
    if (!exportButton || !readConfig().enabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    exportReducedSession();
  }, true);

  document.addEventListener('mousemove', () => {
    window.setTimeout(recordCurrentCoordinate, 0);
  }, true);
  document.addEventListener('pointerover', () => {
    window.setTimeout(recordCurrentCoordinate, 0);
  }, true);

  const mapObserver = new MutationObserver(scheduleScopeOverlay);
  function installMapObserver() {
    const map = document.getElementById('overlayMarkers');
    if (!map || map.dataset.apesScope69Observed === '1') return;
    map.dataset.apesScope69Observed = '1';
    mapObserver.disconnect();
    mapObserver.observe(map, { attributes: true, attributeFilter: ['class', 'style'], childList: true });
  }

  injectStyles();
  window.setInterval(() => {
    syncExtendedSession();
    recordCurrentCoordinate();
    ensureImportButton();
    patchTagTeamUI();
    installMapObserver();
    scheduleScopeOverlay();
    restoreImportFlash();
  }, 300);

  window.addEventListener('resize', scheduleScopeOverlay);
  window.addEventListener('hashchange', () => {
    lastRecordedCoordinate = '';
    scheduleScopeOverlay();
  });
})();
