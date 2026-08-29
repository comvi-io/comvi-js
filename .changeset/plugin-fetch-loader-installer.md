---
"@comvi/plugin-fetch-loader": minor
---

**Added: `fetchLoader(options)` — the lowercase `.with(…)` installer.**

`@comvi/core` is the base host now, so async loading and the plugin host are imports you add. The installer does both in one call and then registers the plugin you already know:

```ts
import { createI18n } from "@comvi/core";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const i18n = createI18n({ locale: "en" }).with(
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);
await i18n.init();
```

That replaces `createI18n({ … }).with(attachLoader).with(attachPlugins)` followed by `i18n.use(FetchLoader({ … }))`.

### Two names, one lifecycle

|                   | `.with(fetchLoader(options))`                 | `.use(FetchLoader(options))`                                        |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| what it is        | the installer — lowercase                     | the plugin factory — uppercase                                      |
| the host it needs | any host                                      | one that already has `@comvi/core/loader` and `@comvi/core/plugins` |
| what it composes  | both capabilities, idempotently, loader first | nothing                                                             |

`FetchLoader` is **unchanged**. The installer does not re-implement anything: `required`, `timeout`, `onError`, cleanup registration and LIFO destroy all keep running inside the plugin host, because the last thing the installer does is call `use`. Composing onto a host that already has either capability installs nothing and keeps everything already registered. The one timing difference is deliberate: `fetchLoader` builds the plugin while it composes, so a missing `cdnUrl` throws at COMPOSITION rather than at `init()`.

The exported installer type is `FetchLoaderInstaller`.

### Putting one in the other's slot is rejected

Nothing is branded — an installer and a plugin are both "a function of the host" — so both cross-uses are type errors, and both are loud at runtime:

- `.use(fetchLoader(…))` fails at `init()` on the installer's first ensure-step, **before** either capability is attached and before a second plugin reaches the queue. The message names `fetchLoader` and the `.with` form.
- `.with(FetchLoader(…))` calls the plugin against a host that has neither capability, so the invocation is rejected. `.with` remains a dumb pipe: it never inspects, orders or brands what you hand it.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.
