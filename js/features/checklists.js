(function() {
    let checklistContainer = null;
    let checklistToggleBtn = null;
    const FEATURE_KEY = 'checklists';
    const PROGRESS_STORAGE_KEY = 'qol_checklist_progress';
    const CUSTOM_STORAGE_KEY = 'qol_custom_checklists';

    const BUILTIN_CHECKLISTS = {
        'x3_speedsettle': {
            name: 'x3 Speedsettle',
            pretext: 'This checklist assumes you\'ll be using gold in order to speed settle as fast as possible. Remember to spend your hero points in resources and to change hero production before using a resource or crop chest!',
            steps: [
                'Finish tutorial. Do not skip it (In tutorial, attack furthest hideout first).', 
                'Queue 5 units.', 
                'Attack closest hideout untill it\'s empty. Send hero on adventures non-stop.', 
                'Upgrade Warehouse & Granary to 3.', 
                'Build Embassy to 1 and annex an oasis if possible.', 
                'Build Market & Cranny to 1.', 
                'Upgrade all crop fields to 2, then upgrade all crop fields to 3.', 
                'This step is optional and you can skip it if you\'re demolishing spawn village: Upgrade all resource fields to 2.', 
                'Upgrade Main Building to 7.', 
                'Build Residence to 1.', 
                'Activate Gold Club, Travian Plus, Resource & Crop Boost.', 
                'Upgrade Warehouse to 5 so you have capacity to accept quest rewards.', 
                'Upgrade your Residence to 5.', 
                'Complete "free" quests such as Renaming your village, changing your hero resource production and healing your hero.', 
                'If you can afford it, play card games for extra adventure point and chests.', 
                'After your Residence level 5 is done, collect the quest reward to further upgrade it to lvl 10 & queue your 1st Settler.', 
                'Queue 2nd Settler as soon as you can. You can clear first 2 hideouts, sell SGs, and send hero on their 7th adventure for extra resources.', 
                'Catch animals in close oasis after 7th adventure for quest reward.', 
                'Wait for 3rd & 4th hideout. They should spawn 1h27m after clearing 1st & 2nd.', 
                'Use 1st Settler to empty 3rd & 4th hideout. Don\'t let it die! Send extra troops with Settler.', 
                'Queue 3rd Settler (Use res/crop chest if necessary).', 
                'Upgrade Main Building to 10.', 
                'Demolish Residence. Try to time it so it\'s completely demolished a few seconds after the 3rd Settler is completed.', 
                'Upgrade Barracks to level 3, Academy to 10, Town Hall to 1, Workshop to 1.', 
                'Upgrade Granary to 7.', 
                'Celebrate a Small party, Relocate & Send Settlers.',
                'Go thank Ruben from Triangles for this guide.'
            ]
        },
    };

    function isEnabled() {
        return typeof window.isQolEnabled === 'function' ? window.isQolEnabled(FEATURE_KEY) : true;
    }

    function getCustomChecklists() {
        try {
            return JSON.parse(localStorage.getItem(CUSTOM_STORAGE_KEY)) || {};
        } catch (e) { return {}; }
    }

    function saveCustomChecklists(customMap) {
        localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customMap));
    }

    function getAllChecklists() {
        return Object.assign({}, BUILTIN_CHECKLISTS, getCustomChecklists());
    }

    function getProgress() {
        try {
            return JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY)) || {};
        } catch (e) { return {}; }
    }

    function saveProgress(checklistId, stepIndex, checked) {
        const progress = getProgress();
        if (!progress[checklistId]) progress[checklistId] = [];
        
        if (checked) {
            if (!progress[checklistId].includes(stepIndex)) progress[checklistId].push(stepIndex);
        } else {
            progress[checklistId] = progress[checklistId].filter(i => i !== stepIndex);
        }
        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    }

    function resetProgress(checklistId) {
        const progress = getProgress();
        delete progress[checklistId];
        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
    }

    function makeResizable(element) {
        if (element.querySelector('.qol-resize-handle')) return;
        const handle = document.createElement('div');
        handle.className = 'qol-resize-handle';
        element.appendChild(handle);

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startWidth = element.offsetWidth;
            const startHeight = element.offsetHeight;
            const startX = e.clientX;
            const startY = e.clientY;

            function onPointerMove(moveEvent) {
                const newWidth = startWidth + (moveEvent.clientX - startX);
                const newHeight = startHeight + (moveEvent.clientY - startY);
                element.style.width = newWidth + 'px';
                element.style.height = newHeight + 'px';
            }

            function onPointerUp() {
                document.removeEventListener('pointermove', onPointerMove);
                document.removeEventListener('pointerup', onPointerUp);
            }

            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
        });
    }

    function makeDraggable(element, handle) {
        handle.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.qol-checklist-close')) return;
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const rect = element.getBoundingClientRect();
            const initialLeft = rect.left;
            const initialTop = rect.top;

            element.style.transform = 'none';
            element.style.left = initialLeft + 'px';
            element.style.top = initialTop + 'px';
            element.style.right = 'auto';
            element.style.bottom = 'auto';

            try {
                handle.setPointerCapture(e.pointerId);
            } catch (err) {}

            function onPointerMove(moveEvent) {
                moveEvent.preventDefault();
                const dx = moveEvent.clientX - startX;
                const dy = moveEvent.clientY - startY;
                element.style.left = (initialLeft + dx) + 'px';
                element.style.top = (initialTop + dy) + 'px';
            }

            function onPointerUp(upEvent) {
                try {
                    handle.releasePointerCapture(upEvent.pointerId);
                } catch (err) {}
                handle.removeEventListener('pointermove', onPointerMove);
                handle.removeEventListener('pointerup', onPointerUp);
            }

            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
        });
    }

    function updateSelectOptions(selectedId) {
        const select = checklistContainer.querySelector('#qol-checklist-select');
        if (!select) return;

        const all = getAllChecklists();
        const custom = getCustomChecklists();

        let html = '<option value="">Choose a checklist...</option>';
        html += '<option value="__add_custom__">+ Add Custom Checklist</option>';
        
        // Built-in section
        const builtinKeys = Object.keys(BUILTIN_CHECKLISTS);
        if (builtinKeys.length > 0) {
            html += '<optgroup label="Default Checklists">';
            builtinKeys.forEach(k => {
                html += `<option value="${k}">${BUILTIN_CHECKLISTS[k].name}</option>`;
            });
            html += '</optgroup>';
        }

        // Custom section
        const customKeys = Object.keys(custom);
        if (customKeys.length > 0) {
            html += '<optgroup label="Custom Checklists">';
            customKeys.forEach(k => {
                html += `<option value="${k}">${custom[k].name}</option>`;
            });
            html += '</optgroup>';
        }

        select.innerHTML = html;
        if (selectedId && all[selectedId]) {
            select.value = selectedId;
        } else {
            select.value = '';
        }
    }

    function showToast(message, type = 'success') {
        if (!checklistContainer) return;
        const existingToast = checklistContainer.querySelector('.qol-wl-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.className = `qol-wl-toast ${type}`;
        toast.textContent = message;

        checklistContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 3000);
    }

    function showCustomConfirm(title, message, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'qol-modal-overlay';
        overlay.innerHTML = `
            <div class="qol-modal-box">
                <div class="qol-modal-header">${title}</div>
                <div class="qol-modal-body">
                    <div>${message}</div>
                </div>
                <div class="qol-modal-footer">
                    <div class="qol-modal-btn qol-modal-btn-secondary qol-modal-cancel">Cancel</div>
                    <div class="qol-modal-btn qol-modal-confirm qol-modal-danger">Delete</div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const close = (val) => {
            overlay.remove();
            if (callback) callback(val);
        };

        overlay.querySelector('.qol-modal-confirm').addEventListener('click', () => {
            close(true);
        });

        overlay.querySelector('.qol-modal-cancel').addEventListener('click', () => {
            close(false);
        });

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close(false);
        });
    }

    function renderAddCustomForm() {
        const body = checklistContainer.querySelector('.qol-checklist-body-content');
        const actionsContainer = checklistContainer.querySelector('#qol-checklist-toolbar-actions');
        if (actionsContainer) actionsContainer.innerHTML = '';

        body.innerHTML = `
            <div style="padding: 12px; font-size: 12px; display: flex; flex-direction: column; gap: 8px;">
                <div style="font-weight: bold; color: #333;">Create New Checklist</div>
                <div>
                    <label style="display:block; margin-bottom: 2px; font-weight: 500;">Checklist Title:</label>
                    <input type="text" id="qol-custom-title" placeholder="e.g. Offense Army Prep" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #ccc; border-radius: 3px;">
                </div>
                <div>
                    <label style="display:block; margin-bottom: 2px; font-weight: 500;">Description / Pretext (optional):</label>
                    <input type="text" id="qol-custom-pretext" placeholder="e.g. Requirements before launching target" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #ccc; border-radius: 3px;">
                </div>
                <div>
                    <label style="display:block; margin-bottom: 2px; font-weight: 500;">Steps (one per line):</label>
                    <textarea id="qol-custom-steps" rows="6" placeholder="Upgrade Main Building to 10&#10;Build Workshop&#10;Queue 50 Rams" style="width: 100%; box-sizing: border-box; padding: 4px; border: 1px solid #ccc; border-radius: 3px; font-family: inherit; resize: vertical;"></textarea>
                </div>
                <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px;">
                    <div id="qol-custom-cancel" class="qol-modal-btn qol-modal-btn-secondary">Cancel</div>
                    <div id="qol-custom-save" class="qol-modal-btn">Save Checklist</div>
                </div>
            </div>
        `;

        body.querySelector('#qol-custom-cancel').addEventListener('click', () => {
            updateSelectOptions('');
            renderChecklistContent('');
        });

        body.querySelector('#qol-custom-save').addEventListener('click', () => {
            const title = body.querySelector('#qol-custom-title').value.trim();
            const pretext = body.querySelector('#qol-custom-pretext').value.trim();
            const rawSteps = body.querySelector('#qol-custom-steps').value;
            
            if (!title) {
                showToast('Please enter a checklist title.', 'error');
                return;
            }

            const steps = rawSteps.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            if (steps.length === 0) {
                showToast('Please enter at least one step for the checklist.', 'error');
                return;
            }

            const customMap = getCustomChecklists();
            const id = 'custom_' + Date.now();
            customMap[id] = {
                name: title,
                pretext: pretext,
                steps: steps
            };

            saveCustomChecklists(customMap);
            updateSelectOptions(id);
            renderChecklistContent(id);
            showToast(`Checklist "${title}" created!`, 'success');
        });
    }

    function renderChecklistContent(checklistId) {
        const body = checklistContainer.querySelector('.qol-checklist-body-content');
        const actionsContainer = checklistContainer.querySelector('#qol-checklist-toolbar-actions');
        
        if (checklistId === '__add_custom__') {
            renderAddCustomForm();
            return;
        }

        const allChecklists = getAllChecklists();
        if (!checklistId || !allChecklists[checklistId]) {
            if (actionsContainer) actionsContainer.innerHTML = '';
            body.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">Select a checklist from the dropdown above.</div>';
            return;
        }

        const checklist = allChecklists[checklistId];
        const isCustom = checklistId.startsWith('custom_');
        const progress = getProgress()[checklistId] || [];
        
        // Setup Toolbar Actions
        if (actionsContainer) {
            let actionsHtml = '';
            if (progress.length > 0) {
                actionsHtml += `<div id="qol-reset-progress-btn" class="qol-wl-action-btn secondary">Reset Progress</div>`;
            }
            if (isCustom) {
                actionsHtml += `<div id="qol-delete-checklist-btn" class="qol-wl-action-btn danger">Delete Checklist</div>`;
            }
            actionsContainer.innerHTML = actionsHtml;

            const resetBtn = actionsContainer.querySelector('#qol-reset-progress-btn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    resetProgress(checklistId);
                    renderChecklistContent(checklistId);
                    showToast('Progress reset.', 'info');
                });
            }

            const delBtn = actionsContainer.querySelector('#qol-delete-checklist-btn');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    showCustomConfirm('Delete Checklist', `Are you sure you want to delete "${checklist.name}"?`, (confirmed) => {
                        if (confirmed) {
                            const custom = getCustomChecklists();
                            delete custom[checklistId];
                            saveCustomChecklists(custom);

                            resetProgress(checklistId);

                            updateSelectOptions('');
                            renderChecklistContent('');
                            showToast(`Checklist "${checklist.name}" deleted.`, 'info');
                        }
                    });
                });
            }
        }

        let html = '';
        if (isCustom) {
            html += `
                <div class="qol-add-step-container">
                    <input type="text" id="qol-new-step-input" placeholder="+ Add a step to this checklist..." />
                    <div id="qol-add-step-btn" class="qol-wl-action-btn primary" style="max-width: 60px !important;">Add</div>
                </div>
            `;
        }

        if (checklist.pretext) {
            html += `<div class="qol-checklist-pretext"><em>${checklist.pretext}</em></div>`;
        }
        
        html += '<ul class="qol-checklist-list">';
        checklist.steps.forEach((step, index) => {
            const isChecked = progress.includes(index);
            html += `
                <li class="${isChecked ? 'completed' : ''}">
                    <input type="checkbox" data-checklist="${checklistId}" data-index="${index}" ${isChecked ? 'checked' : ''}>
                    <span>${step}</span>
                    ${isCustom ? `<span class="qol-step-delete-btn" data-index="${index}" title="Delete step">&times;</span>` : ''}
                </li>
            `;
        });
        html += '</ul>';
        body.innerHTML = html;

        // Add Step Handler
        if (isCustom) {
            const input = body.querySelector('#qol-new-step-input');
            const addBtn = body.querySelector('#qol-add-step-btn');

            const handleAddStep = () => {
                const text = input.value.trim();
                if (!text) return;

                const customMap = getCustomChecklists();
                if (customMap[checklistId]) {
                    customMap[checklistId].steps.push(text);
                    saveCustomChecklists(customMap);
                    renderChecklistContent(checklistId);
                    showToast('Step added!', 'success');
                }
            };

            if (addBtn) addBtn.addEventListener('click', handleAddStep);
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') handleAddStep();
                });
            }

            // Delete Individual Step Handlers
            body.querySelectorAll('.qol-step-delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idxToRemove = parseInt(e.target.getAttribute('data-index'));
                    const customMap = getCustomChecklists();
                    if (customMap[checklistId] && customMap[checklistId].steps[idxToRemove] !== undefined) {
                        customMap[checklistId].steps.splice(idxToRemove, 1);
                        saveCustomChecklists(customMap);

                        // Re-adjust progress indices
                        const currentProgress = getProgress()[checklistId] || [];
                        const updatedProgress = currentProgress
                            .filter(i => i !== idxToRemove)
                            .map(i => i > idxToRemove ? i - 1 : i);

                        const progressObj = getProgress();
                        progressObj[checklistId] = updatedProgress;
                        localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progressObj));

                        renderChecklistContent(checklistId);
                        showToast('Step removed.', 'info');
                    }
                });
            });
        }

        body.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const cId = e.target.getAttribute('data-checklist');
                const idx = parseInt(e.target.getAttribute('data-index'));
                const li = e.target.closest('li');
                
                if (e.target.checked) {
                    li.classList.add('completed');
                } else {
                    li.classList.remove('completed');
                }
                saveProgress(cId, idx, e.target.checked);
            });
        });
    }

    function buildUI() {
        if (document.getElementById('qol-checklist-toggle-btn')) return;

        // Button
        checklistToggleBtn = document.createElement('div');
        checklistToggleBtn.id = 'qol-checklist-toggle-btn';
        checklistToggleBtn.title = 'Checklists';
        checklistToggleBtn.innerHTML = `
            <svg viewBox="0 0 24 24" style="fill:none !important; stroke:#7d6342 !important; stroke-width:2 !important; stroke-linecap:round !important; stroke-linejoin:round !important;">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
            </svg>
        `;
        
        checklistToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = window.getComputedStyle(checklistContainer).display === 'none';
            if (isHidden) {
                // Close others
                window.dispatchEvent(new CustomEvent('qol_close_others', { detail: { source: 'checklists' } }));
                
                const cogBtn = document.getElementById('qol-cog-btn');
                if (cogBtn) {
                    const rect = cogBtn.getBoundingClientRect();
                    checklistContainer.style.setProperty('position', 'fixed', 'important');
                    checklistContainer.style.setProperty('top', (rect.bottom + 20) + 'px', 'important');
                    checklistContainer.style.setProperty('left', rect.left + 'px', 'important');
                    checklistContainer.style.setProperty('transform', 'none', 'important');
                }
            }
            if (isHidden) { checklistContainer.style.setProperty('display', 'flex', 'important'); } else { checklistContainer.style.setProperty('display', 'none', 'important'); }
        });

        document.body.appendChild(checklistToggleBtn);
        if (typeof window.qolRepositionAllButtons === 'function') window.qolRepositionAllButtons();

        // Window
        checklistContainer = document.createElement('div');
        checklistContainer.id = 'qol-checklist-container';
        checklistContainer.style.setProperty('display', 'none', 'important');
        checklistContainer.innerHTML = `
            <div class="qol-checklist-header">
                <span>Checklists</span>
                <span class="qol-checklist-close">&times;</span>
            </div>
            <div class="qol-checklist-toolbar">
                <select id="qol-checklist-select"></select>
                <div id="qol-checklist-toolbar-actions"></div>
            </div>
            <div class="qol-checklist-body-content"></div>
        `;
        document.body.appendChild(checklistContainer);

        const headerEl = checklistContainer.querySelector('.qol-checklist-header');
        makeDraggable(checklistContainer, headerEl);
        makeResizable(checklistContainer);
        
        checklistContainer.querySelector('.qol-checklist-close').addEventListener('click', () => {
            checklistContainer.style.setProperty('display', 'none', 'important');
        });

        checklistContainer.querySelector('#qol-checklist-select').addEventListener('change', (e) => {
            renderChecklistContent(e.target.value);
        });

        updateSelectOptions('');
        renderChecklistContent('');
    }

    function init() {
        if (isEnabled()) {
            buildUI();
        } else {
            if (checklistContainer) checklistContainer.remove();
            if (checklistToggleBtn) checklistToggleBtn.remove();
            checklistContainer = null; checklistToggleBtn = null;
        }
    }

    window.addEventListener('qol_close_others', (e) => {
        if (e.detail && e.detail.source !== 'checklists') {
            if (checklistContainer) checklistContainer.style.setProperty('display', 'none', 'important');
        }
    });

    window.addEventListener('qol_setting_changed', (e) => {
        if (e.detail && e.detail.key === FEATURE_KEY) {
            init();
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();