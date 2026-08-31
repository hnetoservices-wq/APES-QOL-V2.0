function isMapPage() {
  return window.location.hash.includes('/page:map');
}
function isUserTyping() {
  const activeEl = document.activeElement;
  return !!(activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable || activeEl.closest('[contenteditable="true"]')));
}
function hasModifierKey(event) {
  return event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
}
function initializeKeybinds() {
  console.log(`APES QoL ${window.APES?.version || 'v2'}: Modular keybinds initialized.`);
  window.addEventListener('keydown', event => {
    if (isUserTyping()) {
      return;
    }
    if (hasModifierKey(event)) {
      return;
    }
    const code = event.code;
    if (isMapPage() && isMapKey(code)) {
      handleMapMovement(event);
      return;
    }
    if (!event.isTrusted) {
      return;
    }
    if (isMapPage() && code === 'KeyR') {
      event.preventDefault();
      handleHoverSendTroops();
      return;
    }
    const navKeys = ['Digit1', 'Numpad1', 'Digit2', 'Numpad2', 'Digit3', 'Numpad3', 'KeyQ', 'ArrowLeft', 'KeyE', 'ArrowRight', 'KeyB', 'KeyT', 'KeyC', 'KeyF', 'KeyV'];
    if (navKeys.includes(code)) {
      event.preventDefault();
      handleNavigation(code);
    }
  }, true);
  window.addEventListener('keyup', event => {
    if (isUserTyping()) {
      return;
    }
    if (hasModifierKey(event)) {
      return;
    }
    if (isMapPage() && isMapKey(event.code)) {
      handleMapMovement(event);
    }
  }, true);
}
initializeKeybinds();
