# Royal Tribute Countdown — verified model and implementation (2026-10-28)

## Branch safety

- Checkpoint: `checkpoint/pre-royal-tools-2026-10-28` at `b1989ae248139d76dfa43fb44579ed364204ce24`
- Development: `feature/royal-tribute-countdown`
- Production `main` remains unchanged until this feature is tested in-game.

## Discovery: hovering is not required

The HTML attachment's table has `tr[ng-repeat*="village in tributeVillages"]` rows with governor village links containing a numeric `villageid`. The game uses AngularJS, but direct scope inspection was unavailable in the browser. Accessing the **MAIN** world cache works instead:

`window.Cache.c['Village:<villageid>'].data`

The user verified these exact fields (names and example values):

| Game cache property | Value | Meaning |
| --- | --- | --- |
| `tributes` | `{1:35,2:31,3:31}` | Stored tribute amounts from last materialized data |
| `calculatedTributes` | `{1:43,2:38,3:38}` | Updated tribute amounts, total 119 |
| `tributeSum` | `119` | Total updated tribute amount |
| `tributesRequiredToFetch` | `1890` | Required amount for regular collection |
| `tributesCapacity` | `9450` | Tribute fund capacity; 20% × 9450 = 1890 |
| `tributeProduction` | `262` | Total hourly tribute production |
| `tributeProductionDetail` | `{1:94,2:84,3:84}` | Per-resource hourly tribute production |
| `canFetchTributes` | `false` | Game's authoritative collection-ready flag |
| `allowTributeCollection` | `1` | This governor permits collection |
| `tributesOnTheirWay` | `false` | No collection currently travelling |
| `timeUntilTributeFetch` | `1793207817.1852214` | Game-calculated **Unix timestamp in seconds** when tributes should become available |
| `timeUntilTributeFull` | `1793311695.0478168` | Separate full-fund timestamp, **not** the collection threshold |
| `lastTributeCalculation` | `1793183504922` | Last tribute calculation Unix timestamp in milliseconds |

At the last calculation, the game-provided ETA is approximately **6h 45m 13s**. A production-only calculation `(1890−119)/262 × 3600` is close but not identical. The tool therefore **uses the game's own timestamp first** and only falls back to a clearly labelled estimate if it is absent.

Do not confuse ordinary `storage`/`production` with tribute-specific fields.

## Implementation

- `js/modules/royalTributes/etaCalculator.js`: pure, tested math and status interpretation. Prefers `timeUntilTributeFetch`. Distinguishes `ready`, `on_way`, `denied`, `pending`, `game_eta`, `estimated`, `stalled` and `unknown`.
- `js/modules/royalTributes/liveCountdown.js`: read-only script in **MAIN world**. Every second, identifies each connected governor's village ID from the existing `tributeVillages` table, reads that village from `Cache.c`, and inserts a short status in a **dedicated third table column** to the right of the native collection widget. It also adds the number of connected own-governor villages in header column 1 and their combined hourly **tribute** production in header column 2. The timestamp is subtracted from `Date.now()` each update, so inactive background tabs don't make it drift.
- `css/features/royalTributeCountdown.css`: compact APES-style labels, with different colors for ready, countdown, and unavailable. The timer uses two-digit hours and minutes such as `04h59m`, and shows `Ready` when collectible.
- `js/ui/menu.js`: **Kingdom Management → Royal Tribute Countdown** toggle, backed by existing `qol_royalTributeCountdown` preference.
- `manifest.json`: includes scripts/styles on the development branch.
- `tests/royalTributeEta.cjs` and `tests/royalTributeCountdown.cjs`: unit and DOM-stub regression tests, included in `tests/package.json`.

### Safety and accuracy

- No game endpoint requests, hovering, mouse movement, clicks, resource transfers, persistent village data, or new extension permissions.
- Never mark `Ready to collect` on a mere elapsed timer; only `canFetchTributes` can confirm it.
- When `timeUntilTributeFetch` has passed but `canFetchTributes` remains false, show **Awaiting game update**.
- If no valid game timestamp exists, estimate from `tributesRequiredToFetch`, `tributeSum` and `tributeProduction` and label it `Est.`.
- Denied collection, tributes in flight and stopped production have distinct statuses.
- Values can change with production bonuses, capacity, raiding, fealty or game-side effects; live game cache is refreshed by Travian.

## Remaining acceptance testing

The code passes mocked DOM and calculation tests, but has **not been visually or functionally tested on a real Royal account**. Install the development branch and open Kingdom → Tributes. Verify:
1. Governor rows show compact `XXhYYm` or `Ready` statuses in the new third column, without tooltip hovering or obscuring native Collect buttons.
2. Different villages show different timers, and `Big Ping Pong` reads `Ready` when collection is enabled. The native button is used as a fallback if a village's game-cache entry hasn't loaded yet.
3. Timers decrease, and refresh correctly after Travian updates the game's cache.
4. Disabling `Royal Tribute Countdown` in settings removes the added third column, header badges and labels, restoring the original two-column table.
5. Collection in progress or no collection permission is not falsely marked Ready.

Once that works, merge the development branch into main. Do **not** change the checkpoint branch.

## Three-column UI refinement

The header of **Own governors** now shows connected own-governor village count (first column), sum of known `tributeProduction` values as `N res/h` (second column; `≥ N res/h` if a village's rate is missing), and `ETA` (third column). Each connected governor row has a compact third-column timer (`XXhYYm`) or `Ready`. Other conditions show `On way`, `Denied`, `Pending`, `Stopped`, or `—`. The original progress bar and Collect button remain interactive. The feature does not alter foreign governors or deny-tributes tables. Unit/DOM-stub tests passed; the live layout still needs visual inspection.
