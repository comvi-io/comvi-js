<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-dark.svg">
    <img alt="Comvi" src="https://raw.githubusercontent.com/comvi-io/comvi-js/main/.github/assets/header-logo-light.svg" width="860">
  </picture>
</p>

<h1 align="center">Modern i18n for JavaScript & TypeScript</h1>

<p align="center">
  One framework-agnostic core. ICU MessageFormat and rich text without XSS —<br/>
  for <b>Vue</b>, <b>React</b>, <b>SolidJS</b>, <b>Svelte</b>, <b>Next.js</b>, and <b>Nuxt</b>.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/core"><img src="https://img.shields.io/npm/v/@comvi/core?color=blue&label=npm" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/@comvi/core"><img src="https://img.shields.io/bundlephobia/minzip/@comvi/core?label=minzip" alt="Bundle size"></a>
  <a href="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml"><img src="https://github.com/comvi-io/comvi-js/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://comvi.io"><img src="https://img.shields.io/badge/Platform-comvi.io-7c3aed" alt="Comvi Platform"></a>
</p>

<p align="center">
  <a href="https://x.com/Comvi_io"><img src="https://img.shields.io/twitter/follow/Comvi_io?style=social&logo=x" alt="Follow on X"></a>
  <a href="https://www.linkedin.com/company/comvi-io/"><img src="https://img.shields.io/badge/LinkedIn-Comvi-0A66C2?logo=linkedin&logoColor=white" alt="Comvi on LinkedIn"></a>
</p>

<p align="center">
  <b><a href="https://comvi.io/docs/i18n/quick-start/">Documentation</a></b>
  &nbsp;·&nbsp;
  <b><a href="https://comvi.io">Comvi Platform</a></b>
</p>

---

## What this is

An i18n library for JavaScript and TypeScript apps: you write `t("greeting", { name })`, it renders
the right string for the active locale. One core, six framework bindings, ICU MessageFormat, rich
text that embeds components into a sentence without raw HTML, and typed translation keys.

It works standalone with catalogs you ship in your bundle. It also pairs with
[Comvi](https://comvi.io), a translation management platform that serves catalogs from a CDN so you
can ship a translation without a redeploy.

## Install

One install is enough for the host, the bindings and the capability toolkit: each framework package
bundles `@comvi/core` and re-exports what you compose with.

The exception is the free formatting functions — `formatNumber`, `formatDate`, `formatCurrency`,
`formatRelativeTime`, `getTextDirection`. No binding re-exports those, so a component that calls one
directly imports it from `@comvi/core` and must declare `@comvi/core` in its own dependencies;
pnpm's strict layout will not resolve it transitively. Five of the six framework examples do exactly
that. `useI18n()` hands back bound formatters, which need no extra import.

```bash
npm install @comvi/core      # Vanilla / Node
npm install @comvi/vue       # Peer: vue ^3
npm install @comvi/react     # Peer: react ^18 || ^19
npm install @comvi/solid     # Peer: solid-js ^1.8
npm install @comvi/svelte    # Peer: svelte ^5.3
npm install @comvi/next      # Peers: next ^14 || ^15, react ^18 || ^19
npm install @comvi/nuxt      # Peer: nuxt ^3 || ^4
```

Node 20 or newer for the runtime packages above; `@comvi/cli` and `@comvi/vite-plugin` need Node 22.
Loading translations from the Comvi platform adds the loader plugin beside the
framework package:

```bash
npm install @comvi/react @comvi/plugin-fetch-loader
```

## Quick start

Two steps, and the second is additive. Every framework README tells the same two-step story in its
own idiom: [react](packages/react) · [vue](packages/vue) · [solid](packages/solid) ·
[svelte](packages/svelte) · [next](packages/next) · [nuxt](packages/nuxt) ·
[core / vanilla](packages/core). React is the example here.

### Step 1 — an inline catalog

Five things to know. `createI18n` builds **the host**: the object it returns, holding the catalog,
the current locale and `t()`. `locale` is what renders now, `fallbackLocale` covers a missing key,
`translation` is the catalog, and `<I18nProvider>` puts the host where the `useI18n()` hook can find
it.

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, I18nProvider } from "@comvi/react";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  translation: {
    en: { greeting: "Hello, {name}!" },
    uk: { greeting: "Привіт, {name}!" },
  },
});

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n}>
    <App />
  </I18nProvider>,
);
```

```tsx title="src/App.tsx"
import { useI18n } from "@comvi/react";

