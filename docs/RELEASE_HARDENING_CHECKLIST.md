# APES QoL v2 — Release Hardening Checklist

This checklist is the pre-release smoke test for APES QoL v2. It intentionally favors regression detection over new feature work.

## 1. Core identity and storage

- [ ] Load a Travian server and verify `document.documentElement.dataset.apesPlayerId` resolves to a numeric logged-in player id.
- [ ] Switch villages and verify `document.documentElement.dataset.apesVillageId` follows the active village.
- [ ] Open another player's profile and verify the APES player id does **not** change to that profile's player id.
- [ ] Run `await APES.storage.audit()` in DevTools.
- [ ] `playerResolved` is `true`.
- [ ] `ambiguousPlayerKeys` is empty on a clean/current install.
- [ ] If old `:unknown:` keys exist, review them manually; do not auto-migrate or delete them.
- [ ] Verify two different accounts on the same server do not load one another's player-scoped APES data.

## 2. Version and release metadata

- [ ] Settings shows the same version as `chrome.runtime.getManifest().version_name`.
- [ ] Console startup label uses APES QoL, not the old Travian QoL label.
- [ ] README does not claim the project is still alpha 1/foundation.

## 3. Settings / toolbar / command surfaces

- [ ] Settings opens from the cog.
- [ ] Enabled toolbar tools appear once only and do not overlap.
- [ ] More than the expanded toolbar limit collapses into the cog overflow menu.
- [ ] Resource Upgrade Planner appears in its intended surfaces when enabled.
- [ ] B / Instant Finish appears in Settings and respects its toggle.
- [ ] G command palette shows only eligible enabled actions.
- [ ] Disabling a feature removes or disables its launcher without requiring a reload where the feature supports live toggling.

## 4. Backup and storage tools

- [ ] Manage Storage opens Storage Cleanup Manager, not the old destructive clear-cache dialog.
- [ ] Storage Cleanup Manager inventories current-server legacy APES keys and `apes:v2:` server/player keys.
- [ ] Protected preferences are not selected accidentally during normal cleanup.
- [ ] Backup export includes APES localStorage plus APES-owned chrome.storage.local keys.
- [ ] Backup import on the same server restores local + extension data.
- [ ] Backup import on a different server skips source-server localStorage while preserving portable extension data.

## 5. Rally Point Scanner

### Incomings
- [ ] Page 1 only: completes and releases the screen lock.
- [ ] 2+ pages: reaches every page exactly once.
- [ ] Empty final page/state does not hang the scan.
- [ ] Attack/Siege/Raid/Reinforcement filters match the selected controls.

### Outgoings
- [ ] Starts from page 1 regardless of the page currently open.
- [ ] 2+ pages: page number advances and does not jump back to page 1 mid-scan.
- [ ] Attack/Siege/Reinforcement/Merchant filters work independently.
- [ ] Scan lock always disappears after success and after an induced navigation failure.

### Incoming Resources
- [ ] Same sender/resource amount repeated in separate real movements is not collapsed merely because values match.
- [ ] 2+ pages are all parsed.

## 6. Auction House Scanner

- [ ] Scan with one page.
- [ ] Scan with multiple pages.
- [ ] Moving the mouse during scanning does not interrupt traversal.
- [ ] View navigation continues while the mouse moves.
- [ ] Interaction lock releases on success and failure.
- [ ] Sorting the consolidated result does not mutate the underlying scanned count.

## 7. Secret Society Scanner / History

- [ ] Scan a society with multiple pages.
- [ ] A second scan creates a history snapshot.
- [ ] Compare SS Scan opens with blank Scan A and Scan B selections.
- [ ] Scan B only offers snapshots later than Scan A.
- [ ] Compare stays disabled until both valid dates are explicitly chosen.
- [ ] Joined/Left/Stayed comparison renders correctly.
- [ ] Message icon still opens an IGM addressed to the selected member.
- [ ] Delete SS Data clears the matching stored history as intended.

## 8. Resource Upgrade Planner

- [ ] Scan village 06 once and create/view its roadmap.
- [ ] Scan village 07 once and create/view its roadmap.
- [ ] Alternate 06 ↔ 07 without rescanning; each restores its own saved state and roadmap by numeric villId.
- [ ] Queued upgrades move Pending → Queued from Dashboard cache.
- [ ] Completed levels move Queued/Pending → Complete.
- [ ] Planner can be dragged, resized smaller, and left open while clicking Travian outside it.
- [ ] Saved window geometry restores after reopening.

## 9. NPC Calculator

- [ ] Current stock/capacity parses correctly.
- [ ] Multi-pass plan is produced when storage requires multiple NPC passes.
- [ ] Open & Fill NPC opens the current village's actual Marketplace/NpcTrade tab.
- [ ] Suggested Wood/Clay/Iron/Crop values are inserted directly into Travian's inputs.
- [ ] Clipboard is untouched.
- [ ] NPC Calculator remains open after navigation/fill.

## 10. Building Alarm / Operations Center

- [ ] Create a Building Alarm and verify it appears in Operations Center → Next Events.
- [ ] When it reaches the instant-finish window it changes to Alarm ready.
- [ ] The duplicate generic Free Finish event for that same construction is suppressed.
- [ ] Construction completion/cancellation removes the alarm event.
- [ ] Clicking a resolvable alarm event opens the correct village/building location.

## 11. Account Operations Center

- [ ] Scan multiple villages without getting stuck on one village or route.
- [ ] Active and future BuildingQueue entries are distinguished correctly.
- [ ] Construction, Training, Smithy, Celebration and storage/crop attention states update from current data.
- [ ] Direct building links use the stored exact location when available.

## 12. Final packaging

- [ ] Manifest contains no deleted/abandoned feature file.
- [ ] No duplicate source/patch module is loaded for the same single-feature behavior.
- [ ] Extension reload produces no uncaught startup exception.
- [ ] No APES window uses a Travian-native button class for custom controls.
- [ ] Escape closes APES dialogs where intended and does not close persistent companion windows unexpectedly.
- [ ] Test once with toolbar expanded and once with toolbar collapsed.

## Release decision

Do not add a large new feature during this checklist. A failed item should be fixed in the canonical owning feature, followed by a focused regression of that feature and the shared service it uses.
