<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">@comvi/cli</h1>

<p align="center">CLI for the Comvi platform: type generation and translation sync from your terminal and CI.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@comvi/cli"><img src="https://img.shields.io/npm/v/@comvi/cli?color=blue" alt="npm"></a>
  <a href="https://github.com/comvi-io/comvi-js/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

---

`comvi` moves translations between your repository and your Comvi project, fills missing values
with machine translation, validates local catalogs offline and generates the TypeScript
declaration that types `t()`. Use it when the catalogs live on the
[Comvi platform](https://comvi.io); for catalogs that only live as local JSON,
[`@comvi/vite-plugin`](https://comvi.io/docs/i18n/plugins/vite-plugin) emits the same declaration.

## Install

```bash
npm install -D @comvi/cli
# Node 22 or newer.
```

Run it as `npx comvi <command>` once it is a dev dependency, or as
`npx --package @comvi/cli comvi <command>` with nothing installed.

## Authenticate

```bash title="Terminal"
export COMVI_API_KEY=comvi_xxxxxxxxxxxxxxxx
npx comvi pull
```

The commands that talk to the platform (`init`, `typegen`, `pull`, `push`, `translate`) read
`COMVI_API_KEY`. The key selects the project, so there is no project id to configure. Before each
of them the CLI loads the nearest `.env` file, walking up from the working directory and stopping
at the first `package.json`, so `COMVI_API_KEY=...` in `.env` works with no wrapper; a variable
already in the environment wins over the file. `comvi check` works offline: it loads no `.env` and
reads no key.

## Config file

```bash title="Terminal"
npx comvi init
```

A filled-in `.comvirc.json`:

```json title=".comvirc.json"
{
  "apiBaseUrl": "https://api.comvi.io",
  "outputPath": "src/types/i18n.d.ts",
  "strictParams": true,
  "translationsPath": "./src/locales",
  "fileTemplate": "{namespace}/{languageTag}.json",
  "format": "json",
  "locales": ["en", "de"],
  "namespaces": ["common", "auth"],
  "push": { "forceMode": "ask" },
  "pull": { "emptyDir": false }
}
```

`comvi init` writes the file in the current directory with the defaults and without `locales` or
`namespaces`, which means all of them; add a filter by hand. The file is looked up by walking up
from the working directory and stopping at the first `package.json`, so in a monorepo a command
run in `apps/web` does not inherit a config at the workspace root; point at it with
`--config ../../.comvirc.json`.

## Commands

| Command                 | What it does                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- |
| `comvi init`            | Writes `.comvirc.json`.                                                          |
| `comvi pull`            | Downloads the project's translations into local JSON files.                      |
| `comvi push`            | Uploads local JSON files to the project.                                         |
| `comvi check`           | Compares local catalogs with the source locale, offline.                         |
| `comvi translate`       | Machine-translates the values the project is missing and writes them locally.    |
| `comvi typegen`         | Writes the `TranslationKeys` declaration from the project's keys.                |
| `comvi typegen --watch` | Generates once, then regenerates on every schema change over Server-Sent Events. |
| `comvi typegen --check` | Writes nothing; exits `1` when the file on disk is outdated. For CI.             |

```bash title="Terminal"
npx comvi pull
npx comvi check --source en
npx comvi typegen --check
npx tsc --noEmit
```

`pull` writes flat files with dotted keys, in the existing file's indentation and line endings (a
new file takes those of the `sourceLocale` file), and `push` accepts either shape: nested objects are
flattened to dotted keys on push. Every leaf must be a string; a number, boolean, null or array
fails the push with exit code `4` and names the file and key. `push --force-mode` takes
`override`, `keep`, `ask` (the default) or `abort` for keys whose local value differs from the
project's. The generated declaration augments `@comvi/core` when `package.json` declares it,
otherwise the first framework binding it declares; set `augment` in `.comvirc.json` to name a
different module.

`check` compares every other catalog with the source locale (`--source`, or `sourceLocale` in the
config, else `en`). Errors: a key missing or empty in a target, parameters or select branches that differ from the source, a plural without `other` or with a selector the locale does not have, and tag names that differ where the source uses tags. Warnings: a key the source does not have, a plural
category the locale has and the message omits, and a translation equal to its source with
`--identical`. Errors exit `1`; warnings do too only with `--strict`; `--no-fail` exits `0`
either way, and `--format json` prints the report as JSON.

## Machine translation

```bash title="Terminal"
npx comvi translate --dry-run
npx comvi translate --force-mode keep
```

`translate` pushes the local files, has the platform machine-translate every empty key × locale
pair and writes the results where the local files have none; a local value is never overwritten.
It writes files in the existing file's indentation and line endings; a new file takes the source
locale's.
`--max-keys` (default 1000) caps a run and `--dry-run` estimates the credits. The API key needs
the opt-in `mt:use` scope. Details and a CI recipe:
[comvi translate](https://comvi.io/docs/cli/translate).

## Exit codes

Every command uses the same codes, so CI can act on the code alone.

| Code | Meaning                                                                                                                                                                                                                                                                       | What to do              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `0`  | Done                                                                                                                                                                                                                                                                          | —                       |
| `1`  | The command ran and found a problem: a conflict under `--force-mode abort`, outdated types under `typegen --check`, errors under `comvi check` (warnings too with `--strict`), a value `comvi translate` could not translate; also a local failure such as an unwritable file | Fix the content         |
| `2`  | The platform was unreachable, timed out, answered 5xx, 429 or another retryable status, or sent an unexpected response                                                                                                                                                        | Retry                   |
| `3`  | The API key was rejected, lacks access for the command, its project no longer exists, or the account reached a plan or credit limit                                                                                                                                           | Fix the key or the plan |
| `4`  | Invalid input: configuration, flags, an unreadable translation file, a locale the project does not have (or the key may not write), nothing to push, `--force-mode ask` with conflicts and no terminal, a request the platform refused, a wrong `apiBaseUrl`                  | Fix the input           |

`comvi init` still writes the config and only warns when the key cannot be validated.

## Read next

- [Comvi CLI](https://comvi.io/docs/cli): environment variables, every config key, exit codes.
- [comvi typegen](https://comvi.io/docs/cli/typegen): flags, check and watch modes, the emitter.
- [comvi pull](https://comvi.io/docs/cli/pull) and [comvi push](https://comvi.io/docs/cli/push): file layout, filters, force modes.
- [comvi translate](https://comvi.io/docs/cli/translate): how a run works, credits, exit codes, the CI recipe.
- [Type safety](https://comvi.io/docs/i18n/type-safety): how the generated file reaches `t()`.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