export default function App() {
  const { t, locale, setLocale } = useI18n();

  return (
    <>
      <h1>{t("greeting", { name: "Alice" })}</h1>
      <button onClick={() => setLocale(locale === "en" ? "uk" : "en")}>Switch</button>
    </>
  );
}
```

Runnable version: [`examples/react`](examples/react), which opens in
[StackBlitz](https://stackblitz.com/github/comvi-io/comvi-js/tree/main/examples/react) straight from the repository — see
[examples/README.md](examples/README.md) for the link pattern.

### Step 2 — connect to Comvi

Three questions, and the answers are the lines below. Every framework README asks them in this
same order; only the third answer differs, except on next, where step 1 already answered the first.

1. **Which parser?** `compiler: icuCompiler`. The platform's catalogs use ICU plurals, and the
   default `{param}` compiler does not render them. Without `compiler: icuCompiler`, an ICU message
   (`{count, plural, …}`) throws `E_ICU_SYNTAX` in development the moment the catalog is loaded,
   before anything renders; in production it renders the message text literally and reports the
   error through `onError` (`console.error` when no handler is set).
2. **Where from?** `.use(cdnLoader({ cdnUrl }))` from `@comvi/plugin-fetch-loader/cdn`, which
   fetches the catalog at runtime instead of bundling it.
3. **What to paint meanwhile?** A **`fallback`** on `<I18nProvider>`. The catalog is in flight
   during the first paint now, and the provider gates its children until the host is initialized.
   Vue and Svelte have no `fallback` prop and gate on `isInitializing` instead; core, next and nuxt
   need no gate at all.

```tsx title="src/main.tsx"
import { createRoot } from "react-dom/client";
import { createI18n, icuCompiler, I18nProvider } from "@comvi/react";
import { cdnLoader } from "@comvi/plugin-fetch-loader/cdn";
import App from "./App";

const i18n = createI18n({
  locale: "en",
  fallbackLocale: "en",
  compiler: icuCompiler,
}).use(cdnLoader({ cdnUrl: "https://cdn.comvi.io/your-distribution-id" }));

