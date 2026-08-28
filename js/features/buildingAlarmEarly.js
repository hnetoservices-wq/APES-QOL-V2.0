(() => {
    'use strict';

    const SETTING_KEY = 'qol_buildingAlarm';

    function applyEarlyState() {
        try {
            const enabled = localStorage.getItem(SETTING_KEY) !== 'false';
            document.documentElement?.classList.toggle(
                'qol-building-alarm-preenabled',
                enabled
            );
        } catch (_) {
            document.documentElement?.classList.add(
                'qol-building-alarm-preenabled'
            );
        }
    }

    applyEarlyState();

    window.addEventListener('qol_setting_changed', event => {
        if (event.detail?.key !== 'buildingAlarm') return;
        document.documentElement?.classList.toggle(
            'qol-building-alarm-preenabled',
            event.detail.enabled === true
        );
    });
})();
