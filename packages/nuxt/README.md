<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/nuxt</h1>

<p align="center">Nuxt 3 / 4 module for Comvi i18n — auto-imports, SSR, and locale routing.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/nuxt"><img src="https://img.shields.io/npm/v/@comvi/nuxt?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/nuxt` builds on [`@comvi/vue`](../vue) as a Nuxt 3 / 4 module for drop-in i18n integration. Handles locale routing, SSR translation loading, browser-language detection, auto-imported composables, and registered components.

📖 **Documentation:** https://comvi.io/docs/i18n/nuxt/

⚖️ **Comparison:** [Comvi vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n/)

## Why Comvi i18n?

Comvi i18n is a framework-agnostic internationalization library with type-safe translations, real ICU MessageFormat, and a small bundle.

- **Rich text without XSS.** Embed components inside translation strings (`Click <link>here</link>`). Translators see clean markup, and you decide what each tag renders to. No raw HTML, no unsafe DOM injection, and no splitting a sentence across template fragments.
- **ICU `plural`, `selectordinal` & `select`.** Locale-correct grammar via `Intl.PluralRules`, including Polish, Ukrainian, Arabic, Welsh and the rest. It is the same syntax every major TMS (Crowdin, Lokalise, Phrase) already speaks. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Locale-aware formatters built in.** `formatNumber`, `formatDate`, `formatCurrency`, and `formatRelativeTime` follow the active locale via native `Intl`, with reactive updates in every framework binding.
- **~8.2 kB minified + gzipped for the default client graph, ~11.7 kB fully composed (measured, `vue` / `#app` / `h3` externalized), no runtime dependencies beyond `h3` and `@nuxt/kit`, which every Nuxt app already has.** ICU, the plugin host and devtools discovery cost only where your `comvi.host.ts` composes them. No `eval` or `new Function` anywhere, so it runs under a strict CSP without `unsafe-eval`. Safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps.
- **Pluggable.** Translation loading (CDN/API), locale detection, and in-context editing are opt-in plugins via `@comvi/plugin-fetch-loader`, `@comvi/plugin-locale-detector`, and `@comvi/plugin-in-context-editor`, one lowercase `.use(installer)` each. You only ship what you use.
- **Same API across 6 frameworks.** `useI18n()` and `<T>` look the same in [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt), so switching frameworks doesn't mean relearning your i18n layer.
- **SSR support.** `@comvi/next` and `@comvi/nuxt` ship server-side translation loading, locale-routed layouts, and middleware for redirect-on-detect, so there is no flash of untranslated content.

## Why @comvi/nuxt?

- **Two-file setup.** Add `@comvi/nuxt` to `modules` in `nuxt.config.ts` and configure locales. Routing, detection, middleware and auto-imports work with no boilerplate. Add one `comvi.host.ts` next to `nuxt.config.ts` (or under `srcDir`), picked up by convention, and that file is the whole of what your app pays for: ICU, loading, plugins and devtools are each one import and one `.use(...)`.
- **Auto-imported composables and registered components.** `useI18n()`, route helpers, `<T>`, and `<NuxtLinkLocale>` are available without manual imports. `$t` is installed as a Vue global property for templates.
- **Built-in locale routing and middleware.** Clones your existing pages into locale-prefixed routes and adds a global middleware for locale detection and cookie persistence, with no extra setup.

## Install

```bash
npm install @comvi/nuxt
# Peer: nuxt ^3.0.0 || ^4.0.0
```

## Quick start

```ts
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: [
      { code: "en", name: "English", iso: "en-US" },
      { code: "uk", name: "Українська", iso: "uk-UA" },
    ],
    defaultLocale: "en",
    localePrefix: "as-needed",
    // No `hostModule` needed: `./comvi.host.*` under srcDir, then rootDir, is
    // picked up by convention and its path is logged at build time.
  },
});
```

