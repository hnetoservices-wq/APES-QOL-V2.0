/**
 * Travian QoL Extension
 * Module: Page Navigation Keys (1-3, Q/E, Arrows, B, T/G, Z, X, C, F, V)
 * with Toggle Close & Action Triggers
 */

function navigateToRoute(routeParam) {
    let currentHash = window.location.hash;
    if (!currentHash.startsWith('#/')) currentHash = '#/';

    let parts = currentHash.substring(2).split('/').filter(Boolean);
    const [targetKey] = routeParam.split(':');

    if (targetKey === 'tab') {
        parts = parts.filter(part => !part.startsWith('subtab:'));
    } else if (targetKey === 'subtab') {
        parts = parts.filter(part => !part.startsWith('tab:'));
    }

    const existingIndex = parts.findIndex(part => part.startsWith(`${targetKey}:`));
    if (existingIndex !== -1) parts[existingIndex] = routeParam;
    else parts.push(routeParam);

    window.location.hash = `#/${parts.filter(Boolean).join('/')}`;
}

function openVillageWindow(windowName, beforeWindowParams = [], afterWindowParams = []) {
    const currentParts = window.location.hash.startsWith('#/')
        ? window.location.hash.substring(2).split('/').filter(Boolean)
        : [];

    const villageIdPart = currentParts.find(part => part.startsWith('villId:'));
    const nextParts = ['page:village'];

    if (villageIdPart) nextParts.push(villageIdPart);

    nextParts.push(...beforeWindowParams, `window:${windowName}`, ...afterWindowParams);
    window.location.hash = `#/${nextParts.join('/')}`;
}

function removeRouteParam(targetWindowName) {
    let currentHash = window.location.hash;
    if (!currentHash.startsWith('#/')) return;

    let parts = currentHash.substring(2).split('/');
    parts = parts.filter(part => {
        return part !== `window:${targetWindowName}` &&
            !part.startsWith('location:') &&
            !part.startsWith('cp:') &&
            !part.startsWith('herotab:') &&
            !part.startsWith('tab:') &&
            !part.startsWith('subtab:');
    });

    window.location.hash = `#/${parts.filter(Boolean).join('/')}`;
}

function clickSidebarElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.dispatchEvent(new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
    }));

    const icon = element.querySelector('i');
    if (icon) {
        icon.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
        }));
    }
}

