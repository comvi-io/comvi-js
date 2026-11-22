---
"@comvi/core": minor
---

Two copies of `@comvi/core` in one app now fail with an error that names both versions, in the production build too: a binding (or `handover()`) that resolves one copy while the app created its instance with another throws `two copies of @comvi/core: <the instance's version>, <the reading copy's version>`; the development build says the same in a sentence. Two copies of one version are caught as well. An instance carries the version of the core that made it under `Symbol.for("comvi")`. Every `@comvi/*` package in an app must be on one version.
