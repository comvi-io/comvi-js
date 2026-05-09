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

`@comvi/cli` connects your codebase to the [Comvi Translation Management System](https://comvi.io). It generates a strict `TranslationKeys` interface from your TMS schema and syncs translation files between local JSON and the TMS — with optional SSE-based watch mode for live regeneration.

**Use `@comvi/cli`** if your translations live in the Comvi TMS and you want to sync them to your repo or generate types from the live schema.
**Use `@comvi/vite-plugin`** if your translations live as local JSON files and you want autocomplete in your editor.

📖 **Documentation:** https://comvi.io/docs/i18n/tooling/cli/

## About Comvi i18n

Comvi i18n is a modern, framework-agnostic internationalization library — ICU MessageFormat, rich-text component embedding, and locale-aware `Intl` formatters in **~8 kB gzipped** with **zero runtime dependencies** and **no `eval`** (CSP-safe for Chrome extensions, Cloudflare Workers, and locked-down enterprise apps).

- **Same API** across [Vue](https://www.npmjs.com/package/@comvi/vue), [React](https://www.npmjs.com/package/@comvi/react), [SolidJS](https://www.npmjs.com/package/@comvi/solid), [Svelte](https://www.npmjs.com/package/@comvi/svelte), [Next.js](https://www.npmjs.com/package/@comvi/next), and [Nuxt](https://www.npmjs.com/package/@comvi/nuxt).
- **Real ICU MessageFormat** — locale-correct plurals, ordinals, and gender via `Intl.PluralRules`. Recognized by every major TMS.
- **Type-safe translation keys** via TypeScript declaration merging — autocomplete and parameter validation everywhere.
- **Pluggable** — translation loading, locale detection, and in-context editing are opt-in plugins.

See the [main repo](https://github.com/comvi-io/comvi-js) for the full library overview, runnable demos, and the framework binding matrix.

## Why @comvi/cli?

- **Type generation from the live TMS schema.** No manual `i18n.d.ts` upkeep — types stay in sync with your platform.
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
npx comvi generate-types          # generate TranslationKeys.d.ts from the TMS
npx comvi generate-types --watch  # live-regenerate via SSE
npx comvi pull                    # download translations from the TMS
npx comvi push                    # upload local translations to the TMS
```

**Recommended:** keep the API key in the `COMVI_API_KEY` environment variable. Storing `apiKey` in `.comvirc.json` works but is discouraged — env vars take precedence and won't end up in version control by accident.

The CLI auto-loads a `.env` file from the project root before each command — drop `COMVI_API_KEY=...` in `.env` and it just works, no `dotenv-cli` wrapper needed. Real env vars always win over the file (CI-safe). Use `--no-env-file` (or `COMVI_NO_ENV=1`) to opt out, or `--env-file <path>` to point at a specific file.

### Filter what you pull/push

Declare a namespace/language subset in `.comvirc.json` so it's not repeated in every `package.json` script:

```json
{
  "namespaces": ["forest", "share_experience"],
  "locales": ["en", "uk"]
}
```

`comvi pull` and `comvi push` then operate on that subset by default. CLI flags (`--ns`, `--locale`) fully override the config for one-off runs (no merge). If a value in the config doesn't exist on the server (typo, deleted namespace), `pull` fails fast with exit code 4 instead of silently writing empty files.

For all commands and flags, the full `.comvirc.json` reference, and the programmatic API (`TypeGenerator`, `ApiClient`, `TranslationSync`, etc.), see the [documentation](https://comvi.io/docs/i18n/tooling/cli/).

## What you get

Run `npx comvi generate-types` and the CLI writes a `TranslationKeys` declaration straight from your TMS schema:

```typescript
// src/types/i18n.d.ts — generated, do not edit
declare module "@comvi/core" {
  interface TranslationKeys {
    welcome: { name: string };
    items: { count: number };
    greeting: never;
    "errors:NOT_FOUND": never;
    "errors:INVALID_INPUT": { field: string };
  }
}
```

Every `t()` call across your project is now strictly typed against the live TMS schema:

```ts
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

### Live regeneration with `--watch`

Run `npx comvi generate-types --watch` once at the start of your dev session. The CLI opens a Server-Sent Events connection to the TMS — when a translator adds, renames, or removes a key, your local `.d.ts` regenerates within seconds and your editor's autocomplete updates without a restart.

### Workflow: pull/push for translations

```bash
npx comvi pull   # writes the TMS state to local JSON files
npx comvi push   # uploads local edits back to the TMS
```

Use `pull` to bootstrap a fresh checkout or to grab a translator's recent changes for offline review. Use `push` to ship a developer-side copy fix without leaving the editor.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
