# Extension language selector

Choose Extension language in APES settings. Available locales: en, pt-PT, es-ES, fr, ru, cs, de and it. English is the default. The preference is saved globally in Chrome local storage and synchronized between tabs.

The seven non-English catalogs each contain 491 translated messages. Labels without a translation fall back to English; translation coverage is not yet complete. Player names, messages, saved labels and game content are left untouched. Language names use their native spelling.

Edit tools/translations.tsv and run node tools/build-locales.cjs to regenerate the bundled catalog. No translation service is contacted at runtime. Run node tests/localization.cjs for language persistence, switching, dynamic UI, translated attributes, data isolation and save-error checks.
