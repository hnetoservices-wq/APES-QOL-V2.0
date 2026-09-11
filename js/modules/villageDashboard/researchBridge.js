(() => {
  'use strict';

  const FLAG = '__APES_QOL_VILLAGE_RESEARCH_BRIDGE__';
  const UI_SOURCE = 'APES_QOL_VILLAGE_RESEARCH_UI';
  const BRIDGE_SOURCE = 'APES_QOL_VILLAGE_RESEARCH_BRIDGE';
  const REQUEST_TYPE = 'REQUEST_RESEARCH';
  const RESPONSE_TYPE = 'RESEARCH_RESPONSE';

  if (window[FLAG]) return;
  window[FLAG] = true;

  function asVillageId(value) {
    const text = String(value ?? '').trim();
    return /^\d+$/.test(text) ? text : '';
  }

  function researchPayload(villageId) {
    const id = asVillageId(villageId);
    if (!id) return { villageId: '', loaded: false, units: {} };

    const model = window.Cache?.c?.[`Research:${id}`];
    const data = model?.data;
    const rows = Array.isArray(data?.units) ? data.units : [];
    const units = {};

    for (const row of rows) {
      const unitType = Number(row?.unitType);
      const unitLevel = Number(row?.unitLevel);
      if (!Number.isFinite(unitType) || unitType <= 0) continue;
      if (!Number.isFinite(unitLevel) || unitLevel < 0) continue;
      units[String(unitType)] = Math.max(0, Math.min(20, unitLevel));
    }

    return {
      villageId: id,
      loaded: Boolean(model && rows.length),
      filled: model?.filled === true,
      units
    };
  }

  window.addEventListener('message', event => {
    if (event.source !== window) return;
    if (event.data?.source !== UI_SOURCE || event.data?.type !== REQUEST_TYPE) return;

    const requestId = String(event.data?.requestId || '');
    const payload = researchPayload(event.data?.villageId);

    window.postMessage({
      source: BRIDGE_SOURCE,
      type: RESPONSE_TYPE,
      requestId,
      payload
    }, window.location.origin);
  });
})();
