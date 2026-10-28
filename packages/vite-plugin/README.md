<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/vite-plugin</h1>

<p align="center">Vite plugin that writes the typed-translations declaration from local translation JSON.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/vite-plugin"><img src="https://img.shields.io/npm/v/@comvi/vite-plugin?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`@comvi/vite-plugin` reads your translation JSON and writes the declaration that makes `t()`
check keys and parameters: once per `vite build`, and on every change during `vite dev`. For
catalogs on the Comvi platform, or without Vite, `comvi typegen` writes the same file byte for
byte.

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
  plugins: [comviTypes({ from: "./src/locales", sourceLocale: "en" })],
});
```

`from` and `out` resolve against the Vite root. Keep `out` inside your `tsconfig.json` `include`;
most `src/**/*` setups already cover it.

## Options

| Option          | Default                            | Behaviour                                                                                 |
| --------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `from`          | required                           | The catalogs directory, or a schema file such as `.comvi/schema.json` from `comvi pull`.  |
| `out`           | `'./src/types/i18n.d.ts'`          | Where the declaration is written.                                                         |
| `sourceLocale`  | the only locale                    | The locale the types come from. Required when the directory has more than one locale.     |
| `fileTemplate`  | `'{namespace}/{languageTag}.json'` | Maps a file to its locale and namespace. With the default, `<locale>.json` is `default`.  |
| `defaultParams` | none                               | The keys of `createI18n({ defaultParams })`. They become optional in every key's params.  |
| `augment`       | from `package.json`                | The module the declaration augments: `@comvi/core` when declared, otherwise your binding. |

## What gets generated

`src/locales/en.json` is the `default` namespace and `src/locales/shop/en.json` the `shop`
namespace:

```json title="src/locales/en.json"
{
  "welcome": "Hello, {name}!",
  "terms": "Read the <link>terms</link>.",
  "title": "Comvi"
}
```

```json title="src/locales/shop/en.json"
{
  "cart.items": "{count, plural, one {# item} other {# items}}"
}
```

For an app that depends on `@comvi/react`, `src/types/i18n.d.ts` becomes (byte for byte):

<!-- prettier-ignore -->
```ts title="src/types/i18n.d.ts"
/**
 * Comvi translation catalogs, augmenting '@comvi/react'
 * DO NOT EDIT — this file is generated from your translation schema
 */

import type { Tag } from '@comvi/react';

declare module '@comvi/react' {
  interface Catalogs {
    "default": {
      "terms": { "link": Tag };
      "title": never;
      "welcome": { "name": string | number };
    };
    "shop": {
      "cart.items": { "count": number };
    };
  }
}

export {};
```

`never` means the key takes no parameters. A plain `{name}` takes `string | number`, a `plural`
or `selectordinal` count is a `number`, a `select` takes its options, and a tag is a `Tag` param:
the handler that renders it. Catalogs are flat: `cart.items` is one key. A nested object is
reported and left out, as the runtime leaves it out.

### How it works

`vite build` generates once and fails the build when it cannot: broken JSON, a param named `ns`,
`locale` or `markers` (per-call options of `t()`), or a `package.json` that declares no Comvi
package. `vite dev` follows the catalogs until the server closes: a burst of saves is generated
once, only the namespace that changed is read again, a file whose content is unchanged is not
rewritten, and broken JSON is reported once while the previous declaration stays. Writes are
atomic. Two dev servers of one app write the file from one of them.

Messages are read with the scanner `@comvi/core` renders them with, so the types and the
rendered text agree on every message.

## Read next

- [Type safety](https://comvi.io/docs/i18n/type-safety): what the declaration checks, and how it
  reaches `useI18n()`.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
