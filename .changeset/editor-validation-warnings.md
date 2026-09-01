---
"@comvi/plugin-in-context-editor": patch
---

`validateTranslations` now reports placeholder mismatches between plural forms through the new non-blocking `ValidationResult.warnings` array; previously the mismatch was computed and silently discarded.
