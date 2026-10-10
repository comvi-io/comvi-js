<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vite-plugin</h1>

<p align="center">Vite plugin that generates a <code>TranslationKeys</code> declaration from local translation JSON.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vite-plugin"><img src="https://img.shields.io/npm/v/@comvi/vite-plugin?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/vite-plugin` watches your local translation JSON and writes the declaration that types
every `t()` call. It runs in-process with no API key and no network. For catalogs that live on the
Comvi platform, use [comvi typegen](https://comvi.io/docs/cli/typegen) instead; both emit the same
file. The full guide is [Vite plugin](https://comvi.io/docs/i18n/plugins/vite-plugin) on the docs
site.

## Install

```bash
npm install -D @comvi/vite-plugin
# Peer: vite ^5 || ^6 || ^7 || ^8. Node 22 or newer.
```

## Configure

```ts title="vite.config.ts"
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

The plugin generates once on `buildStart` and again whenever a `.json` file under `translations`
is added, changed or removed. Both paths resolve against the Vite root. Make sure `output` is
inside your `tsconfig.json` `include`; most `src/**/*` setups already cover it.

## Options

| Option         | Default                            | Behaviour                                                                                                            |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `translations` | required                           | Directory holding the translation JSON.                                                                              |
| `output`       | `'./src/types/i18n.d.ts'`          | Where the declaration is written; parent directories are created.                                                    |
| `fileTemplate` | `'{namespace}/{languageTag}.json'` | Maps a file path to a language and a namespace. A file the template does not match is read as the default namespace. |
| `defaultNs`    | `'default'`                        | Keys from this namespace lose their prefix. Set it to what your runtime uses.                                        |
| `strictParams` | `true`                             | Parameters required; `false` emits them as optional.                                                                 |
| `augment`      | from `package.json`                | The module the declaration augments.                                                                                 |

## What gets generated

```json title="src/locales/en.json"
{
  "welcome": "Hello, {name}!",
  "items": "{count, plural, one {# item} other {# items}}",
  "greeting": "Hi"
}
```

```ts title="src/types/i18n.d.ts" check=group=typed-calls
/**
 * Auto-generated translation keys, augmenting '@comvi/core'
 * DO NOT EDIT — this file is generated from your translation schema
 */

// Import to ensure module is resolved before augmentation
import "@comvi/core";

declare module "@comvi/core" {
  interface TranslationKeys {
    "errors:NOT_FOUND": never;
    greeting: never;
    items: { count: number };
    welcome: { name: string };
  }
}

export {};
```

```ts title="src/usage.ts" check=group=typed-calls
import { i18n } from "./i18n";

i18n.t("welcome", { name: "Alice" });
i18n.t("greeting");
i18n.t("NOT_FOUND", { ns: "errors" });
```

Keys come out in code-unit order, `never` means no parameters, and nested JSON flattens to dot
keys; `errors:NOT_FOUND` comes from an `errors/en.json` beside the file above. Parameter types
come from ICU syntax: a bare `{name}` is `string`, a `plural` or `selectordinal` count is
`number`, a `select` variable is `string`. The declaration augments `@comvi/core` when
`package.json` declares it, otherwise the first framework binding it declares. Types and the
compiler are two decisions: the `items` key above needs `compiler: icuCompiler` from
`@comvi/core/icu` on the i18n instance, or it throws at ingestion in development and renders its braces in
production; see [Plurals and ICU](https://comvi.io/docs/i18n/pluralization).

## Dev and build

`vite dev` generates on startup, then on every JSON add, change or delete, with no restart.
`vite build` generates once before bundling; a generation error fails the build, in dev it is only
logged. Unchanged output is not written. Every failure logs
`[@comvi/vite-plugin] Failed to generate types: …`: a missing `translations` directory, a
malformed JSON file, a key collision after stripping the default namespace, or a parameter type
outside `string` and `number`.

## Next steps

- [Vite plugin](https://comvi.io/docs/i18n/plugins/vite-plugin): what TypeScript catches, key collisions, the full table.
- [Type safety](https://comvi.io/docs/i18n/type-safety): how the augmentation reaches `useI18n()`, and `InferKeys`.
- [comvi typegen](https://comvi.io/docs/cli/typegen): the same declarations from the platform schema.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
