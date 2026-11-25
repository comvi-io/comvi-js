# Everything is passed to `createI18n()`; each concern is its own subpath

Status: accepted · Date: 2026-11-25 · Rewritten for 0.8. It replaces the 0.5–0.7 record of
`.use(installer)` as the composition verb, which 0.8 removed; that version is in git history.

## Context

Up to 0.7 an instance was created and then composed: `.use()` installed a loader, a detector, the
devtools hook or the ICU compiler, and `init()` started it. The order of those calls mattered, a
composed instance could be used before it was complete, and every package needed rules for what
`.use()` may do after the first `t()`. The 0.8 core has one message syntax built in, so there is no
compiler to install, and every other capability is either a function of the instance (a loader, a
formatter) or a plugin with a lifetime.

## Decision

- **One constructor, complete at creation.** `createI18n(options)` takes everything the instance
  will ever have: `locale`, `fallbackLocale`, inline `messages` and `catalogs`, `loader`,
  `namespaces`, `plugins`, `timeZone`, `formats`, `onError`, `missing`. It starts the loads of its
  `namespaces` itself; `i18n.ready` settles when those loads settle. There is no `init()` and no
  `.use()`.
- **Configuration is immutable.** Options are read at creation; changing an object that was passed
  is not a way to reconfigure an instance.
- **A plugin is `{ name, setup(i18n) }`.** `setup` runs once in `createI18n()`; the function it may
  return runs on `destroy()`. `detect()` and `persist()` (`@comvi/core/plugins`) and `devtools()`
  (`@comvi/core/devtools`) are plugins of this shape.
- **A loader is a function** `(locale, ns, signal) => Promise<catalog>`. `cdn()` and `api()`
  (`@comvi/core/cdn`) build one; any function of that shape is one.
- **One subpath per concern**, so an app pays only for what it imports: `@comvi/core` (the
  instance, `negotiate`), `/cdn` (loaders and the catalog store), `/plugins`, `/format`,
  `/devtools`, `/ssr` (`handover()`). `/internal` holds the seams the bindings use and carries no
  semver guarantee.
- **The bindings add rendering, not composition.** React, Svelte and Solid re-export the core's
  `createI18n`; Vue's `createI18n` returns the same instance with an `install()` for `app.use()`.

```ts title="src/i18n.ts"
import { createI18n, type Plugin } from "@comvi/core";
import { cdn } from "@comvi/core/cdn";
import { detect, persist } from "@comvi/core/plugins";
import { devtools } from "@comvi/core/devtools";

const logSwitches: Plugin = {
  name: "log-switches",
  setup(i18n) {
    let last = i18n.locale;
    return i18n.on(() => {
      if (i18n.locale !== last) console.info(`locale: ${(last = i18n.locale)}`);
    });
  },
};

export const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  loader: cdn("https://cdn.comvi.io/<distribution>"),
  plugins: [detect({ supported: ["en", "uk"] }), persist(), devtools(), logSwitches],
});
```

## Consequences

- An instance is usable from the line that creates it: `t()` renders what is in place and the
  key for the rest, and `ready` says when the startup loads settled.
- Adding a capability later means creating another instance. A server creates one per request
  ([ssr.md](ssr.md)).
- A plugin cannot change the options of the instance it is given; it reads and subscribes like any
  caller, and its teardown runs on `destroy()`.

## Alternatives rejected

- **Keep `.use()` for plugins only.** It brings back the ordering question (a plugin composed after
  the first load) for a gain of one call site.
- **A compiler option for ICU.** The message syntax is one and built in; see [icu.md](icu.md).

## Where it lives

`createI18n`, `I18nOptions`, `Plugin`, `Loader` (`packages/core/src/instance.ts`); `detect`,
`persist` (`packages/core/src/plugins.ts`); `devtools` (`packages/core/src/devtools.ts`); `cdn`,
`api`, `createCatalogStore` (`packages/core/src/cdn.ts`); the export map of `packages/core/package.json`.