```ts check=group=nuxt-app
// comvi.host.ts — the host, composed explicitly
import { createI18n, icuCompiler, loader, type NuxtHostFactory } from "@comvi/nuxt/host";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler }).use(
    loader({
      en: () => import("./locales/en.json"),
      uk: () => import("./locales/uk.json"),
    }),
  )) satisfies NuxtHostFactory;
```

```vue
<!-- app.vue -->
<script setup lang="ts">
// The ONE call the module will not make for you. Nothing in @comvi/nuxt touches
// <html>, so `lang` and `dir` stay unset until this runs — a page that renders
// perfectly and ships `<html>` with no `lang` is the symptom. `addDir` derives
// the direction from the locale, so adding an RTL locale to `nuxt.config.ts`
// gives you `dir="rtl"` with no further change.
useLocaleHead({ addLang: true, addDir: true });
</script>

<template>
  <NuxtPage />
</template>
```

```vue
<script setup lang="ts">
const { t, locale } = useI18n(); // auto-imported
</script>

<template>
  <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
  <NuxtLinkLocale to="/" :locale="locale === 'en' ? 'uk' : 'en'">Switch</NuxtLinkLocale>
</template>
```

**One file, and the values come from `@comvi/nuxt/host`.** That subpath
re-exports core's composition surface, so `comvi.host.ts` resolves from
`npm install @comvi/nuxt` alone: `@comvi/core` is a dependency of this package
rather than of your app, so naming `@comvi/core/icu` directly would need your
app to declare `@comvi/core` too. The TYPES a typed `comvi.setup.ts` names are
on the `@comvi/nuxt` root for the same reason. `useLocaleHead` is auto-imported
like every other composable.

