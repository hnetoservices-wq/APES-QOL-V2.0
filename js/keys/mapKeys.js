/**
 * Travian QoL Extension
 * Module: Map Navigation Keys (WASD)
 */

const mapKeyMap = {
    'KeyW': { arrow: 'ArrowUp', code: 38 },
    'KeyA': { arrow: 'ArrowLeft', code: 37 },
    'KeyS': { arrow: 'ArrowDown', code: 40 },
    'KeyD': { arrow: 'ArrowRight', code: 39 },
    'keyw': { arrow: 'ArrowUp', code: 38 },
    'keya': { arrow: 'ArrowLeft', code: 37 },
    'keys': { arrow: 'ArrowDown', code: 40 },
    'keyd': { arrow: 'ArrowRight', code: 39 }
};

/**
 * Checks if the key code belongs to map controls.
 */
function isMapKey(code) {
    return !!mapKeyMap[code];
}

/**
 * Mutates a trusted event and dispatches a duplicate synthetic event 
 * to achieve 2x speed.
 */
function handleMapMovement(e) {
    const mapData = mapKeyMap[e.code];
    if (!mapData) return;

    // Redefine getters of the original trusted event
    Object.defineProperties(e, {
        key: { get: () => mapData.arrow },
        code: { get: () => mapData.arrow },
        keyCode: { get: () => mapData.code },
        which: { get: () => mapData.code }
    });

    // Generate secondary speed-boost event
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