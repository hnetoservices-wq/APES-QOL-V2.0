# Royal Tribute ETA — investigation (2026-10-28)

## Branch safety

- Immutable checkpoint: `checkpoint/pre-royal-tools-2026-10-28`
- Development: `feature/royal-tribute-countdown`
- Starting commit for both: `b1989ae248139d76dfa43fb44579ed364204ce24`
- Do not deploy to `main` until real game-model values have been verified.

## Evidence from supplied HTML/screenshots

The saved page shows Kingdom → Tributes, with six `tr[ng-repeat*="village in tributeVillages"]` rows.

- Every row has a `village="village"` AngularJS model binding.
- Each collectible fund bar has `tooltip-class="tributesProductionTooltip"` and lazy template `tpl/society/partials/kingdom/tributes/tributesProductionTooltip.html`.
- The progressbar has `perc` and `marker`, e.g. `perc="15" marker="21"` for Cookix / Rage.
- The button uses `ng-class="{disabled: !village.data.canFetchTributes, ...}"`.
- The tooltip is NOT embedded in the saved HTML (the rendered tooltip's production fields cannot be recovered from this static file).
- Screenshot shows Cookix / Rage tooltip: stored 1,739 / 11,813, production 64 wood/h, 65 clay/h, 64 iron/h. This correctly explains the ~15% displayed progress (1739 / 11813 ≈ 14.72%). The source of those numbers in the live JavaScript model has **not** been verified.

## Verified game mechanic

The Travian Kingdoms support articles "Tributes" and "How to Collect Tributes and Treasures" say tribute collection becomes possible after the tribute fund is at least 20% full, provided the village is eligible. The current game's readiness flag remains authoritative. Approximate ETA:

`ceil((0.20 × totalFundCapacity − currentStoredTribute) / (woodTributePerHour + clayTributePerHour + ironTributePerHour) × 3600)` seconds.

This is an estimate, not a guaranteed timer: attacks, production changes, permission changes, cap changes and game-side timing may alter the outcome. Also avoid using the rounded on-screen `marker` as the exact internal threshold without validation.

## How to obtain production *without hovering*

Travian uses AngularJS. In the live **MAIN** world, `angular.element(tributeRow).scope()?.village` is likely available because the row uses `ng-repeat` with `village`. The game's cache may expose `Cache.c['Village:<id>']`. This should be read only: do not issue game API requests or simulate mouse events.

Existing APES source already uses MAIN-world read-only data bridges (e.g. `js/core/playerIdentityBridge.js`, `js/modules/villageDashboard/bridge.js`) to access game models safely and publish only minimal data back to isolated scripts.

**Important:** This static saved HTML does not contain the AngularJS in-memory model. We therefore cannot confirm the exact object keys for the current fund, maximum and hourly rate yet, nor that those keys exist without hover. Avoid guessing or displaying an apparently exact timer based only on bar percentages.

## Next live validation

On a live royal account open Kingdom → Tributes. In the devtools Console, verify the `village` model contains the three values needed:

```js
const row = document.querySelector('tr[ng-repeat*="village in tributeVillages"]');
const scope = window.angular?.element(row)?.scope();
const village = scope?.village;
console.log('Village data keys relevant to tribute:', Object.keys(village?.data || {}).filter(k => /tribut|production|resource|capacity/i.test(k)));
```

Only share **field names**, not the entire account model. Once confirmed, implement an exact field mapping and a MAIN-world bridge that publishes only the numeric `villageId`, `current`, `capacity`, `productionPerHour`, `canFetchTributes` and `collectionAllowed`, with no network activity or persistent logging. The isolated UI can then display `Ready`, `~HH:MM until collectible`, or `Unavailable` beneath each governor row. Recompute from current model values and recheck actual game readiness rather than free-running an uncorrected timer.

## Development status

Implemented and unit-tested: pure conservative ETA arithmetic in `js/modules/royalTributes/etaCalculator.js`.

Not implemented: live Angular field bridge, in-game rows, or automatic runtime loading. These are intentionally deferred until the model's actual properties have been verified. No current-user data is transmitted or stored.