`comvi.host.ts` is where every capability is chosen, and that is the whole of
0.5.0's change to this module. The module looks for `./comvi.host.*` under
`srcDir`, then `rootDir`, logs the path it picked, and warns about a near miss
(a `comvi.host.cjs` it found but could not resolve). `hostModule` names the
file explicitly, and a set `hostModule` that does not resolve is a build error.
With no host file at all the module builds the BASE host for you: text and
`{param}` interpolation, the translation cache, events and default params, with
no ICU compiler, no loader, no plugin host and no devtools discovery. Nothing is
injected on your behalf, so nothing you did not ask for is in your bundle. (ICU
is the one capability with a module option, `icu: true`; it stays off unless
you ask, and a host file that spreads its options gets it too. Catalogs are
`comvi.translation`, below — the base host flattens a nested one, so
`{ nav: { home: "Home" } }` resolves `t("nav.home")` with nothing composed.) See
[Composing your host](#composing-your-host-the-hostmodule-option) for the full
menu; the [0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md)
has the upgrade path.

## Server-side translation loading

The Nuxt module handles SSR by loading translations on the server and hydrating
the client with pre-loaded messages. SSR loading is the loader capability at
work, so a server-rendered app composes `loader()` in `comvi.host.ts` as the
quickstart above does. Without it the server utilities say so once, by name,
and render whatever the catalog already holds. They never call a member the
host does not have.

```vue
<!-- app.vue or any page -->
<script setup lang="ts">
const { t, locale, setLocale } = useI18n(); // auto-imported
</script>

<template>
  <div>
    <h1>{{ t("greeting", { name: "Alice" }) }}</h1>
    <button @click="setLocale(locale === 'en' ? 'uk' : 'en')">Switch: {{ locale }}</button>
  </div>
</template>
```

The composable is auto-imported by the module. Call `setLocale()` to load and
switch translations asynchronously. The module's route middleware pre-loads
translations for the current locale before the page renders.

## Locale routing

The Nuxt module creates locale-prefixed routes from your existing pages automatically. Configure locales and the module clones those pages into localized paths.

```ts
// nuxt.config.ts
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: ["en", "uk", "de"],
    defaultLocale: "en",
    localePrefix: "as-needed", // 'always' | 'as-needed' | 'never'
  },
});
```

The middleware auto-detects the user's language from the URL path, cookies, or the server-side Accept-Language header, and persists the choice in a cookie. Use `<NuxtLinkLocale>` to navigate between locales while preserving the current route path.

```vue
<template>
  <nav>
    <NuxtLinkLocale to="/" :locale="'en'">English</NuxtLinkLocale>
    <NuxtLinkLocale to="/" :locale="'uk'">Українська</NuxtLinkLocale>
  </nav>
</template>
```

For more routing details, browser-language detection options, and helper composables like `useLocalePath` and `useSwitchLocalePath`, see the [documentation](https://comvi.io/docs/i18n/nuxt/).

## Capability composables: `useI18nLoader()` / `useI18nPlugins()`

Async loading and the plugin host are `@comvi/core` **capabilities** rather than
part of the translation core. Since 0.5.0 you acquire their members explicitly
instead of getting them from `useI18n()`. Both are auto-imported, like
`useI18n`:

```vue
<script setup lang="ts">
const { t } = useI18n("admin");
const { addActiveNamespace, removeActiveNamespace, reloadTranslations, onLoadError } =
  useI18nLoader();
const { onMissingKey } = useI18nPlugins();
</script>
```

They verify the capability once, at the acquisition call, and throw in
development and production alike when the host has none, so a component that
asks for something the app never composed fails loudly at the acquisition call
instead of doing nothing.

`comvi.setup` hooks no longer reach a capability through `i18n`. The context's
`i18n` is the union `VueI18n<{}, C> | C`, the wrapper in the app plugin and the
host itself in a server utility (`nuxt/src/types.ts:351-360`), and `VueI18n`
dropped its eight capability proxies, so `i18n.core.*` neither compiles without
a `'core' in i18n` narrowing nor exists on the server arm. The context hands you
the host directly as `core`, the same object on both runtimes:

```diff check=skip:proxy-relocation
-export default ({ i18n }) => { i18n.registerLoader(myLoader); };
+export default ({ core }) => { core.registerLoader(myLoader); };
```

That call needs a host that composed the loader, which is a `comvi.host.ts`
decision, not a `comvi.setup.ts` one. Write the hook with NO host type and the
module supplies it, read off your factory:

```ts check=group=nuxt-app
// comvi.setup.ts — the types are on the module's root, so this file, like
// comvi.host.ts, needs no dependency your app did not declare. It shares a
// fence group with the `comvi.host.ts` above BECAUSE the loader capability this
// file calls is composed there: the snippet gate pools the two the same way
// codegen does, so neither one alone can vouch for the call below.
import type { LoaderFn, NuxtI18nSetup } from "@comvi/nuxt";

const myLoader: LoaderFn = async (locale, namespace) =>
  (await fetch(`/i18n/${locale}/${namespace}.json`)).json();

export default (({ core }) => {
  core.registerLoader(myLoader);
}) satisfies NuxtI18nSetup;
```

That line compiles BECAUSE your `comvi.host.ts` composed `loader(...)`. At build
time the module generates `.nuxt/types/comvi-host.ts`, which declares the host
as `ReturnType<typeof import("./comvi.host").default>` and publishes it through
the `ComviNuxtHostRegistry` interface — so `NuxtI18nSetup`'s default type
argument is the host your factory actually returns, not a claim about it. Drop
the `.use(loader(...))` from `comvi.host.ts` and `nuxi typecheck` fails on the
`registerLoader` line above, where it used to throw a `TypeError` on the first
call instead.

`NuxtI18nSetupContext<C>` / `NuxtI18nSetup<C>` stay generic in the host type, for
a host whose type the module cannot see — a factory in another package, a `.js`
`comvi.host`, or a hook shared by several apps. Naming it by hand is the
FALLBACK, and codegen cross-checks the claim rather than trusting it: the
generated file puts your hook through `CheckedNuxtI18nSetup<TheRealHost, YourHook>`,
so `NuxtI18nSetup<I18n & I18nLoaderApi>` against a factory that composed no
loader is a build error naming both sides. With no `comvi.host` file at all the
host is core's base `I18n` and every capability call is a compile error, which is
what the default branch really builds. Migrating from 0.4.x:
`pnpm codemod:framework-slim "app/**/*.{ts,vue}"`, or the
[0.5.0 migration guide](https://github.com/comvi-io/comvi-js/blob/main/MIGRATION.md).

## Composing your host: `comvi.host.ts` and the `hostModule` option

The host module's default export builds the host, and that host must be a core
HOST rather than a `VueI18n`. The guard requires `t()` AND `init()` and rejects
the wrapper's own `core` member, because a `VueI18n` has a `t()` and used to
slip through and get wrapped a second time; its `TypeError` names
`createI18n from "@comvi/nuxt/host"`.

The file is found by convention: `./comvi.host.*` under `srcDir`, then
`rootDir`, and the module logs the path it resolved at build time so a stray
file is visible. `hostModule` is the explicit override for a file that lives
elsewhere; it is a module **path**, not a function, and a set `hostModule` that
does not resolve fails the build rather than falling back. Either way the branch
is taken at **build time**: the module generates `#build/comvi.host`, and with a
host module neither the runtime plugin nor the server utilities go through
nuxt's own construction path. A runtime `if` could not deliver that, because it
would keep both paths alive in every bundle.

```ts
// nuxt.config.ts — only needed when the file is not ./comvi.host.*
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: { locales: ["en", "de"], defaultLocale: "en", hostModule: "./i18n/host.ts" },
});
```

The factory is handed nuxt's **resolved options**: `locale` (the render locale
on the client, the request locale on the server), `fallbackLocale`, `defaultNs`,
`defaultParams`, `translation`, `tagInterpolation` from `basicHtmlTags`,
`devMode` and `apiKey`. Spreading them keeps `nuxt.config` in charge of
configuration while you stay in charge of capabilities. `apiKey` is forwarded to
the host as `i18n.apiKey`, where a loader plugin such as
`@comvi/plugin-fetch-loader` reads it — on its own it loads nothing, and this
module has no CDN or API option that does. It is called once per constructed instance
(the app plugin, and each per-request server instance), so it must return a
FRESH host every call.

One option reaches only one of the two calls. The app plugin runs in both
bundles and adds `ssrLocale`, so a server render and the hydrated client agree
on the render locale; the request-scoped Nitro host has no hydration to match
and omits it. Set it inside the factory if a server route needs it too.

ICU is the one capability with a module option: `compiler` is a constructor
argument rather than something `.use()` can pipe on, so `icu: true` reaches the
host through its options. With no host module it lands on the generated BASE
host; with one, `compiler: icuCompiler` is the LAST key in the options your
factory receives, so `createI18n({ ...options })` compiles ICU and
`createI18n({ ...options, compiler: mine })` keeps yours. Everything else in the
table below (loader, plugins, devtools) is composed in the host module.

Each capability is one import and one `.use(...)`. `.use(installer)` is
core's composition pipe: `i18n.use(f)` is `f(i18n)`, nothing more.

| you want                                                  | you add                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| ICU plurals / select / selectordinal                      | `compiler: icuCompiler`, in the options object                                                                                              |
| SSR + async translation loading                           | `.use(loader(importMap))`                                                                                                                   |
| plugins, locale detectors, missing-key hooks              | `.use(plugins())`                                                                                                                           |
| your own inline plugin, in one call                       | `.use(definePlugin(fn))`                                                                                                                    |
| browser-extension discovery                               | `.use(devtools())`                                                                                                                          |
| `<tag>` syntax in plain string-API `t()`                  | `import "@comvi/core/tags"` once, anywhere in the app                                                                                       |
| a first-party plugin: CDN loader, locale detector, editor | `.use(cdnLoader({ … }))` / `.use(localeDetector())` / `.use(inContextEditor())`; each installer composes the capabilities that plugin needs |

Everything in the right column but the ambient tag import comes from
**`@comvi/nuxt/host`**, which re-exports `createI18n`, `icuCompiler`, `loader`,
`attachLoader`, `plugins`, `attachPlugins`, `devtools`, `definePlugin` and the
`NuxtHostFactory` type. Every value in the recipe comes from that one subpath of
the package your app already installed: `@comvi/core` is a dependency of
`@comvi/nuxt` rather than of your app, so a host file naming `@comvi/core/icu`
needs your app to declare `@comvi/core` itself. `flattenCatalog` is deliberately not on the
subpath — the base host flattens a nested catalog itself, in `comvi.translation`
and in a loader result alike.

```ts
// comvi.host.ts — everything at once
import {
  createI18n,
  icuCompiler,
  loader,
  plugins,
  devtools,
  type NuxtHostFactory,
} from "@comvi/nuxt/host";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })
    .use(loader({ uk: () => import("./locales/uk.json") }))
    .use(plugins())
    .use(devtools())) satisfies NuxtHostFactory;
```

Order does not matter here. `loader()`, `plugins()` and `devtools()` may go in
any order, because every capability composed before `init()` is attached by the
time plugins run, and ICU is an option rather than a composition step.
`loader(map)` attaches the loader capability **and** registers the map; for a
plain `LoaderFn`, use `.use(attachLoader)` and call `registerLoader(fn)`.

So `comvi.host.ts` is the one file in a nuxt app that names comvi VALUES, and
they come from `@comvi/nuxt/host`. `useI18n()`, `useI18nLoader()`,
`useI18nPlugins()`, `<T>` and `<NuxtLinkLocale>` are auto-imported, so app code
names none; a typed `comvi.setup.ts` and a `TranslationKeys` augmentation name
types only. The composition root is a single readable file, and reading it tells
you exactly what your app pays for.

### What a nuxt app pays

Whole-app comvi graph, min+gz, `vue` / `#app` / `#build` / `h3` externalized
(`node scripts/size-check.mjs`; the committed anchors live in
`scripts/size-budgets.json`):

| graph                                                     | min+gz    | row                             |
| --------------------------------------------------------- | --------- | ------------------------------- |
| client: runtime plugin + `useI18n()` on the base host     | **8108**  | `fw-nuxt-client-default`        |
| server: the same, plus the loader capability SSR needs    | **10017** | `fw-nuxt-server-default-loader` |
| every capability composed: ICU, loader, plugins, devtools | 11648     | `fw-nuxt-full-composite`        |

The client row is what a nuxt app with no host file builds. The last row is the migration
CEILING for a fully composed 0.4 nuxt app rather than a parity claim: 0.4 also
registered string-API tag syntax ambiently, which is now the separate
`import "@comvi/core/tags"`. Every row is gated on its emitted module graph as
well as its bytes, at the corpus-wide measured + 2%.

## Rich text with `<T>`

The `<T>` component is inherited from [`@comvi/vue`](../vue). Embed components in translation strings without raw HTML or unsafe DOM injection.

```json
{ "help": "Read <link>our docs</link> or <bold>contact us</bold>." }
```

```vue
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

See the [Vue README](../vue) for the full Rich Text section with slot patterns and validation options.

## ICU MessageFormat

ICU MessageFormat handles plurals, ordinals and select with locale-correct
grammar via `Intl.PluralRules`. It is a capability: add `compiler: icuCompiler`
from `@comvi/nuxt/host` in `comvi.host.ts` and every catalog in the app is
compiled with it.

```ts
// comvi.host.ts
import { createI18n, icuCompiler, type NuxtHostFactory } from "@comvi/nuxt/host";

export default ((options) =>
  createI18n({ ...options, compiler: icuCompiler })) satisfies NuxtHostFactory;
```

Or set `icu: true` in `nuxt.config.ts`. It is the one capability with a module
option, because `compiler` is a constructor argument no `.use(...)` can add
afterwards; with no host file it goes onto the generated base host, and with one
it arrives as `compiler: icuCompiler` in the factory's options, so a factory
that spreads them needs no `icuCompiler` line of its own. `comvi.translation`
goes with it:
that is how a `nuxt.config.ts` and nothing else becomes an app that actually
renders a translation, because the base host has no loader to get a catalog in
with.

```ts
// nuxt.config.ts — a complete working app, no host file
import { defineNuxtConfig } from "nuxt/config";

export default defineNuxtConfig({
  modules: ["@comvi/nuxt"],
  comvi: {
    locales: ["en", "uk"],
    defaultLocale: "en",
    icu: true,
    translation: {
      en: { items: "{count, plural, one {# item} other {# items}}", nav: { home: "Home" } },
      uk: {
        items: "{count, plural, one {# елемент} other {# елементів}}",
        nav: { home: "Головна" },
      },
    },
  },
});
```

`comvi.translation` is `I18nOptions["translation"]` verbatim: keys are `locale`
or `"locale:namespace"`, and the value may be nested or flat — the host flattens
it either way, so `t("nav.home")` resolves. It travels through
`runtimeConfig.public.comvi` into BOTH construction paths, the client runtime
plugin and each per-request server host, and a `hostModule` factory that spreads
`options` keeps it. Being public runtime config, it must stay JSON-serializable
and must not carry anything private.

`icu` defaults to `false` and the choice is made in codegen, so leaving it off
emits a `#build/comvi.host` that never mentions `@comvi/core/icu`: 0 B rather
than a disabled feature, on both branches. With a host module the compiler is
the last key in the options the factory receives, so a `compiler` you write
after the spread wins.

```vue
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

const items = t("items", { count: 5 });
</script>
```

**Without it, ICU syntax never renders as grammar, and never fails silently.** A
message like `{count, plural, one {# item} other {# items}}` on the default
compiler throws `E_ICU_SYNTAX` at ingestion in development. In production the
braced segment renders literally and `E_ICU_SYNTAX`, naming the argument type,
is reported through `onError` (or `console.error`) on the compilation that hit
it, rather than rendering plausibly-wrong text a reviewer would never catch.
Quoted literals such as `'{name, other}'` stay valid text.

See the [@comvi/vue ICU section](../vue#icu-messageformat)
for the full multilingual examples, ordinals and select.

## Type-safe translation keys

Extend the `TranslationKeys` interface via declaration merging for autocomplete and parameter validation. Type definitions can be generated automatically from the Comvi Platform via `@comvi/cli` or from local JSON files via `@comvi/vite-plugin`.

The augmentation targets `@comvi/core`, where the interface lives — `@comvi/nuxt`
only re-exports it, and a `declare module` on a re-export augments nothing. So
this is the one file that names `@comvi/core`, and your app must declare it as a
dependency (`npm install @comvi/core`) for the specifier to resolve under a
strict package layout.

```typescript
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it; the app declares @comvi/core

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    greeting: { name: string };
    hello: never;
    items: { count: number };
    "errors:NOT_FOUND": never;
  }
}
```

```vue
<script setup lang="ts">
const { t } = useI18n();

// ✓ Autocomplete, params required
const msg = t("welcome", { name: "Alice" });

// ✓ No params needed
const hello = t("hello");

// ✓ Namespaced keys use the ns option
const notFound = t("NOT_FOUND", { ns: "errors" });
</script>
```

**What TypeScript catches:**

```vue check=expect-error
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

// ✗ TS2345 — Argument of type '"welcome"' is not assignable to parameter of type
//   'never'. `welcome` declares a required param, so the key-only overload is out.
t("welcome");
</script>
```

```vue check=expect-error
<script setup lang="ts">
const { t } = useI18n(); // auto-imported

// ✗ TS2769 (no overload matches) — Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ TS2769 (no overload matches) — Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ TS2769 (no overload matches) — '"typo"' is not a declared key
t("typo", { name: "Alice" });
</script>
```

For CDN-delivered translations and visual in-context editing, pair with the [Comvi Platform](https://comvi.io) via [`@comvi/plugin-fetch-loader`](../plugin-fetch-loader) and [`@comvi/plugin-in-context-editor`](../plugin-in-context-editor).

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
