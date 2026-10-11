---
"@comvi/next": patch
---

**Behaviour change: `createNextI18n` no longer composes browser-extension discovery.** Until now it attached discovery to every Next app on its own, so the i18n instance was published on `window.__COMVI__` and got an auto-generated `instanceId`. Now a Next app is not visible to the Comvi browser extension, and `i18n.instanceId` is `undefined`, until the app composes discovery itself, as with every other binding.

To get the previous behaviour, add `.use(devtools())` to the result in the shared config module:

```diff
-import { createNextI18n } from "@comvi/next";
+import { createNextI18n, devtools } from "@comvi/next";

-export const { i18n, routing } = createNextI18n({ ...routing });
+export const { i18n, routing } = createNextI18n({ ...routing }).use(devtools());
```

`devtools` is also exported from `@comvi/next/client` and `@comvi/next/server`. On the server, where there is no `window`, it publishes nothing and assigns no id. `createNextI18n` never took `instanceId` or `exposeGlobal` (passing either is a type error, and the factory does not forward them); both go to the installer: `devtools({ instanceId: "app" })`.
