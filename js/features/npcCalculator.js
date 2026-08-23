(function initNpcCalculatorModule() {
    'use strict';

    const FEATURE_KEY = 'npcCalculator';
    const PANEL_ID = 'qol-calc-container';
    const TOGGLE_ID = 'qol-npc-calc-toggle-btn';
    const STYLE_ID = 'qol-npc-calculator-styles';

    let calcContainer = null;
    let calcToggleButton = null;

    const openDropdowns = new Set();

    const ALL_TRIBE_UNITS = {
        romans: {
            name: 'Roman',
            units: [
                {
                    name: 'Legionnaire',
                    wood: 75,
                    clay: 50,
                    iron: 100,
                    building: 'barracks'
                },
                {
                    name: 'Praetorian',
                    wood: 80,
                    clay: 100,
                    iron: 160,
                    building: 'barracks'
                },
                {
                    name: 'Imperian',
                    wood: 100,
                    clay: 110,
                    iron: 140,
                    building: 'barracks'
                },
                {
                    name: 'Equites Legati',
                    wood: 100,
                    clay: 140,
                    iron: 10,
                    building: 'stables'
                },
                {
                    name: 'Equites Imperatoris',
                    wood: 350,
                    clay: 260,
                    iron: 180,
                    building: 'stables'
                },
                {
                    name: 'Equites Caesaris',
                    wood: 280,
                    clay: 340,
                    iron: 600,
                    building: 'stables'
                },
                {
                    name: 'Battering Ram',
                    wood: 700,
                    clay: 180,
                    iron: 400,
                    building: 'workshop'
                },
                {
                    name: 'Fire Catapult',
                    wood: 690,
                    clay: 1000,
                    iron: 400,
                    building: 'workshop'
                }
            ]
        },

        teutons: {
            name: 'Teuton',
            units: [
                {
                    name: 'Clubswinger',
                    wood: 85,
                    clay: 65,
                    iron: 30,
                    building: 'barracks'
                },
                {
                    name: 'Spearfighter',
                    wood: 125,
                    clay: 50,
                    iron: 65,
                    building: 'barracks'
                },
                {
                    name: 'Axefighter',
                    wood: 80,
                    clay: 65,
                    iron: 130,
                    building: 'barracks'
                },
                {
                    name: 'Scout',
                    wood: 140,
                    clay: 80,
                    iron: 30,
                    building: 'barracks'
                },
                {
                    name: 'Paladin',
                    wood: 330,
                    clay: 170,
                    iron: 200,
                    building: 'stables'
                },
                {
                    name: 'Teutonic Knight',
                    wood: 280,
                    clay: 320,
                    iron: 260,
                    building: 'stables'
                },
                {
                    name: 'Ram',
                    wood: 800,
                    clay: 150,
                    iron: 250,
                    building: 'workshop'
                },
                {
                    name: 'Catapult',
                    wood: 660,
                    clay: 900,
                    iron: 370,
                    building: 'workshop'
                }
            ]
        },

        gauls: {
            name: 'Gaul',
            units: [
                {
                    name: 'Phalanx',
                    wood: 85,
                    clay: 100,
                    iron: 50,
                    building: 'barracks'
                },
                {
                    name: 'Swordsman',
                    wood: 95,
                    clay: 60,
                    iron: 140,
                    building: 'barracks'
                },
                {
                    name: 'Pathfinder',
                    wood: 140,
                    clay: 110,
                    iron: 20,
                    building: 'stables'
                },
                {
                    name: 'Theutates Thunder',
                    wood: 200,
                    clay: 280,
                    iron: 130,
                    building: 'stables'
                },
                {
                    name: 'Druidrider',
                    wood: 300,
                    clay: 270,
                    iron: 190,
                    building: 'stables'
                },
                {
                    name: 'Haeduan',
                    wood: 300,
                    clay: 380,
                    iron: 440,
                    building: 'stables'
                },
                {
                    name: 'Ram',
                    wood: 750,
                    clay: 370,
                    iron: 220,
                    building: 'workshop'
                },
                {
                    name: 'Trebuchet',
                    wood: 590,
                    clay: 1200,
                    iron: 400,
                    building: 'workshop'
                }
            ]
        }
    };

    const SIEGE_UNITS = new Set([
        'Battering Ram',
        'Fire Catapult',
        'Ram',
        'Trebuchet',
        'Catapult'
    ]);

    const FEALTY_BUILDING_DISCOUNTS = {
        8: {
            workshop: 0.03,
            stables: 0,
            barracks: 0
        },
        9: {
            workshop: 0.035,
            stables: 0.035,
            barracks: 0
        },
        10: {
            workshop: 0.04,
            stables: 0.04,
            barracks: 0.04
        },
        11: {
            workshop: 0.045,
            stables: 0.045,
            barracks: 0.045
        },
        12: {
            workshop: 0.05,
            stables: 0.05,
            barracks: 0.05
        },
        13: {
            workshop: 0.055,
            stables: 0.055,
            barracks: 0.055
        },
        14: {
            workshop: 0.06,
            stables: 0.06,
            barracks: 0.06
        },
        15: {
            workshop: 0.065,
            stables: 0.065,
            barracks: 0.065
        },
        16: {
            workshop: 0.07,
            stables: 0.07,
            barracks: 0.07
        },
        17: {
            workshop: 0.075,
            stables: 0.075,
            barracks: 0.075
        },
        18: {
            workshop: 0.08,
            stables: 0.08,
            barracks: 0.08
        },
        19: {
            workshop: 0.085,
            stables: 0.085,
            barracks: 0.085
        },
        20: {
            workshop: 0.09,
            stables: 0.09,
            barracks: 0.09
        }
    };

    function isEnabled() {
        return typeof window.isQolEnabled === 'function'
            ? window.isQolEnabled(FEATURE_KEY) === true
            : true;
    }

    function formatNumber(value) {
        return Number(value || 0).toLocaleString();
    }

    function closeAllDropdowns() {
        openDropdowns.forEach(dropdown => {
            if (
                dropdown &&
                typeof dropdown.close === 'function'
            ) {
                dropdown.close();
            }
        });
    }

    function createCustomDropdown({
        options,
        value,
        onChange,
        width = '100%',
        ariaLabel = 'Select option'
    }) {
        let availableOptions =
            Array.isArray(options)
                ? options.slice()
                : [];

        let currentValue = value;

        const container =
            document.createElement('div');

        container.className =
            'qol-calc-dropdown';

        container.style.setProperty(
            'width',
            width,
            'important'
        );

        const trigger =
            document.createElement('div');

        trigger.className =
            'qol-calc-dropdown-trigger';

        trigger.setAttribute(
            'role',
            'button'
        );

        trigger.setAttribute(
            'tabindex',
            '0'
        );

        trigger.setAttribute(
            'aria-haspopup',
            'listbox'
        );

        trigger.setAttribute(
            'aria-expanded',
            'false'
        );

        trigger.setAttribute(
            'aria-label',
            ariaLabel
        );

        const label =
            document.createElement('span');

        label.className =
            'qol-calc-dropdown-label';

        const arrow =
            document.createElement('span');

        arrow.className =
            'qol-calc-dropdown-arrow';

        arrow.textContent = '▼';

        trigger.appendChild(label);
        trigger.appendChild(arrow);
        container.appendChild(trigger);

        const menu =
            document.createElement('div');

        menu.className =
            'qol-calc-dropdown-menu';

        menu.setAttribute(
            'role',
            'listbox'
        );

        document.body.appendChild(menu);

        function getSelectedOption() {
            return (
                availableOptions.find(option => {
                    return (
                        option.value ===
                        currentValue
                    );
                }) ||
                availableOptions[0] ||
                {
                    value: '',
                    label: ''
                }
            );
        }

        function syncLabel() {
            const selected =
                getSelectedOption();

            currentValue =
                selected.value;

            label.textContent =
                selected.label;

            trigger.title =
                selected.label;
        }

        function close() {
            menu.style.setProperty(
                'display',
                'none',
                'important'
            );

            trigger.setAttribute(
                'aria-expanded',
                'false'
            );
        }

        function positionMenu() {
            const rectangle =
                trigger.getBoundingClientRect();

            menu.style.setProperty(
                'display',
                'block',
                'important'
            );

            menu.style.setProperty(
                'width',
                `${rectangle.width}px`,
                'important'
            );

            menu.style.setProperty(
                'left',
                `${rectangle.left}px`,
                'important'
            );

            const menuHeight =
                menu.offsetHeight || 180;

            const spaceBelow =
                window.innerHeight -
                rectangle.bottom;

            const top =
                spaceBelow >= menuHeight + 8
                    ? rectangle.bottom + 3
                    : Math.max(
                        8,
                        rectangle.top -
                        menuHeight -
                        3
                    );

            menu.style.setProperty(
                'top',
                `${top}px`,
                'important'
            );
        }

        function choose(option) {
            currentValue =
                option.value;

            syncLabel();
            renderOptions();
            close();

            if (
                typeof onChange ===
                'function'
            ) {
                onChange(
                    currentValue,
                    option
                );
            }
        }

        function renderOptions() {
            menu.innerHTML = '';

            availableOptions.forEach(option => {
                const item =
                    document.createElement(
                        'div'
                    );

                item.className =
                    'qol-calc-dropdown-option';

                item.setAttribute(
                    'role',
                    'option'
                );

                item.setAttribute(
                    'tabindex',
                    '0'
                );

                item.setAttribute(
                    'aria-selected',
                    option.value === currentValue
                        ? 'true'
                        : 'false'
                );

                item.textContent =
                    option.label;

                if (
                    option.value ===
                    currentValue
                ) {
                    item.classList.add(
                        'selected'
                    );
                }

                function activate(event) {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(option);
                }

                item.addEventListener(
                    'click',
                    activate
                );

                item.addEventListener(
                    'keydown',
                    event => {
                        if (
                            event.key ===
                                'Enter' ||
                            event.key ===
                                ' '
                        ) {
                            activate(event);
                        }
                    }
                );

                menu.appendChild(item);
            });
        }

        function open() {
            closeAllDropdowns();
            renderOptions();
            positionMenu();

            trigger.setAttribute(
                'aria-expanded',
                'true'
            );

            openDropdowns.add(
                container
            );
        }

        function toggle(event) {
            event.preventDefault();
            event.stopPropagation();

            const isOpen =
                menu.style.display ===
                'block';

            if (isOpen) {
                close();
            } else {
                open();
            }
        }

        function handleDocumentClick(
            event
        ) {
            if (
                !container.contains(
                    event.target
                ) &&
                !menu.contains(
                    event.target
                )
            ) {
                close();
            }
        }

        function handleEscape(event) {
            if (
                event.key ===
                'Escape'
            ) {
                close();
            }
        }

        trigger.addEventListener(
            'click',
            toggle
        );

        trigger.addEventListener(
            'keydown',
            event => {
                if (
                    event.key ===
                        'Enter' ||
                    event.key ===
                        ' '
                ) {
                    toggle(event);
                }

                if (
                    event.key ===
                    'ArrowDown'
                ) {
                    event.preventDefault();
                    open();

                    menu
                        .querySelector(
                            '.qol-calc-dropdown-option'
                        )
                        ?.focus();
                }
            }
        );

        document.addEventListener(
            'click',
            handleDocumentClick,
            true
        );

        document.addEventListener(
            'keydown',
            handleEscape,
            true
        );

        window.addEventListener(
            'resize',
            close
        );

        window.addEventListener(
            'scroll',
            close,
            true
        );

        container.getValue =
            () => currentValue;

        container.setValue =
            newValue => {
                const found =
                    availableOptions.find(
                        option => {
                            return (
                                option.value ===
                                newValue
                            );
                        }
                    );

                if (found) {
                    currentValue =
                        found.value;

                    syncLabel();
                    renderOptions();
                }
            };

        container.updateOptions =
            (
                newOptions,
                preferredValue
            ) => {
                availableOptions =
                    Array.isArray(newOptions)
                        ? newOptions.slice()
                        : [];

                const found =
                    availableOptions.find(
                        option => {
                            return (
                                option.value ===
                                (
                                    preferredValue ||
                                    currentValue
                                )
                            );
                        }
                    ) ||
                    availableOptions[0];

                currentValue =
                    found
                        ? found.value
                        : '';

                syncLabel();
                renderOptions();
            };

        container.close = close;

        container.destroy = () => {
            close();

            openDropdowns.delete(
                container
            );

            document.removeEventListener(
                'click',
                handleDocumentClick,
                true
            );

            document.removeEventListener(
                'keydown',
                handleEscape,
                true
            );

            window.removeEventListener(
                'resize',
                close
            );

            window.removeEventListener(
                'scroll',
                close,
                true
            );

            menu.remove();
        };

        syncLabel();
        renderOptions();

        return container;
    }

    function isSiegeUnit(unitName) {
        return SIEGE_UNITS.has(
            unitName
        );
    }

    function getVillageResources() {
        function parseResource(
            type,
            fallbackNumber
        ) {
            const stockContainer =
                document.querySelector(
                    `.stockContainer.${type}`
                );

            if (stockContainer) {
                const progressBar =
                    stockContainer.querySelector(
                        '[progressbar]'
                    );

                const progressValue =
                    progressBar?.getAttribute(
                        'value'
                    );

                if (progressValue) {
                    const parsed =
                        Number.parseInt(
                            progressValue,
                            10
                        );

                    if (
                        Number.isFinite(
                            parsed
                        )
                    ) {
                        return parsed;
                    }
                }

                const amountElement =
                    stockContainer.querySelector(
                        '.amount, .wrapper'
                    );

                if (amountElement) {
                    const cleaned =
                        (
                            amountElement
                                .textContent ||
                            ''
                        ).replace(
                            /[^\d]/g,
                            ''
                        );

                    const parsed =
                        Number.parseInt(
                            cleaned,
                            10
                        );

                    if (
                        Number.isFinite(
                            parsed
                        )
                    ) {
                        return parsed;
                    }
                }
            }

            const fallbackElement =
                document.querySelector(
                    `#stockBarResource${fallbackNumber}`
                );

            if (fallbackElement) {
                const cleaned =
                    (
                        fallbackElement
                            .textContent ||
                        ''
                    ).replace(
                        /[^\d]/g,
                        ''
                    );

                const parsed =
                    Number.parseInt(
                        cleaned,
                        10
                    );

                if (
                    Number.isFinite(
                        parsed
                    )
                ) {
                    return parsed;
                }
            }

            return 0;
        }

        const wood =
            parseResource(
                'wood',
                1
            );

        const clay =
            parseResource(
                'clay',
                2
            );

        const iron =
            parseResource(
                'iron',
                3
            );

        const crop =
            parseResource(
                'crop',
                4
            );

        return {
            wood,
            clay,
            iron,
            crop,
            total:
                wood +
                clay +
                iron +
                crop
        };
    }

    function detectUserTribe() {
        const pageHtml =
            document
                .documentElement
                .outerHTML ||
            document.body.innerHTML ||
            '';

        if (
            document.querySelector(
                '.tribe1, ' +
                '.nation1, ' +
                '[class*="nation1"], ' +
                '[class*="tribe1"], ' +
                '.unit_u1'
            ) ||
            pageHtml.includes(
                'tribe1'
            ) ||
            pageHtml.includes(
                'nation1'
            )
        ) {
            return 'romans';
        }

        if (
            document.querySelector(
                '.tribe2, ' +
                '.nation2, ' +
                '[class*="nation2"], ' +
                '[class*="tribe2"], ' +
                '.unit_u11'
            ) ||
            pageHtml.includes(
                'tribe2'
            ) ||
            pageHtml.includes(
                'nation2'
            )
        ) {
            return 'teutons';
        }

        if (
            document.querySelector(
                '.tribe3, ' +
                '.nation3, ' +
                '[class*="nation3"], ' +
                '[class*="tribe3"], ' +
                '.unit_u21'
            ) ||
            pageHtml.includes(
                'tribe3'
            ) ||
            pageHtml.includes(
                'nation3'
            )
        ) {
            return 'gauls';
        }

        return 'romans';
    }

    function getFealtyDiscount(
        fealty,
        unit
    ) {
        const building =
            unit?.building ||
            'barracks';

        const levelData =
            FEALTY_BUILDING_DISCOUNTS[
                fealty
            ];

        if (
            levelData &&
            typeof levelData[
                building
            ] === 'number'
        ) {
            return levelData[
                building
            ];
        }

        return 0;
    }

    function calculateUnitEffectiveResourceCosts(
        unit,
        fealtyLevel,
        isGsGb
    ) {
        const fealty =
            Math.min(
                20,
                Math.max(
                    1,
                    Number.parseInt(
                        fealtyLevel,
                        10
                    ) ||
                    1
                )
            );

        const discount =
            getFealtyDiscount(
                fealty,
                unit
            );

        const factor =
            1 - discount;

        const multiplier =
            isGsGb
                ? 3
                : 1;

        const wood =
            Math.floor(
                (
                    unit?.wood ||
                    0
                ) *
                factor
            ) *
            multiplier;

        const clay =
            Math.floor(
                (
                    unit?.clay ||
                    0
                ) *
                factor
            ) *
            multiplier;

        const iron =
            Math.floor(
                (
                    unit?.iron ||
                    0
                ) *
                factor
            ) *
            multiplier;

        const crop =
            Math.floor(
                (
                    unit?.crop ||
                    0
                ) *
                factor
            ) *
            multiplier;

        return {
            wood,
            clay,
            iron,
            crop,

            total:
                wood +
                clay +
                iron +
                crop
        };
    }

    function makeDraggable(
        element,
        handle
    ) {
        handle.addEventListener(
            'pointerdown',
            event => {
                if (
                    event.target.closest(
                        '.qol-calc-close'
                    )
                ) {
                    return;
                }

                event.preventDefault();
                event.stopPropagation();

                const startX =
                    event.clientX;

                const startY =
                    event.clientY;

                const rectangle =
                    element
                        .getBoundingClientRect();

                const initialLeft =
                    rectangle.left;

                const initialTop =
                    rectangle.top;

                element.style.setProperty(
                    'transform',
                    'none',
                    'important'
                );

                element.style.setProperty(
                    'left',
                    `${initialLeft}px`,
                    'important'
                );

                element.style.setProperty(
                    'top',
                    `${initialTop}px`,
                    'important'
                );

                element.style.setProperty(
                    'right',
                    'auto',
                    'important'
                );

                element.style.setProperty(
                    'bottom',
                    'auto',
                    'important'
                );

                try {
                    handle.setPointerCapture(
                        event.pointerId
                    );
                } catch (error) {
                    // Pointer capture is optional.
                }

                function handleMove(
                    moveEvent
                ) {
                    moveEvent.preventDefault();

                    const nextLeft =
                        Math.max(
                            0,
                            Math.min(
                                window.innerWidth -
                                70,

                                initialLeft +
                                moveEvent.clientX -
                                startX
                            )
                        );

                    const nextTop =
                        Math.max(
                            0,
                            Math.min(
                                window.innerHeight -
                                40,

                                initialTop +
                                moveEvent.clientY -
                                startY
                            )
                        );

                    element.style.setProperty(
                        'left',
                        `${nextLeft}px`,
                        'important'
                    );

                    element.style.setProperty(
                        'top',
                        `${nextTop}px`,
                        'important'
                    );
                }

                function handleUp(
                    upEvent
                ) {
                    try {
                        handle
                            .releasePointerCapture(
                                upEvent.pointerId
                            );
                    } catch (error) {
                        // Pointer capture may already be released.
                    }

                    handle.removeEventListener(
                        'pointermove',
                        handleMove
                    );

                    handle.removeEventListener(
                        'pointerup',
                        handleUp
                    );
                }

                handle.addEventListener(
                    'pointermove',
                    handleMove
                );

                handle.addEventListener(
                    'pointerup',
                    handleUp
                );
            }
        );
    }

    function positionPanel() {
        if (!calcContainer) {
            return;
        }

        const cogButton =
            document.getElementById(
                'qol-cog-btn'
            );

        if (!cogButton) {
            calcContainer
                .style
                .setProperty(
                    'left',
                    '20px',
                    'important'
                );

            calcContainer
                .style
                .setProperty(
                    'top',
                    '80px',
                    'important'
                );

            return;
        }

        const rectangle =
            cogButton
                .getBoundingClientRect();

        const panelWidth =
            calcContainer
                .offsetWidth ||
            920;

        const panelHeight =
            calcContainer
                .offsetHeight ||
            560;

        const maximumLeft =
            Math.max(
                10,
                window.innerWidth -
                panelWidth -
                10
            );

        const maximumTop =
            Math.max(
                10,
                window.innerHeight -
                panelHeight -
                10
            );

        const left =
            Math.max(
                10,
                Math.min(
                    rectangle.left,
                    maximumLeft
                )
            );

        const top =
            Math.max(
                10,
                Math.min(
                    rectangle.bottom +
                    20,
                    maximumTop
                )
            );

        calcContainer
            .style
            .setProperty(
                'position',
                'fixed',
                'important'
            );

        calcContainer
            .style
            .setProperty(
                'left',
                `${left}px`,
                'important'
            );

        calcContainer
            .style
            .setProperty(
                'top',
                `${top}px`,
                'important'
            );

        calcContainer
            .style
            .setProperty(
                'right',
                'auto',
                'important'
            );

        calcContainer
            .style
            .setProperty(
                'bottom',
                'auto',
                'important'
            );

        calcContainer
            .style
            .setProperty(
                'transform',
                'none',
                'important'
            );
    }

    function setStatus(
        message,
        tone = 'neutral'
    ) {
        const statusElement =
            calcContainer
                ?.querySelector(
                    '#qol-calc-status'
                );

        if (!statusElement) {
            return;
        }

        statusElement.textContent =
            message;

        statusElement.dataset.tone =
            tone;
    }

    function updateRowGsGbState(
        row
    ) {
        if (!row.unitDropdown) {
            return;
        }

        const selectedUnitName =
            row.unitDropdown
                .getValue();

        const checkbox =
            row.querySelector(
                '.qol-calc-gbgs-check'
            );

        const label =
            row.querySelector(
                '.qol-calc-mode-label'
            );

        const isSiege =
            isSiegeUnit(
                selectedUnitName
            );

        if (
            !checkbox ||
            !label
        ) {
            return;
        }

        row.classList.toggle(
            'qol-calc-siege-row',
            isSiege
        );

        if (isSiege) {
            checkbox.checked =
                false;

            checkbox.disabled =
                true;

            label.textContent =
                'Siege';

            label.title =
                'Great Barracks and Great Stable do not apply to siege units.';
        } else {
            checkbox.disabled =
                false;

            label.textContent =
                checkbox.checked
                    ? 'GS/GB'
                    : 'Normal';

            label.title =
                checkbox.checked
                    ? 'Three times the normal resource cost.'
                    : 'Normal training building cost.';
        }
    }

    function updateCalculations() {
        if (!calcContainer) {
            return;
        }

        const resources =
            getVillageResources();

        const fealtyInput =
            calcContainer
                .querySelector(
                    '#qol-calc-fealty-input'
                );

        const fealty =
            Math.min(
                20,
                Math.max(
                    1,
                    Number.parseInt(
                        fealtyInput
                            ?.value ||
                        '1',
                        10
                    ) ||
                    1
                )
            );

        const resourceValues = {
            wood:
                resources.wood,

            clay:
                resources.clay,

            iron:
                resources.iron,

            crop:
                resources.crop,

            total:
                resources.total
        };

        Object
            .entries(
                resourceValues
            )
            .forEach(
                (
                    [
                        key,
                        value
                    ]
                ) => {
                    const element =
                        calcContainer
                            .querySelector(
                                `#qol-calc-res-${key}`
                            );

                    if (element) {
                        element.textContent =
                            formatNumber(
                                value
                            );
                    }
                }
            );

        const tribeKey =
            calcContainer
                .tribeDropdown
                ? calcContainer
                    .tribeDropdown
                    .getValue()
                : 'romans';

        const tribeUnits =
            (
                ALL_TRIBE_UNITS[
                    tribeKey
                ] ||
                ALL_TRIBE_UNITS
                    .romans
            ).units;

        let remainingResources =
            resources.total;

        let totalCostAllRows =
            0;

        let totalUnitsPlanned =
            0;

        let distributionWood =
            0;

        let distributionClay =
            0;

        let distributionIron =
            0;

        let distributionCrop =
            0;

        const rows =
            Array.from(
                calcContainer
                    .querySelectorAll(
                        '.qol-calc-entry-row'
                    )
            );

        rows.forEach(
            (
                row,
                index
            ) => {
                const maxElement =
                    row.querySelector(
                        '.qol-calc-max-trainable'
                    );

                const trainInput =
                    row.querySelector(
                        '.qol-calc-train-input'
                    );

                const costElement =
                    row.querySelector(
                        '.qol-calc-cost'
                    );

                if (
                    !row.unitDropdown ||
                    !maxElement ||
                    !trainInput ||
                    !costElement
                ) {
                    return;
                }

                const selectedUnitName =
                    row.unitDropdown
                        .getValue();

                const unit =
                    tribeUnits.find(
                        candidate => {
                            return (
                                candidate.name ===
                                selectedUnitName
                            );
                        }
                    ) ||
                    tribeUnits[0];

                updateRowGsGbState(
                    row
                );

                const checkbox =
                    row.querySelector(
                        '.qol-calc-gbgs-check'
                    );

                const isGsGb =
                    Boolean(
                        checkbox &&
                        checkbox.checked &&
                        !checkbox.disabled
                    );

                const costs =
                    calculateUnitEffectiveResourceCosts(
                        unit,
                        fealty,
                        isGsGb
                    );

                const resourcesForMaximum =
                    index === 0
                        ? resources.total
                        : Math.max(
                            0,
                            remainingResources
                        );

                const maximumTrainable =
                    costs.total > 0
                        ? Math.floor(
                            resourcesForMaximum /
                            costs.total
                        )
                        : 0;

                maxElement.textContent =
                    formatNumber(
                        maximumTrainable
                    );

                maxElement.title =
                    `${formatNumber(
                        costs.total
                    )} total resources per unit`;

                trainInput.max =
                    String(
                        maximumTrainable
                    );

                let plannedUnits =
                    Number.parseInt(
                        trainInput.value,
                        10
                    ) ||
                    0;

                plannedUnits =
                    Math.max(
                        0,
                        plannedUnits
                    );

                if (
                    plannedUnits >
                    maximumTrainable
                ) {
                    plannedUnits =
                        maximumTrainable;

                    trainInput.value =
                        String(
                            plannedUnits
                        );
                }

                const rowCost =
                    costs.total *
                    plannedUnits;

                costElement.textContent =
                    formatNumber(
                        rowCost
                    );

                costElement.title =
                    [
                        `${formatNumber(
                            costs.wood *
                            plannedUnits
                        )} wood`,

                        `${formatNumber(
                            costs.clay *
                            plannedUnits
                        )} clay`,

                        `${formatNumber(
                            costs.iron *
                            plannedUnits
                        )} iron`,

                        `${formatNumber(
                            costs.crop *
                            plannedUnits
                        )} crop`
                    ].join(' · ');

                totalCostAllRows +=
                    rowCost;

                totalUnitsPlanned +=
                    plannedUnits;

                remainingResources -=
                    rowCost;

                distributionWood +=
                    costs.wood *
                    plannedUnits;

                distributionClay +=
                    costs.clay *
                    plannedUnits;

                distributionIron +=
                    costs.iron *
                    plannedUnits;

                distributionCrop +=
                    costs.crop *
                    plannedUnits;
            }
        );

        const remaining =
            Math.max(
                0,
                resources.total -
                totalCostAllRows
            );

        const remainingElement =
            calcContainer
                .querySelector(
                    '#qol-calc-res-remaining'
                );

        const plannedElement =
            calcContainer
                .querySelector(
                    '#qol-calc-plan-total'
                );

        if (remainingElement) {
            remainingElement.textContent =
                formatNumber(
                    remaining
                );
        }

        if (plannedElement) {
            plannedElement.textContent =
                formatNumber(
                    totalUnitsPlanned
                );
        }

        const distributionValues = {
            wood:
                distributionWood,

            clay:
                distributionClay,

            iron:
                distributionIron,

            crop:
                distributionCrop,

            total:
                totalCostAllRows
        };

        Object
            .entries(
                distributionValues
            )
            .forEach(
                (
                    [
                        key,
                        value
                    ]
                ) => {
                    const element =
                        calcContainer
                            .querySelector(
                                `#qol-calc-dist-${key}`
                            );

                    if (element) {
                        element.textContent =
                            formatNumber(
                                value
                            );
                    }
                }
            );

        if (
            rows.length ===
            0
        ) {
            setStatus(
                'Add a training entry to begin planning.',
                'neutral'
            );
        } else if (
            totalUnitsPlanned ===
            0
        ) {
            setStatus(
                `${rows.length} ${
                    rows.length === 1
                        ? 'entry'
                        : 'entries'
                } ready. Enter the number of troops to train.`,

                'neutral'
            );
        } else {
            setStatus(
                `${formatNumber(
                    totalUnitsPlanned
                )} troops planned · ${formatNumber(
                    totalCostAllRows
                )} resources assigned.`,

                'success'
            );
        }
    }

    function getUnitOptions(
        tribeKey
    ) {
        const tribeUnits =
            (
                ALL_TRIBE_UNITS[
                    tribeKey
                ] ||
                ALL_TRIBE_UNITS
                    .romans
            ).units;

        return tribeUnits.map(
            unit => ({
                value:
                    unit.name,

                label:
                    unit.name
            })
        );
    }

    function createRow(
        tribeKey
    ) {
        const row =
            document.createElement(
                'tr'
            );

        row.className =
            'qol-calc-entry-row';

        row.innerHTML = `
            <td class="qol-calc-unit-cell"></td>

            <td class="qol-calc-mode-cell">
                <label class="qol-calc-mode-control">
                    <input
                        type="checkbox"
                        class="qol-calc-gbgs-check"
                    >

                    <span class="qol-calc-switch-track">
                        <span class="qol-calc-switch-thumb"></span>
                    </span>

                    <span class="qol-calc-mode-label">
                        Normal
                    </span>
                </label>
            </td>

            <td class="qol-calc-number-cell qol-calc-max-trainable">
                0
            </td>

            <td class="qol-calc-input-cell">
                <input
                    type="number"
                    class="qol-calc-train-input"
                    min="0"
                    value="0"
                    inputmode="numeric"
                >
            </td>

            <td class="qol-calc-number-cell qol-calc-cost">
                0
            </td>

            <td class="qol-calc-delete-cell">
                <div
                    class="qol-calc-delete-row"
                    role="button"
                    tabindex="0"
                    title="Delete entry"
                >
                    &times;
                </div>
            </td>
        `;

        const unitOptions =
            getUnitOptions(
                tribeKey
            );

        const unitDropdown =
            createCustomDropdown({
                options:
                    unitOptions,

                value:
                    unitOptions[0]
                        ?.value ||
                    '',

                width:
                    '100%',

                ariaLabel:
                    'Select unit',

                onChange:
                    () => {
                        updateRowGsGbState(
                            row
                        );

                        updateCalculations();
                    }
            });

        row
            .querySelector(
                '.qol-calc-unit-cell'
            )
            ?.appendChild(
                unitDropdown
            );

        row.unitDropdown =
            unitDropdown;

        const checkbox =
            row.querySelector(
                '.qol-calc-gbgs-check'
            );

        const trainInput =
            row.querySelector(
                '.qol-calc-train-input'
            );

        const deleteButton =
            row.querySelector(
                '.qol-calc-delete-row'
            );

        checkbox
            ?.addEventListener(
                'change',
                () => {
                    updateRowGsGbState(
                        row
                    );

                    updateCalculations();
                }
            );

        trainInput
            ?.addEventListener(
                'input',
                updateCalculations
            );

        trainInput
            ?.addEventListener(
                'focus',
                event => {
                    event.target.select();
                }
            );

        function removeRow(
            event
        ) {
            event.preventDefault();
            event.stopPropagation();

            row.unitDropdown
                ?.destroy
                ?.();

            row.remove();

            updateCalculations();
        }

        deleteButton
            ?.addEventListener(
                'click',
                removeRow
            );

        deleteButton
            ?.addEventListener(
                'keydown',
                event => {
                    if (
                        event.key ===
                            'Enter' ||
                        event.key ===
                            ' '
                    ) {
                        removeRow(event);
                    }
                }
            );

        updateRowGsGbState(
            row
        );

        return row;
    }

    function updateRowUnitOptions(
        row,
        tribeKey
    ) {
        if (!row.unitDropdown) {
            return;
        }

        const currentValue =
            row.unitDropdown
                .getValue();

        row.unitDropdown
            .updateOptions(
                getUnitOptions(
                    tribeKey
                ),

                currentValue
            );

        updateRowGsGbState(
            row
        );
    }

    function updateAllRowsForTribe(
        tribeKey
    ) {
        const tableBody =
            calcContainer
                ?.querySelector(
                    '#qol-calc-table-body'
                );

        if (!tableBody) {
            return;
        }

        const rows =
            Array.from(
                tableBody
                    .querySelectorAll(
                        '.qol-calc-entry-row'
                    )
            );

        if (
            rows.length ===
            0
        ) {
            tableBody.appendChild(
                createRow(
                    tribeKey
                )
            );
        } else {
            rows.forEach(
                row => {
                    updateRowUnitOptions(
                        row,
                        tribeKey
                    );
                }
            );
        }

        updateCalculations();
    }

    function clearPlan() {
        if (!calcContainer) {
            return;
        }

        const tableBody =
            calcContainer
                .querySelector(
                    '#qol-calc-table-body'
                );

        const tribeKey =
            calcContainer
                .tribeDropdown
                ?.getValue() ||
            'romans';

        if (!tableBody) {
            return;
        }

        Array
            .from(
                tableBody
                    .querySelectorAll(
                        '.qol-calc-entry-row'
                    )
            )
            .forEach(
                row => {
                    row.unitDropdown
                        ?.destroy
                        ?.();

                    row.remove();
                }
            );

        tableBody.appendChild(
            createRow(
                tribeKey
            )
        );

        updateCalculations();

        setStatus(
            'Training plan cleared.',
            'neutral'
        );
    }

    function addEntry() {
        if (!calcContainer) {
            return;
        }

        const tableBody =
            calcContainer
                .querySelector(
                    '#qol-calc-table-body'
                );

        const tribeKey =
            calcContainer
                .tribeDropdown
                ?.getValue() ||
            'romans';

        if (!tableBody) {
            return;
        }

        const row =
            createRow(
                tribeKey
            );

        tableBody.appendChild(
            row
        );

        updateCalculations();

        row
            .querySelector(
                '.qol-calc-train-input'
            )
            ?.focus();
    }

    function injectStyles() {
        if (
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            STYLE_ID;

        style.textContent = `
            #${PANEL_ID} {
                position: fixed !important;
                display: none;
                flex-direction: column !important;
                width: 920px;
                min-width: 700px !important;
                max-width: 96vw !important;
                height: 560px;
                min-height: 430px !important;
                max-height: 92vh !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 3px solid #634d31 !important;
                border-radius: 4px !important;
                background: #f7f5f0 !important;
                box-shadow:
                    0 10px 30px
                    rgba(0,0,0,.5)
                    !important;
                color: #333 !important;
                font:
                    11px Arial,
                    sans-serif
                    !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                resize: both !important;
                z-index: 999999 !important;
            }

            #${PANEL_ID},
            #${PANEL_ID} *,
            .qol-calc-dropdown-menu,
            .qol-calc-dropdown-menu * {
                box-sizing: border-box !important;
                font-family:
                    Arial,
                    sans-serif
                    !important;
                text-shadow: none !important;
            }

            #${PANEL_ID}
            .qol-calc-header {
                width: 100% !important;
                height: 34px !important;
                min-height: 34px !important;
                margin: 0 !important;
                padding: 6px 10px !important;
                border: 0 !important;
                border-radius: 0 !important;
                background:
                    linear-gradient(
                        to bottom,
                        #6d5436,
                        #543f26
                    )
                    !important;
                color: #f7f5f0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                flex: 0 0 auto !important;
                font-size: 14px !important;
                font-weight: bold !important;
                line-height: 20px !important;
                cursor: move !important;
                user-select: none !important;
                touch-action: none !important;
            }

            #${PANEL_ID}
            .qol-calc-close {
                all: unset !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 25px !important;
                height: 24px !important;
                margin: 0 !important;
                padding: 0 5px !important;
                border-radius: 3px !important;
                background:
                    rgba(0,0,0,.2)
                    !important;
                color: #fff !important;
                font:
                    bold 21px/1
                    Arial,
                    sans-serif
                    !important;
                cursor: pointer !important;
            }

            #${PANEL_ID}
            .qol-calc-close:hover {
                background:
                    rgba(
                        255,
                        255,
                        255,
                        .16
                    )
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-body {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                gap: 8px !important;
                margin: 0 !important;
                padding: 10px !important;
                background: #f7f5f0 !important;
                overflow: hidden !important;
            }

            #${PANEL_ID}
            .qol-calc-description {
                flex: 0 0 auto !important;
                margin: 0 !important;
                padding: 7px 9px !important;
                border:
                    1px solid
                    #d4c2a5
                    !important;
                border-radius: 4px !important;
                background: #fff6e5 !important;
                color: #5b4630 !important;
                font-size: 11px !important;
                line-height: 1.4 !important;
            }

            #${PANEL_ID}
            .qol-calc-controls {
                display: flex !important;
                align-items: flex-end !important;
                gap: 10px !important;
                flex: 0 0 auto !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            #${PANEL_ID}
            .qol-calc-control-group {
                display: flex !important;
                flex-direction: column !important;
                gap: 4px !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            #${PANEL_ID}
            .qol-calc-control-group.grow {
                flex: 1 1 auto !important;
                max-width: 230px !important;
            }

            #${PANEL_ID}
            .qol-calc-control-label {
                color: #5b4630 !important;
                font-size: 10px !important;
                font-weight: bold !important;
                line-height: 14px !important;
                text-transform: uppercase !important;
                letter-spacing: .3px !important;
            }

            #${PANEL_ID}
            #qol-calc-fealty-input,
            #${PANEL_ID}
            .qol-calc-train-input {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
                height: 30px !important;
                margin: 0 !important;
                padding: 4px 7px !important;
                border:
                    1px solid
                    #9c8565
                    !important;
                border-radius: 3px !important;
                background: #fff !important;
                color: #332719 !important;
                font:
                    bold 11px/20px
                    Arial,
                    sans-serif
                    !important;
                text-align: center !important;
                box-shadow: none !important;
                -webkit-appearance:
                    none
                    !important;
                appearance: none !important;
            }

            #${PANEL_ID}
            #qol-calc-fealty-input {
                width: 66px !important;
            }

            #${PANEL_ID}
            .qol-calc-train-input {
                width: 92px !important;
            }

            #${PANEL_ID}
            #qol-calc-fealty-input:focus,
            #${PANEL_ID}
            .qol-calc-train-input:focus,
            #${PANEL_ID}
            .qol-calc-dropdown-trigger:focus {
                outline:
                    2px solid
                    rgba(
                        125,
                        99,
                        66,
                        .28
                    )
                    !important;
                outline-offset:
                    1px
                    !important;
                border-color:
                    #6d5436
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-action-button {
                all: unset !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                height: 30px !important;
                min-width: 110px !important;
                margin: 0 !important;
                padding: 5px 11px !important;
                border:
                    1px solid
                    #523d24
                    !important;
                border-radius: 3px !important;
                background:
                    linear-gradient(
                        to bottom,
                        #7d6342,
                        #543f26
                    )
                    !important;
                color: #fff !important;
                font:
                    bold 11px/18px
                    Arial,
                    sans-serif
                    !important;
                text-align: center !important;
                white-space: nowrap !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            #${PANEL_ID}
            .qol-calc-action-button:hover {
                filter:
                    brightness(1.08)
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-action-button.secondary {
                background:
                    linear-gradient(
                        to bottom,
                        #fdfbf7,
                        #e7dcc8
                    )
                    !important;
                color: #5b4328 !important;
                border-color:
                    #8c7250
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-action-button.danger {
                background:
                    linear-gradient(
                        to bottom,
                        #d9534f,
                        #b52b27
                    )
                    !important;
                border-color:
                    #8f211e
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-grid {
                display: grid !important;
                grid-template-columns:
                    1fr 1fr
                    !important;
                gap: 8px !important;
                flex: 0 0 auto !important;
                min-width: 0 !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-panel {
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border:
                    1px solid
                    #c7b99e
                    !important;
                border-radius: 4px !important;
                background: #fff !important;
                overflow: hidden !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-title {
                min-height: 28px !important;
                margin: 0 !important;
                padding: 6px 9px !important;
                background: #e9dfcc !important;
                color: #4f3b24 !important;
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                gap: 8px !important;
                font-size: 10px !important;
                font-weight: bold !important;
                line-height: 16px !important;
                text-transform: uppercase !important;
                letter-spacing: .3px !important;
            }

            #${PANEL_ID}
            .qol-calc-resource-grid {
                display: grid !important;
                grid-template-columns:
                    repeat(
                        4,
                        minmax(
                            70px,
                            1fr
                        )
                    )
                    !important;
                gap: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            #${PANEL_ID}
            .qol-calc-resource-item {
                min-width: 0 !important;
                min-height: 48px !important;
                margin: 0 !important;
                padding: 7px 8px !important;
                border-right:
                    1px solid
                    #eee5d7
                    !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
                gap: 3px !important;
            }

            #${PANEL_ID}
            .qol-calc-resource-item:last-child {
                border-right: 0 !important;
            }

            #${PANEL_ID}
            .qol-calc-resource-label {
                display: flex !important;
                align-items: center !important;
                gap: 4px !important;
                min-width: 0 !important;
                color: #6a573d !important;
                font-size: 9px !important;
                font-weight: bold !important;
                line-height: 13px !important;
                text-transform: uppercase !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID}
            .qol-calc-resource-value {
                min-width: 0 !important;
                color: #3f3020 !important;
                font-size: 14px !important;
                font-weight: bold !important;
                line-height: 18px !important;
                overflow: hidden !important;
                text-overflow:
                    ellipsis
                    !important;
                white-space: nowrap !important;
                font-variant-numeric:
                    tabular-nums
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-footer {
                display: grid !important;
                grid-template-columns:
                    1fr 1fr
                    !important;
                gap: 0 !important;
                margin: 0 !important;
                border-top:
                    1px solid
                    #e4dccd
                    !important;
                background: #fffaf0 !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-stat {
                min-width: 0 !important;
                padding: 6px 9px !important;
                color: #5b4630 !important;
                font-size: 10px !important;
                font-weight: bold !important;
                line-height: 16px !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-stat +
            .qol-calc-summary-stat {
                border-left:
                    1px solid
                    #e4dccd
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-summary-stat strong {
                color: #3f3020 !important;
                font-size: 12px !important;
            }

            #${PANEL_ID}
            .qol-calc-plan-area {
                display: flex !important;
                flex-direction: column !important;
                flex: 1 1 auto !important;
                min-height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border:
                    1px solid
                    #c7b99e
                    !important;
                border-radius: 3px !important;
                background: #fff !important;
                overflow: hidden !important;
            }

            #${PANEL_ID}
            .qol-calc-table-wrapper {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                overflow: auto !important;
                background: #fff !important;
            }

            #${PANEL_ID}
            .qol-calc-table {
                width: 100% !important;
                margin: 0 !important;
                border-collapse:
                    collapse
                    !important;
                table-layout:
                    fixed
                    !important;
                background: #fff !important;
                color: #332211 !important;
                font-size: 11px !important;
            }

            #${PANEL_ID}
            .qol-calc-table th,
            #${PANEL_ID}
            .qol-calc-table td {
                margin: 0 !important;
                padding: 7px 8px !important;
                border: 0 !important;
                border-bottom:
                    1px solid
                    #e4dccd
                    !important;
                color: #332211 !important;
                vertical-align:
                    middle
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-table th {
                position: sticky !important;
                top: 0 !important;
                z-index: 2 !important;
                background: #e9dfcc !important;
                color: #4f3b24 !important;
                font-size: 10px !important;
                font-weight: bold !important;
                line-height: 16px !important;
                text-align: left !important;
                text-transform: uppercase !important;
                letter-spacing: .3px !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID}
            .qol-calc-table
            tbody
            tr:hover {
                background: #fff8e9 !important;
            }

            #${PANEL_ID}
            .qol-calc-unit-cell {
                width: 31% !important;
                min-width: 180px !important;
            }

            #${PANEL_ID}
            .qol-calc-mode-cell {
                width: 18% !important;
                min-width: 120px !important;
            }

            #${PANEL_ID}
            .qol-calc-number-cell {
                width: 15% !important;
                text-align: right !important;
                font-weight: bold !important;
                font-variant-numeric:
                    tabular-nums
                    !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID}
            .qol-calc-input-cell {
                width: 16% !important;
                text-align: center !important;
            }

            #${PANEL_ID}
            .qol-calc-cost {
                color: #6d5436 !important;
            }

            #${PANEL_ID}
            .qol-calc-delete-cell {
                width: 40px !important;
                text-align: center !important;
            }

            #${PANEL_ID}
            .qol-calc-delete-row {
                all: unset !important;
                box-sizing: border-box !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                width: 24px !important;
                height: 24px !important;
                border-radius: 3px !important;
                color: #a00000 !important;
                font:
                    bold 18px/1
                    Arial,
                    sans-serif
                    !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            #${PANEL_ID}
            .qol-calc-delete-row:hover {
                background: #f7d8d6 !important;
            }

            #${PANEL_ID}
            .qol-calc-mode-control {
                display: flex !important;
                align-items: center !important;
                gap: 7px !important;
                min-width: 0 !important;
                margin: 0 !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            #${PANEL_ID}
            .qol-calc-gbgs-check {
                position: absolute !important;
                width: 1px !important;
                height: 1px !important;
                opacity: 0 !important;
                pointer-events: none !important;
            }

            #${PANEL_ID}
            .qol-calc-switch-track {
                position: relative !important;
                display: block !important;
                flex: 0 0 auto !important;
                width: 34px !important;
                height: 18px !important;
                border:
                    1px solid
                    #9c8565
                    !important;
                border-radius: 10px !important;
                background: #ddd2bf !important;
                transition:
                    background
                    .15s ease
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-switch-thumb {
                position: absolute !important;
                left: 2px !important;
                top: 2px !important;
                width: 12px !important;
                height: 12px !important;
                border-radius: 50% !important;
                background: #fff !important;
                box-shadow:
                    0 1px 3px
                    rgba(0,0,0,.25)
                    !important;
                transition:
                    transform
                    .15s ease
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-gbgs-check:checked +
            .qol-calc-switch-track {
                background: #7d6342 !important;
                border-color: #523d24 !important;
            }

            #${PANEL_ID}
            .qol-calc-gbgs-check:checked +
            .qol-calc-switch-track
            .qol-calc-switch-thumb {
                transform:
                    translateX(16px)
                    !important;
            }

            #${PANEL_ID}
            .qol-calc-gbgs-check:disabled +
            .qol-calc-switch-track {
                background: #e8e2d8 !important;
                border-color: #c9bead !important;
                opacity: .55 !important;
            }

            #${PANEL_ID}
            .qol-calc-mode-label {
                min-width: 0 !important;
                color: #5b4630 !important;
                font-size: 10px !important;
                font-weight: bold !important;
                line-height: 14px !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID}
            .qol-calc-siege-row
            .qol-calc-mode-control {
                cursor: default !important;
            }

            #${PANEL_ID}
            .qol-calc-plan-footer {
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                gap: 10px !important;
                flex: 0 0 auto !important;
                min-height: 42px !important;
                margin: 0 !important;
                padding: 6px 8px !important;
                border-top:
                    1px solid
                    #c7b99e
                    !important;
                background: #f6f1e7 !important;
            }

            #${PANEL_ID}
            .qol-calc-footer-actions {
                display: flex !important;
                align-items: center !important;
                gap: 6px !important;
                min-width: 0 !important;
            }

            #${PANEL_ID}
            .qol-calc-status {
                min-width: 0 !important;
                color: #5b4630 !important;
                font-size: 10px !important;
                line-height: 15px !important;
                text-align: right !important;
                overflow: hidden !important;
                text-overflow:
                    ellipsis
                    !important;
                white-space: nowrap !important;
            }

            #${PANEL_ID}
            .qol-calc-status[
                data-tone="success"
            ] {
                color: #4f7328 !important;
                font-weight: bold !important;
            }

            .qol-calc-dropdown {
                position: relative !important;
                display: block !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
            }

            .qol-calc-dropdown-trigger {
                all: unset !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content:
                    space-between
                    !important;
                width: 100% !important;
                height: 30px !important;
                margin: 0 !important;
                padding: 4px 8px !important;
                border:
                    1px solid
                    #9c8565
                    !important;
                border-radius: 3px !important;
                background: #fff !important;
                color: #332719 !important;
                font:
                    bold 11px/20px
                    Arial,
                    sans-serif
                    !important;
                cursor: pointer !important;
                user-select: none !important;
            }

            .qol-calc-dropdown-trigger:hover {
                background: #fffaf0 !important;
                border-color: #7d6342 !important;
            }

            .qol-calc-dropdown-label {
                min-width: 0 !important;
                overflow: hidden !important;
                text-overflow:
                    ellipsis
                    !important;
                white-space: nowrap !important;
            }

            .qol-calc-dropdown-arrow {
                flex: 0 0 auto !important;
                margin-left: 7px !important;
                color: #7d6342 !important;
                font-size: 8px !important;
                line-height: 1 !important;
            }

            .qol-calc-dropdown-menu {
                position: fixed !important;
                display: none;
                z-index: 1000002 !important;
                max-height: 260px !important;
                margin: 0 !important;
                padding: 4px !important;
                border:
                    2px solid
                    #634d31
                    !important;
                border-radius: 4px !important;
                background: #f7f5f0 !important;
                box-shadow:
                    0 8px 22px
                    rgba(0,0,0,.36)
                    !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
            }

            .qol-calc-dropdown-option {
                all: unset !important;
                box-sizing: border-box !important;
                display: block !important;
                width: 100% !important;
                min-height: 28px !important;
                margin: 0 !important;
                padding: 5px 8px !important;
                border-radius: 3px !important;
                background:
                    transparent
                    !important;
                color: #3f3020 !important;
                font:
                    11px/18px
                    Arial,
                    sans-serif
                    !important;
                text-align: left !important;
                white-space: nowrap !important;
                cursor: pointer !important;
            }

            .qol-calc-dropdown-option:hover,
            .qol-calc-dropdown-option:focus,
            .qol-calc-dropdown-option.selected {
                background: #e9dfcc !important;
            }

            .qol-calc-dropdown-option.selected {
                font-weight: bold !important;
            }

            @media
            (max-width: 820px) {
                #${PANEL_ID} {
                    min-width:
                        94vw
                        !important;
                }

                #${PANEL_ID}
                .qol-calc-summary-grid {
                    grid-template-columns:
                        1fr
                        !important;
                }

                #${PANEL_ID}
                .qol-calc-controls {
                    flex-wrap:
                        wrap
                        !important;
                }
            }
        `;

        document.head.appendChild(
            style
        );
    }

    function buildPanel() {
        const existingPanel =
            document.getElementById(
                PANEL_ID
            );

        if (existingPanel) {
            calcContainer =
                existingPanel;

            return;
        }

        calcContainer =
            document.createElement(
                'div'
            );

        calcContainer.id =
            PANEL_ID;

        calcContainer
            .style
            .setProperty(
                'display',
                'none',
                'important'
            );

        calcContainer.innerHTML = `
            <div class="qol-calc-header">
                <span>NPC Calculator</span>

                <span
                    class="qol-calc-close"
                    title="Close Calculator"
                >
                    &times;
                </span>
            </div>

            <div class="qol-calc-body">
                <div class="qol-calc-description">
                    Plan troop training against the current village stock. The calculator applies Fealty discounts, accounts for Great Barracks or Great Stable costs, and shows the NPC distribution needed for the full plan.
                </div>

                <div class="qol-calc-controls">
                    <div class="qol-calc-control-group grow">
                        <span class="qol-calc-control-label">
                            Tribe
                        </span>

                        <div id="qol-calc-tribe-dropdown-wrap"></div>
                    </div>

                    <div class="qol-calc-control-group">
                        <label
                            for="qol-calc-fealty-input"
                            class="qol-calc-control-label"
                        >
                            Fealty
                        </label>

                        <input
                            type="number"
                            id="qol-calc-fealty-input"
                            min="1"
                            max="20"
                            value="1"
                        >
                    </div>

                    <div
                        id="qol-calc-refresh-resources"
                        class="qol-calc-action-button secondary"
                        role="button"
                        tabindex="0"
                    >
                        Refresh Stock
                    </div>
                </div>

                <div class="qol-calc-summary-grid">
                    <div class="qol-calc-summary-panel">
                        <div class="qol-calc-summary-title">
                            <span>
                                Village Stock
                            </span>

                            <span>
                                Total:
                                <strong id="qol-calc-res-total">
                                    0
                                </strong>
                            </span>
                        </div>

                        <div class="qol-calc-resource-grid">
                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_wood_small_illu resType1"></i>
                                    Wood
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-res-wood"
                                >
                                    0
                                </div>
                            </div>

                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_clay_small_illu resType2"></i>
                                    Clay
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-res-clay"
                                >
                                    0
                                </div>
                            </div>

                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_iron_small_illu resType3"></i>
                                    Iron
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-res-iron"
                                >
                                    0
                                </div>
                            </div>

                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_crop_small_illu resType4"></i>
                                    Crop
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-res-crop"
                                >
                                    0
                                </div>
                            </div>
                        </div>

                        <div class="qol-calc-summary-footer">
                            <div class="qol-calc-summary-stat">
                                Remaining:
                                <strong id="qol-calc-res-remaining">
                                    0
                                </strong>
                            </div>

                            <div class="qol-calc-summary-stat">
                                Troops planned:
                                <strong id="qol-calc-plan-total">
                                    0
                                </strong>
                            </div>
                        </div>
                    </div>

                    <div class="qol-calc-summary-panel">
                        <div class="qol-calc-summary-title">
                            <span>
                                NPC Distribution
                            </span>

                            <span>
                                Total:
                                <strong id="qol-calc-dist-total">
                                    0
                                </strong>
                            </span>
                        </div>

                        <div class="qol-calc-resource-grid">
                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_wood_small_illu resType1"></i>
                                    Wood
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-dist-wood"
                                >
                                    0
                                </div>
                            </div>

                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_clay_small_illu resType2"></i>
                                    Clay
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-dist-clay"
                                >
                                    0
                                </div>
                            </div>

                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_iron_small_illu resType3"></i>
                                    Iron
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-dist-iron"
                                >
                                    0
                                </div>
                            </div>

                            <div class="qol-calc-resource-item">
                                <div class="qol-calc-resource-label">
                                    <i class="unit_crop_small_illu resType4"></i>
                                    Crop
                                </div>

                                <div
                                    class="qol-calc-resource-value"
                                    id="qol-calc-dist-crop"
                                >
                                    0
                                </div>
                            </div>
                        </div>

                        <div class="qol-calc-summary-footer">
                            <div class="qol-calc-summary-stat">
                                Uses the current village total after discounts.
                            </div>

                            <div class="qol-calc-summary-stat">
                                GS/GB costs are calculated at 3×.
                            </div>
                        </div>
                    </div>
                </div>

                <div class="qol-calc-plan-area">
                    <div class="qol-calc-table-wrapper">
                        <table class="qol-calc-table">
                            <thead>
                                <tr>
                                    <th>
                                        Unit
                                    </th>

                                    <th>
                                        Training Mode
                                    </th>

                                    <th style="text-align:right !important;">
                                        Max Trainable
                                    </th>

                                    <th style="text-align:center !important;">
                                        Plan
                                    </th>

                                    <th style="text-align:right !important;">
                                        Cost
                                    </th>

                                    <th></th>
                                </tr>
                            </thead>

                            <tbody id="qol-calc-table-body"></tbody>
                        </table>
                    </div>

                    <div class="qol-calc-plan-footer">
                        <div class="qol-calc-footer-actions">
                            <div
                                id="qol-calc-add-entry-btn"
                                class="qol-calc-action-button"
                                role="button"
                                tabindex="0"
                            >
                                Add Entry
                            </div>

                            <div
                                id="qol-calc-clear-plan"
                                class="qol-calc-action-button danger"
                                role="button"
                                tabindex="0"
                            >
                                Clear Plan
                            </div>
                        </div>

                        <div
                            id="qol-calc-status"
                            class="qol-calc-status"
                            data-tone="neutral"
                        >
                            Ready.
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(
            calcContainer
        );

        const tribeWrapper =
            calcContainer
                .querySelector(
                    '#qol-calc-tribe-dropdown-wrap'
                );

        const tribeDropdown =
            createCustomDropdown({
                options: [
                    {
                        value:
                            'romans',

                        label:
                            'Roman'
                    },
                    {
                        value:
                            'gauls',

                        label:
                            'Gaul'
                    },
                    {
                        value:
                            'teutons',

                        label:
                            'Teuton'
                    }
                ],

                value:
                    'romans',

                width:
                    '100%',

                ariaLabel:
                    'Select tribe',

                onChange:
                    tribeKey => {
                        updateAllRowsForTribe(
                            tribeKey
                        );
                    }
            });

        tribeWrapper
            ?.appendChild(
                tribeDropdown
            );

        calcContainer.tribeDropdown =
            tribeDropdown;

        const header =
            calcContainer
                .querySelector(
                    '.qol-calc-header'
                );

        const closeButton =
            calcContainer
                .querySelector(
                    '.qol-calc-close'
                );

        const fealtyInput =
            calcContainer
                .querySelector(
                    '#qol-calc-fealty-input'
                );

        const refreshButton =
            calcContainer
                .querySelector(
                    '#qol-calc-refresh-resources'
                );

        const addButton =
            calcContainer
                .querySelector(
                    '#qol-calc-add-entry-btn'
                );

        const clearButton =
            calcContainer
                .querySelector(
                    '#qol-calc-clear-plan'
                );

        makeDraggable(
            calcContainer,
            header
        );

        closeButton
            ?.addEventListener(
                'click',
                () => {
                    closeAllDropdowns();

                    calcContainer
                        .style
                        .setProperty(
                            'display',
                            'none',
                            'important'
                        );
                }
            );

        fealtyInput
            ?.addEventListener(
                'input',
                () => {
                    const parsed =
                        Number.parseInt(
                            fealtyInput.value,
                            10
                        );

                    if (
                        !Number.isFinite(
                            parsed
                        ) ||
                        parsed < 1
                    ) {
                        fealtyInput.value =
                            '1';
                    } else if (
                        parsed > 20
                    ) {
                        fealtyInput.value =
                            '20';
                    }

                    updateCalculations();
                }
            );

        function bindActivation(
            element,
            callback
        ) {
            element
                ?.addEventListener(
                    'click',
                    event => {
                        event.preventDefault();
                        event.stopPropagation();
                        callback();
                    }
                );

            element
                ?.addEventListener(
                    'keydown',
                    event => {
                        if (
                            event.key ===
                                'Enter' ||
                            event.key ===
                                ' '
                        ) {
                            event.preventDefault();
                            event.stopPropagation();
                            callback();
                        }
                    }
                );
        }

        bindActivation(
            refreshButton,
            () => {
                updateCalculations();

                setStatus(
                    'Village stock refreshed.',
                    'success'
                );
            }
        );

        bindActivation(
            addButton,
            addEntry
        );

        bindActivation(
            clearButton,
            clearPlan
        );
    }

    function buildToggleButton() {
        const existingButton =
            document.getElementById(
                TOGGLE_ID
            );

        if (existingButton) {
            calcToggleButton =
                existingButton;

            return;
        }

        calcToggleButton =
            document.createElement(
                'div'
            );

        calcToggleButton.id =
            TOGGLE_ID;

        calcToggleButton.title =
            'NPC Calculator';

        calcToggleButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <rect
                    x="4"
                    y="2"
                    width="16"
                    height="20"
                    rx="2"
                ></rect>

                <line
                    x1="8"
                    y1="6"
                    x2="16"
                    y2="6"
                ></line>

                <line
                    x1="16"
                    y1="14"
                    x2="16"
                    y2="18"
                ></line>

                <path d="M16 10h.01"></path>
                <path d="M12 10h.01"></path>
                <path d="M8 10h.01"></path>
                <path d="M12 14h.01"></path>
                <path d="M8 14h.01"></path>
                <path d="M12 18h.01"></path>
                <path d="M8 18h.01"></path>
            </svg>
        `;

        calcToggleButton
            .addEventListener(
                'click',
                event => {
                    event.preventDefault();
                    event.stopPropagation();

                    if (!calcContainer) {
                        return;
                    }

                    const isHidden =
                        window
                            .getComputedStyle(
                                calcContainer
                            )
                            .display ===
                        'none';

                    if (isHidden) {
                        window.dispatchEvent(
                            new CustomEvent(
                                'qol_close_others',
                                {
                                    detail: {
                                        source:
                                            'npcCalculator'
                                    }
                                }
                            )
                        );

                        const tableBody =
                            calcContainer
                                .querySelector(
                                    '#qol-calc-table-body'
                                );

                        if (
                            tableBody &&
                            tableBody
                                .children
                                .length ===
                            0
                        ) {
                            const detectedTribe =
                                detectUserTribe();

                            calcContainer
                                .tribeDropdown
                                ?.setValue(
                                    detectedTribe
                                );

                            updateAllRowsForTribe(
                                detectedTribe
                            );
                        } else {
                            updateCalculations();
                        }

                        positionPanel();

                        calcContainer
                            .style
                            .setProperty(
                                'display',
                                'flex',
                                'important'
                            );
                    } else {
                        closeAllDropdowns();

                        calcContainer
                            .style
                            .setProperty(
                                'display',
                                'none',
                                'important'
                            );
                    }
                }
            );

        document.body.appendChild(
            calcToggleButton
        );

        if (
            typeof window
                .qolRepositionAllButtons ===
            'function'
        ) {
            window
                .qolRepositionAllButtons();
        }
    }

    function buildUI() {
        if (!isEnabled()) {
            return;
        }

        injectStyles();
        buildPanel();
        buildToggleButton();

        if (
            typeof window
                .qolRepositionAllButtons ===
            'function'
        ) {
            window
                .qolRepositionAllButtons();
        }
    }

    function destroyUI() {
        closeAllDropdowns();

        if (calcContainer) {
            calcContainer
                .querySelectorAll(
                    '.qol-calc-entry-row'
                )
                .forEach(
                    row => {
                        row.unitDropdown
                            ?.destroy
                            ?.();
                    }
                );

            calcContainer
                .tribeDropdown
                ?.destroy
                ?.();

            calcContainer.remove();
        }

        calcToggleButton
            ?.remove();

        calcContainer =
            null;

        calcToggleButton =
            null;

        if (
            typeof window
                .qolRepositionAllButtons ===
            'function'
        ) {
            window
                .qolRepositionAllButtons();
        }
    }

    window.addEventListener(
        'qol_close_others',
        event => {
            if (
                event.detail
                    ?.source !==
                'npcCalculator'
            ) {
                closeAllDropdowns();

                if (calcContainer) {
                    calcContainer
                        .style
                        .setProperty(
                            'display',
                            'none',
                            'important'
                        );
                }
            }
        }
    );

    window.addEventListener(
        'qol_setting_changed',
        event => {
            if (
                event.detail
                    ?.key !==
                FEATURE_KEY
            ) {
                return;
            }

            if (
                event.detail.enabled
            ) {
                buildUI();
            } else {
                destroyUI();
            }
        }
    );

    window.addEventListener(
        'resize',
        () => {
            closeAllDropdowns();

            if (
                calcContainer &&
                window
                    .getComputedStyle(
                        calcContainer
                    )
                    .display !==
                'none'
            ) {
                const rectangle =
                    calcContainer
                        .getBoundingClientRect();

                if (
                    rectangle.right >
                        window.innerWidth ||
                    rectangle.bottom >
                        window.innerHeight
                ) {
                    positionPanel();
                }
            }
        }
    );

    document.addEventListener(
        'keydown',
        event => {
            if (
                event.key ===
                    'Escape' &&
                calcContainer &&
                window
                    .getComputedStyle(
                        calcContainer
                    )
                    .display !==
                'none'
            ) {
                closeAllDropdowns();

                calcContainer
                    .style
                    .setProperty(
                        'display',
                        'none',
                        'important'
                    );
            }
        },
        true
    );

    function initialise() {
        if (isEnabled()) {
            buildUI();
        }

        console.log(
            '[NPC Calculator] APES calculator UI initialized.'
        );
    }

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            initialise,
            {
                once: true
            }
        );
    } else {
        initialise();
    }
})();