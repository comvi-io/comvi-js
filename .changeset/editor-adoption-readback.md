---
"@comvi/plugin-in-context-editor": patch
---

The in-context editor counts its stylesheet as adopted wherever it sits among the shadow root's adopted sheets, and takes a half-finished adoption back before it falls back to a `<style>` element, so its styles are never applied twice.