createRoot(document.getElementById("root")!).render(
  <I18nProvider i18n={i18n} fallback={<div className="spinner" />}>
    <App />
  </I18nProvider>,
);
```

The distribution id in `cdnUrl` comes from the Comvi platform: open your project and copy it from
**Settings → Content Deploy → CDN Endpoint** (the URL is generated when Content Deploy is enabled and saved).

Chain `.use(…)` before `init()`; doing it afterwards warns once in development. ICU is not chained
at all — it is the constructor option above. Full rules:
[docs/design/composition.md](docs/design/composition.md).

## What is portable across frameworks

Portable, identically, in all six bindings:

- **`useI18n()`** and the member names it returns — `t`, `tRaw`, `locale`, `setLocale`,
  `isLoading`, `isInitializing`, `isInitialized`, `cacheRevision`.
- **`t()`** and its one call signature, including `useI18n("admin")` binding a namespace at the
  type level.
- **Typed keys.** One `TranslationKeys` augmentation serves every binding.
- **ICU** syntax and behaviour, through the same `compiler: icuCompiler` option.
- **Capability acquisition**: `useI18nLoader()` and `useI18nPlugins()`.

Not portable, by design: **`<T>` follows each framework's own idiom** for its `components` map.
React takes elements to clone, vue takes named slots, solid takes functions, svelte takes tag names
or `{ tag, props }` configs. See that framework's README. **SSR rules differ too**, and one of them
inverts: Next requires a module-scope host, while Solid, Svelte, Vue and Nuxt each forbid one. The
four rules sit side by side in [docs/design/ssr.md](docs/design/ssr.md).

Reactivity of the four `Intl` formatters differs as well: React and Vue re-render on a locale
change, Svelte and Solid do not. [docs/design/formatting.md](docs/design/formatting.md) has the
table and the one-line rule.

## Typed translation keys

Declaration merging on `TranslationKeys` gives autocomplete and parameter validation per key.
Generate it with [`@comvi/cli`](packages/cli) from the platform, or
[`@comvi/vite-plugin`](packages/vite-plugin) from local JSON.

```typescript check=group=typed-keys
// src/types/i18n.d.ts
import "@comvi/core"; // resolves the module before augmenting it

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    hello: never;
    "errors:NOT_FOUND": never;
  }
}
```

```ts check=group=typed-keys
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.t("welcome", { name: "Alice" }); // params shape matches the declaration
i18n.t("hello"); // no params needed
i18n.t("NOT_FOUND", { ns: "errors" }); // namespaced keys use the ns option
```

What TypeScript catches:

```ts check=group=typed-keys check=expect-error=TS2554
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// TS2554 — Expected 2 arguments, but got 1. `welcome` declares a required param.
i18n.t("welcome");
```

```ts check=group=typed-keys check=expect-error=TS2345
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

// TS2345 — Property 'name' is missing in type '{ age: number; }'
i18n.t("welcome", { age: 5 });

// TS2322 — Type 'number' is not assignable to type 'string'
i18n.t("welcome", { name: 42 });

// TS2345 — '"typo"' is not assignable to the union of declared keys
i18n.t("typo", { name: "Alice" });
```

## Reading the type errors

Six diagnostics cover almost every first run against 0.5, and each is quoted below exactly as
`tsc` or node prints it. Five are compile errors; the sixth only exists at runtime.

`t()` has ONE call signature, so TypeScript names the actual problem on the first line. It used to
have three overloads, and a wrong call went one of two ways: "No overload matches this call"
followed by the failure of each overload in turn, with the one useful line buried last — or, for a
forgotten param and a bare key of the wrong namespace, a one-line report against the permissive
overload's `null` key, which said nothing useful at all.

**An unknown key.** The key parameter is the union of the keys this call site may use, so a typo is
reported against that union — and the union is the list of what you may have meant:

```ts check=group=typed-keys check=expect-error=TS2345
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.t("typo", { name: "Alice" });
```

```
error TS2345: Argument of type '"typo"' is not assignable to parameter of type '"welcome" | "hello" | "errors:NOT_FOUND" | null'.
```

The union holds the default namespace's keys plus the fully-qualified spellings, and the trailing
`null` is the documented no-op, which returns `""`. A key of another namespace written BARE is not
in it, because a bare key is only meaningful next to the namespace that declares it: the moment you
write `{ ns: "errors" }`, or reach the call through `useI18n("errors")`, `"NOT_FOUND"` joins the
union. That is why a bare key from the wrong namespace is reported here, on the key, and not as a
complaint about the params.

**A typed key called without a required parameter.** The params object is not optional for a key
that declares params, so a forgotten one is an argument-count error rather than anything about
types:

```ts check=group=typed-keys check=expect-error=TS2554
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.t("welcome");
```

```
error TS2554: Expected 2 arguments, but got 1.
```

A key that takes no params is declared `never`, and for those the second argument is optional, so
this error cannot happen.

**A key of another namespace, written bare.** Reported on the key, against the keys this call site
can use — not as a complaint about the params:

```ts check=group=typed-keys check=expect-error=TS2345
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.t("NOT_FOUND");
```

```
error TS2345: Argument of type '"NOT_FOUND"' is not assignable to parameter of type '"welcome" | "hello" | "errors:NOT_FOUND" | null'.
```

Two things put a bare key in the union. Naming the namespace in the params does:
`t("NOT_FOUND", { ns: "errors" })` compiles. So does binding it at the call site, which is what a
wrapper's `useI18n("errors")` is for — inside it `t("NOT_FOUND")` compiles, and a key from some
third namespace is what gets reported instead. The qualified spelling, `t("errors:NOT_FOUND")`, is
always available on the core instance.

**The wrong parameters.** Two lines, and the second names exactly what is missing:

```ts check=group=typed-keys check=expect-error=TS2345
import { createI18n } from "@comvi/core";

