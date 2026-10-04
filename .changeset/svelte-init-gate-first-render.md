---
"@comvi/svelte": patch
---

`isInitializing` reads `true` while the auto-init `setI18nContext` scheduled has not started yet, so the documented `{#if $isInitializing}` gate is closed from the first render and raw keys are never rendered.
