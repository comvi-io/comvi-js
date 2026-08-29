<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vue</h1>

<p align="center">Vue 3 binding for Comvi i18n — plugin, composable, and <code>&lt;T&gt;</code> component.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vue"><img src="https://img.shields.io/npm/v/@comvi/vue?color=blue" alt="npm"></a>
  <a href="https://bundlephobia.com/package/@comvi/vue"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/vue?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/vue` wraps [`@comvi/core`](../core) for Vue 3. `app.use(i18n)` installs `$t` and `$i18n` global properties; `useI18n()` returns reactive refs that integrate with Vue's reactivity system.

Same `t()` and `<T>` API as the [React](../react), [SolidJS](../solid), and [Svelte](../svelte) bindings — switch frameworks without relearning your i18n layer.

For Nuxt 3, use [`@comvi/nuxt`](../nuxt) — it adds SSR, locale routing, and auto-imports on top of this package.

📖 **Documentation:** https://comvi.io/docs/i18n/vue/

## Why Comvi i18n?

Comvi i18n is a modern, framework-agnostic internationalization library built on three principles: type-safe translations, real ICU MessageFormat, and zero compromises on bundle size or security.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`) — translators see clean markup, you decide what each tag renders to. No raw HTML, no unsafe DOM injection, no splitting a sentence across template fragments.
- **Real ICU MessageFormat.** Plurals, ordinals, and select all follow locale-correct grammar via `Intl.PluralRules` — Polish, Ukrainian, Arabic, Welsh, and the rest. Same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~7.0 kB minified + gzipped for a default app graph (measured, `vue` externalized), zero runtime dependencies.** That is the base host plus the vue bindings and the `VueI18n` preset; ICU, async loading, the plugin host and devtools discovery cost only where you compose them. No `eval` or `new Function` anywhere — runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable, not monolithic.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor` — one lowercase `.with(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt) — switch frameworks without relearning your i18n layer.

## Why @comvi/vue?

- **Reactivity first.** `useI18n()` returns Vue refs and computed properties — changes to language or translations trigger precise re-renders without manual store subscriptions.
- **Template-native API.** `<T>` component uses named slots for tag interpolation; `$t` template helper and `$i18n` global property eliminate boilerplate in Options API code.
- **Single plugin, both APIs.** One `app.use(i18n)` install works seamlessly with Composition API, Options API, and component templates.

## Install

```bash
npm install @comvi/vue
# Peer: vue ^3.0.0
```

## Quick start

```ts
// main.ts
import { createApp } from "vue";
import { createI18n } from "@comvi/vue";
import App from "./App.vue";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createApp(App).use(i18n).mount("#app");
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { useI18n } from "@comvi/vue";
const { t, locale, setLocale } = useI18n();
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <select :value="locale" @change="setLocale(($event.target as HTMLSelectElement).value)">
    <option value="en">English</option>
    <option value="uk">Українська</option>
  </select>
</template>
```

