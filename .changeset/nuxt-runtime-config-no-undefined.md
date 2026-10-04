---
"@comvi/nuxt": patch
---

A production build of an app without `comvi.messages` no longer answers every page with HTTP 500 `E_MESSAGES_NOT_OBJECT`.

This hit any app that loads its catalogs through a `comvi.host.ts` loader or the CDN, which is the documented Connect to Comvi setup. `nuxt dev` was not affected. The module wrote unset options into the public runtime config as `undefined`, and Nitro turns `undefined` into `""` when it serializes that config. The runtime then passed `messages: ""` to `createI18n`, which rejects a string catalog. The module now leaves unset options out of the runtime config. The client plugin and the per-request server host also treat an empty `messages` as no catalog, so an empty `NUXT_PUBLIC_COMVI_MESSAGES` override is safe too.
