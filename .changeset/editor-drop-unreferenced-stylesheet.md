---
"@comvi/plugin-in-context-editor": patch
---

The package no longer ships two stylesheets that nothing loaded; the editor textarea looks the same, because its placeholder and selection colours already come from utility classes inside the editor's shadow root.
