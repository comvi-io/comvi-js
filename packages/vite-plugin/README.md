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

`@comvi/vite-plugin` watches your translation JSON and writes the declaration that makes `t()`
check keys and parameters. Use it when the catalogs live in your repository; for catalogs on the
Comvi platform, [comvi typegen](https://comvi.io/docs/cli/typegen) emits the same file.

## Install

```bash
npm install -D @comvi/vite-plugin
# Peer: vite ^5 || ^6 || ^7 || ^8. Node 22 or newer.
```

## Configure

In `vite.config.ts`:

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
is added, changed or removed. Both paths resolve against the Vite root. Keep `output` inside your
`tsconfig.json` `include`; most `src/**/*` setups already cover it.

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

The default namespace, in `src/locales/en.json`:

```json title="src/locales/en.json"
{
  "welcome": "Hello, {name}!",
  "items": "{count, plural, one {# item} other {# items}}",
  "greeting": "Hi",
  "unread": "{count} unread"
}
```

An `errors` namespace beside it, in `src/locales/errors/en.json`:

```json title="src/locales/errors/en.json"
{
  "NOT_FOUND": "Not found"
}
```

The declaration, `src/types/i18n.d.ts`:

```ts title="src/types/i18n.d.ts" check=group=typed-calls
import "@comvi/core";

declare module "@comvi/core" {
  interface TranslationKeys {
    "errors:NOT_FOUND": never;
    greeting: never;
    items: { count: number };
    unread: { count: string | number };
    welcome: { name: string | number };
  }
}

export {};
```

And the calls it checks, in `src/usage.ts`:

```ts title="src/usage.ts" check=group=typed-calls
import { i18n } from "./i18n";

i18n.t("welcome", { name: "Alice" });
i18n.t("unread", { count: 3 });
i18n.t("greeting");
i18n.t("NOT_FOUND", { ns: "errors" });
```

### How it works

Nested JSON flattens to dot keys and a namespace directory becomes the `errors:` prefix. `never`
means the key takes no parameters. Parameter types come from ICU syntax: a bare `{name}` and a
`select` variable take `string | number`, a `plural` or `selectordinal` count is `number`. The
declaration augments `@comvi/core` when `package.json` declares it, otherwise the first framework
binding it declares; `augment` names a different module. Types and the compiler are two
decisions: the `items` key needs `compiler: icuCompiler` from `@comvi/core/icu` on the i18n
instance, or it throws at ingestion in development and renders its braces in production; see
[Plurals and ICU](https://comvi.io/docs/i18n/pluralization).

In `vite build` a generation error fails the build; in `vite dev` it is logged as
`[@comvi/vite-plugin] Failed to generate types: …` and the previous declaration stays. The causes:
a missing `translations` directory, a malformed JSON file, a key collision after stripping the
default namespace, a parameter type outside `string` and `number`, or a `package.json` that
declares no Comvi package to augment.

## Read next

- [Vite plugin](https://comvi.io/docs/i18n/plugins/vite-plugin): what TypeScript catches, key collisions, the full table.
- [Type safety](https://comvi.io/docs/i18n/type-safety): how the augmentation reaches `useI18n()`, and `InferKeys`.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
