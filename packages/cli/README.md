<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/cli</h1>

<p align="center">CLI for the Comvi TMS — type generation, translation sync, project management.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/cli"><img src="https://img.shields.io/npm/v/@comvi/cli?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/cli` connects your codebase to the [Comvi Translation Management System](https://comvi.io). It generates a strict `TranslationKeys` interface from your TMS schema and syncs translation files between local JSON and the TMS, with an optional SSE-based watch mode for live regeneration.

**Use `@comvi/cli`** if your translations live in the Comvi TMS and you want to sync them to your repo or generate types from the live schema.
**Use `@comvi/vite-plugin`** if your translations live as local JSON files and you want autocomplete in your editor.

📖 **Documentation:** https://comvi.io/docs/cli/

## About Comvi i18n

Comvi i18n is a framework-agnostic internationalization library. You get ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~5 kB minified + gzipped for the base host, ~8.5 kB with every capability composed (as bundled by your app)**, with **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps). `@comvi/core` has zero runtime dependencies; the CLI itself depends on `commander` and `eventsource`.

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **ICU `plural`, `selectordinal` & `select`:** locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS. One explicit import: `compiler: icuCompiler` from `@comvi/core/icu`. The `number` / `date` / `time` argument types and the plural `offset:` form are not implemented and are not planned. Each one fails with `E_ICU_SYNTAX` instead of rendering something wrong.
- **Type-safe translation keys** via TypeScript declaration merging, for autocomplete and parameter validation everywhere.
- **Pluggable:** translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

## Why @comvi/cli?

- **Type generation from the live TMS schema.** No manual `i18n.d.ts` upkeep: types stay in sync with your platform.
- **Pull & push translations.** Download from the TMS to local JSON, or upload changes back without leaving your terminal.
- **Watch mode with SSE.** Use `--watch` to live-regenerate types as translators ship changes to the platform.

## Install

```bash
npm install -D @comvi/cli
```

## Quick start

```bash
export COMVI_API_KEY=cmv_xxxxxxxxxxxxxxxx

npx comvi init                    # creates .comvirc.json
npx comvi generate-types          # write src/types/i18n.d.ts from the TMS
npx comvi generate-types --watch  # live-regenerate via SSE
npx comvi pull                    # download translations from the TMS
npx comvi push                    # upload local translations to the TMS
```

**Recommended:** keep the API key in the `COMVI_API_KEY` environment variable. Storing `apiKey` in `.comvirc.json` works but is discouraged. Env vars take precedence and won't end up in version control by accident.

The CLI auto-loads the nearest `.env` by walking up from your current working directory (bounded by the project root) before each command. Drop `COMVI_API_KEY=...` in `.env` and no `dotenv-cli` wrapper is needed. Real env vars always win over the file (CI-safe). Use `--no-dotenv` (or `COMVI_NO_ENV=1`) to opt out, or `--dotenv <path>` to point at a specific file.

### Filter what you pull/push

Declare a namespace/locale subset in `.comvirc.json` so it's not repeated in every `package.json` script:

```json
{
  "namespaces": ["forest", "share_experience"],
  "locales": ["en", "uk"]
}
```

`comvi pull` and `comvi push` then operate on that subset by default. CLI flags (`--ns`, `--locale`) fully override the config for one-off runs (no merge). If a value in the config doesn't exist on the server (typo, deleted namespace), `pull` fails fast with exit code 4 instead of silently writing empty files.

For all commands and flags, the full `.comvirc.json` reference, and the programmatic API (`TypeGenerator`, `ApiClient`, `TranslationSync`, etc.), see the [documentation](https://comvi.io/docs/cli/).

## What you get

Run `npx comvi generate-types` and the CLI writes a `TranslationKeys` declaration straight from your TMS schema:

```typescript check=group=typed-keys
/**
 * Auto-generated translation keys
 * DO NOT EDIT MANUALLY - This file is generated by @comvi/cli
 */

// Import to ensure module is resolved before augmentation
import "@comvi/core";

declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    items: { count: number };
    greeting: never;
    "errors:NOT_FOUND": never;
    "errors:INVALID_INPUT": { field: string };
  }
}

export {};
```

Written to `src/types/i18n.d.ts` by default. The emitter writes single quotes
(`typegen/src/index.ts:62-71,99-103`); the block above is Prettier-formatted
like the rest of the README.

Every `t()` call across your project is now strictly typed against the live TMS schema:

```ts check=group=typed-keys
import { useI18n } from "@comvi/react"; // or vue, solid, svelte, @comvi/next/client; Nuxt auto-imports it
const { t } = useI18n();

// ✓ Compiles — name required, type-checked
t("welcome", { name: "Alice" });

// ✓ No params needed
t("greeting");

// ✓ Namespaced keys use the ns option
t("INVALID_INPUT", { ns: "errors", field: "email" });
```

**What TypeScript catches:**

```ts check=group=typed-keys check=expect-error=TS2345
import { useI18n } from "@comvi/react";
const { t } = useI18n();

// ✗ TS2345 — Argument of type '"welcome"' is not assignable to parameter of type
//   'never'. `welcome` declares a required param, so the key-only overload is out.
t("welcome");
```

```ts check=group=typed-keys check=expect-error=TS2769
import { useI18n } from "@comvi/react";
const { t } = useI18n();

// ✗ TS2769 (no overload matches) — Property 'name' is missing in type '{ age: number }'
t("welcome", { age: 5 });

// ✗ TS2769 (no overload matches) — Type 'number' is not assignable to type 'string'
t("welcome", { name: 42 });

// ✗ TS2769 (no overload matches) — '"typo"' is not a declared key
t("typo", { name: "Alice" });
```

### Live regeneration with `--watch`

Run `npx comvi generate-types --watch` once at the start of your dev session. The CLI opens a Server-Sent Events connection to the TMS. When a translator adds, renames, or removes a key, your local `.d.ts` regenerates within seconds and your editor's autocomplete updates without a restart.

### Workflow: pull/push for translations

```bash
npx comvi pull   # writes the TMS state to local JSON files
npx comvi push   # uploads local edits back to the TMS
```

Use `pull` to bootstrap a fresh checkout or to grab a translator's recent changes for offline review. Use `push` to ship a developer-side copy fix without leaving the editor.

The default `fileTemplate` is `{namespace}/{languageTag}.json` (`cli/src/defaults.ts:1`), with one special case: the namespace marked default in the TMS is written at the locale root instead (`cli/src/core/TranslationSync.ts:327-329`).

```txt
src/locales/
├── en.json
├── uk.json
└── review_list/
    ├── en.json
    └── uk.json
```

Set `"fileTemplate": "{languageTag}/{namespace}.json"` in `.comvirc.json` for the locale-folder layout; any non-default template also turns the root special case off.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