For the `<T>` component (rich text with slot-based tag interpolation), `$t` template helper, type-safe keys, and the full composable API, see the [documentation](https://comvi.io/docs/i18n/vue/).

## Capability composables: `useI18nLoader()` / `useI18nPlugins()`

Async loading and the plugin host are `@comvi/core` **capabilities**, not part
of the translation core. Since 0.5.0 their members are acquired explicitly
rather than being handed out by `useI18n()`:

```vue
<script setup lang="ts">
import { useI18n, useI18nLoader, useI18nPlugins } from "@comvi/vue";

const { t } = useI18n("admin");
const { addActiveNamespace, reloadTranslations, onLoadError } = useI18nLoader();
const { onMissingKey } = useI18nPlugins();
</script>
```

Neither takes parameters — the namespace argument stays on `useI18n(ns)`. The
bag is referentially stable per host instance (keyed on the core, so two
`VueI18n` wrappers over one host share it).

On a host that lacks the capability the acquisition call throws — in
development **and** production, never a silent no-op:

```
[comvi] This i18n instance has no loader capability. Compose it: .with(loader()) from "@comvi/core/loader", or the lower-level attachLoader.
```

**`VueI18n` dropped its eight instance proxies.** `addActiveNamespace`,
`reloadTranslations`, `registerLoader`, `registerLocaleDetector`,
`registerPostProcessor`, `onMissingKey`, `onLoadError` and `use` are gone from
the class; the host it wraps is public as `readonly core`, so registration
happens there:

```diff
-i18n.registerLoader(myLoader);
-i18n.use(FetchLoader({ … }));
+i18n.core.registerLoader(myLoader);
+i18n.core.use(FetchLoader({ … }));
```

Note that `i18n.core.use(…)` returns the host, not the wrapper, so it no longer
chains off the `createI18n(…)` call. Nothing on `VueI18n` is typed present and
then throws "missing capability" — that is why `use` left with the rest.

Migrating from 0.4.x: `pnpm codemod:framework-slim "src/**/*.{ts,vue}"` (it
rewrites the destructures and _reports_ the proxy call sites, whose receiver
type is textually undecidable), or the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Supported hosts and what they cost

`createI18n(options)` keeps its 0.4 signature and still builds the host for you
— a `@comvi/core` base host, so ICU, tag syntax, async loading, the plugin host
and devtools discovery are each something you compose, never something the
wrapper carries by default. `createCore(options)` is core's own constructor
when you want to build that host yourself, and
`createI18nFromCore(core, options?)` wraps whatever you built, preserving its
exact type as `i18n.core`. All three ship from the one entry.

Whole-app comvi graph, min+gz, `vue` externalized
(`node scripts/size-check.mjs`):

| app shape                         | size fixture              | min+gz      |
| --------------------------------- | ------------------------- | ----------- |
| base host, one call, no `<T>`     | `fw-vue-default`          | **6966 B**  |
| base host, injected, no `<T>`     | `fw-vue-default-composed` | 6962 B      |
| base host, one call + `<T>`       | `fw-vue-default-t`        | **8812 B**  |
| base host + inline ICU            | `fw-vue-icu`              | **7848 B**  |
| full explicit composition + `<T>` | `fw-vue-full-composite`   | **11435 B** |

All five rows are live in `scripts/size-budgets.json`; the four gated ones are
sentinel-checked from the emitted module graph on every run and budgeted at
measured + 2%. The one-call default is +86 B (+1.25%) over the pre-convergence
single-package anchor and 3397 B (32.8%) below the historical 0.4 composed root,
which measured 10363 B.

`fw-vue-default-composed` is the exception and the reason it exists: it is
informational — measured and printed, never gated — because it is a comparison
row. Read against `fw-vue-default`, its delta is the whole `VueI18n`
construction path, the preset glue no other binding pays, because react, solid
and svelte have no wrapper object to build. On the converged entries that glue
is 4 B (6966 one-call against 6962 injected); before they converged it was 5 B
(6880 against 6875).

`<T>` adds the pure `@comvi/core/rich-text` path. It no longer registers
ambient string-API tags — the seam changed in this release — so its graph
excludes the tag-registration pair, exactly like the rows that never render it.

## One package, one entry

`@comvi/vue` is the whole toolkit: all three constructors, the base `I18n`
class, the vue bindings, and core's capability installers as **named**
re-exports. One entry, one build pass, one injection key — a vue app names one
package and nothing else, and no sibling entry exists whose `app.use(i18n)`
could be invisible to this one's `useI18n()`. Migrating a 0.4 app is
`pnpm codemod:framework-slim "src/**/*.{ts,vue}"`; the breaks are written up in
the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

| export                                          | what it is                                         |
| ----------------------------------------------- | -------------------------------------------------- |
| `createI18n`                                    | the one-call preset — a `VueI18n` over a base host |
| `createCore`                                    | core's own constructor, for the composed path      |
| `createI18nFromCore`                            | wraps a host you built, preserving its exact type  |
| `I18n`                                          | the base class `createCore` instantiates           |
| `icuCompiler`, `icu`                            | from `@comvi/core/icu` — compiler and installer    |
| `loader`, `attachLoader`, `flattenCatalog`      | from `@comvi/core/loader`                          |
| `plugins`, `attachPlugins`                      | from `@comvi/core/plugins`                         |
| `devtools`, `attachDevtools`                    | from `@comvi/core/devtools`                        |
| `VueI18n`, the composables, `T`, the inject key | the vue bindings                                   |

`createI18n` is vue's own function, not a rename: there is a `VueI18n` to
construct, and `ssrLocale` has to reach the host before the reactive ref is
seeded so the ref and `core.locale` cannot disagree for a render. That is also
why the composition pipe lives one level down.

`.with(installer)` is core's composition pipe — `host.with(f)` is `f(host)` —
and on vue it goes on the **host**: `i18n.core` for a preset instance, or the
value `createCore` handed you. `loader(map)` attaches the capability **and**
registers the map; for a plain `LoaderFn`, compose `.with(attachLoader)` and
call `registerLoader(fn)` yourself (it keeps the import-map adapter out of your
bundle).

### Default — text and `{param}` interpolation

```ts
import { createI18n } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  translation: { en: { hello: "Hello, {name}!" } },
});

createApp(App).use(i18n).mount("#app");
```

### Inline catalogs with ICU — the `compiler` option

The preset ingests `translation`, so the compiler has to be chosen in the same
call:

```ts
import { createI18n, icuCompiler } from "@comvi/vue";

const i18n = createI18n({
  locale: "en",
  compiler: icuCompiler,
  translation: {
    en: { messages: "{count, plural, one {# message} other {# messages}}" },
  },
});
```

### Remote catalogs with ICU — `.with(icu())` before ingestion

When the catalog arrives from a loader there is nothing to compile at
construction time, so install the compiler first — on the host, which means
building it with `createCore` and wrapping the result:

```ts
import { createCore, createI18nFromCore, icu, loader } from "@comvi/vue";

const core = createCore({ locale: "en" })
  .with(icu())
  .with(loader({ uk: () => import("./uk.json") }));
const i18n = createI18nFromCore(core, { ssrLocale: "en" }); // i18n.core is exactly `core`
```

`.with(icu())` is **pre-ingestion only**. The compiler locks the moment any
catalog reaches the host — a constructor `translation`, an `addTranslations`
call, or a loader merge — and a later `icu()` throws with own
`code === "E_COMPILER_LOCKED"`. So `createI18n({ translation }).core.with(icu())`
is invalid by construction: pass `compiler: icuCompiler` there instead.

### Async loading — `loader()`

```ts
import { createI18n, loader } from "@comvi/vue";

const i18n = createI18n({ locale: "en" });
i18n.core.with(loader({ uk: () => import("./uk.json") }));
// inside a component: const { reloadTranslations } = useI18nLoader();
```

### Plugins — one `.with(installer)`

The three first-party plugin packages ship a lowercase **installer** beside the
uppercase factory. The installer composes the capabilities that plugin needs —
`fetchLoader` attaches `/loader`, then `/plugins` — and registers it, in one
call. It runs on the HOST, so build with `createCore` and wrap afterwards:

```ts
import { createCore, createI18nFromCore } from "@comvi/vue";
import { fetchLoader } from "@comvi/plugin-fetch-loader";

const core = createCore({ locale: "en", defaultNs: "common" }).with(
  fetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }),
);

const i18n = createI18nFromCore(core);
```

The explicit form is that composition spelled out, and it is what you want when
you register plugins from a list. `loader()` goes on first when a plugin
registers a loader: plugins run at `init()`, and `registerLoader` has to exist by
then. `VueI18n` does not proxy `use` — registration happens on the host, either
before wrapping or as `i18n.core.use(…)` afterwards.

```ts
import { createCore, createI18nFromCore, loader, plugins } from "@comvi/vue";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

const core = createCore({ locale: "en", defaultNs: "common" }).with(loader()).with(plugins());

core.use(FetchLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

const i18n = createI18nFromCore(core);
```

Swapping the two slots is a type error and loud at runtime:
`.use(fetchLoader(…))` throws at `init()` before any capability is attached.

### Devtools — `devtools()`

Browser-extension discovery (`instanceId`, the `window.__COMVI__` queue) is
opt-in too:

```ts
import { createI18n, devtools } from "@comvi/vue";

const i18n = createI18n({ locale: "en" });
i18n.core.with(devtools({ instanceId: "storefront" }));
```

These are **named** re-exports of core's own bindings, so the ones you do not
call are pruned. Three bundler-matrix cases hold that line, on webpack and vite,
in development and production: `vue-default` calls no capability and asserts all
four subpath entries out of the module graph, `vue-icu` calls `icuCompiler`,
formats a real plural from the built bundle and asserts the other three out, and
`vue-composed` composes `createCore(...).with(loader(map))` through
`createI18nFromCore` and asserts the three it does not call out.

`@comvi/core/tags` is deliberately not re-exported: importing it registers tag
syntax ambiently. `<T>` uses the pure `@comvi/core/rich-text` seam in its own
dist chunk and does not change string-API tag behavior.

### String-API tags render literally — the one residual

`t("Click <b>here</b>")` hands back that markup as text on the base host: tag
syntax is a grammar the host has to be taught, and no entry teaches it
ambiently. Development warns the first time; production stays literal and never
throws, because a literal `<b>` is visibly broken in review while a wrong plural
is not. Two ways out:

- render `<T>` — it passes the tag extension per call and needs no ambient
  registration at all (see [Rich text with `<T>`](#rich-text-with-t));
- `import "@comvi/core/tags";` once at your entry, if you want tag
  interpolation through `t()` itself. That import is the side effect
  `@comvi/vue` will not hand you by re-exporting it.

## Rich text with `<T>`

Embed components inside translation strings without raw HTML, without unsafe DOM injection. Translators see clean markup; you control the rendering via named slots.

```json
{ "help": "Read <link>our docs</link> or <bold>contact us</bold>." }
```

```vue
<script setup lang="ts">
import { T } from "@comvi/vue";
</script>

<template>
  <T i18nKey="help">
    <template #link="{ children }">
      <a href="/docs">{{ children }}</a>
    </template>
    <template #bold="{ children }">
      <strong>{{ children }}</strong>
    </template>
  </T>
</template>
```

Alternatively, use the `components` prop for programmatic tag handling. Pass `tagInterpolation: { strict: "warn" }` to `createI18n` to catch translations referencing tags you forgot to handle before they ship.

## ICU MessageFormat — locale-correct grammar, not just singular/plural

`count === 1 ? "item" : "items"` works in English. It silently ships broken grammar in Polish, Ukrainian, Arabic, Welsh, and 30+ other locales — those languages have 3, 4, sometimes 6 distinct plural categories that a binary if/else can't express. [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/) is the standard syntax for handling them — the same syntax Crowdin, Lokalise, Phrase, and every major TMS already speak. Comvi i18n parses it via native [`Intl.PluralRules`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules), so every CLDR plural category is correct by default.

### Plurals across languages

```json
{
  "en": { "messages": "{count, plural, one {# message} other {# messages}}" },
  "uk": {
    "messages": "{count, plural, one {# повідомлення} few {# повідомлення} many {# повідомлень} other {# повідомлення}}"
  },
  "ar": {
    "messages": "{count, plural, zero {لا توجد رسائل} one {رسالة واحدة} two {رسالتان} few {# رسائل} many {# رسالة} other {# رسالة}}"
  }
}
```

```ts
t("messages", { count: 0 }); // ar: "لا توجد رسائل"      (zero form)
t("messages", { count: 1 }); // en: "1 message"            uk: "1 повідомлення"
t("messages", { count: 5 }); // en: "5 messages"           uk: "5 повідомлень"          ar: "5 رسائل"
t("messages", { count: 22 }); // uk: "22 повідомлення"  ← the "few" form, NOT the "many" form
```

A naive English-style `count === 1 ? singular : plural` picks one Ukrainian form and ships it for every count — grammatically wrong for half your traffic.

### Ordinals (1st, 2nd, 3rd…)

```json
{ "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" }
```

```ts
t("rank", { place: 1 }); // "1st"
t("rank", { place: 22 }); // "22nd"
t("rank", { place: 113 }); // "113th"
```

### Select (gender, role, status)

```json
{ "greeting": "{gender, select, female {Welcome, madam} male {Welcome, sir} other {Welcome}}" }
```

```ts
t("greeting", { gender: "female" }); // "Welcome, madam"
t("greeting", { gender: "male" }); // "Welcome, sir"
t("greeting", { gender: "other" }); // "Welcome"
```

### Locale-aware Intl formatters

Numbers, dates, currency, and relative time follow the active locale via native `Intl` — reactive in your framework binding:

```vue
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t, locale, setLocale, formatCurrency, formatRelativeTime, formatDate } = useI18n();
</script>

<template>
  <div>
    <!-- Locale-aware plurals -->
    <p>{{ t("items", { count: 5 }) }}</p>

    <!-- Locale-aware Intl formatters — re-render when setLocale() is called -->
    <p>Price: {{ formatCurrency(99.99, "USD") }}</p>
    <p>Posted {{ formatRelativeTime(-2, "hour") }}</p>
    <p>Date: {{ formatDate(new Date(), { dateStyle: "long" }) }}</p>

    <select :value="locale" @change="setLocale(($event.target as HTMLSelectElement).value)">
      <option value="en">English</option>
      <option value="fr">Français</option>
    </select>
  </div>
</template>
```

Switching locale via `setLocale()` re-renders all formatters automatically through Vue's reactivity.

## Type-safe translation keys

Declaration merging on `TranslationKeys` provides autocomplete and parameter validation per key. Generated automatically via `@comvi/cli` (TMS) or `@comvi/vite-plugin` (local JSON).

```typescript
// src/types/i18n.d.ts
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: never;
    "errors:NOT_FOUND": never;
  }
}
```

```vue
<script setup lang="ts">
import { useI18n } from "@comvi/vue";

const { t } = useI18n();

// ✓ Autocomplete works, params required
t("welcome", { name: "Alice" });

// ✓ No params needed
t("greeting");

// ✓ Namespaced keys use the ns option
t("NOT_FOUND", { ns: "errors" });
</script>
```

**What TypeScript catches:**

```ts
// ✗ Expected 2 arguments, but got 1
t("welcome");

// ✗ Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ Argument of type '"typo"' is not assignable to parameter
t("typo", { name: "Alice" });
```

## Loading translations from the Comvi platform

Pair with `@comvi/plugin-fetch-loader` to load translations from a CDN or API. No redeploy needed to ship a translation:

```ts
// main.ts
import { createApp } from "vue";
import { createCore, createI18nFromCore } from "@comvi/vue";
import { fetchLoader } from "@comvi/plugin-fetch-loader";
import App from "./App.vue";

// One installer composes the loader capability, then the plugin host, then
// registers the plugin — the order a loader-registering plugin needs. It runs
// on the HOST, because `VueI18n` does not proxy `use`.
// CDN for production, API for dev/staging.
const core = createCore({
  locale: "en",
  defaultNs: "common",
}).with(
  fetchLoader({
    cdnUrl: "https://cdn.comvi.io/your-distribution-id",
  }),
);

const i18n = createI18nFromCore(core);

createApp(App).use(i18n).mount("#app");
```

See [`@comvi/plugin-fetch-loader`](https://github.com/comvi-io/comvi-js/tree/main/packages/plugin-fetch-loader) for full options and API endpoints.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