const i18n = createI18n({ locale: "en" });

i18n.t("welcome", { age: 5 });
```

```
error TS2345: Argument of type '{ age: number; }' is not assignable to parameter of type 'CallParams<{ name: string; }, {}>'.
  Property 'name' is missing in type '{ age: number; }' but required in type 'MissingParams<{ name: string; }, {}>'.
```

`CallParams` is the full params object for the key, `MissingParams` the part of it the call site
still has to supply — a constructor-level `defaultParams` entry moves a param from the second to
the first. This one keeps its second line because `CallParams` is an intersection: the key's own
params, plus the routing options (`ns`, `locale`, `fallback`) that every call accepts. A wrong
param VALUE, as opposed to a missing one, is a plain `TS2322: Type 'number' is not assignable to
type 'string'`.

**A member that left `useI18n()`.** Four names moved to `useI18nLoader()` and `useI18nPlugins()` in
0.5. They are still declared on the hook's return type, as optional `never`, so the name stays
visible in autocomplete — struck through, with the acquisition in the tooltip — and any use is an
error. Which error depends on how the call is written:

```ts check=expect-error=TS2722
import { useI18n } from "@comvi/react";

export function Refresh() {
  // The 0.4 shape: destructure, then call.
  const { reloadTranslations } = useI18n();
  void reloadTranslations();
}
```

```
error TS2722: Cannot invoke an object which is possibly 'undefined'.
```

```ts check=expect-error=TS2349
import { useI18n } from "@comvi/react";

export function Refresh() {
  // The same member reached through the bag, with the optionality asserted away.
  const bag = useI18n();
  void bag.reloadTranslations!();
}
```

```
error TS2349: This expression is not callable.
  Type 'never' has no call signatures.
