---
"@comvi/nuxt": patch
---

Fail fast when the `comvi.setup` hook throws. Previously setup errors were swallowed outside dev mode and `i18n.init()` ran anyway, which could leave the app in a partially configured state (missing loaders/hooks) with hard-to-diagnose behaviour. The error is now rethrown in all environments after being reported.
