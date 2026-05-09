---
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Fix broken documentation URLs in published READMEs. The `@comvi/cli` README pointed at `/docs/i18n/tooling/cli/` (404) — corrected to `/docs/cli/`. The `@comvi/vite-plugin` README's documentation links pointed at `/docs/i18n/tooling/vite-plugin/`, which doesn't exist at any URL — links removed until docs ship.
