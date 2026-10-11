---
"@comvi/plugin-in-context-editor": patch
---

The in-context editor now applies its styles through a constructable stylesheet instead of an inline `<style>` element, so it renders on sites whose Content Security Policy has a strict `style-src`; the standalone build also exposes its own `version` and reports the `devtools()` editor loader it found in `getStatus().hook`.
