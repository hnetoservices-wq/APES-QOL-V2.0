/**
 * Travian QoL Extension
 * Module: Map Hover Actions (R to Send Troops with Toggle Close)
 */

/**
 * Grabs the raw x and y attributes straight out of the active tile tooltip container.
 */
function getHoveredCoordinates() {
    const coordinateWrapper = document.querySelector('#tileInformation .coordinateWrapper');
    
    if (coordinateWrapper) {
        const xAttr = coordinateWrapper.getAttribute('x');
        const yAttr = coordinateWrapper.getAttribute('y');
        
        if (xAttr !== null && yAttr !== null) {
            return {
                x: parseInt(xAttr, 10),
                y: parseInt(yAttr, 10)
            };
        }
    }
    
    return null;
}

/**
 * Directs the hash routing to the Rally Point screen targeting the hovered tile,
 * or closes it if it's already open.
 */
function handleHoverSendTroops() {
    const currentHash = window.location.hash;

    // Toggle Close: If the sendTroops window is already active, close it
    if (currentHash.includes('window:sendTroops')) {
        // Try clicking the physical close button first for safety
        const closeBtn = document.querySelector('.window .close, .closeWindow');
        if (closeBtn) {
            closeBtn.click();
        } else {
            // Fallback: Manually strip the parameters from the hash
            let parts = currentHash.substring(2).split('/');
            parts = parts.filter(part => {
                return part !== 'window:sendTroops' && 
                       !part.startsWith('x:') && 
                       !part.startsWith('y:');
            });
            window.location.hash = '#/' + parts.filter(Boolean).join('/');
        }
        return;
    }

    // Otherwise, open it for the hovered coordinates
    const coords = getHoveredCoordinates();
    
    if (coords) {
        console.log(`[QoL Extension] Target coordinates identified: (${coords.x}|${coords.y})`);
        window.location.hash = `#/page:map/x:${coords.x}/y:${coords.y}/window:sendTroops`;
    } else {
        console.warn("[QoL Extension] No active map tile tooltip found under cursor.");
    }
}