from pathlib import Path
import json

path = Path('js/features/oasisScanner.js')
text = path.read_text()

def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, got {count}')
    text = text.replace(old, new, 1)

def replace_between(start_marker, end_marker, replacement, label):
    global text
    start = text.find(start_marker)
    if start < 0:
        raise SystemExit(f'{label}: start marker missing')
    end = text.find(end_marker, start + len(start_marker))
    if end < 0:
        raise SystemExit(f'{label}: end marker missing')
    text = text[:start] + replacement + text[end:]

replace_once('  const TAG_TEAM_OVERLAP = 1;\n', '', 'overlap constant')

replace_between(
    '  function getDefaultTagTeamConfig() {',
    '  function loadTagTeamConfig() {',
    '''  function getDefaultTagTeamConfig() {
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
''',
    'config block'
)

replace_between(
    '        const assigned = {',
    '        sections.push({',
    '''        const assigned = {
          ...primary
        };
''',
    'assigned bounds'
)

replace_between(
    '  function getSelectedTagTeamSection() {',
    '  function getBoundsTileCount(bounds) {',
    '''  function getSelectedTagTeamSection() {
    if (tagTeamConfig.selectedSection === "ALL") {
      return null;
    }
    return getTagTeamSections().find(section => section.id === tagTeamConfig.selectedSection) || null;
  }
  function isAllTagTeamSectionsVisible() {
    return tagTeamConfig.selectedSection === "ALL";
  }
''',
    'selected section helper'
)

replace_between(
    '  function getTagTeamProgress() {',
    '  function formatPercentage(value) {',
    '''  function getTagTeamProgress() {
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
''',
    'progress block'
)

replace_between(
    '  function updateTagTeamProgressUI() {',
    '  function updateTagTeamUI() {',
    '''  function updateTagTeamProgressUI() {
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
''',
    'progress ui'
)

replace_between(
    '  function updateTagTeamUI() {',
    '  function toggleVisualAidMode() {',
    '''  function updateTagTeamUI() {
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
''',
    'tag ui'
)

replace_between(
    '  function toggleTagTeamMode() {',
    '  function recordTagTeamScan(record) {',
    '''  function getVisibleSectionLabel() {
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
''',
    'tag controls'
)

replace_between(
    '  function renderScannedTileOverlay() {',
    '  function scheduleScannedOverlayRender() {',
    '''  function renderScannedTileOverlay() {
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
''',
    'overlay renderer'
)

replace_between(
    '  function updateResultCount() {',
    '  function getCropperStatusLabel(cropper) {',
    '''  function updateResultCount() {
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
''',
    'result count'
)

replace_between(
    '  function exportTagTeamSession() {',
    '  function exportVisibleResults() {',
    '''  function exportTagTeamSession() {
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
''',
    'tag export'
)

replace_between(
    '      .qol-tag-team-settings {',
    '      .qol-tag-team-field {',
    '''      .qol-tag-team-settings {
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

''',
    'settings css'
)

replace_between(
    '      .qol-tag-team-area {',
    '      .qol-tag-team-progress-grid {',
    '',
    'area css'
)

replace_between(
    '      .qol-tag-team-tile.is-other-section {',
    '      .qol-tag-team-tile.is-section-edge {',
    '',
    'obsolete overlay css'
)

replace_between(
    '          <div class="qol-tag-team-settings">',
    '            <div class="qol-tag-team-progress-grid">',
    '''          <div class="qol-tag-team-settings">
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

''',
    'settings html'
)

replace_between(
    '    oasisContainer.querySelector("#qol-tag-team-scanner-name")',
    '    oasisContainer.querySelector("#qol-tag-team-new-session").addEventListener("click"',
    '',
    'obsolete listeners'
)

text = text.replace(
    'Visual Aid Mode shows unscanned tiles in blue and\n          scanned tiles in red. Highlight 9c marks discovered 9c tiles',
    'Visual Aid Mode shows unscanned tiles in blue and\n          scanned tiles in red. Tag Team Visual Aid shows only the selected section, or every section when All is selected. Highlight 9c marks discovered 9c tiles'
)

forbidden = [
    'scannerName',
    'Scanner Name',
    'qol-tag-team-scanner-name',
    'qol-tag-team-copy-setup',
    'Copy Setup',
    'TAG_TEAM_OVERLAP',
    'is-selected-overlap',
    'is-other-section',
    'qol-tag-team-area',
    'Your Section'
]
for token in forbidden:
    if token in text:
        raise SystemExit(f'forbidden token remains: {token}')
if '<span>Visible Section</span>' not in text:
    raise SystemExit('Visible Section label missing')
if '<option value="ALL">All</option>' not in text:
    raise SystemExit('All section option missing')

path.write_text(text)

manifest_path = Path('manifest.json')
manifest = json.loads(manifest_path.read_text())
manifest['version'] = '2.0.0.73'
manifest['version_name'] = '2.0.0-alpha.80'
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
