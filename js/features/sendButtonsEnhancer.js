function initSendButtonsEnhancer() {
  const FEATURE_KEY = 'sendTroopsEnhanced';
  const CLASS_NAME = 'qol-send-troops-enhanced-enabled';
  function isEnabled() {
    return typeof window.isQolEnabled === 'function' ? window.isQolEnabled(FEATURE_KEY) : true;
  }
  function syncState() {
    if (isEnabled()) {
      document.body.classList.add(CLASS_NAME);
    } else {
      document.body.classList.remove(CLASS_NAME);
    }
  }
  syncState();
  window.addEventListener('qol_setting_changed', e => {
    if (e.detail && e.detail.key === FEATURE_KEY) {
      syncState();
    }
  });
}
initSendButtonsEnhancer();
