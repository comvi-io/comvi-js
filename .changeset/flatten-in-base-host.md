---
"@comvi/core": minor
"@comvi/next": minor
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/vue": minor
---

A nested inline catalog now works on every host, and `flattenCatalog` stops being an escape hatch.

`createI18n({ translation: { en: { nav: { home: "Home" } } } })` type-checked before, warned once in
development, and then resolved every key under `nav` as missing in production — because flattening
was an optional capability hook (`_flattenNs`) that only a loader-bearing host installed, and a base
host stored the nested object as if it were flat. `addTranslations()` had the same hole.

Flattening now happens in the BASE host, unconditionally, at the one place a catalog enters. Nested
objects and flat dotted keys are the same catalog everywhere — in the constructor, in
`addTranslations()`, and in a loader result — and a mixed object carrying both works too. With that,
two things are gone:

- the dev warning that told you a base host "stores catalogs as given";
- `flattenCatalog` as the answer to that rule. It is still exported, from the `@comvi/core` ROOT
  only, for pre-flattening data by hand.

Non-string leaves now behave identically on every host, as they already did on the loader path:
coerced with `String()`, and `null`/`undefined` leaves dropped with a dev warning. On a base host a
`null` leaf used to be stored verbatim and resolve as an empty template.

MIGRATION — `flattenCatalog` is no longer re-exported from `@comvi/core/loader`, nor from the
`@comvi/react`, `@comvi/solid`, `@comvi/svelte`, `@comvi/vue`, `@comvi/next/client` and
`@comvi/next/server` roots. In almost every case the call can simply be deleted:

```diff
-import { createI18n } from "@comvi/react";
-import { flattenCatalog } from "@comvi/react";
+import { createI18n } from "@comvi/react";

-createI18n({ locale: "en", translation: { en: flattenCatalog({ nav: { home: "Home" } }) } });
+createI18n({ locale: "en", translation: { en: { nav: { home: "Home" } } } });
```

If you still want the function itself — to inspect the keys a catalog will produce, or to merge
several sources before handing one object over — import it from `@comvi/core`:

```ts
import { flattenCatalog } from "@comvi/core";
```

Also: `init()` now warns once, in development only, when an option was passed whose capability was
never composed — `ns` without the loader (naming `.use(loader(map))`), and `instanceId` /
`exposeGlobal: true` without discovery (naming `.use(devtools({ instanceId }))`). Both used to do
nothing and say nothing. Production stays silent.
