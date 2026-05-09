<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vite-plugin</h1>

<p align="center">Vite plugin that auto-generates strict TypeScript types from local translation files.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vite-plugin"><img src="https://img.shields.io/npm/v/@comvi/vite-plugin?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/vite-plugin` watches your translation JSON files in dev and emits a `TranslationKeys` declaration that types every `t()` call in your project. No TMS, no API key — point it at a folder and you get autocomplete + parameter validation.

**Use `@comvi/vite-plugin`** if your translations live as local JSON files and you want autocomplete in your editor.
**Use `@comvi/cli`** if your translations live in the Comvi TMS and you want to sync them to your repo or generate types from the live schema.

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~8 kB gzipped** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

## Why @comvi/vite-plugin?

- **Autocomplete and parameter validation.** Generated from your local JSON at dev time — every translation key is strictly typed.
- **Zero runtime cost.** Types only, no plugin code in your bundle. Regenerates on save during `vite dev`.
- **No external dependencies.** Works fully offline — point at a folder of JSON and go.

## Install

```bash
npm install -D @comvi/vite-plugin
# Peer: vite ^5 || ^6 || ^7 || ^8
```

## Quick start

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { comviTypes } from "@comvi/vite-plugin";

export default defineConfig({
  plugins: [
    comviTypes({
      translations: "./src/locales",
      output: "./src/types/i18n.d.ts",
      defaultNs: "common",
    }),
  ],
});
```

The plugin watches `./src/locales` and rewrites the declaration whenever you save a JSON file. Add the generated `.d.ts` to your `tsconfig.json` `include` (most setups already cover `src/**/*`). Comvi's default namespace is `default`; this example sets `defaultNs: "common"` because its files are named `common.json`, which strips the `common:` prefix from generated keys. Other namespaces stay namespaced and are called with `{ ns: "..." }`.

## What you get

Given this directory layout:

```
src/locales/
├── en/
│   ├── common.json
│   └── errors.json
└── uk/
    ├── common.json
    └── errors.json
```

…and `en/common.json`:

```json
{
  "welcome": "Hello, {name}!",
  "items": "{count, plural, one {# item} other {# items}}",
  "greeting": "Hi"
}
```

The plugin writes to `src/types/i18n.d.ts`:

```typescript
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    items: { count: number };
    greeting: never;
    "errors:NOT_FOUND": never;
  }
}
```

Every `t()` call across your project is now strictly typed:

```ts
import { useI18n } from "@comvi/react"; // or vue, solid, svelte, @comvi/next/client; Nuxt auto-imports it
const { t } = useI18n();

// ✓ Compiles — name required, type-checked
t("welcome", { name: "Alice" });

// ✓ No params needed
t("greeting");

// ✓ Namespaced keys use the ns option
t("NOT_FOUND", { ns: "errors" });
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

Add a key to a JSON file → save → the declaration regenerates → autocomplete updates. No restart, no build step.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