```

Neither message says where the member went, and that is what the tooltip is for: hover the struck
name and the `@deprecated` line reads "Moved in 0.5. Acquire it:
`const { reloadTranslations } = useI18nLoader()`". `useI18nLoader()` is also the thing to reach for
when a member is missing entirely rather than typed `never` — that means the host never composed the
capability.

**A raw plugin factory in the `.use(…)` slot.** This one compiles under `any` and in plain
JavaScript, so it is a runtime error rather than a type error, and it is the one the factory rename
exists to prevent: `localeDetector()` is the installer, `localeDetectorPlugin()` builds a plugin.

```js check=skip:deliberate-misuse
i18n.use(localeDetectorPlugin({ order: ["navigator"] })); // wrong: a plugin, not an installer
```

```
[i18n] .use(f) expects an installer that returns the host it was given, but f returned function. A raw plugin goes through .use(definePlugin(f)) or registerPlugin(f); a plugin package's installer is the name WITHOUT the Plugin suffix (localeDetector(), not localeDetectorPlugin()).
```

The thrown error carries `code: "E_USE_NOT_INSTALLER"`, and that code is what to branch on: a
production build resolves the production condition, where the message is the bare string
`"E_USE_NOT_INSTALLER"` and the sentence above is not shipped.

## What it weighs

Measured min+gz through each package's published entry. Every figure below names the measurement it
comes from, and CI re-measures all of them against
[`scripts/size-budgets.json`](scripts/size-budgets.json); the rule behind the numbers is in
[`scripts/size-budgets.md`](scripts/size-budgets.md). A framework's own runtime is left out of the
bundle, so a framework row is the comvi code only.

| app shape                                | measured as                    | min+gz  |
| ---------------------------------------- | ------------------------------ | ------- |
| `@comvi/core` alone, nothing composed    | `core-base`                    | 5270 B  |
| `@comvi/core` + ICU                      | `core-base-icu`                | 6183 B  |
| every core capability composed           | `core-full-composite`          | 8874 B  |
| `@comvi/react`, base host + bindings     | `fw-react-default`             | 6902 B  |
| `@comvi/react` + ICU + the CDN loader    | `platform-path-react`          | 10793 B |
| core + ICU + the CDN-only loader subpath | `plugin-fetch-loader-cdn-lite` | 9173 B  |

Against the last published release, measured on 2026-09-06 with the same harness on both sides (tag
`v0.4.1`, a monolith with one entry; the "minimal app" fixture is identical source on both sides,
the "everything" side is `import * as everything` on 0.4.1 against the full composite on 0.5):

| app shape                     | 0.4.1                    | 0.5                     | change            |
| ----------------------------- | ------------------------ | ----------------------- | ----------------- |
| core, minimal app             | 8 429 B                  | 5 093 B                 | −40 %             |
| react, minimal app            | 10 858 B                 | 6 714 B                 | −38 %             |
| vue / solid / svelte, minimal | 11 094 / 9 923 / 9 871 B | 7 041 / 6 413 / 6 518 B | −37 / −35 / −34 % |
| every capability composed     | 9 015 … 11 217 B         | 8 785 … 11 653 B        | −2.6 … +4.0 %     |

The minimal app lost a third of its weight; the ceiling did not move, while 0.5 composes things 0.4
did not have (devtools discovery, the tag-handler boundary, the editor contract).

Every capability is an import you add, so an app carries only what it composes. No `eval` and no
`new Function` in any runtime package, so everything runs under a strict CSP without `unsafe-eval`.
`@comvi/core` has zero runtime dependencies.

## Packages

### Frameworks

| Package                            | Description                                           | Docs                                     |
| ---------------------------------- | ----------------------------------------------------- | ---------------------------------------- |
| [`@comvi/core`](packages/core)     | Framework-agnostic runtime, ICU parser, plugin system | [→](https://comvi.io/docs/i18n/vanilla/) |
| [`@comvi/vue`](packages/vue)       | Vue 3 plugin, `useI18n()`, `<T>` component            | [→](https://comvi.io/docs/i18n/vue/)     |
| [`@comvi/react`](packages/react)   | `<I18nProvider>`, `useI18n()` hook, `<T>` component   | [→](https://comvi.io/docs/i18n/react/)   |
| [`@comvi/solid`](packages/solid)   | SolidJS provider + reactive signals + `<T>` component | [→](https://comvi.io/docs/i18n/solid/)   |
| [`@comvi/svelte`](packages/svelte) | Svelte stores + context (Svelte 5) + `<T>` component  | [→](https://comvi.io/docs/i18n/svelte/)  |
| [`@comvi/next`](packages/next)     | Next.js App Router: SSR, middleware, locale routing   | [→](https://comvi.io/docs/i18n/next/)    |
| [`@comvi/nuxt`](packages/nuxt)     | Nuxt 3 / 4 module: auto-imports, SSR, locale routing  | [→](https://comvi.io/docs/i18n/nuxt/)    |

### Plugins and tooling

| Package                                                                | Description                                               |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader)           | Load translations from the Comvi CDN or API               |
| [`@comvi/plugin-locale-detector`](packages/plugin-locale-detector)     | Detect the locale from query, cookie, storage, browser    |
| [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor) | Visual in-app translation editor (requires Comvi account) |
| [`@comvi/vite-plugin`](packages/vite-plugin)                           | Generate types from local JSON files at dev/build time    |
| [`@comvi/cli`](packages/cli)                                           | Generate types from the Comvi TMS, sync translations      |

Two workspace packages, `locale-routing` and `typegen`, are `"private": true`: they publish no npm
package and are inlined into the packages above at build time, so nothing you install ever names
them.

### Upgrading from 0.4.x

Every package now has exactly ONE entry, and `@comvi/core` is the base host: ICU, async loading, the
plugin host and extension discovery are imports you add, not an entry you switch to. That is a
breaking change on a 0.x minor. Four specifics:

- **ICU syntax on the default compiler throws** instead of rendering wrong text. Name
  `compiler: icuCompiler`.
- **Four loader/plugin members left `useI18n()`.** Acquire them from `useI18nLoader()` /
  `useI18nPlugins()`.
- **A missing interpolation parameter renders as the literal placeholder.** `t("greet")` on
  `"Hello, {name}!"` gave `"Hello, !"` in 0.4 and gives `"Hello, {name}!"` in 0.5, plus one dev
  warning per template and parameter. An explicit `null` still renders as an empty string. Opt out
  with `missingParam: "drop"`.
- **`.with(…)` is gone**, with no alias. `.use(installer)` is the one verb.

The migration is mechanical, and every rename is tabled. See **[MIGRATION.md](MIGRATION.md)**.

## Design notes

Why the library has the shape it has, kept out of the READMEs so those stay instructions:

| Note                                             | What it covers                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| [composition.md](docs/design/composition.md)     | one entry per package, `.use(installer)`, why ICU is a constructor option   |
| [icu.md](docs/design/icu.md)                     | the grammar that is implemented, the gaps, fail-loud/fail-soft              |
| [rich-text.md](docs/design/rich-text.md)         | `<T>` versus the ambient `t()` tag grammar                                  |
| [formatting.md](docs/design/formatting.md)       | `Intl` formatters, and where the four bindings disagree on reactivity       |
| [ssr.md](docs/design/ssr.md)                     | the four module-scope rules side by side                                    |
| [next-runtimes.md](docs/design/next-runtimes.md) | why the Next config module is evaluated twice, and what must not reach Edge |
| [limitations.md](docs/design/limitations.md)     | everything the library does not do, in one list                             |

## Comvi Platform

Comvi i18n is the open-source library, and it is usable on its own.
[**Comvi**](https://comvi.io) is the optional translation management platform that pairs with it:

- **Collaborative dashboard** for translators, designers, and developers
- **CDN delivery** via [`@comvi/plugin-fetch-loader`](packages/plugin-fetch-loader), so you can ship
  a translation without a redeploy
- **Auto-generated types** straight from the platform via [`@comvi/cli`](packages/cli)
- **In-context editing** in your live app via
  [`@comvi/plugin-in-context-editor`](packages/plugin-in-context-editor)

Adopt the platform when you're ready. The library never depends on it.

Comparisons: [vs i18next](https://comvi.io/compare/i18next/) ·
[vs next-intl](https://comvi.io/compare/next-intl/) ·
[vs nuxt-i18n](https://comvi.io/compare/nuxt-i18n/) ·
[vs Lokalise](https://comvi.io/compare/lokalise/)

## Repository

```
packages/        — 14 workspace packages: 12 published to npm, plus
                   locale-routing and typegen (private, inlined into consumers)
docs/design/     — design notes; not published to npm
examples/        — runnable StackBlitz demos, one per framework, for readers
test-apps/       — this workspace's own test apps, for CI
tooling/         — shared internal Vite/Vitest config
```

[pnpm](https://pnpm.io/) + [Turborepo](https://turbo.build/) monorepo. Every package builds
independently; the 12 publishable ones ship to npm under the `@comvi/*` scope as one release train.

## Development

```bash
pnpm install     # install workspace deps
pnpm build       # build all packages
pnpm -w run test # run all tests
pnpm lint        # lint all packages
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE) © Comvi
