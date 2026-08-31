const mapKeyMap = {
  'KeyW': {
    arrow: 'ArrowUp',
    code: 38
  },
  'KeyA': {
    arrow: 'ArrowLeft',
    code: 37
  },
  'KeyS': {
    arrow: 'ArrowDown',
    code: 40
  },
  'KeyD': {
    arrow: 'ArrowRight',
    code: 39
  },
  'keyw': {
    arrow: 'ArrowUp',
    code: 38
  },
  'keya': {
    arrow: 'ArrowLeft',
    code: 37
  },
  'keys': {
    arrow: 'ArrowDown',
    code: 40
  },
  'keyd': {
    arrow: 'ArrowRight',
    code: 39
  }
};
function isMapKey(code) {
  return !!mapKeyMap[code];
}
function handleMapMovement(e) {
  const mapData = mapKeyMap[e.code];
  if (!mapData) return;
  Object.defineProperties(e, {
    key: {
      get: () => mapData.arrow
    },
    code: {
      get: () => mapData.arrow
    },
    keyCode: {
      get: () => mapData.code
    },
    which: {
      get: () => mapData.code
    }
  });
  const speedBoostEvent = new KeyboardEvent(e.type, {
    key: mapData.arrow,
    code: mapData.arrow,
    keyCode: mapData.code,
    which: mapData.code,
    bubbles: true,
    cancelable: true,
    shiftKey: e.shiftKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    repeat: e.repeat
  });
  e.target.dispatchEvent(speedBoostEvent);
}
