# Extension language selector

Choose Extension language in APES settings. Available locales: en, pt-PT, es-ES, fr, ru, cs, de, it and pl. English is the default. The preference is saved globally in Chrome local storage and synchronized between tabs.

The eight non-English catalogs each contain 1,036 translated messages. Labels without a translation fall back to English; translation coverage is not yet complete. Player names, messages, saved labels and game content are left untouched. Language names use their native spelling.

Edit tools/translations.tsv and run node tools/build-locales.cjs to regenerate the bundled catalog. No translation service is contacted at runtime. Run node tests/localization.cjs for language persistence, switching, dynamic UI, translated attributes, data isolation and save-error checks.

Feature coverage checks: node tools/audit-feature-localization.cjs audits static template text, tooltips and bound text keys across the twelve localized feature areas. node tests/featureLocalization.cjs verifies Watchlists controls and Kingdom Management before/after stored scans in all locales, dynamic status messages, stable bindings, placeholder parity, and isolation of player/kingdom names. Authored messages are bound explicitly; page text and saved names are not globally translated.
