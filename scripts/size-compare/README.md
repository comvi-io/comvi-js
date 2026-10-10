# Cross-library size and ICU runtime comparison

What the comparison pages on comvi.io cite when they put a Comvi figure next to a figure for
another library. Everything here runs on **published npm packages** (Comvi included, pinned to
0.5.0), with one bundler configuration for every row, so the numbers are comparable with each
other. They are not comparable with figures produced elsewhere with a different bundler, fixture
or gzip level.

This directory is a standalone package, deliberately outside the pnpm workspace, so the competitor
packages never enter the monorepo lockfile.

## Run

```sh
cd scripts/size-compare
pnpm install --ignore-workspace
node measure.mjs   # writes results-<date>.json and results-<date>.md
node bench.mjs     # prints the runtime table; paste into bench-<date>.txt
```

## Method: bundle size

Identical to `scripts/size-check.mjs`, the gate that guards Comvi's own sizes:

- esbuild 0.28.0, `bundle`, `minify`, `format: esm`, `platform: browser`, `target: es2020`
- resolution conditions `production, import, module, browser`; `process.env.NODE_ENV` defined as
  `"production"`, `__DEV__` as `false`
- the framework is marked external in every framework row (`react`, `react-dom`, `next`, `vue`),
  so only the i18n graph is counted
- the reported number is the single output file, minified, and the same bytes gzipped at level 9
- the metafile lists every package that landed in the bundle; the results table prints them with
  the resolved version, so a figure can be traced to what it contains

Each fixture is the smallest app that does the same job: one message with one parameter, one
`t()` call, plus whatever the library needs to make that call. The pairs:

| Group            | Comvi                                                    | Other                                                                                                                                 |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| core             | `@comvi/core`, simple compiler                           | `i18next` (its own interpolation and suffix-key plurals)                                                                              |
| core+icu         | `@comvi/core` + `compiler: icuCompiler`                  | `i18next` + `i18next-icu`; `intl-messageformat` alone; `use-intl/core`                                                                |
| react            | `@comvi/react` (`createI18n`, `I18nProvider`, `useI18n`) | `i18next` + `react-i18next` (`initReactI18next`, `I18nextProvider`, `useTranslation`); `use-intl` (`IntlProvider`, `useTranslations`) |
| react+icu+loader | `@comvi/react` + ICU + `cdnLoader`                       | `i18next` + `react-i18next` + `i18next-icu` + `i18next-http-backend`                                                                  |
| vue              | `@comvi/vue`                                             | `vue-i18n` 11, Composition API, with and without the runtime message compiler                                                         |
| next-client      | `@comvi/next/client`                                     | `next-intl` client entry (`NextIntlClientProvider`, `useTranslations`)                                                                |

### Caveats a reader should know

- `i18next` without `i18next-icu` is not an ICU library; the "core" row compares two libraries that
  each do interpolation and plurals in their own syntax. The "core+icu" row is the ICU-to-ICU one.
- `vue-i18n` is measured twice, with the feature flags a production Vite build would set
  (`__VUE_I18N_FULL_INSTALL__`, `__VUE_I18N_LEGACY_API__`, `__INTLIFY_PROD_DEVTOOLS__`,
  `__VUE_PROD_DEVTOOLS__` all `false`): once with the runtime message compiler kept, which is what
  an app gets when it ships JSON and compiles at runtime like Comvi does, and once with
  `__INTLIFY_DROP_MESSAGE_COMPILER__` set, which assumes every message is precompiled by
  `@intlify/unplugin-vue-i18n`. The smaller of the two is the fair floor for vue-i18n.
- `use-intl/core` imports `react` for its `cache()`; `react` is marked external in that row so the
  number is the library, not React.
- `next-intl` is measured on its client entry only. Its server entry and middleware are not in the
  table, and neither are `@comvi/next/server` or `@comvi/next/middleware`.
