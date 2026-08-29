---
"@comvi/plugin-locale-detector": minor
---

**Added: `localeDetector(options)` — the lowercase `.with(…)` installer.**

`@comvi/core` is the base host now, so the plugin host is an import you add. The installer composes it and registers the plugin you already know, in one call:

```ts
import { createI18n } from "@comvi/core";
import { localeDetector } from "@comvi/plugin-locale-detector";

const i18n = createI18n({ locale: "en" }).with(
  localeDetector({ supportedLocales: ["en", "uk", "de"], caches: ["cookie"] }),
);
await i18n.init();
```

That replaces `createI18n({ … }).with(attachPlugins)` followed by `i18n.use(LocaleDetector({ … }))`.

### Two names, one lifecycle

|                   | `.with(localeDetector(options))` | `.use(LocaleDetector(options))`            |
| ----------------- | -------------------------------- | ------------------------------------------ |
| what it is        | the installer — lowercase        | the plugin factory — uppercase             |
| the host it needs | any host                         | one that already has `@comvi/core/plugins` |
| what it composes  | the plugin host, idempotently    | nothing                                    |

No loader capability is composed, deliberately: the detector hands core a locale, it never loads a catalog, and core loads namespaces through whatever loading the host already has.

`LocaleDetector` is **unchanged**. The installer does not re-implement anything: `required`, `timeout`, `onError`, cleanup registration and LIFO destroy all keep running inside the plugin host, because the last thing the installer does is call `use`. Composing onto a host that already has the capability installs nothing and keeps every plugin already registered.

The exported installer type is `LocaleDetectorInstaller`.

### Putting one in the other's slot is rejected

Nothing is branded — an installer and a plugin are both "a function of the host" — so both cross-uses are type errors, and both are loud at runtime:

- `.use(localeDetector(…))` fails at `init()` on the installer's first ensure-step, **before** the plugin host is attached and before a second plugin reaches the queue. The message names `localeDetector` and the `.with` form.
- `.with(LocaleDetector(…))` calls the plugin against a host with no `registerLocaleDetector`, so the invocation is rejected. `.with` remains a dumb pipe: it never inspects, orders or brands what you hand it.

See the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md) §4.
