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
function handleHoverSendTroops() {
  const currentHash = window.location.hash;
  if (currentHash.includes('window:sendTroops')) {
    const closeBtn = document.querySelector('.window .close, .closeWindow');
    if (closeBtn) {
      closeBtn.click();
    } else {
      let parts = currentHash.substring(2).split('/');
      parts = parts.filter(part => {
        return part !== 'window:sendTroops' && !part.startsWith('x:') && !part.startsWith('y:');
      });
      window.location.hash = '#/' + parts.filter(Boolean).join('/');
    }
    return;
  }
  const coords = getHoveredCoordinates();
  if (coords) {
    console.log(`[QoL Extension] Target coordinates identified: (${coords.x}|${coords.y})`);
    window.location.hash = `#/page:map/x:${coords.x}/y:${coords.y}/window:sendTroops`;
  } else {
    console.warn("[QoL Extension] No active map tile tooltip found under cursor.");
  }
}