function changeVillage(direction) {
    const navigationButtons = Array.from(document.querySelectorAll(
        `#villageList .navigation.${direction}`
    ));

    const navigationButton = navigationButtons.find(button => {
        const style = window.getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            bounds.width > 0 &&
            bounds.height > 0;
    }) || navigationButtons[0];

    if (!navigationButton) {
        console.warn(`[QoL] ${direction} village button not found.`);
        return;
    }

    const bounds = navigationButton.getBoundingClientRect();
    const eventOptions = {
        view: window,
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        clientX: bounds.left + (bounds.width / 2),
        clientY: bounds.top + (bounds.height / 2)
    };

    if (typeof PointerEvent === 'function') {
        navigationButton.dispatchEvent(new PointerEvent('pointerover', {
            ...eventOptions,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
        navigationButton.dispatchEvent(new PointerEvent('pointerdown', {
            ...eventOptions,
            buttons: 1,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
    }

    navigationButton.dispatchEvent(new MouseEvent('mouseover', eventOptions));
    navigationButton.dispatchEvent(new MouseEvent('mousedown', {
        ...eventOptions,
        buttons: 1
    }));

    if (typeof PointerEvent === 'function') {
        navigationButton.dispatchEvent(new PointerEvent('pointerup', {
            ...eventOptions,
            buttons: 0,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
    }

    navigationButton.dispatchEvent(new MouseEvent('mouseup', eventOptions));
    navigationButton.dispatchEvent(new MouseEvent('click', eventOptions));
}

function isVisibleNavigationTarget(element) {
    if (!element?.isConnected) return false;
    const style = window.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number.parseFloat(style.opacity || '1') > 0 &&
        bounds.width > 0 &&
        bounds.height > 0;
}

function getNavigationPointerOptions(element) {
    const bounds = element.getBoundingClientRect();
    return {
        view: window,
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
        clientX: bounds.left + (bounds.width / 2),
        clientY: bounds.top + (bounds.height / 2)
    };
}

function revealActiveBuildingQueueDetails(slot) {
    const options = getNavigationPointerOptions(slot);

    if (typeof PointerEvent === 'function') {
        slot.dispatchEvent(new PointerEvent('pointerover', {
            ...options,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
    }

    slot.dispatchEvent(new MouseEvent('mouseover', options));
    slot.dispatchEvent(new MouseEvent('mousemove', options));
}

function findActiveBuildingQueueSlot() {
    const selectors = [
        '.queueContainer.usedSlot.queueType1',
        '.queueContainer.usedSlot'
    ];

    for (const selector of selectors) {
        const visibleSlot = Array.from(document.querySelectorAll(selector))
            .find(isVisibleNavigationTarget);
        if (visibleSlot) return visibleSlot;
    }

    return null;
}

function describeInstantFinishCandidate(element) {
    const values = [
        element.id,
        element.className,
        element.textContent,
        element.getAttribute('title'),
        element.getAttribute('tooltip'),
        element.getAttribute('tooltip-translate'),
        element.getAttribute('aria-label'),
        element.getAttribute('clickable'),
        element.getAttribute('ng-click'),
        element.getAttribute('on-click'),
        element.getAttribute('on-pointer-up'),
        element.getAttribute('on-pointer-down')
    ];

    const child = element.querySelector?.('i,img,span');
    if (child) {
        values.push(
            child.id,
            child.className,
            child.getAttribute?.('title'),
            child.getAttribute?.('tooltip'),
            child.getAttribute?.('tooltip-translate'),
            child.getAttribute?.('aria-label')
        );
    }

    return values.filter(Boolean).map(String).join(' ').replace(/\s+/g, ' ').trim();
}

function scoreInstantFinishCandidate(element, slotBounds) {
    if (!isVisibleNavigationTarget(element)) return -10000;

    const bounds = element.getBoundingClientRect();
    const description = describeInstantFinishCandidate(element).toLowerCase();
    let score = 0;

    if (/(instant|finish|complete|finishnow|instantfinish|completenow|speedup|speed-up)/i.test(description)) score += 140;
    if (/(gold|masterbuilder|master builder)/i.test(description)) score += 35;
    if (/(construction|building|build)/i.test(description)) score += 15;
    if (/(cancel|abort|remove|delete|destroy|stop|close|dismiss)/i.test(description)) score -= 220;
    if (/(symbol_x|icon_x|closebutton|cancelbutton)/i.test(description)) score -= 220;

    if (bounds.width >= 18 && bounds.width <= 60 && bounds.height >= 18 && bounds.height <= 60) {
        score += 18;
    }
    if (bounds.left >= slotBounds.left + (slotBounds.width * 0.55)) score += 28;

    return score;
}

function findInstantFinishButton(slot) {
    const scope = slot.closest('[ng-include]') ||
        slot.closest('.buildingQueue') ||
        slot.parentElement ||
        document.body;

    const selector = [
        '[clickable]',
        '[ng-click]',
        '[on-click]',
        '[on-pointer-up]',
        '[on-pointer-down]',
        'button',
        'a',
        '[role="button"]'
    ].join(',');

    const slotBounds = slot.getBoundingClientRect();
    const candidates = Array.from(scope.querySelectorAll(selector))
        .filter(element => element !== slot)
        .map(element => ({
            element,
            score: scoreInstantFinishCandidate(element, slotBounds),
            description: describeInstantFinishCandidate(element)
        }))
        .filter(candidate => candidate.score > -100)
        .sort((a, b) => b.score - a.score);

    const semanticMatch = candidates.find(candidate => candidate.score >= 100);
    if (semanticMatch) return semanticMatch.element;

    const positionalMatch = candidates.find(candidate => {
        const bounds = candidate.element.getBoundingClientRect();
        const description = candidate.description.toLowerCase();
        return candidate.score >= 35 &&
            bounds.left >= slotBounds.left + (slotBounds.width * 0.55) &&
            !/(cancel|abort|remove|delete|destroy|stop|close|dismiss|symbol_x|icon_x)/i.test(description);
    });

    if (positionalMatch) return positionalMatch.element;

    console.warn('[APES Instant Finish] Instant-finish button could not be identified safely.');
    console.table(candidates.slice(0, 12).map(candidate => {
        const bounds = candidate.element.getBoundingClientRect();
        return {
            score: candidate.score,
            description: candidate.description,
            tag: candidate.element.tagName,
            left: Math.round(bounds.left),
            top: Math.round(bounds.top),
            width: Math.round(bounds.width),
            height: Math.round(bounds.height)
        };
    }));

    return null;
}

function clickInstantFinishButton(button) {
    const options = getNavigationPointerOptions(button);

    if (typeof PointerEvent === 'function') {
        button.dispatchEvent(new PointerEvent('pointerdown', {
            ...options,
            buttons: 1,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
    }

    button.dispatchEvent(new MouseEvent('mousedown', {
        ...options,
        buttons: 1
    }));

    if (typeof PointerEvent === 'function') {
        button.dispatchEvent(new PointerEvent('pointerup', {
            ...options,
            buttons: 0,
            pointerId: 1,
            pointerType: 'mouse',
            isPrimary: true
        }));
    }

    button.dispatchEvent(new MouseEvent('mouseup', options));
    button.dispatchEvent(new MouseEvent('click', options));
}

function findHoveredInstantFinishBubble() {
    return Array.from(document.querySelectorAll('.buildingBubble.clickable:hover'))
        .find(bubble =>
            isVisibleNavigationTarget(bubble) &&
            !bubble.classList.contains('disabled') &&
            !bubble.querySelector('.colorLayer.notAtAll')
        ) || null;
}

async function triggerInstantFinish() {
    // On the village view, Travian exposes the hover action as the clickable
    // building bubble itself. Prefer that target when the cursor is over it.
    const bubble = findHoveredInstantFinishBubble();
    if (bubble) {
        clickInstantFinishButton(bubble);
        return;
    }

    await triggerInstantFinishBuildingQueue();
}

async function triggerInstantFinishBuildingQueue() {
    const slot = findActiveBuildingQueueSlot();
    if (!slot) {
        console.warn('[APES Instant Finish] No active building queue slot found.');
        return;
    }

    revealActiveBuildingQueueDetails(slot);
    await new Promise(resolve => window.setTimeout(resolve, 80));

    const button = findInstantFinishButton(slot);
    if (button) clickInstantFinishButton(button);
}

let modifiersActive = false;

window.addEventListener('keydown', (event) => {
    modifiersActive = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
}, true);

window.addEventListener('keyup', (event) => {
    modifiersActive = event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
}, true);

function isKeybindEnabled(actionKey) {
    const setting = localStorage.getItem(`qol_keybind_${actionKey}`);
    return setting !== 'false';
}

function ensureInstantFinishKeybindMenuEntry() {
    const grid = document.querySelector('#qol-modal .qol-keybind-grid');
    if (!grid || document.getElementById('qol-keybind-instant-finish')) return;

    const row = document.createElement('div');
    row.id = 'qol-keybind-instant-finish';
    row.className = 'qol-keybind-item';
    row.innerHTML = `
        <div class="qol-key-combo"><span class="qol-kbd">B</span></div>
        <span class="qol-keybind-action">Instant Finish Building / Queue</span>
        <label class="qol-switch" title="Toggle Instant Finish Building / Queue shortcut">
            <input type="checkbox" id="qol-chk-instant-finish" class="qol-checkbox">
            <span class="qol-switch-track" aria-hidden="true"></span>
            <span class="qol-visually-hidden">Toggle Instant Finish Building / Queue shortcut</span>
        </label>
    `;

    grid.appendChild(row);

    const checkbox = row.querySelector('#qol-chk-instant-finish');
    checkbox.checked = isKeybindEnabled('instantFinish');
    checkbox.addEventListener('change', event => {
        try {
            localStorage.setItem('qol_keybind_instantFinish', String(Boolean(event.target.checked)));
        } catch (error) {
            console.warn('[APES Instant Finish] Could not save keybind setting.', error);
        }
    });

    const count = document.querySelector('#qol-modal .qol-keybind-heading .qol-section-count');
    if (count) count.textContent = `${grid.querySelectorAll('.qol-keybind-item').length} shortcuts`;
}

function handleNavigation(code) {
    const legacyModifierEvent = window.event;

    if (
        modifiersActive ||
        (
            legacyModifierEvent &&
            (
                legacyModifierEvent.ctrlKey ||
                legacyModifierEvent.altKey ||
                legacyModifierEvent.metaKey ||
                legacyModifierEvent.shiftKey
            )
        )
    ) {
        return;
    }

    const activeElement = document.activeElement;

    if (activeElement) {
        const tagName = activeElement.tagName.toUpperCase();
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;
        if (activeElement.isContentEditable || activeElement.getAttribute('contenteditable') === 'true') return;

        const role = activeElement.getAttribute('role');
        if (role === 'textbox' || role === 'searchbox') return;

        if (
            activeElement.closest('.chat') ||
            activeElement.closest('.message') ||
            activeElement.closest('.input')
        ) {
            return;
        }
    }

    const currentHash = window.location.hash;

    switch (code) {
        case 'Digit1':
        case 'Numpad1':
            if (isKeybindEnabled('village')) window.location.hash = '#/page:village';
            break;

        case 'Digit2':
        case 'Numpad2':
            if (isKeybindEnabled('resources')) window.location.hash = '#/page:resources';
            break;

        case 'Digit3':
        case 'Numpad3':
            if (isKeybindEnabled('map')) window.location.hash = '#/page:map';
            break;

        case 'KeyQ':
        case 'ArrowLeft':
            if (isKeybindEnabled('previousVillage')) changeVillage('previous');
            break;

        case 'KeyE':
        case 'ArrowRight':
            if (isKeybindEnabled('nextVillage')) changeVillage('next');
            break;

        case 'KeyB':
            if (isKeybindEnabled('instantFinish')) {
                void triggerInstantFinish();
            }
            break;

        case 'KeyT':
            if (isKeybindEnabled('rallyPoint')) {
                const rallyPointIsOpen =
                    currentHash.includes('window:building') &&
                    currentHash.includes('location:32') &&
                    !currentHash.includes('tab:FarmList');

                if (rallyPointIsOpen) {
                    removeRouteParam('building');
                } else {
                    const cpMatch = currentHash.match(/cp:([^/]+)/);
                    const activeCp = cpMatch ? cpMatch[1] : '1';
                    openVillageWindow('building', ['location:32'], [`cp:${activeCp}`]);
                }
            }
            break;

        case 'KeyC':
            if (isKeybindEnabled('conversations')) {
                if (currentHash.includes('window:igm')) removeRouteParam('igm');
                else {
                    navigateToRoute('window:igm');
                    clickSidebarElement('jsQuestButtonIgm');
                }
            }
            break;

        case 'KeyF':
            if (isKeybindEnabled('reports')) {
                if (currentHash.includes('window:reports')) {
                    removeRouteParam('reports');
                } else {
                    const cpMatch = currentHash.match(/cp:([^/]+)/);
                    const activeCp = cpMatch ? cpMatch[1] : '1';
                    navigateToRoute(`cp:${activeCp}`);
                    navigateToRoute('window:reports');
                }
            }
            break;

        case 'KeyV':
            if (isKeybindEnabled('villagesOverview')) {
                if (currentHash.includes('window:villagesOverview')) removeRouteParam('villagesOverview');
                else navigateToRoute('window:villagesOverview');
            }
            break;
    }
}

ensureInstantFinishKeybindMenuEntry();
window.setInterval(ensureInstantFinishKeybindMenuEntry, 1200);