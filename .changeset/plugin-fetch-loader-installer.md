---
"@comvi/plugin-fetch-loader": minor
---

**Added: `fetchLoader(options)` — the bare-name `.use(…)` installer.** `@comvi/core` is the
base host now, so async loading and the plugin host are imports you add; the installer does
both in one call and then registers the plugin you already know.

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader/api";

const i18n = createI18n({ locale: "en" }).use(fetchLoader({ cdnUrl }));
await i18n.init();
```

That replaces `createI18n({ … }).use(attachLoader).use(attachPlugins)` followed by
`i18n.registerPlugin(fetchLoaderPlugin({ … }))`.

`fetchLoaderPlugin` behaves exactly as `FetchLoader` did (the rename is in its own
changeset), and the installer re-implements no lifecycle: `required`,
`timeout`, `onError`, cleanup registration and LIFO destroy keep running inside the plugin host,
because the installer's last act is `registerPlugin`. It composes `@comvi/core/loader` and
`@comvi/core/plugins` idempotently, so a host that already has either keeps everything registered
on it. One timing difference is deliberate: `fetchLoader` builds the plugin while it composes, so
a missing `cdnUrl` throws at COMPOSITION rather than at `init()`. The exported installer type is
`FetchLoaderInstaller`.

Putting one in the other's slot is rejected: both cross-uses are type errors, and at runtime
`registerPlugin(fetchLoader(…))` fails at `init()` with `E_INSTALLER_AS_PLUGIN`, on the
installer's first ensure-step, naming `fetchLoader` and the `.use` form, while
`.use(fetchLoaderPlugin(…))` runs the plugin against a host that has neither capability — and on
one that has both it throws `E_USE_NOT_INSTALLER`, because an installer widens the host in
place and hands that same host back, and a plugin never does.
