(function initOasisNetworkBridge() {
  "use strict";

  const BRIDGE_FLAG = "__APES_QOL_OASIS_NETWORK_BRIDGE__";
  const MESSAGE_SOURCE = "APES_QOL_OASIS_BRIDGE";
  const OASIS_MESSAGE_TYPE = "OASIS_DETAILS";
  const TILE_MESSAGE_TYPE = "TILE_DETAILS";
  const CROPPER_MESSAGE_TYPE = "CROPPER_DETAILS";
  const MAP_DETAILS_PREFIX = "MapDetails:";
  const FEATURE_STORAGE_KEY = "qol_oasisScanner";
  const MAP_SIZE = 32768;
  const MAP_OFFSET = 16384;
  const TARGET_RESOURCE_TYPES = new Set([3339, 11115]);
  if (window[BRIDGE_FLAG]) {
    return;
  }
  window[BRIDGE_FLAG] = true;
  const emittedResponseVersions = new Map();
  let lastHoveredCoordinateKey = "";
  let lastHoveredCacheSignature = "";
  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function toText(value) {
    return value === null || value === undefined ? "" : String(value);
  }
  function isTruthyGameValue(value) {
    return value === true || value === 1 || value === "1";
  }
  function isFeatureEnabled() {
    try {
      return localStorage.getItem(FEATURE_STORAGE_KEY) !== "false";
    } catch (error) {
      return true;
    }
  }
  function isNatarName(value) {
    return /natars?|natarian/i.test(toText(value));
  }
  function isNatarData(data) {
    const playerId = toNumber(data.playerId ?? data.ownerId ?? data.player?.playerId);
    return playerId === 1 || isNatarName(data.playerName) || isNatarName(data.ownerName) || isNatarName(data.villageName) || isNatarName(data.name) || isNatarName(data.player?.playerName);
  }
  function coordinatesToLocationId(x, y) {
    const parsedX = Number.parseInt(x, 10);
    const parsedY = Number.parseInt(y, 10);
    if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) {
      return "";
    }
    return String((parsedY + MAP_OFFSET) * MAP_SIZE + (parsedX + MAP_OFFSET));
  }
  function locationIdToCoordinates(locationId) {
    const parsed = Number(locationId);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    const encodedY = Math.floor(parsed / MAP_SIZE);
    const encodedX = parsed - encodedY * MAP_SIZE;
    return {
      x: encodedX - MAP_OFFSET,
      y: encodedY - MAP_OFFSET
    };
  }
  function readHoveredCoordinates() {
    const wrapper = document.querySelector("#tileInformation .coordinateWrapper");
    if (!wrapper) {
      return null;
    }
    const x = Number.parseInt(wrapper.getAttribute("x"), 10);
    const y = Number.parseInt(wrapper.getAttribute("y"), 10);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return {
      x,
      y
    };
  }
  function normalisePayload(payload) {
    if (payload === null || payload === undefined) {
      return null;
    }
    if (typeof payload === "object") {
      return payload;
    }
    if (typeof payload !== "string") {
      return null;
    }
    if (!payload.includes(MAP_DETAILS_PREFIX)) {
      return null;
    }
    try {
      return JSON.parse(payload);
    } catch (error) {
      return null;
    }
  }
  function postMessage(type, payload) {
    window.postMessage({
      source: MESSAGE_SOURCE,
      type,
      payload
    }, window.location.origin);
  }
  function emitOasis(data, locationId, coordinates) {
    if (!isTruthyGameValue(data.isOasis)) {
      return false;
    }
    const rawBonus = data.oasisBonus || {};
    const fallbackBonuses = {
      10: {
        wood: 25,
        clay: 0,
        iron: 0,
        crop: 0
      },
      11: {
        wood: 25,
        clay: 0,
        iron: 0,
        crop: 25
      },
      20: {
        wood: 0,
        clay: 25,
        iron: 0,
        crop: 0
      },
      21: {
        wood: 0,
        clay: 25,
        iron: 0,
        crop: 25
      },
      30: {
        wood: 0,
        clay: 0,
        iron: 25,
        crop: 0
      },
      31: {
        wood: 0,
        clay: 0,
        iron: 25,
        crop: 25
      },
      40: {
        wood: 0,
        clay: 0,
        iron: 0,
        crop: 25
      },
      41: {
        wood: 0,
        clay: 0,
        iron: 0,
        crop: 50
      }
    };
    const oasisType = toText(data.oasisType);
    const fallback = fallbackBonuses[oasisType] || {
      wood: 0,
      clay: 0,
      iron: 0,
      crop: 0
    };
    postMessage(OASIS_MESSAGE_TYPE, {
      locationId,
      x: coordinates?.x ?? null,
      y: coordinates?.y ?? null,
      oasisType,
      oasisStatus: toText(data.oasisStatus),
      kingdomId: toNumber(data.kingdomId),
      hasVillage: toNumber(data.hasVillage),
      oasisBonus: {
        wood: Math.max(toNumber(rawBonus["1"] ?? rawBonus.wood), fallback.wood),
        clay: Math.max(toNumber(rawBonus["2"] ?? rawBonus.clay), fallback.clay),
        iron: Math.max(toNumber(rawBonus["3"] ?? rawBonus.iron), fallback.iron),
        crop: Math.max(toNumber(rawBonus["4"] ?? rawBonus.crop), fallback.crop)
      }
    });
    return true;
  }
  function emitTile(data, locationId, coordinates) {
    postMessage(TILE_MESSAGE_TYPE, {
      locationId,
      x: coordinates?.x ?? null,
      y: coordinates?.y ?? null,
      isOasis: isTruthyGameValue(data.isOasis),
      hasVillage: toNumber(data.hasVillage),
      isHabitable: isTruthyGameValue(data.isHabitable)
    });
  }
  function emitCropper(data, locationId, coordinates) {
    const rawResType = toNumber(data.resType);
    const isNatar = isNatarData(data);
    if (!TARGET_RESOURCE_TYPES.has(rawResType)) {
      return false;
    }
    const playerName = toText(data.playerName ?? data.ownerName ?? data.player?.playerName);
    const villageName = toText(data.villageName ?? data.name);
    postMessage(CROPPER_MESSAGE_TYPE, {
      locationId,
      x: coordinates?.x ?? null,
      y: coordinates?.y ?? null,
      resType: rawResType,
      hasVillage: toNumber(data.hasVillage),
      isHabitable: isTruthyGameValue(data.isHabitable),
      playerId: toNumber(data.playerId ?? data.ownerId ?? data.player?.playerId),
      playerName,
      villageName,
      tribe: toNumber(data.tribe ?? data.tribeId),
      isNatar
    });
    return true;
  }
  function processMapDetailsEntry(entry) {
    if (!isFeatureEnabled()) {
      return;
    }
    if (!entry || typeof entry.name !== "string" || !entry.name.startsWith(MAP_DETAILS_PREFIX)) {
      return;
    }
    const data = entry.data;
    if (!data || typeof data !== "object") {
      return;
    }
    const locationId = entry.name.substring(MAP_DETAILS_PREFIX.length);
    if (!locationId) {
      return;
    }
    const coordinates = locationIdToCoordinates(locationId);
    emitTile(data, locationId, coordinates);
    if (emitOasis(data, locationId, coordinates)) {
      return;
    }
    emitCropper(data, locationId, coordinates);
  }
  function processResponsePayload(payload) {
    if (!isFeatureEnabled()) {
      return;
    }
    const parsed = normalisePayload(payload);
    if (!parsed || !Array.isArray(parsed.cache)) {
      return;
    }
    parsed.cache.forEach(entry => {
      if (!entry || typeof entry.name !== "string") {
        return;
      }
      const version = Number(entry.lastFilled ?? entry.version ?? entry.Vb ?? Date.now());
      const cacheSignature = `${entry.name}|` + `${version}`;
      if (emittedResponseVersions.get(entry.name) === cacheSignature) {
        return;
      }
      emittedResponseVersions.set(entry.name, cacheSignature);
      processMapDetailsEntry(entry);
    });
  }
  function patchXMLHttpRequest() {
    if (typeof XMLHttpRequest === "undefined" || !XMLHttpRequest.prototype) {
      return;
    }
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      const xhr = this;
      xhr.addEventListener("load", function handleMapDetailsXHRLoad() {
        try {
          let responsePayload = null;
          if (xhr.responseType === "json") {
            responsePayload = xhr.response;
          } else if (xhr.responseType === "" || xhr.responseType === "text") {
            responsePayload = xhr.responseText;
          } else if (typeof xhr.response === "string") {
            responsePayload = xhr.response;
          }
          processResponsePayload(responsePayload);
        } catch (error) {
          console.debug("[APES Oasis Bridge] Could not inspect XHR response.", error);
        }
      }, {
        once: true
      });
      return Reflect.apply(originalSend, this, args);
    };
  }
  function patchFetch() {
    if (typeof window.fetch !== "function") {
      return;
    }
    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(...args) {
      const response = await Reflect.apply(originalFetch, this, args);
      try {
        response.clone().text().then(processResponsePayload).catch(() => {});
      } catch (error) {
        console.debug("[APES Oasis Bridge] Could not inspect fetch response.", error);
      }
      return response;
    };
  }
  function importHoveredMapDetailsCache() {
    if (!isFeatureEnabled()) {
      lastHoveredCoordinateKey = "";
      lastHoveredCacheSignature = "";
      return;
    }
    const coordinates = readHoveredCoordinates();
    if (!coordinates) {
      lastHoveredCoordinateKey = "";
      lastHoveredCacheSignature = "";
      return;
    }
    const coordinateKey = `${coordinates.x}|` + `${coordinates.y}`;
    if (coordinateKey !== lastHoveredCoordinateKey) {
      lastHoveredCoordinateKey = coordinateKey;
      lastHoveredCacheSignature = "";
    }
    const locationId = coordinatesToLocationId(coordinates.x, coordinates.y);
    if (!locationId) {
      return;
    }
    const cacheKey = `${MAP_DETAILS_PREFIX}` + `${locationId}`;
    const model = window.Cache?.c?.[cacheKey];
    if (!model?.data) {
      return;
    }
    const version = Number(model.lastFilled ?? model.Vb ?? 1);
    const cacheSignature = `${coordinateKey}|` + `${version}`;
    if (cacheSignature === lastHoveredCacheSignature) {
      return;
    }
    lastHoveredCacheSignature = cacheSignature;
    processMapDetailsEntry({
      name: cacheKey,
      data: model.data
    });
  }
  patchXMLHttpRequest();
  patchFetch();
  window.setInterval(importHoveredMapDetailsCache, 100);
  console.log("[APES Oasis Bridge] " + "Manual-hover map bridge initialized.");
})();
