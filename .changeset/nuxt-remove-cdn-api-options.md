---
"@comvi/nuxt": minor
---

**BREAKING (breaking change on a 0.x minor): `comvi.cdnUrl` and `comvi.apiBaseUrl` are removed.**

Both were documented with `@example "https://cdn.comvi.io/your-distribution-id"` and written into
`runtimeConfig.public.comvi`, and no runtime code in this package ever read either one. An app
that set them got a config key, a serialized payload entry, and no loading — the exact shape of a
setting that looks configured and does nothing. They are removed rather than wired: this module
composes nothing on your behalf, which is the same rule that makes `hostModule` the only way to
get a loader.

**Migration.** A 0.4 app that set `cdnUrl` composes the loader in its host file instead:

```ts
// comvi.host.ts
import { createI18n, type NuxtHostFactory } from "@comvi/nuxt/host";
import { cdnLoader } from "@comvi/plugin-fetch-loader";

export default ((options) =>
  createI18n(options).use(
    cdnLoader({ cdnUrl: "https://cdn.comvi.io/51db17c3d52f4e7eba810b7bb9b6576b" }),
  )) satisfies NuxtHostFactory;
```

…and points `comvi.hostModule` at it. `apiBaseUrl` moves the same way, into the loader plugin's
own options.

`comvi.apiKey` STAYS: it is forwarded to the host as `i18n.apiKey`, where a loader plugin such as
`@comvi/plugin-fetch-loader` reads it. Its doc comment no longer implies this module does CDN or
API loading.
