# Visual Tribe Skin

Choose Roman, Teuton or Gaul building artwork and Server default, Standard or Halloween artwork from the existing cosmetic feature. Seasonal artwork can fall back to the chosen tribe's standard building image, then the native image.

## Remove night overlay

The APES switch under the artwork choices is off by default. It is independent of tribe/artwork selection and works without selecting a different tribe. Turning it on removes the village/resource darkness layer, brightness and contrast filters, building lights and map camp night decorations. An APES-owned root class scopes the CSS to the game content, covering new/replaced views automatically. Native night classes, inline styles, images, controls, canvas nodes and game configuration remain intact.

The map also paints blue shading into its canvas. A small MAIN-world bridge finds the existing Angular MapService and its active map. For the supplied 0.121.7 client, MapService.yh() returns that map and map.Hi(intensity) changes its renderer's night intensity. While enabled, the bridge wraps only that map instance's visual method, forwarding zero intensity while retaining the latest native intensity. It preserves receivers, other arguments and return values. It does not intercept canvas APIs, change server time/configuration, send requests or alter night-truce rules.

Turning the switch off or disabling Visual Tribe Skin removes the root class and restores the original map method with its latest native intensity. Daytime stays daytime when restoring. The bridge listens for root-class changes and checks once per second only while enabled to handle late Angular initialization and replaced maps. Missing/changed game methods are skipped safely; CSS still applies, but a future game update may require updating the map bridge. Other extensions' replacement methods are not overwritten during cleanup.

The boolean preference is stored as apes_visual_tribe_skin_remove_night_v1 in this browser/server origin. It survives reloads and syncs preference changes across tabs. Existing APES backup prefixes include it; Storage Manager treats tribe, artwork and night preferences as protected Preferences rather than disposable visual cache data. No new permissions are added.

## Validation

Run `node tests/visualTribeSkins.cjs` and `node tests/nightOverlay.cjs`, or `npm test` from tests. The new suite exercises native CSS and inline conflicts, UI/keyboard switching, map shading calls, saved/default/malformed preferences, day/night restoration, feature disabling, map replacement, delayed/unavailable Angular, cross-tab updates and protected storage classification. The fixture uses fabricated content based on the supplied village and map structure. Local DOM verification checks both supplied HTML pages against the 0.121.7 stylesheet. These checks cover computed styles and bridge behavior; live-game visual verification is still needed.
