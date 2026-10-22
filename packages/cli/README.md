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

`@comvi/cli` moves translations between your repository and your Comvi project and generates a
TypeScript declaration from the project's keys. For catalogs that live as local JSON, use
[`@comvi/vite-plugin`](https://comvi.io/docs/i18n/plugins/vite-plugin) instead; both emit the same
file. The full guide is [Comvi CLI](https://comvi.io/docs/cli) on the docs site.

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

The commands that talk to the platform (`init`, `typegen`, `pull`, `push`) read `COMVI_API_KEY`.
The key selects the project, so there is no project id to configure. Before each of them the CLI
loads the nearest `.env` file, walking up from the working directory and stopping at the first
`package.json`, so `COMVI_API_KEY=...` in `.env` works with no wrapper. Real environment variables
always win over the file. `comvi check` works offline: it loads no `.env` and reads no key.

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

`comvi init` writes `.comvirc.json` in the current directory without `locales` or `namespaces`;
add those by hand. It does write `push` and `pull` with their defaults, `"forceMode": "ask"` and
`"emptyDir": false`. The file is looked up by walking up from the working directory
and stopping at the first `package.json`, so in a monorepo a command run in `apps/web` does not
inherit a config at the workspace root; point at it with `--config ../../.comvirc.json`.

## Commands

| Command                 | What it does                                                                     |
| ----------------------- | -------------------------------------------------------------------------------- |
| `comvi init`            | Writes `.comvirc.json`.                                                          |
| `comvi pull`            | Downloads the project's translations into local JSON files.                      |
| `comvi push`            | Uploads local JSON files to the project.                                         |
| `comvi typegen`         | Writes the `TranslationKeys` declaration from the project's keys.                |
| `comvi typegen --watch` | Generates once, then regenerates on every schema change over Server-Sent Events. |
| `comvi typegen --check` | Writes nothing; exits `1` when the file on disk is outdated. For CI.             |
| `comvi check`           | Compares local catalogs with the source locale, offline; exits `1` on findings.  |

```bash title="Terminal"
npx comvi pull
npx comvi check --source en
npx comvi typegen --check
npx tsc --noEmit
```

`pull` writes flat files with dotted keys, and `push` accepts either shape: nested objects are
flattened to dotted keys on push. Every leaf must be a string; a number, boolean, null or array
fails the push with exit code `4` and names the file and key. The generated declaration augments
`@comvi/core` when `package.json` declares it, otherwise the first framework binding it declares;
set `augment` in `.comvirc.json` to name a different module.

## Exit codes

Every command uses the same codes, so CI can act on the code alone. `comvi init` still writes the config and only warns when the key cannot be validated.

| Code | Meaning                                                                                                                                                                                                                  | What to do      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `0`  | Done                                                                                                                                                                                                                     | —               |
| `1`  | The command ran and found a problem: a conflict under `--force-mode abort`, outdated types under `typegen --check`, findings under `comvi check`; also a local failure such as a file that cannot be written             | Fix the content |
| `2`  | The platform was unreachable, timed out, answered 5xx or 429, or sent an unexpected response                                                                                                                             | Retry           |
| `3`  | The API key was rejected, lacks the scope the command needs, or its project no longer exists                                                                                                                             | Fix the key     |
| `4`  | Invalid input: configuration, flags, an unreadable local file, a locale the project does not have (or the key may not write), nothing to push, a plan limit, `--force-mode ask` without a terminal, a wrong `apiBaseUrl` | Fix the input   |

## Next steps

- [Comvi CLI](https://comvi.io/docs/cli): environment variables, every config key, exit codes.
- [comvi typegen](https://comvi.io/docs/cli/typegen): flags, check and watch modes, the emitter.
- [comvi pull](https://comvi.io/docs/cli/pull) and [comvi push](https://comvi.io/docs/cli/push): file layout, filters, force modes.
- [Type safety](https://comvi.io/docs/i18n/type-safety): how the generated file reaches `t()`.

## Contributing

Bug reports, docs fixes and pull requests are welcome.
[CONTRIBUTING.md](https://github.com/comvi-io/comvi-js/blob/main/CONTRIBUTING.md) explains the setup
and what CI checks.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
