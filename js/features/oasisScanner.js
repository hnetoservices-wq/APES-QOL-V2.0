(function initOasisScannerModule() {
  "use strict";

  const FEATURE_KEY = "oasisScanner";
  const MESSAGE_SOURCE = "APES_QOL_OASIS_BRIDGE";
  const OASIS_MESSAGE_TYPE = "OASIS_DETAILS";
  const TILE_MESSAGE_TYPE = "TILE_DETAILS";
  const CROPPER_MESSAGE_TYPE = "CROPPER_DETAILS";
  const OASIS_STORAGE_KEY = `qol_oasis_scanner_${window.location.hostname}`;
  const CROPPER_STORAGE_KEY = `qol_cropper_scanner_${window.location.hostname}`;
  const TILE_STORAGE_KEY = `qol_tile_scanner_${window.location.hostname}`;
  const VISUAL_AID_STORAGE_KEY = `qol_oasis_visual_aid_${window.location.hostname}`;
  const HIGHLIGHT_9C_STORAGE_KEY = `qol_oasis_highlight_9c_${window.location.hostname}`;
  const HIGHLIGHT_15C_STORAGE_KEY = `qol_oasis_highlight_15c_${window.location.hostname}`;
  const LEGACY_TINT_STORAGE_KEY = `qol_oasis_tint_${window.location.hostname}`;
  const TAG_TEAM_STORAGE_KEY = `qol_oasis_tag_team_${window.location.hostname}`;
  const TAG_TEAM_SESSION_STORAGE_KEY = `qol_oasis_tag_team_session_${window.location.hostname}`;
  const OASIS_RADIUS = 3;
  const MAX_ASSIGNED_OASES = 3;
  const LOCATION_ID_SIZE = 32768;
  const LOCATION_ID_OFFSET = 16384;
  const TAG_TEAM_BOUNDS = {
    minX: -59,
    maxX: 59,
    minY: -59,
    maxY: 59
  };
  const TAG_TEAM_LAYOUTS = {
    2: {
      columns: 2,
      rows: 1
    },
    3: {
      columns: 3,
      rows: 1
    },
    4: {
      columns: 2,
      rows: 2
    },
    5: {
      columns: 5,
      rows: 1
    },
    6: {
      columns: 3,
      rows: 2
    }
  };
  const TAG_TEAM_SECTION_COLORS = [{
    id: "A",
    name: "Blue",
    hex: "#2d7dd2",
    rgb: "45, 125, 210"
  }, {
    id: "B",
    name: "Orange",
    hex: "#f28e2b",
    rgb: "242, 142, 43"
  }, {
    id: "C",
    name: "Purple",
    hex: "#8f63c7",
    rgb: "143, 99, 199"
  }, {
    id: "D",
    name: "Green",
    hex: "#43a047",
    rgb: "67, 160, 71"
  }, {
    id: "E",
    name: "Pink",
    hex: "#d45087",
    rgb: "212, 80, 135"
  }, {
    id: "F",
    name: "Cyan",
    hex: "#17a2b8",
    rgb: "23, 162, 184"
  }];
  const BONUS_CAPS = {
    wood: 75,
    clay: 75,
    iron: 75,
    crop: 150
  };
  let oasisContainer = null;
  let oasisToggleButton = null;
  let savedOases = loadStoredObject(OASIS_STORAGE_KEY);
  let savedCroppers = loadStoredObject(CROPPER_STORAGE_KEY);
  let savedTiles = loadStoredObject(TILE_STORAGE_KEY);
  let visualAidEnabled = loadVisualAidEnabled();
  let highlight9cEnabled = loadCropperHighlightEnabled(HIGHLIGHT_9C_STORAGE_KEY);
  let highlight15cEnabled = loadCropperHighlightEnabled(HIGHLIGHT_15C_STORAGE_KEY);
  let tagTeamConfig = loadTagTeamConfig();
  let tagTeamSession = loadTagTeamSession();
  let tooltipObserver = null;
  let tooltipRootObserver = null;
  let observedTooltip = null;
  let scanQueued = false;
  let scanFrame = null;
  let lastTooltipSignature = "";
  let lastHoveredCoordinates = null;
  let scannedOverlay = null;
  let observedMapOverlay = null;
  let mapOverlayObserver = null;
  let overlayRenderFrame = null;
  let tagTeamSaveTimer = null;
  const expandedCropperIds = new Set();
  function isEnabled() {
    return typeof window.isQolEnabled === "function" ? window.isQolEnabled(FEATURE_KEY) : true;
  }
  function isMapPage() {
    return window.location.hash.includes("page:map");
  }
  function loadVisualAidEnabled() {
    try {
      const savedValue = localStorage.getItem(VISUAL_AID_STORAGE_KEY);
      if (savedValue !== null) {
        return savedValue !== "false";
      }
      const legacyValue = localStorage.getItem(LEGACY_TINT_STORAGE_KEY);
      return legacyValue !== "false";
    } catch (error) {
      return true;
    }
  }
  function saveVisualAidEnabled() {
    try {
      localStorage.setItem(VISUAL_AID_STORAGE_KEY, String(visualAidEnabled));
    } catch (error) {
      console.error("[APES Oasis Scanner] Failed to save the Visual Aid setting.", error);
    }
  }
  function loadCropperHighlightEnabled(storageKey) {
    try {
      return localStorage.getItem(storageKey) === "true";
    } catch (error) {
      return false;
    }
  }
  function saveCropperHighlightSettings() {
    try {
      localStorage.setItem(HIGHLIGHT_9C_STORAGE_KEY, String(highlight9cEnabled));
      localStorage.setItem(HIGHLIGHT_15C_STORAGE_KEY, String(highlight15cEnabled));
    } catch (error) {
      console.error("[APES Oasis Scanner] Failed to save cropper highlight settings.", error);
    }
  }
  function updateCropperHighlightButtons() {
    const button9c = document.getElementById("qol-oasis-highlight-9c");
    const button15c = document.getElementById("qol-oasis-highlight-15c");
    if (button9c) {
      button9c.classList.toggle("is-active", highlight9cEnabled);
      button9c.setAttribute("aria-pressed", String(highlight9cEnabled));
      button9c.title = highlight9cEnabled ? "Hide scanned 9c tiles" : "Highlight scanned 9c tiles in orange";
    }
    if (button15c) {
      button15c.classList.toggle("is-active", highlight15cEnabled);
      button15c.setAttribute("aria-pressed", String(highlight15cEnabled));
      button15c.title = highlight15cEnabled ? "Hide scanned 15c tiles" : "Highlight scanned 15c tiles in purple";
    }
  }
  function toggleCropperHighlight(fieldType) {
    if (fieldType === "9c") {
      highlight9cEnabled = !highlight9cEnabled;
    } else if (fieldType === "15c") {
      highlight15cEnabled = !highlight15cEnabled;
    } else {
      return;
    }
    saveCropperHighlightSettings();
    updateCropperHighlightButtons();
    scheduleScannedOverlayRender();
    const enabled = fieldType === "9c" ? highlight9cEnabled : highlight15cEnabled;
    setStatus(`${fieldType} map highlight ${enabled ? "enabled" : "disabled"}. ` + "Scanning remains active.");
  }
  function getDefaultTagTeamConfig() {
    return {
      enabled: false,
      teamSize: 2,
      selectedSection: "A"
    };
  }
  function normaliseTagTeamConfig(rawConfig) {
    const defaults = getDefaultTagTeamConfig();
    const teamSize = Math.max(2, Math.min(6, parseInteger(rawConfig?.teamSize) || defaults.teamSize));
    const availableSections = ["ALL", ...TAG_TEAM_SECTION_COLORS.slice(0, teamSize).map(section => section.id)];
    const selectedSection = availableSections.includes(rawConfig?.selectedSection) ? rawConfig.selectedSection : "A";
    return {
      enabled: rawConfig?.enabled === true,
      teamSize,
      selectedSection
    };
  }
  function loadTagTeamConfig() {
    try {
      const raw = localStorage.getItem(TAG_TEAM_STORAGE_KEY);
      return normaliseTagTeamConfig(raw ? JSON.parse(raw) : null);
    } catch (error) {
      console.error("[APES Oasis Scanner] Failed to load the Tag Team setup.", error);
      return getDefaultTagTeamConfig();
    }
  }
  function saveTagTeamConfig() {
    try {
      localStorage.setItem(TAG_TEAM_STORAGE_KEY, JSON.stringify(tagTeamConfig));
    } catch (error) {
      console.error("[APES Oasis Scanner] Failed to save the Tag Team setup.", error);
    }
  }
  function createTagTeamSession() {
    const now = Date.now();
    return {
      id: `${now.toString(36)}-` + `${Math.random().toString(36).slice(2, 8)}`,
      startedAt: now,
      teamSize: tagTeamConfig.teamSize,
      scannedTiles: {}
    };
  }
  function loadTagTeamSession() {
    try {
      const raw = localStorage.getItem(TAG_TEAM_SESSION_STORAGE_KEY);
      if (!raw) {
        return createTagTeamSession();
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.scannedTiles || typeof parsed.scannedTiles !== "object" || Array.isArray(parsed.scannedTiles)) {
        return createTagTeamSession();
      }
      return {
        id: String(parsed.id || "") || createTagTeamSession().id,
        startedAt: Number(parsed.startedAt) || Date.now(),
        teamSize: Math.max(2, Math.min(6, parseInteger(parsed.teamSize) || tagTeamConfig.teamSize)),
        scannedTiles: parsed.scannedTiles
      };
    } catch (error) {
      console.error("[APES Oasis Scanner] Failed to load the Tag Team session.", error);
      return createTagTeamSession();
    }
  }
  function saveTagTeamSession() {
    if (tagTeamSaveTimer !== null) {
      clearTimeout(tagTeamSaveTimer);
      tagTeamSaveTimer = null;
    }
    try {
      localStorage.setItem(TAG_TEAM_SESSION_STORAGE_KEY, JSON.stringify(tagTeamSession));
    } catch (error) {
      console.error("[APES Oasis Scanner] Failed to save the Tag Team session.", error);
    }
  }
  function queueTagTeamSessionSave() {
    if (tagTeamSaveTimer !== null) {
      return;
    }
    tagTeamSaveTimer = window.setTimeout(saveTagTeamSession, 500);
  }
  function getAxisSections(minimum, maximum, count) {
    const total = maximum - minimum + 1;
    const baseSize = Math.floor(total / count);
    const remainder = total % count;
    const sections = [];
    let cursor = minimum;
    for (let index = 0; index < count; index += 1) {
      const size = baseSize + (index < remainder ? 1 : 0);
      const sectionMaximum = cursor + size - 1;
      sections.push({
        minimum: cursor,
        maximum: sectionMaximum
      });
      cursor = sectionMaximum + 1;
    }
    return sections;
  }
  function getSectionPositionLabel(teamSize, row, column) {
    const labels = {
      2: ["West", "East"],
      3: ["West", "Centre", "East"],
      4: ["Northwest", "Northeast", "Southwest", "Southeast"],
      5: ["Far West", "West-Centre", "Centre", "East-Centre", "Far East"],
      6: ["Northwest", "North-Centre", "Northeast", "Southwest", "South-Centre", "Southeast"]
    };
    const layout = TAG_TEAM_LAYOUTS[teamSize];
    const index = row * layout.columns + column;
    return labels[teamSize][index];
  }
  function getTagTeamSections(teamSize = tagTeamConfig.teamSize) {
    const layout = TAG_TEAM_LAYOUTS[teamSize] || TAG_TEAM_LAYOUTS[2];
    const xSections = getAxisSections(TAG_TEAM_BOUNDS.minX, TAG_TEAM_BOUNDS.maxX, layout.columns);
    const ySections = getAxisSections(TAG_TEAM_BOUNDS.minY, TAG_TEAM_BOUNDS.maxY, layout.rows);
    const sections = [];
    let sectionIndex = 0;
    for (let row = 0; row < layout.rows; row += 1) {
      for (let column = 0; column < layout.columns; column += 1) {
        const color = TAG_TEAM_SECTION_COLORS[sectionIndex];
        const primary = {
          minX: xSections[column].minimum,
          maxX: xSections[column].maximum,
          minY: ySections[row].minimum,
          maxY: ySections[row].maximum
        };
        const assigned = {
          ...primary
        };
        sections.push({
          ...color,
          row,
          column,
          primary,
          assigned,
          position: getSectionPositionLabel(teamSize, row, column)
        });
        sectionIndex += 1;
      }
    }
    return sections;
  }
  function isCoordinateInsideBounds(x, y, bounds) {
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
  }
  function getPrimarySectionForCoordinate(x, y, teamSize = tagTeamConfig.teamSize) {
    return getTagTeamSections(teamSize).find(section => isCoordinateInsideBounds(x, y, section.primary)) || null;
  }
  function getAssignedSectionsForCoordinate(x, y, teamSize = tagTeamConfig.teamSize) {
    return getTagTeamSections(teamSize).filter(section => isCoordinateInsideBounds(x, y, section.assigned));
  }
  function getSelectedTagTeamSection() {
    if (tagTeamConfig.selectedSection === "ALL") {
      return null;
    }
    return getTagTeamSections().find(section => section.id === tagTeamConfig.selectedSection) || null;
  }
  function isAllTagTeamSectionsVisible() {
    return tagTeamConfig.selectedSection === "ALL";
  }
  function getBoundsTileCount(bounds) {
    return (bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1);
  }
  function getTagTeamProgress() {
    const selectedSection = getSelectedTagTeamSection();
    const allSections = isAllTagTeamSectionsVisible();
    const scannedCoordinates = Object.entries(tagTeamSession.scannedTiles || {}).map(([id, scannedAt]) => {
      const [rawX, rawY] = id.split("|");
      const x = parseInteger(rawX);
      const y = parseInteger(rawY);
      if (x === null || y === null || !isCoordinateInsideBounds(x, y, TAG_TEAM_BOUNDS)) {
        return null;
      }
      return {
        id,
        x,
        y,
        scannedAt: Number(scannedAt) || tagTeamSession.startedAt
      };
    }).filter(Boolean);
    const overallScanned = scannedCoordinates.length;
    const overallTotal = getBoundsTileCount(TAG_TEAM_BOUNDS);
    const assignedScanned = allSections ? overallScanned : selectedSection ? scannedCoordinates.filter(coordinate => isCoordinateInsideBounds(coordinate.x, coordinate.y, selectedSection.assigned)).length : 0;
    const assignedTotal = allSections ? overallTotal : selectedSection ? getBoundsTileCount(selectedSection.assigned) : 0;
    return {
      selectedSection,
      allSections,
      scannedCoordinates,
      assignedScanned,
      assignedTotal,
      overallScanned,
      overallTotal,
      assignedPercentage: assignedTotal ? assignedScanned / assignedTotal * 100 : 0,
      overallPercentage: overallTotal ? overallScanned / overallTotal * 100 : 0
    };
  }
  function formatPercentage(value) {
    return `${Math.min(100, Math.max(0, value)).toFixed(1)}%`;
  }
  function updateVisualAidToggleButton() {
    const button = document.getElementById("qol-oasis-visual-aid-toggle");
    if (!button) {
      return;
    }
    button.textContent = visualAidEnabled ? "Visual Aid: On" : "Visual Aid: Off";
    button.classList.toggle("is-active", visualAidEnabled);
    button.setAttribute("aria-pressed", String(visualAidEnabled));
    button.title = visualAidEnabled ? "Hide map scan colours" : "Show map scan colours";
  }
  function updateTagTeamProgressUI() {
    const card = document.getElementById("qol-tag-team-card");
    if (!card) {
      return;
    }
    const progress = getTagTeamProgress();
    const selectedSection = progress.selectedSection;
    const assignedText = document.getElementById("qol-tag-team-assigned-text");
    const overallText = document.getElementById("qol-tag-team-overall-text");
    const assignedBar = document.getElementById("qol-tag-team-assigned-bar");
    const overallBar = document.getElementById("qol-tag-team-overall-bar");
    if (assignedText) {
      assignedText.textContent = progress.allSections ? `All sections: ${progress.assignedScanned.toLocaleString()} / ${progress.assignedTotal.toLocaleString()} (${formatPercentage(progress.assignedPercentage)})` : selectedSection ? `Section ${selectedSection.id}: ${progress.assignedScanned.toLocaleString()} / ${progress.assignedTotal.toLocaleString()} (${formatPercentage(progress.assignedPercentage)})` : "No section selected";
    }
    if (overallText) {
      overallText.textContent = `Full map: ${progress.overallScanned.toLocaleString()} / ${progress.overallTotal.toLocaleString()} (${formatPercentage(progress.overallPercentage)})`;
    }
    if (assignedBar) {
      assignedBar.style.setProperty("width", formatPercentage(progress.assignedPercentage), "important");
      assignedBar.style.backgroundColor = selectedSection?.hex || "var(--qol-accent)";
    }
    if (overallBar) {
      overallBar.style.setProperty("width", formatPercentage(progress.overallPercentage), "important");
    }
  }
  function updateTagTeamUI() {
    const card = document.getElementById("qol-tag-team-card");
    if (!card) {
      return;
    }
    card.classList.toggle("is-enabled", tagTeamConfig.enabled);
    const toggleButton = document.getElementById("qol-tag-team-toggle");
    if (toggleButton) {
      toggleButton.textContent = tagTeamConfig.enabled ? "Tag Team: On" : "Tag Team: Off";
      toggleButton.classList.toggle("is-active", tagTeamConfig.enabled);
      toggleButton.setAttribute("aria-pressed", String(tagTeamConfig.enabled));
    }
    const teamSizeSelect = document.getElementById("qol-tag-team-size");
    if (teamSizeSelect) {
      teamSizeSelect.value = String(tagTeamConfig.teamSize);
    }
    const sectionSelect = document.getElementById("qol-tag-team-section");
    if (sectionSelect) {
      sectionSelect.innerHTML = [`<option value="ALL">All</option>`, ...getTagTeamSections().map(section => `<option value="${section.id}">${section.id} — ${section.position}</option>`)].join("");
      sectionSelect.value = tagTeamConfig.selectedSection;
    }
    const setupSummary = document.getElementById("qol-tag-team-setup-summary");
    const selectedSection = getSelectedTagTeamSection();
    if (setupSummary) {
      setupSummary.textContent = tagTeamConfig.enabled ? isAllTagTeamSectionsVisible() ? `All sections · ${tagTeamConfig.teamSize} users` : selectedSection ? `Section ${selectedSection.id} · ${selectedSection.position} · ${selectedSection.name}` : "Manual shared scan sections" : "Manual shared scan sections";
    }
    const legend = document.getElementById("qol-tag-team-legend");
    if (legend) {
      const showAll = isAllTagTeamSectionsVisible();
      legend.innerHTML = getTagTeamSections().map(section => `
              <span
                class="qol-tag-team-legend-item ${showAll || section.id === tagTeamConfig.selectedSection ? "is-selected" : ""}"
              >
                <span
                  class="qol-tag-team-swatch"
                  style="background-color: ${section.hex}"
                ></span>
                ${section.id}
              </span>
            `).join("");
    }
    const exportButton = document.getElementById("qol-oasis-export");
    if (exportButton) {
      exportButton.textContent = tagTeamConfig.enabled ? "Export Session" : "Export CSV";
    }
    updateTagTeamProgressUI();
  }
  function toggleVisualAidMode() {
    visualAidEnabled = !visualAidEnabled;
    saveVisualAidEnabled();
    updateVisualAidToggleButton();
    if (visualAidEnabled) {
      scheduleScannedOverlayRender();
      setStatus("Visual Aid Mode turned on.");
    } else {
      if (highlight9cEnabled || highlight15cEnabled) {
        scheduleScannedOverlayRender();
      } else {
        removeScannedTileOverlay();
      }
      setStatus("Visual Aid Mode turned off. Scanning remains active.");
    }
  }
  function getVisibleSectionLabel() {
    return isAllTagTeamSectionsVisible() ? "All sections" : `Section ${tagTeamConfig.selectedSection}`;
  }
  function toggleTagTeamMode() {
    tagTeamConfig.enabled = !tagTeamConfig.enabled;
    if (tagTeamConfig.enabled && tagTeamSession.teamSize !== tagTeamConfig.teamSize) {
      tagTeamSession = createTagTeamSession();
      saveTagTeamSession();
    }
    saveTagTeamConfig();
    updateTagTeamUI();
    scheduleScannedOverlayRender();
    setStatus(tagTeamConfig.enabled ? `Tag Team Mode enabled. Visible section: ${getVisibleSectionLabel()}.` : "Tag Team Mode disabled. Your session progress was preserved.");
  }
  function startNewTagTeamSession(askForConfirmation = true) {
    if (askForConfirmation && Object.keys(tagTeamSession.scannedTiles || {}).length > 0) {
      const confirmed = window.confirm("Start a new Tag Team session? " + "The current session progress will be reset to zero. " + "Saved croppers, oases and tile details will not be deleted.");
      if (!confirmed) {
        return;
      }
    }
    tagTeamSession = createTagTeamSession();
    saveTagTeamSession();
    updateTagTeamUI();
    scheduleScannedOverlayRender();
    setStatus(`New Tag Team session started. Visible section: ${getVisibleSectionLabel()}.`);
  }
  function changeTagTeamSize(rawValue) {
    const nextTeamSize = Math.max(2, Math.min(6, parseInteger(rawValue) || 2));
    if (nextTeamSize === tagTeamConfig.teamSize) {
      return;
    }
    tagTeamConfig.teamSize = nextTeamSize;
    const availableSections = ["ALL", ...TAG_TEAM_SECTION_COLORS.slice(0, nextTeamSize).map(section => section.id)];
    if (!availableSections.includes(tagTeamConfig.selectedSection)) {
      tagTeamConfig.selectedSection = "A";
    }
    saveTagTeamConfig();
    tagTeamSession = createTagTeamSession();
    saveTagTeamSession();
    updateTagTeamUI();
    scheduleScannedOverlayRender();
    setStatus(`Tag Team changed to ${nextTeamSize} sections. A new zero-progress session was started.`);
  }
  function changeTagTeamSection(sectionId) {
    const isAvailable = sectionId === "ALL" || getTagTeamSections().some(section => section.id === sectionId);
    if (!isAvailable) {
      return;
    }
    tagTeamConfig.selectedSection = sectionId;
    saveTagTeamConfig();
    updateTagTeamUI();
    scheduleScannedOverlayRender();
    setStatus(`Visible section changed to ${getVisibleSectionLabel()}. Existing session scans were preserved.`);
  }
  function recordTagTeamScan(record) {
    if (!tagTeamConfig.enabled || !record) {
      return;
    }
    const x = Number(record.x);
    const y = Number(record.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !isCoordinateInsideBounds(x, y, TAG_TEAM_BOUNDS)) {
      return;
    }
    const id = `${x}|${y}`;
    if (!tagTeamSession.scannedTiles[id]) {
      tagTeamSession.scannedTiles[id] = Date.now();
      queueTagTeamSessionSave();
      updateTagTeamProgressUI();
    }
  }
  function parseInteger(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function cleanTooltipText(value) {
    return String(value || "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/gi, "").replace(/\s+/g, " ").trim();
  }
  function readHoveredCoordinates() {
    const wrapper = document.querySelector("#tileInformation .coordinateWrapper");
    if (!wrapper) {
      return null;
    }
    const x = parseInteger(wrapper.getAttribute("x"));
    const y = parseInteger(wrapper.getAttribute("y"));
    if (x === null || y === null) {
      return null;
    }
    return {
      x,
      y
    };
  }
  function rememberHoveredCoordinates(coordinates) {
    if (!coordinates) {
      return;
    }
    lastHoveredCoordinates = {
      x: coordinates.x,
      y: coordinates.y,
      capturedAt: Date.now()
    };
  }
  function getUsableCoordinates() {
    const current = readHoveredCoordinates();
    if (current) {
      return current;
    }
    if (lastHoveredCoordinates && Date.now() - lastHoveredCoordinates.capturedAt <= 1500) {
      return {
        x: lastHoveredCoordinates.x,
        y: lastHoveredCoordinates.y
      };
    }
    return null;
  }
  function locationIdToCoordinates(locationId) {
    const value = Number(locationId);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const encodedY = Math.floor(value / LOCATION_ID_SIZE);
    const encodedX = value - encodedY * LOCATION_ID_SIZE;
    return {
      x: encodedX - LOCATION_ID_OFFSET,
      y: encodedY - LOCATION_ID_OFFSET
    };
  }
  function readPayloadCoordinates(payload) {
    const x = parseInteger(payload?.x ?? payload?.coordinates?.x);
    const y = parseInteger(payload?.y ?? payload?.coordinates?.y);
    if (x !== null && y !== null) {
      return {
        x,
        y
      };
    }
    return locationIdToCoordinates(payload?.locationId);
  }
  function loadStoredObject(storageKey) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch (error) {
      console.error(`[APES Oasis Scanner] Failed to load ${storageKey}.`, error);
      return {};
    }
  }
  function saveStoredObject(storageKey, value) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.error(`[APES Oasis Scanner] Failed to save ${storageKey}.`, error);
    }
  }
  function saveOases() {
    saveStoredObject(OASIS_STORAGE_KEY, savedOases);
  }
  function saveCroppers() {
    saveStoredObject(CROPPER_STORAGE_KEY, savedCroppers);
  }
  function saveTiles() {
    saveStoredObject(TILE_STORAGE_KEY, savedTiles);
  }
  function normaliseBonus(rawBonus) {
    const bonus = rawBonus || {};
    return {
      wood: Number(bonus.wood ?? bonus["1"]) || 0,
      clay: Number(bonus.clay ?? bonus["2"]) || 0,
      iron: Number(bonus.iron ?? bonus["3"]) || 0,
      crop: Number(bonus.crop ?? bonus["4"]) || 0
    };
  }
  function isNatarText(value) {
    return /natars?|natarian/i.test(String(value || ""));
  }
  function migrateStoredData() {
    let changedOases = false;
    let changedCroppers = false;
    let changedTiles = false;
    Object.values(savedOases).forEach(oasis => {
      if (!oasis || typeof oasis !== "object") {
        return;
      }
      oasis.bonus = normaliseBonus(oasis.bonus);
      if (String(oasis.oasisType || "") === "41" && oasis.bonus.crop < 50) {
        oasis.bonus.crop = 50;
        changedOases = true;
      }
      if (oasis.id && !savedTiles[oasis.id]) {
        savedTiles[oasis.id] = {
          id: oasis.id,
          x: Number(oasis.x),
          y: Number(oasis.y),
          tileType: "oasis",
          status: oasis.oasisStatus || "wild",
          bonus: normaliseBonus(oasis.bonus),
          lastSeen: Number(oasis.lastSeen) || Date.now()
        };
        changedTiles = true;
      }
    });
    Object.values(savedCroppers).forEach(cropper => {
      if (!cropper || typeof cropper !== "object") {
        return;
      }
      if (cropper.isNatar === true || isNatarText(cropper.playerName) || isNatarText(cropper.villageName)) {
        cropper.isNatar = true;
        cropper.available = false;
        changedCroppers = true;
      }
      if (cropper.id && !savedTiles[cropper.id]) {
        savedTiles[cropper.id] = {
          ...cropper,
          tileType: "settlement",
          status: cropper.isNatar ? "natarian" : cropper.available ? "available" : "occupied"
        };
        changedTiles = true;
      }
    });
    Object.values(savedTiles).forEach(tile => {
      if (!tile || typeof tile !== "object") {
        return;
      }
      if (tile.distribution) {
        tile.distribution = {
          wood: Number(tile.distribution.wood) || 0,
          clay: Number(tile.distribution.clay) || 0,
          iron: Number(tile.distribution.iron) || 0,
          crop: Number(tile.distribution.crop) || 0
        };
      }
      if (tile.bonus) {
        tile.bonus = normaliseBonus(tile.bonus);
      }
    });
    if (changedOases) {
      saveOases();
    }
    if (changedCroppers) {
      saveCroppers();
    }
    if (changedTiles) {
      saveTiles();
    }
  }
  function formatBonus(rawBonus) {
    const bonus = normaliseBonus(rawBonus);
    const parts = [];
    if (bonus.wood > 0) {
      parts.push(`${bonus.wood}% Wood`);
    }
    if (bonus.clay > 0) {
      parts.push(`${bonus.clay}% Clay`);
    }
    if (bonus.iron > 0) {
      parts.push(`${bonus.iron}% Iron`);
    }
    if (bonus.crop > 0) {
      parts.push(`${bonus.crop}% Crop`);
    }
    return parts.length ? parts.join(" + ") : "No scanned bonus";
  }
  function formatCoordinates(entry) {
    return `(${entry.x}|${entry.y})`;
  }
  function formatKingdom(kingdomId) {
    const parsed = Number(kingdomId);
    return Number.isFinite(parsed) && parsed > 0 ? `#${parsed}` : "—";
  }
  function formatLastSeen(timestamp) {
    const parsed = Number(timestamp);
    if (Number.isFinite(parsed) && parsed > 0) {
      return new Date(parsed).toLocaleString();
    }
    return "Unknown";
  }
  function findResourceDistributionContainer(tileInformation) {
    if (!tileInformation) {
      return null;
    }
    const candidates = tileInformation.querySelectorAll(".contentBoxBody.resources span, " + '[ng-if="tiInfos.resDistribution"]');
    for (const candidate of candidates) {
      if (candidate.querySelector(".unit_wood_small_illu") && candidate.querySelector(".unit_clay_small_illu") && candidate.querySelector(".unit_iron_small_illu") && candidate.querySelector(".unit_crop_small_illu")) {
        return candidate;
      }
    }
    return null;
  }
  function readNumberFollowingIcon(iconElement) {
    if (!iconElement) {
      return null;
    }
    let sibling = iconElement.nextSibling;
    let text = "";
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.matches?.(".unit_wood_small_illu, " + ".unit_clay_small_illu, " + ".unit_iron_small_illu, " + ".unit_crop_small_illu")) {
        break;
      }
      text += sibling.textContent || "";
      const match = cleanTooltipText(text).match(/-?\d+/);
      if (match) {
        return parseInteger(match[0]);
      }
      sibling = sibling.nextSibling;
    }
    return null;
  }
  function readResourceDistribution(tileInformation) {
    const container = findResourceDistributionContainer(tileInformation);
    if (!container) {
      return null;
    }
    const distribution = {
      wood: readNumberFollowingIcon(container.querySelector(".unit_wood_small_illu")),
      clay: readNumberFollowingIcon(container.querySelector(".unit_clay_small_illu")),
      iron: readNumberFollowingIcon(container.querySelector(".unit_iron_small_illu")),
      crop: readNumberFollowingIcon(container.querySelector(".unit_crop_small_illu"))
    };
    if (Object.values(distribution).some(value => value === null)) {
      return null;
    }
    return distribution;
  }
  function getCropperType(distribution) {
    if (!distribution) {
      return null;
    }
    if (distribution.wood === 3 && distribution.clay === 3 && distribution.iron === 3 && distribution.crop === 9) {
      return "9c";
    }
    if (distribution.wood === 1 && distribution.clay === 1 && distribution.iron === 1 && distribution.crop === 15) {
      return "15c";
    }
    return null;
  }
  function isElementVisiblyPopulated(element) {
    if (!element || element.classList.contains("ng-hide")) {
      return false;
    }
    if ((element.textContent || "").trim()) {
      return true;
    }
    return Boolean(element.querySelector(".unit_population_small_illu, " + ".playerName, " + "[player-id], " + "[playerid]"));
  }
  function getSettlementTileStatus(tileInformation) {
    if (!tileInformation) {
      return {
        type: "occupied",
        available: false,
        isNatar: false
      };
    }
    const owner = tileInformation.querySelector(".owner");
    const playerName = tileInformation.querySelector(".playerName, " + '[ng-if="tiInfos.playerName"]');
    const villageName = tileInformation.querySelector(".villageName, " + '[ng-if="tiInfos.villageName"]');
    const identityText = [owner?.textContent, playerName?.textContent, villageName?.textContent].filter(Boolean).join(" ");
    if (isNatarText(identityText)) {
      return {
        type: "natarian",
        available: false,
        isNatar: true,
        playerName: cleanTooltipText(playerName?.textContent) || "Natars",
        villageName: cleanTooltipText(villageName?.textContent) || "Natarian village"
      };
    }
    if (owner && cleanTooltipText(owner.textContent)) {
      return {
        type: "occupied",
        available: false,
        isNatar: false
      };
    }
    if (isElementVisiblyPopulated(playerName)) {
      return {
        type: "occupied",
        available: false,
        isNatar: false
      };
    }
    const populationBlocks = tileInformation.querySelectorAll(".additionalInfo > div, " + '[ng-show="tiInfos.population"]');
    for (const block of populationBlocks) {
      if (block.querySelector(".unit_population_small_illu") && isElementVisiblyPopulated(block)) {
        return {
          type: "occupied",
          available: false,
          isNatar: false
        };
      }
    }
    const robberVillage = tileInformation.querySelector('[ng-if="tiInfos.robberVillageDetails"]');
    if (isElementVisiblyPopulated(robberVillage)) {
      return {
        type: "occupied",
        available: false,
        isNatar: false
      };
    }
    return {
      type: "available",
      available: true,
      isNatar: false
    };
  }
  function createSettlementTileRecord(coordinates, distribution, status = {}) {
    const fieldType = getCropperType(distribution);
    return {
      id: `${coordinates.x}|` + `${coordinates.y}`,
      x: coordinates.x,
      y: coordinates.y,
      tileType: "settlement",
      fieldType: fieldType || "standard",
      fieldCombination: `${distribution.wood}/` + `${distribution.clay}/` + `${distribution.iron}/` + `${distribution.crop}`,
      distribution: {
        ...distribution
      },
      status: status.type || "available",
      available: status.available !== false,
      isNatar: status.isNatar === true,
      playerId: Number(status.playerId) || 0,
      playerName: String(status.playerName || ""),
      villageName: String(status.villageName || ""),
      locationId: String(status.locationId || ""),
      lastSeen: Date.now()
    };
  }
  function createOasisTileRecord(oasisRecord) {
    return {
      id: oasisRecord.id,
      x: oasisRecord.x,
      y: oasisRecord.y,
      tileType: "oasis",
      status: oasisRecord.oasisStatus || "wild",
      kingdomId: Number(oasisRecord.kingdomId) || 0,
      bonus: normaliseBonus(oasisRecord.bonus),
      locationId: String(oasisRecord.locationId || ""),
      lastSeen: Number(oasisRecord.lastSeen) || Date.now()
    };
  }
  function saveHoveredTileMarker(coordinates, tileInformation) {
    if (!coordinates) {
      return;
    }
    const id = `${coordinates.x}|${coordinates.y}`;
    const existing = savedTiles[id];
    if (existing) {
      recordTagTeamScan(existing);
      return;
    }
    const settlementStatus = getSettlementTileStatus(tileInformation);
    saveTileRecord({
      ...(existing || {}),
      id,
      x: coordinates.x,
      y: coordinates.y,
      tileType: existing?.tileType || (isOasisTooltip(tileInformation) ? "oasis" : settlementStatus.isNatar || tileInformation?.querySelector(".villageName, .playerName, .owner") ? "settlement" : "terrain"),
      status: existing?.status || (settlementStatus.isNatar ? "natarian" : settlementStatus.type === "occupied" ? "occupied" : "scanned"),
      lastSeen: Date.now()
    }, false);
  }
  function saveTileRecord(record, announce = true) {
    if (!record?.id) {
      return;
    }
    const isNew = !savedTiles[record.id];
    savedTiles[record.id] = {
      ...savedTiles[record.id],
      ...record
    };
    recordTagTeamScan(savedTiles[record.id]);
    saveTiles();
    scheduleScannedOverlayRender();
    if (announce) {
      const detail = record.fieldCombination ? ` — ${record.fieldCombination}` : record.tileType === "oasis" ? ` — ${formatBonus(record.bonus)}` : "";
      setStatus(`${isNew ? "Scanned" : "Updated"} ` + `${formatCoordinates(record)}` + `${detail}.`);
    } else {
      updateResultCount();
    }
  }
  function createCropperRecord(coordinates, distribution, fieldType, status = {}) {
    return {
      id: `${coordinates.x}|` + `${coordinates.y}`,
      x: coordinates.x,
      y: coordinates.y,
      fieldType,
      distribution: {
        ...distribution
      },
      available: status.available !== false,
      isNatar: status.isNatar === true,
      playerId: Number(status.playerId) || 0,
      playerName: String(status.playerName || ""),
      villageName: String(status.villageName || ""),
      locationId: String(status.locationId || ""),
      lastSeen: Date.now()
    };
  }
  function saveCropperRecord(record) {
    const isNew = !savedCroppers[record.id];
    savedCroppers[record.id] = {
      ...savedCroppers[record.id],
      ...record
    };
    saveCroppers();
    saveTileRecord(createSettlementTileRecord(record, record.distribution, {
      ...record,
      type: record.isNatar ? "natarian" : record.available ? "available" : "occupied"
    }), false);
    renderResultsTable();
    setStatus(`${isNew ? "Saved" : "Updated"} ` + `${formatCoordinates(record)} — ` + `${formatFieldDistribution(record)}` + `${record.isNatar ? " — Natarian village" : ""}.`);
  }
  function removeOccupiedCropper(coordinates) {
    const id = `${coordinates.x}|` + `${coordinates.y}`;
    if (!savedCroppers[id]) {
      return;
    }
    delete savedCroppers[id];
    expandedCropperIds.delete(id);
    saveCroppers();
    renderResultsTable();
    setStatus(`Removed ` + `${formatCoordinates(coordinates)} ` + "because the tile is occupied.");
  }
  function getOasisBonusContainer(tileInformation) {
    const container = tileInformation?.querySelector('[ng-show="tiInfos.oasisBonus"]');
    if (container && !container.classList.contains("ng-hide")) {
      return container;
    }
    return null;
  }
  function isOasisTooltip(tileInformation) {
    const villageName = cleanTooltipText(tileInformation?.querySelector(".villageName")?.textContent);
    if (/^oasis$/i.test(villageName)) {
      return true;
    }
    const bonusContainer = getOasisBonusContainer(tileInformation);
    return Boolean(bonusContainer?.querySelector(".unit_wood_small_illu, " + ".unit_clay_small_illu, " + ".unit_iron_small_illu, " + ".unit_crop_small_illu"));
  }
  function readOasisBonus(tileInformation) {
    const container = getOasisBonusContainer(tileInformation);
    if (!container) {
      return null;
    }
    const bonus = {
      wood: 0,
      clay: 0,
      iron: 0,
      crop: 0
    };
    const rows = container.querySelectorAll('span[ng-repeat*="oasisBonus"]');
    rows.forEach(row => {
      const text = cleanTooltipText(row.textContent).replace(",", ".");
      const match = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
      if (!match) {
        return;
      }
      const percentage = Number(match[1]);
      if (!Number.isFinite(percentage)) {
        return;
      }
      if (row.querySelector(".unit_wood_small_illu")) {
        bonus.wood += percentage;
      }
      if (row.querySelector(".unit_clay_small_illu")) {
        bonus.clay += percentage;
      }
      if (row.querySelector(".unit_iron_small_illu")) {
        bonus.iron += percentage;
      }
      if (row.querySelector(".unit_crop_small_illu")) {
        bonus.crop += percentage;
      }
    });
    const total = bonus.wood + bonus.clay + bonus.iron + bonus.crop;
    return total > 0 ? bonus : null;
  }
  function readOasisKingdomId(tileInformation) {
    const link = tileInformation?.querySelector(".kingdomLink[kingdomid], " + "[kingdomid]");
    return Number(link?.getAttribute("kingdomid")) || 0;
  }
  function createOasisRecord(coordinates, bonus, tileInformation) {
    const kingdomId = readOasisKingdomId(tileInformation);
    const ownerText = cleanTooltipText(tileInformation?.querySelector(".owner")?.textContent);
    return {
      id: `${coordinates.x}|` + `${coordinates.y}`,
      x: coordinates.x,
      y: coordinates.y,
      locationId: "",
      oasisType: "tooltip",
      oasisStatus: kingdomId > 0 || ownerText ? "occupied" : "wild",
      kingdomId,
      bonus: normaliseBonus(bonus),
      lastSeen: Date.now()
    };
  }
  function saveOasisRecord(record) {
    const isNew = !savedOases[record.id];
    savedOases[record.id] = {
      ...savedOases[record.id],
      ...record
    };
    saveOases();
    saveTileRecord(createOasisTileRecord(record), false);
    renderResultsTable();
    setStatus(`${isNew ? "Saved" : "Updated"} ` + `${formatCoordinates(record)} — ` + `${formatBonus(record.bonus)}.`);
  }
  function buildTooltipSignature(type, coordinates, values) {
    return [type, coordinates.x, coordinates.y, ...values].join("|");
  }
  function scanCurrentTooltip() {
    if (!isEnabled() || !isMapPage()) {
      lastTooltipSignature = "";
      return;
    }
    const tileInformation = document.getElementById("tileInformation");
    const coordinates = readHoveredCoordinates();
    if (!tileInformation || !coordinates) {
      lastTooltipSignature = "";
      return;
    }
    rememberHoveredCoordinates(coordinates);
    saveHoveredTileMarker(coordinates, tileInformation);
    if (isOasisTooltip(tileInformation)) {
      const bonus = readOasisBonus(tileInformation);
      if (!bonus) {
        return;
      }
      const kingdomId = readOasisKingdomId(tileInformation);
      const signature = buildTooltipSignature("oasis", coordinates, [bonus.wood, bonus.clay, bonus.iron, bonus.crop, kingdomId]);
      if (signature === lastTooltipSignature) {
        return;
      }
      lastTooltipSignature = signature;
      saveOasisRecord(createOasisRecord(coordinates, bonus, tileInformation));
      return;
    }
    let distribution = readResourceDistribution(tileInformation);
    const status = getSettlementTileStatus(tileInformation);
    if (status.isNatar) {
      distribution = {
        wood: 1,
        clay: 1,
        iron: 1,
        crop: 15
      };
    }
    if (!distribution) {
      lastTooltipSignature = `${coordinates.x}|` + `${coordinates.y}|` + "unreadable";
      return;
    }
    const signature = buildTooltipSignature("settlement", coordinates, [distribution.wood, distribution.clay, distribution.iron, distribution.crop, status.type]);
    if (signature === lastTooltipSignature) {
      return;
    }
    lastTooltipSignature = signature;
    saveTileRecord(createSettlementTileRecord(coordinates, distribution, status));
    const fieldType = getCropperType(distribution);
    if (!fieldType) {
      return;
    }
    if (status.type === "occupied" && !status.isNatar) {
      removeOccupiedCropper(coordinates);
      return;
    }
    saveCropperRecord(createCropperRecord(coordinates, distribution, fieldType, status));
  }
  function scheduleTooltipScan() {
    if (!scanQueued) {
      scanQueued = true;
      queueMicrotask(() => {
        scanQueued = false;
        scanCurrentTooltip();
      });
    }
    if (scanFrame === null) {
      scanFrame = requestAnimationFrame(() => {
        scanFrame = null;
        scanCurrentTooltip();
      });
    }
  }
  function observeTooltipElement() {
    const nextTooltip = document.getElementById("tileInformation");
    if (nextTooltip === observedTooltip && tooltipObserver) {
      return;
    }
    if (tooltipObserver) {
      tooltipObserver.disconnect();
    }
    tooltipObserver = null;
    observedTooltip = nextTooltip;
    if (!observedTooltip) {
      return;
    }
    tooltipObserver = new MutationObserver(scheduleTooltipScan);
    tooltipObserver.observe(observedTooltip, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });
    scheduleTooltipScan();
  }
  function startTooltipTracking() {
    if (tooltipRootObserver) {
      return;
    }
    observeTooltipElement();
    tooltipRootObserver = new MutationObserver(mutations => {
      const currentTooltip = document.getElementById("tileInformation");
      if (!observedTooltip || !observedTooltip.isConnected || currentTooltip !== observedTooltip) {
        observeTooltipElement();
      }
      const hasExternalChange = mutations.some(mutation => !scannedOverlay || mutation.target !== scannedOverlay && !scannedOverlay.contains(mutation.target));
      if (hasExternalChange) {
        scheduleScannedOverlayRender();
      }
    });
    tooltipRootObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    document.addEventListener("pointerover", scheduleTooltipScan, true);
    document.addEventListener("mousemove", scheduleTooltipScan, true);
    scheduleScannedOverlayRender();
  }
  function removeScannedTileOverlay() {
    if (overlayRenderFrame !== null) {
      cancelAnimationFrame(overlayRenderFrame);
      overlayRenderFrame = null;
    }
    if (mapOverlayObserver) {
      mapOverlayObserver.disconnect();
    }
    mapOverlayObserver = null;
    observedMapOverlay = null;
    if (scannedOverlay) {
      scannedOverlay.remove();
    }
    scannedOverlay = null;
  }
  function ensureScannedTileOverlay() {
    if (!isEnabled() || !visualAidEnabled && !highlight9cEnabled && !highlight15cEnabled || !isMapPage()) {
      removeScannedTileOverlay();
      return false;
    }
    const mapOverlay = document.getElementById("overlayMarkers");
    if (!mapOverlay) {
      removeScannedTileOverlay();
      return false;
    }
    if (mapOverlay !== observedMapOverlay) {
      if (mapOverlayObserver) {
        mapOverlayObserver.disconnect();
      }
      observedMapOverlay = mapOverlay;
      mapOverlayObserver = new MutationObserver(scheduleScannedOverlayRender);
      mapOverlayObserver.observe(observedMapOverlay, {
        attributes: true,
        attributeFilter: ["class", "style"]
      });
      if (scannedOverlay) {
        scannedOverlay.remove();
      }
      scannedOverlay = null;
    }
    if (!scannedOverlay || !scannedOverlay.isConnected || scannedOverlay.parentElement !== mapOverlay) {
      scannedOverlay = document.createElement("div");
      scannedOverlay.id = "qol-oasis-scanned-overlay";
      scannedOverlay.setAttribute("aria-hidden", "true");
      mapOverlay.insertBefore(scannedOverlay, mapOverlay.firstChild);
    }
    return true;
  }
  function getFallbackGridMetrics(mapOverlay) {
    if (mapOverlay.classList.contains("zoomLevel0")) {
      return {
        halfWidth: 126,
        halfHeight: 68
      };
    }
    if (mapOverlay.classList.contains("zoomLevel2")) {
      return {
        halfWidth: 31.5,
        halfHeight: 17
      };
    }
    return {
      halfWidth: 63,
      halfHeight: 34
    };
  }
  function getMapGridMetrics(mapOverlay) {
    const fallback = getFallbackGridMetrics(mapOverlay);
    let halfWidth = null;
    let halfHeight = null;
    const markers = mapOverlay.querySelectorAll('.mainVillage[id^="mainVillage"]');
    for (const marker of markers) {
      const locationId = marker.id.replace(/^mainVillage/, "");
      const coordinates = locationIdToCoordinates(locationId);
      if (!coordinates) {
        continue;
      }
      const left = Number.parseFloat(marker.style.left);
      const top = Number.parseFloat(marker.style.top);
      const horizontalIndex = coordinates.x + coordinates.y;
      const verticalIndex = coordinates.x - coordinates.y;
      if (halfWidth === null && Number.isFinite(left) && horizontalIndex !== 0) {
        const candidate = Math.abs(left / horizontalIndex);
        if (candidate > 0) {
          halfWidth = candidate;
        }
      }
      if (halfHeight === null && Number.isFinite(top) && verticalIndex !== 0) {
        const candidate = Math.abs(top / verticalIndex);
        if (candidate > 0) {
          halfHeight = candidate;
        }
      }
      if (halfWidth !== null && halfHeight !== null) {
        break;
      }
    }
    return {
      halfWidth: halfWidth || fallback.halfWidth,
      halfHeight: halfHeight || fallback.halfHeight
    };
  }
  function getScannedTileRecords() {
    const records = {
      ...savedTiles
    };
    Object.values(savedOases).forEach(oasis => {
      if (oasis?.id && !records[oasis.id]) {
        records[oasis.id] = createOasisTileRecord(oasis);
      }
    });
    Object.values(savedCroppers).forEach(cropper => {
      if (!cropper?.id || records[cropper.id]) {
        return;
      }
      records[cropper.id] = createSettlementTileRecord(cropper, cropper.distribution, {
        ...cropper,
        type: cropper.isNatar ? "natarian" : cropper.available ? "available" : "occupied"
      });
    });
    return Object.values(records).filter(record => Number.isFinite(Number(record?.x)) && Number.isFinite(Number(record?.y)));
  }
  function screenPointToMapCoordinate(screenX, screenY, metrics, overlayLeft, overlayTop) {
    const horizontalIndex = (screenX - overlayLeft) / metrics.halfWidth;
    const verticalIndex = (screenY - overlayTop) / metrics.halfHeight;
    return {
      x: (horizontalIndex + verticalIndex) / 2,
      y: (horizontalIndex - verticalIndex) / 2
    };
  }
  function getVisibleCoordinateBounds(metrics, overlayLeft, overlayTop, viewportWidth, viewportHeight) {
    const paddingX = metrics.halfWidth * 3;
    const paddingY = metrics.halfHeight * 3;
    const corners = [screenPointToMapCoordinate(-paddingX, -paddingY, metrics, overlayLeft, overlayTop), screenPointToMapCoordinate(viewportWidth + paddingX, -paddingY, metrics, overlayLeft, overlayTop), screenPointToMapCoordinate(-paddingX, viewportHeight + paddingY, metrics, overlayLeft, overlayTop), screenPointToMapCoordinate(viewportWidth + paddingX, viewportHeight + paddingY, metrics, overlayLeft, overlayTop)];
    return {
      minX: Math.max(TAG_TEAM_BOUNDS.minX, Math.floor(Math.min(...corners.map(corner => corner.x))) - 1),
      maxX: Math.min(TAG_TEAM_BOUNDS.maxX, Math.ceil(Math.max(...corners.map(corner => corner.x))) + 1),
      minY: Math.max(TAG_TEAM_BOUNDS.minY, Math.floor(Math.min(...corners.map(corner => corner.y))) - 1),
      maxY: Math.min(TAG_TEAM_BOUNDS.maxY, Math.ceil(Math.max(...corners.map(corner => corner.y))) + 1)
    };
  }
  function isVisualAidTileScanned(id) {
    if (tagTeamConfig.enabled) {
      return Boolean(tagTeamSession.scannedTiles?.[id]);
    }
    return Boolean(savedTiles[id] || savedOases[id] || savedCroppers[id]);
  }
  function getStoredCropperType(id) {
    const cropperType = savedCroppers[id]?.fieldType;
    if (cropperType === "9c" || cropperType === "15c") {
      return cropperType;
    }
    const tile = savedTiles[id];
    if (tile?.fieldType === "9c" || tile?.fieldType === "15c") {
      return tile.fieldType;
    }
    return getCropperType(tile?.distribution);
  }
  function renderScannedTileOverlay() {
    if (!ensureScannedTileOverlay() || !scannedOverlay || !observedMapOverlay) {
      return;
    }
    const metrics = getMapGridMetrics(observedMapOverlay);
    const tileWidth = metrics.halfWidth * 2;
    const tileHeight = metrics.halfHeight * 2;
    const overlayLeft = Number.parseFloat(observedMapOverlay.style.left) || 0;
    const overlayTop = Number.parseFloat(observedMapOverlay.style.top) || 0;
    const canvasBorder = document.getElementById("canvasBorder");
    const viewportWidth = canvasBorder?.clientWidth || Number.parseFloat(canvasBorder?.style.width) || window.innerWidth;
    const viewportHeight = canvasBorder?.clientHeight || Number.parseFloat(canvasBorder?.style.height) || window.innerHeight;
    const fragment = document.createDocumentFragment();
    const visibleBounds = getVisibleCoordinateBounds(metrics, overlayLeft, overlayTop, viewportWidth, viewportHeight);
    const sections = tagTeamConfig.enabled ? getTagTeamSections() : [];
    const showAllSections = tagTeamConfig.enabled && isAllTagTeamSectionsVisible();
    for (let x = visibleBounds.minX; x <= visibleBounds.maxX; x += 1) {
      for (let y = visibleBounds.minY; y <= visibleBounds.maxY; y += 1) {
        const left = (x + y) * metrics.halfWidth - metrics.halfWidth;
        const top = (x - y) * metrics.halfHeight - metrics.halfHeight;
        const screenLeft = left + overlayLeft;
        const screenTop = top + overlayTop;
        if (screenLeft < -tileWidth || screenTop < -tileHeight || screenLeft > viewportWidth || screenTop > viewportHeight) {
          continue;
        }
        const id = `${x}|${y}`;
        const cropperType = getStoredCropperType(id);
        const highlight9c = highlight9cEnabled && cropperType === "9c";
        const highlight15c = highlight15cEnabled && cropperType === "15c";
        const scanned = isVisualAidTileScanned(id);
        const scannedVisual = visualAidEnabled && scanned;
        const primarySection = tagTeamConfig.enabled ? sections.find(section => isCoordinateInsideBounds(x, y, section.primary)) : null;
        const sectionVisible = Boolean(tagTeamConfig.enabled && visualAidEnabled && !scanned && primarySection && (showAllSections || primarySection.id === tagTeamConfig.selectedSection));
        const standardVisual = Boolean(visualAidEnabled && !tagTeamConfig.enabled);
        if (!scannedVisual && !sectionVisible && !standardVisual && !highlight9c && !highlight15c) {
          continue;
        }
        const tile = document.createElement("span");
        tile.className = "qol-oasis-visual-tile";
        if (visualAidEnabled) {
          if (tagTeamConfig.enabled) {
            if (scanned) {
              tile.classList.add("is-scanned");
            } else if (sectionVisible) {
              tile.classList.add("qol-tag-team-tile", "is-selected-section");
              tile.dataset.section = primarySection.id;
              tile.style.setProperty("--qol-section-rgb", primarySection.rgb);
              if (x === primarySection.primary.minX || x === primarySection.primary.maxX || y === primarySection.primary.minY || y === primarySection.primary.maxY) {
                tile.classList.add("is-section-edge");
              }
            }
          } else {
            tile.classList.add(scanned ? "is-scanned" : "is-unscanned");
          }
        }
        if (!scannedVisual && highlight9c) {
          tile.classList.add("is-highlight-9c");
        }
        if (!scannedVisual && highlight15c) {
          tile.classList.add("is-highlight-15c");
        }
        tile.style.left = `${left}px`;
        tile.style.top = `${top}px`;
        tile.style.width = `${tileWidth}px`;
        tile.style.height = `${tileHeight}px`;
        fragment.appendChild(tile);
      }
    }
    scannedOverlay.replaceChildren(fragment);
  }
  function scheduleScannedOverlayRender() {
    if (overlayRenderFrame !== null) {
      return;
    }
    overlayRenderFrame = requestAnimationFrame(() => {
      overlayRenderFrame = null;
      renderScannedTileOverlay();
    });
  }
  function getDistributionFromResourceType(resType) {
    const parsed = Number(resType);
    if (parsed === 3339) {
      return {
        wood: 3,
        clay: 3,
        iron: 3,
        crop: 9
      };
    }
    if (parsed === 11115) {
      return {
        wood: 1,
        clay: 1,
        iron: 1,
        crop: 15
      };
    }
    return null;
  }
  function isNatarCropperPayload(payload) {
    return Boolean(payload?.isNatar === true || Number(payload?.playerId) === 1 || isNatarText(payload?.playerName) || isNatarText(payload?.villageName));
  }
  function captureBridgeTile(payload) {
    if (!isEnabled() || !isMapPage()) {
      return;
    }
    const coordinates = readPayloadCoordinates(payload) || getUsableCoordinates();
    if (!coordinates) {
      return;
    }
    const id = `${coordinates.x}|` + `${coordinates.y}`;
    const existing = savedTiles[id];
    if (existing) {
      saveTileRecord({
        ...existing,
        locationId: String(payload.locationId || existing.locationId || ""),
        lastSeen: Date.now()
      }, false);
      return;
    }
    const isOasis = payload.isOasis === true;
    const hasVillage = Number(payload.hasVillage) > 0;
    const isHabitable = payload.isHabitable === true;
    saveTileRecord({
      id,
      x: coordinates.x,
      y: coordinates.y,
      tileType: isOasis ? "oasis" : isHabitable || hasVillage ? "settlement" : "terrain",
      status: isOasis ? "oasis" : hasVillage ? "occupied" : isHabitable ? "unclassified" : "empty terrain",
      locationId: String(payload.locationId || ""),
      lastSeen: Date.now()
    }, false);
  }
  function captureBridgeOasis(payload) {
    if (!isEnabled() || !isMapPage()) {
      return;
    }
    const coordinates = readPayloadCoordinates(payload) || getUsableCoordinates();
    if (!coordinates) {
      return;
    }
    const kingdomId = Number(payload.kingdomId) || 0;
    const oasisStatus = String(payload.oasisStatus || "") || (kingdomId > 0 || Number(payload.hasVillage) > 0 ? "occupied" : "wild");
    saveOasisRecord({
      id: `${coordinates.x}|` + `${coordinates.y}`,
      x: coordinates.x,
      y: coordinates.y,
      locationId: String(payload.locationId || ""),
      oasisType: String(payload.oasisType || "bridge"),
      oasisStatus,
      kingdomId,
      bonus: normaliseBonus(payload.oasisBonus || payload.bonus),
      lastSeen: Date.now()
    });
  }
  function captureNatarCropper(payload) {
    if (!isEnabled() || !isMapPage() || !isNatarCropperPayload(payload)) {
      return;
    }
    const coordinates = readPayloadCoordinates(payload) || getUsableCoordinates();
    const distribution = getDistributionFromResourceType(payload.resType);
    const fieldType = getCropperType(distribution);
    if (!coordinates || !fieldType) {
      return;
    }
    saveCropperRecord(createCropperRecord(coordinates, distribution, fieldType, {
      available: false,
      isNatar: true,
      playerId: payload.playerId,
      playerName: payload.playerName || "Natars",
      villageName: payload.villageName || "Natarian village",
      locationId: payload.locationId
    }));
  }
  function handleBridgeMessage(event) {
    const message = event.data;
    if (event.source !== window || !message || message.source !== MESSAGE_SOURCE || !message.payload) {
      return;
    }
    if (message.type === TILE_MESSAGE_TYPE) {
      captureBridgeTile(message.payload);
      return;
    }
    if (message.type === OASIS_MESSAGE_TYPE) {
      captureBridgeOasis(message.payload);
      return;
    }
    if (message.type === CROPPER_MESSAGE_TYPE) {
      captureNatarCropper(message.payload);
    }
  }
  function isOasisInRange(cropper, oasis) {
    return Math.abs(Number(oasis.x) - Number(cropper.x)) <= OASIS_RADIUS && Math.abs(Number(oasis.y) - Number(cropper.y)) <= OASIS_RADIUS;
  }
  function addCappedBonuses(oases) {
    const total = {
      wood: 0,
      clay: 0,
      iron: 0,
      crop: 0
    };
    oases.forEach(oasis => {
      const bonus = normaliseBonus(oasis.bonus);
      total.wood += bonus.wood;
      total.clay += bonus.clay;
      total.iron += bonus.iron;
      total.crop += bonus.crop;
    });
    return {
      wood: Math.min(total.wood, BONUS_CAPS.wood),
      clay: Math.min(total.clay, BONUS_CAPS.clay),
      iron: Math.min(total.iron, BONUS_CAPS.iron),
      crop: Math.min(total.crop, BONUS_CAPS.crop)
    };
  }
  function getNonCropBonusTotal(bonus) {
    return bonus.wood + bonus.clay + bonus.iron;
  }
  function getCombinationCoordinateKey(combination) {
    return combination.map(oasis => `${oasis.x}|` + `${oasis.y}`).sort().join(",");
  }
  function isCandidateCombinationBetter(candidate, currentBest) {
    if (!currentBest) {
      return true;
    }
    if (candidate.bonus.crop !== currentBest.bonus.crop) {
      return candidate.bonus.crop > currentBest.bonus.crop;
    }
    const candidateOther = getNonCropBonusTotal(candidate.bonus);
    const currentOther = getNonCropBonusTotal(currentBest.bonus);
    if (candidateOther !== currentOther) {
      return candidateOther > currentOther;
    }
    if (candidate.oases.length !== currentBest.oases.length) {
      return candidate.oases.length < currentBest.oases.length;
    }
    return getCombinationCoordinateKey(candidate.oases) < getCombinationCoordinateKey(currentBest.oases);
  }
  function evaluateBestOasisCombination(cropper) {
    const nearbyOases = Object.values(savedOases).filter(oasis => isOasisInRange(cropper, oasis));
    let best = {
      oases: [],
      bonus: {
        wood: 0,
        clay: 0,
        iron: 0,
        crop: 0
      }
    };
    function evaluate(combination) {
      const candidate = {
        oases: combination.slice(),
        bonus: addCappedBonuses(combination)
      };
      if (isCandidateCombinationBetter(candidate, best)) {
        best = candidate;
      }
    }
    function build(startIndex, current) {
      if (current.length) {
        evaluate(current);
      }
      if (current.length >= MAX_ASSIGNED_OASES) {
        return;
      }
      for (let index = startIndex; index < nearbyOases.length; index += 1) {
        current.push(nearbyOases[index]);
        build(index + 1, current);
        current.pop();
      }
    }
    build(0, []);
    return {
      nearbyOases,
      selectedOases: best.oases,
      bonus: best.bonus
    };
  }
  function formatFieldDistribution(cropper) {
    const distribution = cropper.distribution || {};
    return `${distribution.wood}/` + `${distribution.clay}/` + `${distribution.iron}/` + `${distribution.crop}`;
  }
  function getCropperEvaluation(cropper) {
    return {
      ...cropper,
      evaluation: evaluateBestOasisCombination(cropper)
    };
  }
  function getSelectedTypeFilter() {
    return document.getElementById("qol-oasis-type-filter")?.value || "croppers";
  }
  function getSelectedResourceFilter() {
    return document.getElementById("qol-oasis-resource-filter")?.value || "all";
  }
  function getSelectedSort() {
    return document.getElementById("qol-oasis-sort")?.value || "best";
  }
  function getSearchValue() {
    return (document.getElementById("qol-oasis-search")?.value || "").trim().toLowerCase();
  }
  function createDisplayEntries() {
    const typeFilter = getSelectedTypeFilter();
    const resourceFilter = getSelectedResourceFilter();
    const searchValue = getSearchValue();
    let entries = [];
    if (typeFilter === "oases" || typeFilter === "all") {
      entries.push(...Object.values(savedOases).map(oasis => ({
        resultType: "oasis",
        id: oasis.id,
        x: oasis.x,
        y: oasis.y,
        bonus: normaliseBonus(oasis.bonus),
        lastSeen: oasis.lastSeen,
        source: oasis
      })));
    }
    if (typeFilter !== "oases") {
      let croppers = Object.values(savedCroppers);
      if (typeFilter === "9c" || typeFilter === "15c") {
        croppers = croppers.filter(cropper => cropper.fieldType === typeFilter);
      }
      entries.push(...croppers.map(cropper => {
        const evaluated = getCropperEvaluation(cropper);
        return {
          resultType: "cropper",
          id: cropper.id,
          x: cropper.x,
          y: cropper.y,
          bonus: evaluated.evaluation.bonus,
          lastSeen: cropper.lastSeen,
          source: evaluated
        };
      }));
    }
    if (resourceFilter !== "all") {
      entries = entries.filter(entry => Number(entry.bonus?.[resourceFilter]) > 0);
    }
    if (searchValue) {
      entries = entries.filter(entry => {
        const source = entry.source;
        const searchableText = [entry.x, entry.y, `${entry.x}|${entry.y}`, entry.resultType, formatBonus(entry.bonus), source.fieldType, source.locationId, source.oasisType, source.oasisStatus, source.kingdomId, source.distribution ? formatFieldDistribution(source) : "", source.isNatar ? "natarian natars conquer natars" : "", source.playerName, source.villageName].join(" ").toLowerCase();
        return searchableText.includes(searchValue);
      });
    }
    const selectedSort = getSelectedSort();
    entries.sort((first, second) => {
      if (selectedSort === "coordinates") {
        return first.x !== second.x ? first.x - second.x : first.y - second.y;
      }
      if (selectedSort === "recent") {
        return Number(second.lastSeen || 0) - Number(first.lastSeen || 0);
      }
      if (selectedSort === "type") {
        const firstType = first.resultType === "cropper" ? first.source.fieldType : "oasis";
        const secondType = second.resultType === "cropper" ? second.source.fieldType : "oasis";
        return firstType.localeCompare(secondType);
      }
      if (first.bonus.crop !== second.bonus.crop) {
        return second.bonus.crop - first.bonus.crop;
      }
      const firstOther = getNonCropBonusTotal(first.bonus);
      const secondOther = getNonCropBonusTotal(second.bonus);
      if (firstOther !== secondOther) {
        return secondOther - firstOther;
      }
      if (first.resultType !== second.resultType) {
        return first.resultType === "cropper" ? -1 : 1;
      }
      return first.x !== second.x ? first.x - second.x : first.y - second.y;
    });
    return entries;
  }
  function getTotalSavedCount() {
    return new Set([...Object.keys(savedTiles), ...Object.keys(savedOases), ...Object.keys(savedCroppers)]).size;
  }
  function setStatus(message) {
    const statusElement = document.getElementById("qol-oasis-status-message");
    if (statusElement) {
      statusElement.textContent = message;
    }
    updateResultCount();
  }
  function updateResultCount() {
    const countElement = document.getElementById("qol-oasis-result-count");
    if (!countElement) {
      return;
    }
    if (tagTeamConfig.enabled) {
      const progress = getTagTeamProgress();
      const scope = progress.allSections ? "All sections" : `Section ${tagTeamConfig.selectedSection}`;
      countElement.textContent = `${createDisplayEntries().length} results / ${scope}: ${progress.assignedScanned.toLocaleString()} / ${progress.assignedTotal.toLocaleString()}`;
      updateTagTeamProgressUI();
      return;
    }
    countElement.textContent = `${createDisplayEntries().length} results shown / ${getTotalSavedCount()} tiles scanned`;
  }
  function getCropperStatusLabel(cropper) {
    return cropper?.isNatar ? "Conquer Natars" : "Available";
  }
  function renderSelectedOasesDetails(entry) {
    const evaluation = entry.source.evaluation;
    if (!evaluation.selectedOases.length) {
      return `
        <tr class="qol-cropper-details-row">
          <td colspan="7">
            <div class="qol-cropper-details">
              No scanned oasis inside the three-tile radius contributes to this cropper yet.
            </div>
          </td>
        </tr>
      `;
    }
    const lines = evaluation.selectedOases.map(oasis => `
            <div class="qol-cropper-oasis-line">
              <span
                class="qol-oasis-coordinate-link"
                data-action="goto"
                data-x="${oasis.x}"
                data-y="${oasis.y}"
              >
                ${formatCoordinates(oasis)}
              </span>

              <span>
                ${formatBonus(oasis.bonus)}
              </span>
            </div>
          `).join("");
    return `
      <tr class="qol-cropper-details-row">
        <td colspan="7">
          <div class="qol-cropper-details">
            <div class="qol-cropper-details-title">
              Best scanned combination
            </div>

            ${lines}
          </div>
        </td>
      </tr>
    `;
  }
  function renderResultsTable() {
    const tableBody = document.getElementById("qol-oasis-table-body");
    if (!tableBody) {
      return;
    }
    const entries = createDisplayEntries();
    if (!entries.length) {
      tableBody.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="qol-oasis-empty"
          >
            No saved results match the current filters.
            Hover a 9c, 15c or oasis to add a planner result;
            other field combinations are still saved and tinted.
          </td>
        </tr>
      `;
      updateResultCount();
      return;
    }
    let html = "";
    entries.forEach(entry => {
      if (entry.resultType === "oasis") {
        const oasis = entry.source;
        html += `
          <tr>
            <td>
              <span
                class="qol-oasis-coordinate-link"
                data-action="goto"
                data-x="${oasis.x}"
                data-y="${oasis.y}"
                title="Open this coordinate on the map"
              >
                ${formatCoordinates(oasis)}
              </span>
            </td>

            <td>
              <span class="qol-result-type oasis">
                Oasis
              </span>
            </td>

            <td>
              ${formatBonus(oasis.bonus)}
            </td>

            <td>—</td>

            <td>
              ${formatKingdom(oasis.kingdomId)}
            </td>

            <td>
              ${formatLastSeen(oasis.lastSeen)}
            </td>

            <td class="qol-delete-cell">
              <span
                class="qol-oasis-delete-entry"
                data-action="delete"
                data-result-type="oasis"
                data-id="${oasis.id}"
                title="Delete this entry"
              >
                &times;
              </span>
            </td>
          </tr>
        `;
        return;
      }
      const cropper = entry.source;
      const evaluation = cropper.evaluation;
      const selectedCount = evaluation.selectedOases.length;
      const nearbyCount = evaluation.nearbyOases.length;
      const isExpanded = expandedCropperIds.has(cropper.id);
      html += `
        <tr>
          <td>
            <span
              class="qol-oasis-coordinate-link"
              data-action="goto"
              data-x="${cropper.x}"
              data-y="${cropper.y}"
              title="Open this coordinate on the map"
            >
              ${formatCoordinates(cropper)}
            </span>
          </td>

          <td>
            <span class="qol-result-type cropper">
              ${formatFieldDistribution(cropper)}
            </span>
          </td>

          <td>
            ${formatBonus(evaluation.bonus)}
          </td>

          <td>
            <span
              class="qol-cropper-oasis-count"
              data-action="toggle-details"
              data-id="${cropper.id}"
              title="Show the selected oasis combination"
            >
              ${isExpanded ? "▾" : "▸"}
              ${selectedCount} used /
              ${nearbyCount} nearby
            </span>
          </td>

          <td>
            ${getCropperStatusLabel(cropper)}
          </td>

          <td>
            ${formatLastSeen(cropper.lastSeen)}
          </td>

          <td class="qol-delete-cell">
            <span
              class="qol-oasis-delete-entry"
              data-action="delete"
              data-result-type="cropper"
              data-id="${cropper.id}"
              title="Delete this entry"
            >
              &times;
            </span>
          </td>
        </tr>
      `;
      if (isExpanded) {
        html += renderSelectedOasesDetails(entry);
      }
    });
    tableBody.innerHTML = html;
    updateResultCount();
  }
  function navigateToCoordinate(x, y) {
    window.location.hash = `#/page:map/x:${x}/y:${y}`;
  }
  function deleteEntry(resultType, id) {
    if (resultType === "cropper") {
      if (!savedCroppers[id]) {
        return;
      }
      delete savedCroppers[id];
      delete savedTiles[id];
      expandedCropperIds.delete(id);
      saveCroppers();
      saveTiles();
      scheduleScannedOverlayRender();
      renderResultsTable();
      setStatus("Cropper removed.");
      return;
    }
    if (!savedOases[id]) {
      return;
    }
    delete savedOases[id];
    delete savedTiles[id];
    saveOases();
    saveTiles();
    scheduleScannedOverlayRender();
    renderResultsTable();
    setStatus("Oasis removed.");
  }
  async function copyVisibleResults() {
    const entries = createDisplayEntries();
    if (!entries.length) {
      setStatus("There are no visible results to copy.");
      return;
    }
    const output = entries.map(entry => {
      if (entry.resultType === "oasis") {
        return `${formatCoordinates(entry.source)} — ` + "Oasis — " + `${formatBonus(entry.bonus)}`;
      }
      return `${formatCoordinates(entry.source)} — ` + `${formatFieldDistribution(entry.source)} — ` + `${formatBonus(entry.bonus)}` + `${entry.source.isNatar ? " — Conquer Natars" : ""}`;
    }).join("\n");
    try {
      await navigator.clipboard.writeText(output);
      setStatus(`Copied ${entries.length} results.`);
    } catch (error) {
      console.error("[APES Oasis Scanner] Clipboard write failed.", error);
      setStatus("Could not copy the visible results.");
    }
  }
  function escapeCSVValue(value) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
  function getExportTileRecord(id, x, y) {
    const tile = {
      id,
      x,
      y,
      tileType: "unknown",
      status: "scanned",
      ...savedTiles[id]
    };
    const oasis = savedOases[id];
    if (oasis) {
      return {
        ...tile,
        ...oasis,
        tileType: "oasis",
        resultType: "oasis",
        status: oasis.oasisStatus || tile.status || "wild",
        bonus: normaliseBonus(oasis.bonus)
      };
    }
    const cropper = savedCroppers[id];
    if (cropper) {
      return {
        ...tile,
        ...cropper,
        tileType: "settlement",
        resultType: cropper.fieldType || "cropper",
        status: cropper.isNatar ? "natarian" : cropper.available ? "available" : tile.status || "occupied"
      };
    }
    return tile;
  }
  function getRecordFieldCombination(record) {
    if (record.fieldCombination) {
      return record.fieldCombination;
    }
    if (record.distribution) {
      return `${Number(record.distribution.wood) || 0}/` + `${Number(record.distribution.clay) || 0}/` + `${Number(record.distribution.iron) || 0}/` + `${Number(record.distribution.crop) || 0}`;
    }
    return "";
  }
  function createCSVDownload(rows, filename) {
    const csv = rows.map(row => row.map(escapeCSVValue).join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  function exportTagTeamSession() {
    saveTagTeamSession();
    const progress = getTagTeamProgress();
    if (!progress.scannedCoordinates.length) {
      setStatus("This Tag Team session has no scanned tiles to export.");
      return;
    }
    const selectedSection = progress.selectedSection;
    const rows = [["Server", "Session ID", "Session Started", "Team Size", "Visible Section", "Visible Position", "Primary Section", "Assigned Sections", "Inside Visible Section", "X", "Y", "Coordinate", "Tile Type", "Field Combination", "Result Type", "Status", "Wood Bonus", "Clay Bonus", "Iron Bonus", "Crop Bonus", "Player ID", "Player Name", "Village Name", "Kingdom ID", "Oasis Status", "Location ID", "Scanned At", "Last Seen"]];
    progress.scannedCoordinates.sort((first, second) => first.x !== second.x ? first.x - second.x : first.y - second.y).forEach(coordinate => {
      const record = getExportTileRecord(coordinate.id, coordinate.x, coordinate.y);
      const primarySection = getPrimarySectionForCoordinate(coordinate.x, coordinate.y);
      const assignedSections = getAssignedSectionsForCoordinate(coordinate.x, coordinate.y);
      const bonus = normaliseBonus(record.bonus);
      const insideSelected = progress.allSections || assignedSections.some(section => section.id === tagTeamConfig.selectedSection);
      rows.push([window.location.hostname, tagTeamSession.id, new Date(tagTeamSession.startedAt).toISOString(), tagTeamConfig.teamSize, tagTeamConfig.selectedSection, progress.allSections ? "All" : selectedSection?.position || "", primarySection?.id || "", assignedSections.map(section => section.id).join(" ; "), insideSelected ? "Yes" : "No", coordinate.x, coordinate.y, `${coordinate.x}|${coordinate.y}`, record.tileType || "unknown", getRecordFieldCombination(record), record.resultType || record.fieldType || "", record.status || "scanned", bonus.wood, bonus.clay, bonus.iron, bonus.crop, record.playerId || "", record.playerName || "", record.villageName || "", record.kingdomId || "", record.oasisStatus || "", record.locationId || "", new Date(coordinate.scannedAt).toISOString(), record.lastSeen ? new Date(record.lastSeen).toISOString() : ""]);
    });
    const scope = progress.allSections ? "all" : tagTeamConfig.selectedSection.toLowerCase();
    createCSVDownload(rows, `apes-tag-team-${window.location.hostname}-section-${scope}-${tagTeamSession.id}.csv`);
    setStatus(`Exported ${progress.scannedCoordinates.length.toLocaleString()} Tag Team session tiles for ${getVisibleSectionLabel()}.`);
  }
  function exportVisibleResults() {
    if (tagTeamConfig.enabled) {
      exportTagTeamSession();
      return;
    }
    const entries = createDisplayEntries();
    if (!entries.length) {
      setStatus("There are no visible results to export.");
      return;
    }
    const rows = [["X", "Y", "Type", "Distribution", "Best Bonus", "Wood Bonus", "Clay Bonus", "Iron Bonus", "Crop Bonus", "Selected Oases", "Nearby Scanned Oases", "Status", "Kingdom ID", "Oasis Status", "Location ID", "Last Seen"]];
    entries.forEach(entry => {
      if (entry.resultType === "oasis") {
        const oasis = entry.source;
        rows.push([oasis.x, oasis.y, "Oasis", "", formatBonus(entry.bonus), entry.bonus.wood, entry.bonus.clay, entry.bonus.iron, entry.bonus.crop, "", "", "Oasis", oasis.kingdomId || "", oasis.oasisStatus || "", oasis.locationId || "", new Date(oasis.lastSeen).toISOString()]);
        return;
      }
      const cropper = entry.source;
      rows.push([cropper.x, cropper.y, cropper.fieldType, formatFieldDistribution(cropper), formatBonus(entry.bonus), entry.bonus.wood, entry.bonus.clay, entry.bonus.iron, entry.bonus.crop, cropper.evaluation.selectedOases.map(oasis => `${oasis.x}|${oasis.y}`).join(" ; "), cropper.evaluation.nearbyOases.length, getCropperStatusLabel(cropper), "", "", cropper.locationId || "", new Date(cropper.lastSeen).toISOString()]);
    });
    const csv = rows.map(row => row.map(escapeCSVValue).join(",")).join("\n");
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "apes-settlement-scan-" + `${window.location.hostname}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Exported ${entries.length} results.`);
  }
  function clearAllResults() {
    const oasisCount = Object.keys(savedOases).length;
    const cropperCount = Object.keys(savedCroppers).length;
    const total = getTotalSavedCount();
    const sessionTileCount = Object.keys(tagTeamSession.scannedTiles || {}).length;
    if (!total && !sessionTileCount) {
      setStatus("There are no scanned tiles to clear.");
      return;
    }
    const confirmed = window.confirm(`Delete all ${total} saved tiles, including ` + `${cropperCount} croppers and ${oasisCount} oases, for ` + `${window.location.hostname}? ` + "The current Tag Team session progress will also be cleared.");
    if (!confirmed) {
      return;
    }
    savedOases = {};
    savedCroppers = {};
    savedTiles = {};
    tagTeamSession = createTagTeamSession();
    expandedCropperIds.clear();
    saveOases();
    saveCroppers();
    saveTiles();
    saveTagTeamSession();
    scheduleScannedOverlayRender();
    renderResultsTable();
    updateTagTeamUI();
    setStatus("All scanned tiles, croppers and oases were cleared.");
  }
  function injectStyles() {
    if (document.getElementById("qol-oasis-scanner-styles")) {
      return;
    }
    const style = document.createElement("style");
    style.id = "qol-oasis-scanner-styles";
    style.textContent = `
      #qol-oasis-scanned-overlay {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 0 !important;
        height: 0 !important;
        overflow: visible !important;
        pointer-events: none !important;
        z-index: 0 !important;
      }

      .qol-oasis-visual-tile {
        position: absolute !important;
        display: block !important;
        box-sizing: border-box !important;
        pointer-events: none !important;
        clip-path: polygon(
          50% 0,
          100% 50%,
          50% 100%,
          0 50%
        ) !important;
        mix-blend-mode: multiply !important;
      }

      .qol-oasis-visual-tile.is-unscanned {
        background:
          rgba(35, 111, 180, 0.24)
          !important;
      }

      .qol-oasis-visual-tile.is-scanned {
        background:
          rgba(167, 40, 40, 0.42)
          !important;
      }

      .qol-tag-team-tile {
        background:
          rgba(
            var(--qol-section-rgb),
            0.18
          )
          !important;
        opacity: 1 !important;
        transition:
          opacity 0.12s ease,
          filter 0.12s ease
          !important;
      }

      .qol-tag-team-tile.is-selected-section {
        background:
          rgba(
            var(--qol-section-rgb),
            0.58
          )
          !important;
      }

      .qol-tag-team-tile.is-section-edge {
        box-shadow:
          inset 0 0 0 2px
          rgba(255, 255, 255, 0.42)
          !important;
      }

      .qol-oasis-visual-tile.is-highlight-9c {
        background:
          rgba(242, 142, 43, 0.62)
          !important;
        filter:
          none
          !important;
        opacity:
          1
          !important;
        box-shadow:
          inset 0 0 0 1px
          rgba(125, 70, 10, 0.58)
          !important;
      }

      .qol-oasis-visual-tile.is-highlight-15c {
        background:
          rgba(143, 99, 199, 0.64)
          !important;
        filter:
          none
          !important;
        opacity:
          1
          !important;
        box-shadow:
          inset 0 0 0 1px
          rgba(75, 43, 118, 0.62)
          !important;
      }

      #qol-oasis-toggle-btn {
        position: fixed !important;
        width: 30px !important;
        height: 30px !important;
        background-color:
          var(--qol-accent-soft)
          !important;
        border:
          2px solid var(--qol-accent)
          !important;
        border-radius:
          50%
          !important;
        display: none;
        align-items:
          center
          !important;
        justify-content:
          center
          !important;
        cursor:
          pointer
          !important;
        z-index:
          9999
          !important;
        box-shadow:
          0 2px 5px
          rgba(0, 0, 0, 0.25)
          !important;
        box-sizing:
          border-box
          !important;
        padding:
          0
          !important;
        transition:
          transform 0.2s ease,
          background-color 0.2s ease,
          filter 0.2s ease,
          opacity 0.2s ease
          !important;
      }

      #qol-oasis-toggle-btn:hover {
        transform:
          scale(1.1)
          !important;
        background-color:
          #f7f5f0
          !important;
      }

      #qol-oasis-toggle-btn svg {
        width:
          18px
          !important;
        height:
          18px
          !important;
        fill:
          none
          !important;
        stroke:
          var(--qol-accent)
          !important;
        stroke-width:
          2
          !important;
        stroke-linecap:
          round
          !important;
        stroke-linejoin:
          round
          !important;
        pointer-events:
          none
          !important;
      }

      body.qol-menu-open
      #qol-oasis-toggle-btn {
        filter:
          blur(3px)
          !important;
        opacity:
          0.35
          !important;
        pointer-events:
          none
          !important;
      }

      #qol-oasis-container {
        position:
          fixed
          !important;
        display:
          none;
        flex-direction:
          column
          !important;
        width:
          900px;
        min-width:
          600px
          !important;
        max-width:
          96vw
          !important;
        height:
          500px;
        min-height:
          330px
          !important;
        max-height:
          92vh
          !important;
        background-color:
          #f7f5f0
          !important;
        border:
          3px solid var(--qol-border)
          !important;
        border-radius:
          4px
          !important;
        box-shadow:
          0 10px 30px
          rgba(0, 0, 0, 0.5)
          !important;
        color:
          #333
          !important;
        font-family:
          Arial,
          sans-serif
          !important;
        font-size:
          11px
          !important;
        box-sizing:
          border-box
          !important;
        overflow:
          hidden
          !important;
        resize:
          both
          !important;
        z-index:
          999999
          !important;
      }

      .qol-oasis-header {
        height:
          34px
          !important;
        padding:
          6px 10px
          !important;
        background:
          linear-gradient(
            to bottom,
            var(--qol-accent-mid),
            var(--qol-accent-dark)
          )
          !important;
        color:
          #f7f5f0
          !important;
        font-size:
          14px
          !important;
        font-weight:
          bold
          !important;
        display:
          flex
          !important;
        align-items:
          center
          !important;
        justify-content:
          space-between
          !important;
        cursor:
          move
          !important;
        user-select:
          none
          !important;
        box-sizing:
          border-box
          !important;
      }

      .qol-oasis-close {
        cursor:
          pointer
          !important;
        color:
          #fff
          !important;
        font-size:
          21px
          !important;
        font-weight:
          bold
          !important;
        line-height:
          1
          !important;
        padding:
          0 5px
          !important;
        border-radius:
          3px
          !important;
        background-color:
          rgba(0, 0, 0, 0.2)
          !important;
      }

      .qol-oasis-body {
        display:
          flex
          !important;
        flex-direction:
          column
          !important;
        gap:
          8px
          !important;
        flex:
          1 1 auto
          !important;
        min-height:
          0
          !important;
        padding:
          10px
          !important;
        box-sizing:
          border-box
          !important;
      }

      .qol-oasis-description {
        padding:
          7px 9px
          !important;
        background-color:
          #fff6e5
          !important;
        border:
          1px solid #d4c2a5
          !important;
        border-radius:
          4px
          !important;
        color:
          #5b4630
          !important;
        line-height:
          1.4
          !important;
      }

      .qol-tag-team-card {
        display:
          flex
          !important;
        flex-direction:
          column
          !important;
        gap:
          6px
          !important;
        padding:
          6px 8px
          !important;
        border:
          1px solid #c7b99e
          !important;
        border-radius:
          4px
          !important;
        background:
          #f1eadc
          !important;
        box-sizing:
          border-box
          !important;
      }

      .qol-tag-team-card.is-enabled {
        border-color:
          var(--qol-accent)
          !important;
        background:
          #f8f4eb
          !important;
      }

      .qol-tag-team-heading {
        display:
          flex
          !important;
        align-items:
          center
          !important;
        justify-content:
          space-between
          !important;
        gap:
          8px
          !important;
        min-height:
          28px
          !important;
      }

      .qol-tag-team-heading-left {
        display:
          flex
          !important;
        align-items:
          center
          !important;
        gap:
          8px
          !important;
        min-width:
          0
          !important;
      }

      #qol-tag-team-setup-summary {
        color:
          #66533e
          !important;
        font-weight:
          bold
          !important;
        overflow:
          hidden
          !important;
        text-overflow:
          ellipsis
          !important;
        white-space:
          nowrap
          !important;
      }

      .qol-tag-team-details {
        display:
          none
          !important;
        flex-direction:
          column
          !important;
        gap:
          6px
          !important;
      }

      .qol-tag-team-card.is-enabled
      .qol-tag-team-details {
        display:
          flex
          !important;
      }

      .qol-tag-team-settings {
        display:
          grid
          !important;
        grid-template-columns:
          minmax(105px, 140px)
          minmax(150px, 220px)
          !important;
        gap:
          6px
          !important;
        align-items:
          end
          !important;
      }

      .qol-tag-team-field {
        display:
          flex
          !important;
        flex-direction:
          column
          !important;
        gap:
          2px
          !important;
        color:
          #5b4630
          !important;
        font-size:
          10px
          !important;
        font-weight:
          bold
          !important;
      }

      .qol-tag-team-progress-grid {
        display:
          grid
          !important;
        grid-template-columns:
          1fr 1fr auto
          !important;
        gap:
          8px
          !important;
        align-items:
          center
          !important;
      }

      .qol-tag-team-progress-item {
        display:
          flex
          !important;
        flex-direction:
          column
          !important;
        gap:
          3px
          !important;
        color:
          var(--qol-accent-deep)
          !important;
        font-size:
          10px
          !important;
        font-weight:
          bold
          !important;
      }

      .qol-tag-team-progress-track {
        height:
          6px
          !important;
        overflow:
          hidden
          !important;
        border-radius:
          4px
          !important;
        background:
          #d6cbb8
          !important;
      }

      .qol-tag-team-progress-fill {
        width:
          0
          !important;
        height:
          100%
          !important;
        border-radius:
          4px
          !important;
        transition:
          width 0.15s ease
          !important;
      }

      #qol-tag-team-overall-bar {
        background:
          var(--qol-accent)
          !important;
      }

      .qol-tag-team-legend {
        display:
          flex
          !important;
        align-items:
          center
          !important;
        gap:
          5px
          !important;
        flex-wrap:
          wrap
          !important;
      }

      .qol-tag-team-card:not(.is-enabled)
      .qol-tag-team-legend {
        display:
          none
          !important;
      }

      .qol-tag-team-progress-actions {
        display:
          flex
          !important;
        align-items:
          center
          !important;
        justify-content:
          flex-end
          !important;
      }

      .qol-tag-team-legend-item {
        display:
          inline-flex
          !important;
        align-items:
          center
          !important;
        gap:
          3px
          !important;
        padding:
          2px 5px
          !important;
        border:
          1px solid transparent
          !important;
        border-radius:
          9px
          !important;
        color:
          #6a5a47
          !important;
        font-size:
          10px
          !important;
      }

      .qol-tag-team-legend-item.is-selected {
        border-color:
          var(--qol-accent)
          !important;
        background:
          #fff
          !important;
        color:
          #3f3020
          !important;
        font-weight:
          bold
          !important;
      }

      .qol-tag-team-swatch {
        width:
          9px
          !important;
        height:
          9px
          !important;
        border-radius:
          50%
          !important;
        box-shadow:
          inset 0 0 0 1px
          rgba(0, 0, 0, 0.22)
          !important;
      }

      .qol-oasis-controls {
        display:
          grid
          !important;
        grid-template-columns:
          minmax(105px, 1fr)
          minmax(105px, 1fr)
          minmax(130px, 1.3fr)
          minmax(100px, 1fr)
          auto
          auto
          auto
          auto
          auto
          auto
          !important;
        gap:
          6px
          !important;
        align-items:
          center
          !important;
      }

      #qol-oasis-container select,
      #qol-oasis-container input {
        display:
          block
          !important;
        visibility:
          visible
          !important;
        opacity:
          1
          !important;
        width:
          100%
          !important;
        height:
          28px
          !important;
        box-sizing:
          border-box
          !important;
        border:
          1px solid #9c8565
          !important;
        border-radius:
          3px
          !important;
        background-color:
          #fff
          !important;
        color:
          #222
          !important;
        font-family:
          Arial,
          sans-serif
          !important;
        font-size:
          11px
          !important;
        padding:
          4px 7px
          !important;
      }

      .qol-oasis-action-btn {
        height:
          28px
          !important;
        padding:
          5px 9px
          !important;
        border:
          1px solid var(--qol-action-border)
          !important;
        border-radius:
          3px
          !important;
        background:
          linear-gradient(
            to bottom,
            var(--qol-accent),
            var(--qol-accent-dark)
          )
          !important;
        color:
          #fff
          !important;
        font-size:
          11px
          !important;
        font-weight:
          bold
          !important;
        white-space:
          nowrap
          !important;
        cursor:
          pointer
          !important;
        user-select:
          none
          !important;
        box-sizing:
          border-box
          !important;
      }

      .qol-oasis-action-btn:hover {
        background:
          linear-gradient(
            to bottom,
            var(--qol-accent-hover),
            var(--qol-accent-hover-dark)
          )
          !important;
      }

      .qol-oasis-action-btn.visual-aid-toggle {
        min-width:
          102px
          !important;
        background:
          linear-gradient(
            to bottom,
            #666,
            #444
          )
          !important;
        border-color:
          #333
          !important;
      }

      .qol-oasis-action-btn.visual-aid-toggle.is-active {
        background:
          linear-gradient(
            135deg,
            #236fb4 0%,
            #18598f 49%,
            #a72828 51%,
            #711414 100%
          )
          !important;
        border-color:
          #273f57
          !important;
      }

      .qol-oasis-action-btn.cropper-highlight-toggle {
        min-width:
          84px
          !important;
        background:
          linear-gradient(
            to bottom,
            #666,
            #444
          )
          !important;
        border-color:
          #333
          !important;
      }

      .qol-oasis-action-btn.cropper-highlight-toggle.highlight-9c.is-active {
        background:
          linear-gradient(
            to bottom,
            #f2a23f,
            #c97316
          )
          !important;
        border-color:
          #9b570e
          !important;
      }

      .qol-oasis-action-btn.cropper-highlight-toggle.highlight-15c.is-active {
        background:
          linear-gradient(
            to bottom,
            #9c73cf,
            #69439b
          )
          !important;
        border-color:
          #503076
          !important;
      }

      .qol-oasis-action-btn.visual-aid-toggle:hover,
      .qol-oasis-action-btn.cropper-highlight-toggle:hover,
      #qol-tag-team-toggle:hover {
        filter:
          brightness(1.12)
          !important;
      }

      #qol-tag-team-toggle {
        min-width:
          92px
          !important;
        background:
          linear-gradient(
            to bottom,
            #666,
            #444
          )
          !important;
        border-color:
          #333
          !important;
      }

      #qol-tag-team-toggle.is-active {
        background:
          linear-gradient(
            to bottom,
            #3d7f43,
            #24572a
          )
          !important;
        border-color:
          #1d4622
          !important;
      }

      .qol-oasis-action-btn.danger {
        background:
          linear-gradient(
            to bottom,
            #d9534f,
            #b52b27
          )
          !important;
        border-color:
          #8f211e
          !important;
      }

      .qol-oasis-status-line {
        min-height:
          18px
          !important;
        color:
          #5b4630
          !important;
        font-size:
          11px
          !important;
        display:
          flex
          !important;
        align-items:
          center
          !important;
        justify-content:
          space-between
          !important;
        gap:
          10px
          !important;
      }

      .qol-oasis-table-wrapper {
        flex:
          1 1 auto
          !important;
        min-height:
          0
          !important;
        overflow:
          auto
          !important;
        background-color:
          #fff
          !important;
        border:
          1px solid #c7b99e
          !important;
        border-radius:
          3px
          !important;
      }

      .qol-oasis-table {
        width:
          100%
          !important;
        border-collapse:
          collapse
          !important;
        background-color:
          #fff
          !important;
        font-size:
          11px
          !important;
      }

      .qol-oasis-table th,
      .qol-oasis-table td {
        padding:
          6px 7px
          !important;
        border-bottom:
          1px solid #e4dccd
          !important;
        text-align:
          left
          !important;
        vertical-align:
          middle
          !important;
        white-space:
          nowrap
          !important;
      }

      .qol-oasis-table th {
        position:
          sticky
          !important;
        top:
          0
          !important;
        z-index:
          2
          !important;
        background-color:
          #e9dfcc
          !important;
        color:
          var(--qol-accent-deep)
          !important;
        font-size:
          10px
          !important;
        text-transform:
          uppercase
          !important;
        letter-spacing:
          0.3px
          !important;
      }

      .qol-oasis-table
      tbody
      tr:not(.qol-cropper-details-row):hover {
        background-color:
          #fff8e9
          !important;
      }

      .qol-oasis-coordinate-link {
        color:
          #005580
          !important;
        font-weight:
          bold
          !important;
        cursor:
          pointer
          !important;
        text-decoration:
          none
          !important;
      }

      .qol-oasis-coordinate-link:hover {
        text-decoration:
          underline
          !important;
      }

      .qol-result-type {
        display:
          inline-block
          !important;
        min-width:
          64px
          !important;
        padding:
          2px 6px
          !important;
        border-radius:
          10px
          !important;
        text-align:
          center
          !important;
        font-size:
          10px
          !important;
        font-weight:
          bold
          !important;
        box-sizing:
          border-box
          !important;
      }

      .qol-result-type.cropper {
        background-color:
          #e7f3d4
          !important;
        color:
          #3f6420
          !important;
        border:
          1px solid #9dbb71
          !important;
      }

      .qol-result-type.oasis {
        background-color:
          #dfeef5
          !important;
        color:
          #285a73
          !important;
        border:
          1px solid #8eb8ca
          !important;
      }

      .qol-cropper-oasis-count {
        color:
          #6a4c29
          !important;
        font-weight:
          bold
          !important;
        cursor:
          pointer
          !important;
        user-select:
          none
          !important;
      }

      .qol-cropper-oasis-count:hover {
        text-decoration:
          underline
          !important;
      }

      .qol-cropper-details-row td {
        padding:
          0
          !important;
        background-color:
          #f6f1e7
          !important;
        white-space:
          normal
          !important;
      }

      .qol-cropper-details {
        padding:
          8px 14px
          !important;
        border-left:
          4px solid var(--qol-accent)
          !important;
        color:
          #4c3b28
          !important;
      }

      .qol-cropper-details-title {
        margin-bottom:
          5px
          !important;
        font-weight:
          bold
          !important;
      }

      .qol-cropper-oasis-line {
        display:
          flex
          !important;
        align-items:
          center
          !important;
        gap:
          10px
          !important;
        padding:
          2px 0
          !important;
      }

      .qol-delete-cell {
        text-align:
          center
          !important;
      }

      .qol-oasis-delete-entry {
        color:
          #a00000
          !important;
        font-size:
          17px
          !important;
        font-weight:
          bold
          !important;
        cursor:
          pointer
          !important;
        user-select:
          none
          !important;
      }

      .qol-oasis-empty {
        padding:
          30px 12px
          !important;
        text-align:
          center
          !important;
        color:
          #777
          !important;
        font-size:
          12px
          !important;
      }

      @media (max-width: 1050px) {
        .qol-oasis-controls {
          grid-template-columns:
            1fr 1fr 1fr
            !important;
        }

        .qol-tag-team-settings {
          grid-template-columns:
            1fr 1fr
            !important;
        }

        .qol-tag-team-progress-grid {
          grid-template-columns:
            1fr 1fr
            !important;
        }

        .qol-tag-team-progress-actions {
          grid-column:
            1 / -1
            !important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  function makeDraggable(element, handle) {
    handle.addEventListener("pointerdown", event => {
      if (event.target.closest(".qol-oasis-close")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startY = event.clientY;
      const rect = element.getBoundingClientRect();
      const originalLeft = rect.left;
      const originalTop = rect.top;
      element.style.setProperty("transform", "none", "important");
      element.style.setProperty("left", `${originalLeft}px`, "important");
      element.style.setProperty("top", `${originalTop}px`, "important");
      element.style.setProperty("right", "auto", "important");
      element.style.setProperty("bottom", "auto", "important");
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (error) {}
      function onMove(moveEvent) {
        moveEvent.preventDefault();
        element.style.setProperty("left", `${originalLeft + moveEvent.clientX - startX}px`, "important");
        element.style.setProperty("top", `${originalTop + moveEvent.clientY - startY}px`, "important");
      }
      function onUp(upEvent) {
        try {
          handle.releasePointerCapture(upEvent.pointerId);
        } catch (error) {}
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
      }
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }
  function positionPanel() {
    if (!oasisContainer) {
      return;
    }
    const cogButton = document.getElementById("qol-cog-btn");
    if (!cogButton) {
      oasisContainer.style.setProperty("left", "20px", "important");
      oasisContainer.style.setProperty("top", "80px", "important");
      return;
    }
    const rect = cogButton.getBoundingClientRect();
    const panelWidth = oasisContainer.offsetWidth || 900;
    const panelHeight = oasisContainer.offsetHeight || 500;
    const maximumLeft = Math.max(10, window.innerWidth - panelWidth - 10);
    const maximumTop = Math.max(10, window.innerHeight - panelHeight - 10);
    oasisContainer.style.setProperty("left", `${Math.max(10, Math.min(rect.left, maximumLeft))}px`, "important");
    oasisContainer.style.setProperty("top", `${Math.max(10, Math.min(rect.bottom + 20, maximumTop))}px`, "important");
    oasisContainer.style.setProperty("transform", "none", "important");
  }
  function buildPanel() {
    const existing = document.getElementById("qol-oasis-container");
    if (existing) {
      oasisContainer = existing;
      return;
    }
    oasisContainer = document.createElement("div");
    oasisContainer.id = "qol-oasis-container";
    oasisContainer.innerHTML = `
      <div class="qol-oasis-header">
        <span>
          Oasis & Cropper Scanner
        </span>

        <span
          class="qol-oasis-close"
          title="Close Scanner"
        >
          &times;
        </span>
      </div>

      <div class="qol-oasis-body">
        <div class="qol-oasis-description">
          Hover any map tile to mark its coordinate as scanned,
          including empty terrain and occupied villages.
          Visual Aid Mode shows unscanned tiles in blue and
          scanned tiles in red. Tag Team Visual Aid shows only the selected section, or every section when All is selected. Highlight 9c marks discovered 9c tiles
          orange, while Highlight 15c marks discovered 15c tiles purple.
          Tag Team Mode divides the
          -59 to 59 map into identical shared sections while
          keeping all scanning completely manual.
        </div>

        <div
          id="qol-tag-team-card"
          class="qol-tag-team-card"
        >
          <div class="qol-tag-team-heading">
            <div class="qol-tag-team-heading-left">
              <div
                id="qol-tag-team-toggle"
                class="qol-oasis-action-btn"
                role="button"
                tabindex="0"
                aria-pressed="false"
              >
                Tag Team: Off
              </div>

              <span
                id="qol-tag-team-setup-summary"
              >
                Manual shared scan sections
              </span>
            </div>

            <div
              id="qol-tag-team-legend"
              class="qol-tag-team-legend"
            ></div>
          </div>

          <div class="qol-tag-team-details">
            <div class="qol-tag-team-settings">
            <label class="qol-tag-team-field">
              <span>Tag Team Users</span>

              <select id="qol-tag-team-size">
                <option value="2">2 users</option>
                <option value="3">3 users</option>
                <option value="4">4 users</option>
                <option value="5">5 users</option>
                <option value="6">6 users</option>
              </select>
            </label>

            <label class="qol-tag-team-field">
              <span>Visible Section</span>

              <select
                id="qol-tag-team-section"
              ></select>
            </label>
          </div>

            <div class="qol-tag-team-progress-grid">
              <div class="qol-tag-team-progress-item">
                <span
                  id="qol-tag-team-assigned-text"
                >
                  Section A: 0 / 0 (0.0%)
                </span>

                <div class="qol-tag-team-progress-track">
                  <div
                    id="qol-tag-team-assigned-bar"
                    class="qol-tag-team-progress-fill"
                  ></div>
                </div>
              </div>

              <div class="qol-tag-team-progress-item">
                <span
                  id="qol-tag-team-overall-text"
                >
                  Full map: 0 / 14,161 (0.0%)
                </span>

                <div class="qol-tag-team-progress-track">
                  <div
                    id="qol-tag-team-overall-bar"
                    class="qol-tag-team-progress-fill"
                  ></div>
                </div>
              </div>

              <div class="qol-tag-team-progress-actions">
                <div
                  id="qol-tag-team-new-session"
                  class="qol-oasis-action-btn"
                  role="button"
                  tabindex="0"
                >
                  New Session
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="qol-oasis-controls">
          <select
            id="qol-oasis-type-filter"
            title="Result type"
          >
            <option value="croppers">
              All Croppers
            </option>

            <option value="15c">
              15c Only
            </option>

            <option value="9c">
              9c Only
            </option>

            <option value="oases">
              Oases Only
            </option>

            <option value="all">
              Croppers + Oases
            </option>
          </select>

          <select
            id="qol-oasis-resource-filter"
            title="Require this resource bonus"
          >
            <option value="all">
              All Bonuses
            </option>

            <option value="wood">
              Wood Bonus
            </option>

            <option value="clay">
              Clay Bonus
            </option>

            <option value="iron">
              Iron Bonus
            </option>

            <option value="crop">
              Crop Bonus
            </option>
          </select>

          <input
            id="qol-oasis-search"
            type="text"
            placeholder="Search coordinates or bonus..."
            autocomplete="off"
          >

          <select
            id="qol-oasis-sort"
            title="Sort results"
          >
            <option value="best">
              Best Bonus
            </option>

            <option value="recent">
              Newest First
            </option>

            <option value="coordinates">
              Coordinates
            </option>

            <option value="type">
              Type
            </option>
          </select>

          <div
            id="qol-oasis-visual-aid-toggle"
            class="qol-oasis-action-btn visual-aid-toggle"
            role="button"
            tabindex="0"
            aria-pressed="true"
          >
            Visual Aid: On
          </div>

          <div
            id="qol-oasis-highlight-9c"
            class="qol-oasis-action-btn cropper-highlight-toggle highlight-9c"
            role="button"
            tabindex="0"
            aria-pressed="false"
            title="Highlight scanned 9c tiles in orange"
          >
            Highlight 9c
          </div>

          <div
            id="qol-oasis-highlight-15c"
            class="qol-oasis-action-btn cropper-highlight-toggle highlight-15c"
            role="button"
            tabindex="0"
            aria-pressed="false"
            title="Highlight scanned 15c tiles in purple"
          >
            Highlight 15c
          </div>

          <div
            id="qol-oasis-copy"
            class="qol-oasis-action-btn"
          >
            Copy
          </div>

          <div
            id="qol-oasis-export"
            class="qol-oasis-action-btn"
          >
            Export CSV
          </div>

          <div
            id="qol-oasis-clear"
            class="qol-oasis-action-btn danger"
          >
            Clear
          </div>
        </div>

        <div class="qol-oasis-status-line">
          <span
            id="qol-oasis-status-message"
          >
            Ready. Hover any map tile to scan it.
          </span>

          <span
            id="qol-oasis-result-count"
          >
            0 results shown / 0 tiles scanned
          </span>
        </div>

        <div class="qol-oasis-table-wrapper">
          <table class="qol-oasis-table">
            <thead>
              <tr>
                <th>Coordinates</th>
                <th>Type</th>
                <th>Best Bonus</th>
                <th>Oases</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th></th>
              </tr>
            </thead>

            <tbody
              id="qol-oasis-table-body"
            ></tbody>
          </table>
        </div>
      </div>
    `;
    document.body.appendChild(oasisContainer);
    makeDraggable(oasisContainer, oasisContainer.querySelector(".qol-oasis-header"));
    oasisContainer.querySelector(".qol-oasis-close").addEventListener("click", () => {
      oasisContainer.style.setProperty("display", "none", "important");
    });
    oasisContainer.querySelector("#qol-oasis-type-filter").addEventListener("change", renderResultsTable);
    oasisContainer.querySelector("#qol-oasis-resource-filter").addEventListener("change", renderResultsTable);
    oasisContainer.querySelector("#qol-oasis-sort").addEventListener("change", renderResultsTable);
    oasisContainer.querySelector("#qol-oasis-search").addEventListener("input", renderResultsTable);
    oasisContainer.querySelector("#qol-oasis-visual-aid-toggle").addEventListener("click", toggleVisualAidMode);
    oasisContainer.querySelector("#qol-oasis-visual-aid-toggle").addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      toggleVisualAidMode();
    });
    const bindCropperHighlightButton = (selector, fieldType) => {
      const button = oasisContainer.querySelector(selector);
      button.addEventListener("click", () => toggleCropperHighlight(fieldType));
      button.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") {
          return;
        }
        event.preventDefault();
        toggleCropperHighlight(fieldType);
      });
    };
    bindCropperHighlightButton("#qol-oasis-highlight-9c", "9c");
    bindCropperHighlightButton("#qol-oasis-highlight-15c", "15c");
    oasisContainer.querySelector("#qol-tag-team-toggle").addEventListener("click", toggleTagTeamMode);
    oasisContainer.querySelector("#qol-tag-team-toggle").addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      toggleTagTeamMode();
    });
    oasisContainer.querySelector("#qol-tag-team-size").addEventListener("change", event => {
      changeTagTeamSize(event.target.value);
    });
    oasisContainer.querySelector("#qol-tag-team-section").addEventListener("change", event => {
      changeTagTeamSection(event.target.value);
    });
    oasisContainer.querySelector("#qol-tag-team-new-session").addEventListener("click", () => {
      startNewTagTeamSession();
    });
    oasisContainer.querySelector("#qol-tag-team-new-session").addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      startNewTagTeamSession();
    });
    oasisContainer.querySelector("#qol-oasis-copy").addEventListener("click", copyVisibleResults);
    oasisContainer.querySelector("#qol-oasis-export").addEventListener("click", exportVisibleResults);
    oasisContainer.querySelector("#qol-oasis-clear").addEventListener("click", clearAllResults);
    oasisContainer.querySelector("#qol-oasis-table-body").addEventListener("click", event => {
      const target = event.target.closest("[data-action]");
      if (!target) {
        return;
      }
      const action = target.getAttribute("data-action");
      if (action === "delete") {
        deleteEntry(target.getAttribute("data-result-type"), target.getAttribute("data-id"));
        return;
      }
      if (action === "goto") {
        const x = parseInteger(target.getAttribute("data-x"));
        const y = parseInteger(target.getAttribute("data-y"));
        if (x !== null && y !== null) {
          navigateToCoordinate(x, y);
        }
        return;
      }
      if (action === "toggle-details") {
        const id = target.getAttribute("data-id");
        if (expandedCropperIds.has(id)) {
          expandedCropperIds.delete(id);
        } else {
          expandedCropperIds.add(id);
        }
        renderResultsTable();
      }
    });
    updateVisualAidToggleButton();
    updateCropperHighlightButtons();
    updateTagTeamUI();
    renderResultsTable();
  }
  function openPanel() {
    if (!oasisContainer) {
      buildPanel();
    }
    window.dispatchEvent(new CustomEvent("qol_close_others", {
      detail: {
        source: "oasisScanner"
      }
    }));
    oasisContainer.style.setProperty("display", "flex", "important");
    requestAnimationFrame(positionPanel);
    renderResultsTable();
  }
  function togglePanel() {
    if (!oasisContainer) {
      buildPanel();
    }
    if (getComputedStyle(oasisContainer).display === "none") {
      openPanel();
    } else {
      oasisContainer.style.setProperty("display", "none", "important");
    }
  }
  function buildToggleButton() {
    const existing = document.getElementById("qol-oasis-toggle-btn");
    if (existing) {
      oasisToggleButton = existing;
      return;
    }
    oasisToggleButton = document.createElement("div");
    oasisToggleButton.id = "qol-oasis-toggle-btn";
    oasisToggleButton.title = "Oasis & Cropper Scanner";
    oasisToggleButton.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 22V10"></path>

        <path
          d="
            M12 10
            C8 10 5 7.5 5 4
            c4 0 7 2.5 7 6Z
          "
        ></path>

        <path
          d="
            M12 14
            c4 0 7-2.5 7-6
            -4 0-7 2.5-7 6Z
          "
        ></path>

        <path d="M8 22h8"></path>
      </svg>
    `;
    oasisToggleButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      togglePanel();
    });
    document.body.appendChild(oasisToggleButton);
    if (typeof window.qolRepositionAllButtons === "function") {
      window.qolRepositionAllButtons();
    }
  }
  function buildUI() {
    if (!isEnabled()) {
      return;
    }
    injectStyles();
    buildToggleButton();
    buildPanel();
    scheduleScannedOverlayRender();
    if (typeof window.qolRepositionAllButtons === "function") {
      window.qolRepositionAllButtons();
    }
  }
  function destroyUI() {
    const button = document.getElementById("qol-oasis-toggle-btn");
    const panel = document.getElementById("qol-oasis-container");
    if (button) {
      button.remove();
    }
    if (panel) {
      panel.remove();
    }
    oasisToggleButton = null;
    oasisContainer = null;
    removeScannedTileOverlay();
    if (typeof window.qolRepositionAllButtons === "function") {
      window.qolRepositionAllButtons();
    }
  }
  function initialise() {
    savedOases = loadStoredObject(OASIS_STORAGE_KEY);
    savedCroppers = loadStoredObject(CROPPER_STORAGE_KEY);
    savedTiles = loadStoredObject(TILE_STORAGE_KEY);
    visualAidEnabled = loadVisualAidEnabled();
    highlight9cEnabled = loadCropperHighlightEnabled(HIGHLIGHT_9C_STORAGE_KEY);
    highlight15cEnabled = loadCropperHighlightEnabled(HIGHLIGHT_15C_STORAGE_KEY);
    tagTeamConfig = loadTagTeamConfig();
    tagTeamSession = loadTagTeamSession();
    if (tagTeamSession.teamSize !== tagTeamConfig.teamSize) {
      tagTeamSession = createTagTeamSession();
      saveTagTeamSession();
    }
    migrateStoredData();
    startTooltipTracking();
    if (isEnabled()) {
      buildUI();
    }
    console.log("[APES Oasis Scanner] " + "DOM tile, oasis, cropper and Tag Team scanner initialized.");
  }
  window.addEventListener("message", handleBridgeMessage);
  window.addEventListener("qol_close_others", event => {
    if (event.detail?.source !== "oasisScanner" && oasisContainer) {
      oasisContainer.style.setProperty("display", "none", "important");
    }
  });
  window.addEventListener("qol_setting_changed", event => {
    if (event.detail?.key !== FEATURE_KEY) {
      return;
    }
    if (event.detail.enabled) {
      buildUI();
      scheduleScannedOverlayRender();
    } else {
      destroyUI();
    }
  });
  window.addEventListener("resize", () => {
    if (oasisContainer && getComputedStyle(oasisContainer).display !== "none") {
      positionPanel();
    }
    scheduleScannedOverlayRender();
  });
  window.addEventListener("hashchange", () => {
    lastTooltipSignature = "";
    scheduleTooltipScan();
    scheduleScannedOverlayRender();
  });
  window.addEventListener("pagehide", () => {
    if (tagTeamSaveTimer !== null) {
      saveTagTeamSession();
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && oasisContainer && getComputedStyle(oasisContainer).display !== "none") {
      oasisContainer.style.setProperty("display", "none", "important");
    }
  }, true);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialise, {
      once: true
    });
  } else {
    initialise();
  }
})();