- `@nuxtjs/i18n` cannot be bundled by esbuild outside Nuxt (it depends on Nuxt's virtual modules),
  so it is not in this table. See `nuxt/` for a comparison made with Nuxt's own production build.
- A minimal fixture is a floor. A real app pulls in more of every library; the ratio between two
  floors is the honest claim, not an absolute "your app will weigh X".

## Method: ICU runtime

`bench.mjs`, Node, the same message for every library that speaks ICU
(`{count, plural, one {# item} other {# items}} in {name}`), 7 rounds, median reported.

- **warm**: the same key formatted 200,000 times with a changing `count`. This is the render-loop
  case; every library caches the parsed message, so it measures the formatter.
- **cold**: a fresh message string on every one of 20,000 calls, so it measures parse plus format.
  For Comvi and vue-i18n the cold path creates a whole instance per call, which is more work than
  the other libraries do in their cold row; the Comvi figure is therefore conservative.
- `vue-i18n` has no ICU; it is run on its own pipe-plural syntax
  (`{count} item in {name} | {count} items in {name}`), so its row is "the same job in its own
  format", not an ICU implementation.

Micro-benchmarks of a formatter that takes under a microsecond per call do not decide a UI; a
page formats hundreds of strings, not millions. The cold number is the one that shows in practice,
on the first render of a large catalog.

## Results, 2026-10-10

Node v24.19.0, esbuild 0.28.0. The full table with the packages inside each bundle is in
`results-2026-10-10.md`; the raw data in `results-2026-10-10.json`.

### Size, min+gz bytes

| Group            |                                         Comvi |                                                   Other | Ratio |
| ---------------- | --------------------------------------------: | ------------------------------------------------------: | ----: |
| core             |                           `@comvi/core` 5,452 |                                        `i18next` 14,032 |  2.6× |
| core+icu         |                     `@comvi/core` + ICU 6,510 |                        `i18next` + `i18next-icu` 25,707 |  3.9× |
| core+icu         | the ICU compiler alone: 6,510 − 5,452 = 1,058 |                        `intl-messageformat` alone 9,894 |  9.4× |
| core+icu         |                                         6,510 |                                  `use-intl/core` 11,277 |  1.7× |
| react            |                          `@comvi/react` 7,425 |                      `i18next` + `react-i18next` 19,615 |  2.6× |
| react            |                                         7,425 |                                       `use-intl` 11,567 |  1.6× |
| react+icu+loader |                                        11,837 | `i18next` + `react-i18next` + ICU + http-backend 33,826 |  2.9× |
| vue              |                            `@comvi/vue` 7,540 |                 `vue-i18n` runtime compiler kept 18,693 |  2.5× |
| vue              |                                         7,540 |                  `vue-i18n` precompiled messages 13,732 |  1.8× |
| next-client      |                    `@comvi/next/client` 8,044 |                               `next-intl` client 12,512 |  1.6× |

### ICU runtime, median of 7 rounds

| Library                               |        warm, 200k calls |                    cold, 20k calls |
| ------------------------------------- | ----------------------: | ---------------------------------: |
| `@comvi/core` + `icuCompiler`         | 120.6 ms (1.66 M ops/s) |             59.9 ms (0.33 M ops/s) |
| `intl-messageformat` 12.1.3           | 312.8 ms (0.64 M ops/s) |            635.9 ms (0.03 M ops/s) |
| `i18next` + `i18next-icu`             | 788.1 ms (0.25 M ops/s) | not run (no per-message cold path) |
| `use-intl/core`                       | 915.2 ms (0.22 M ops/s) |            818.5 ms (0.02 M ops/s) |
| `vue-i18n`, pipe plural               | 892.4 ms (0.22 M ops/s) |            267.1 ms (0.07 M ops/s) |
| `@comvi/core` simple compiler, no ICU |  36.7 ms (5.45 M ops/s) |                                  — |

The exact console output is in `bench-2026-10-10.txt`.

## Where the Comvi figures come from

The Comvi rows reproduce `scripts/size-check.mjs` on the published 0.5.0 tarballs to the byte
(`core-base` 5,452, `fw-react-default` 7,425, `platform-path-react` 11,837, `fw-vue-default` 7,540,
`fw-next-client-default` 8,044 on 2026-10-10). The `baseline` values in `scripts/size-budgets.json`
were recorded between 2026-09-12 and 2026-10-05 and are 1–4 % lower than 0.5.0; the budgets still
hold. Public pages should cite the figure measured on the released version, not the baseline.
