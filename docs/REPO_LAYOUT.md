APES QoL repository layout

- js/features/: top-level, user-facing APES tools/features only.
- js/modules/<feature>/: implementation modules that belong to one feature.
- js/helpers/: generic JavaScript utilities shared by multiple unrelated features (create/use only when a genuinely shared helper exists).
- css/features/: primary feature styles.
- css/modules/<feature>/: feature-internal module styles.
- css/helpers/: generic shared style fixes/utilities.

Keep feature load order explicit in manifest.json. Moving a file between these folders must preserve its load order unless the dependency itself is intentionally changed.
