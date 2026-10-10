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

| Group            | Comvi                                                    | Other                                                                                                                                        |
| ---------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| core             | `@comvi/core`, simple compiler                           | `i18next` (its own interpolation and suffix-key plurals)                                                                                     |
| core+icu         | `@comvi/core` + `compiler: icuCompiler`                  | `i18next` + `i18next-icu`; `intl-messageformat` alone; `use-intl/core`                                                                       |
| react            | `@comvi/react` (`createI18n`, `I18nProvider`, `useI18n`) | `i18next` + `react-i18next` (`initReactI18next`, `I18nextProvider`, `useTranslation`); `use-intl` (`IntlProvider`, `useTranslations`)        |
| react+icu+loader | `@comvi/react` + ICU + `cdnLoader`                       | `i18next` + `react-i18next` + `i18next-icu` + `i18next-http-backend`                                                                         |
| vue              | `@comvi/vue`                                             | `vue-i18n` 11, Composition API, a raw-string message with the runtime compiler, and a precompiled message function with the compiler dropped |
| next-client      | `@comvi/next/client`                                     | `next-intl` client entry (`NextIntlClientProvider`, `useTranslations`)                                                                       |

### Caveats a reader should know

- `i18next` without `i18next-icu` is not an ICU library; the "core" row compares two libraries that
  each do interpolation and plurals in their own syntax. The "core+icu" row is the ICU-to-ICU one.
- `vue-i18n` is measured twice, with the feature flags a production Vite build would set
  (`__VUE_I18N_FULL_INSTALL__`, `__VUE_I18N_LEGACY_API__`, `__INTLIFY_PROD_DEVTOOLS__`,
  `__VUE_PROD_DEVTOOLS__` all `false`): once with the runtime message compiler kept, which is what
  an app gets when it ships JSON and compiles at runtime like Comvi does, and once with
  `__INTLIFY_DROP_MESSAGE_COMPILER__` set on a fixture whose message is already a message
  function in the shape `@intlify/unplugin-vue-i18n` emits (`fixtures/vue-i18n-precompiled.ts`;
  the function was executed in Node and renders `Hello, world!`). The smaller of the two is the
  fair floor for vue-i18n.
- `use-intl/core` pulls in `react` through a shared chunk that imports `cloneElement` and
  `isValidElement` for rich-text formatting; `react` is marked external in that row so the number
  is the library, not React.
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

| Group                                   |                      Comvi |                                                                        Other | Ratio |
| --------------------------------------- | -------------------------: | ---------------------------------------------------------------------------: | ----: |
| core                                    |        `@comvi/core` 5,452 |                                                             `i18next` 14,032 |  2.6× |
| core+icu                                |  `@comvi/core` + ICU 6,510 |                                             `i18next` + `i18next-icu` 25,707 |  3.9× |
| core+icu, ICU added to the same library |     +1,058 (6,510 − 5,452) | `i18next-icu` + `intl-messageformat` on `i18next`: +11,675 (25,707 − 14,032) | 11.0× |
| core+icu, the engine alone, no ratio    |                          — |                                   `intl-messageformat` with its parser 9,894 |     — |
| core+icu                                |                      6,510 |                                                       `use-intl/core` 11,277 |  1.7× |
| react                                   |       `@comvi/react` 7,425 |                                           `i18next` + `react-i18next` 19,615 |  2.6× |
| react                                   |                      7,425 |                                                            `use-intl` 11,567 |  1.6× |
| react+icu+loader                        |                     11,837 |                      `i18next` + `react-i18next` + ICU + http-backend 33,826 |  2.9× |
| vue                                     |         `@comvi/vue` 7,540 |                                      `vue-i18n` runtime compiler kept 18,693 |  2.5× |
| vue                                     |                      7,540 |             `vue-i18n` precompiled message function, compiler dropped 13,764 |  1.8× |
| next-client                             | `@comvi/next/client` 8,044 |                                                    `next-intl` client 12,512 |  1.6× |

### Comvi-only rows that the pages cite, published 0.5.0, min+gz bytes

The same fixtures and externals as the size gate, bundled from the published tarballs with the
configuration above:

| Row                                                        |  Bytes |
| ---------------------------------------------------------- | -----: |
| `@comvi/next` root composed (fw-next-root-composed)        | 10,155 |
| `@comvi/next/server` provider (fw-next-server-provider)    |  1,980 |
| `@comvi/next/middleware` (fw-next-middleware-edge)         |  2,045 |
| `@comvi/nuxt` client runtime (fw-nuxt-client-default)      |  8,563 |
| `@comvi/nuxt/i18n` entry, nothing external (fw-nuxt-i18n)  |  8,525 |
| `@comvi/nuxt` everything composed (fw-nuxt-full-composite) | 13,361 |

Five of the six match `scripts/size-check.mjs` on the same code to the byte. The server-provider
row is 1,980 B here and 2,052 B in the gate: the gate resolves `@comvi/*` imports through its own
exports-map plugin, this harness lets esbuild resolve the installed tarballs, and the two walk the
`*/client/ComviClientProvider.js` external slightly differently. The pages cite the harness figure,
because the page states this harness as its method; both numbers are recorded here.

Ratios compare like with like: a complete minimal fixture against a complete minimal fixture, or
the bytes ICU adds to one library against the bytes ICU adds to the other. The engine-alone row
for `intl-messageformat` is a fact about that package and carries no ratio, because Comvi has no
standalone equivalent to put next to it.

### ICU runtime, three runs, each the median of 7 rounds, million calls per second

| Library                                                           | run 1 | run 2 | run 3 | median of the three |
| ----------------------------------------------------------------- | ----: | ----: | ----: | ------------------: |
| `@comvi/core` + `icuCompiler`, warm                               |  1.66 |  1.69 |  1.68 |            **1.68** |
| `intl-messageformat` 12.1.3, warm, instance reused                |  0.64 |  0.65 |  0.66 |            **0.65** |
| `i18next` + `i18next-icu`, warm                                   |  0.25 |  0.26 |  0.26 |            **0.26** |
| `use-intl/core` translator, warm                                  |  0.22 |  0.22 |  0.23 |            **0.22** |
| `vue-i18n`, pipe plural, warm                                     |  0.22 |  0.23 |  0.23 |            **0.23** |
| `@comvi/core` simple compiler, no ICU, warm                       |  5.45 |  5.25 |  5.52 |            **5.45** |
| `@comvi/core` + `icuCompiler`, cold (new instance, compile, call) |  0.33 |  0.35 |  0.36 |            **0.35** |
| `intl-messageformat`, cold (new instance, format)                 |  0.03 |  0.03 |  0.03 |            **0.03** |
| `use-intl/core`, cold (new translator, call)                      |  0.02 |  0.03 |  0.03 |            **0.03** |
| `vue-i18n`, cold (new instance, call)                             |  0.07 |  0.08 |  0.08 |            **0.08** |

The pages cite the median of the three runs. The exact console output of each run is in
`bench-2026-10-10.txt`, `bench-2026-10-10-run2.txt` and `bench-2026-10-10-run3.txt`; `i18next-icu`
has no cold row because the library does not expose a per-message cold path.

## Where the Comvi figures come from

The Comvi rows reproduce `scripts/size-check.mjs` on the published 0.5.0 tarballs to the byte
(`core-base` 5,452, `fw-react-default` 7,425, `platform-path-react` 11,837, `fw-vue-default` 7,540,
`fw-next-client-default` 8,044 on 2026-10-10). The `baseline` values in `scripts/size-budgets.json`
were recorded between 2026-09-12 and 2026-10-05 and are 1–4 % lower than 0.5.0; the budgets still
hold. Public pages should cite the figure measured on the released version, not the baseline.

## Nuxt: measured with Nuxt's own build

`@nuxtjs/i18n` depends on Nuxt's virtual modules and cannot be bundled by esbuild on its own, so
the two Nuxt modules are compared with `nuxi build` instead. `nuxt/apps/` holds three one-string
apps (`bare`, `nuxt-i18n`, `comvi-nuxt`) with identical `app.vue` output; `nuxt/measure.mjs` sums
every client JavaScript file under `.output/public/_nuxt/` (minified, gzip level 9, brotli 11) and
reports the delta over the bare app, total and for the entry chunk alone. `nuxt/attribute.mjs`
attributes minified bytes to packages from a source-mapped build. The entry chunk is read from Nuxt's client manifest (`.nuxt/dist/server/client.manifest.mjs`, the record marked `isEntry`) or from a prerendered `index.html`; when neither is present the entry row says so instead of guessing. `nuxt/REPORT.md` is the full
run of 2026-10-10 with every config, command and version.

```sh
cd scripts/size-compare/nuxt/apps/<app> && pnpm install --ignore-workspace && pnpm nuxi build
cd ../.. && node measure.mjs apps/bare apps/nuxt-i18n apps/comvi-nuxt
```

### Results, 2026-10-10 (Nuxt 4.6.1, @nuxtjs/i18n 10.6.0, @comvi/nuxt 0.5.0)

| App          | JS files |   min B | gzip B | Δ gzip vs bare | entry chunk gzip | Δ entry vs bare |
| ------------ | -------: | ------: | -----: | -------------: | ---------------: | --------------: |
| bare         |        4 | 144,943 | 54,453 |              — |           49,167 |               — |
| @nuxtjs/i18n |        5 | 229,147 | 82,571 |        +28,118 |           79,515 |         +30,348 |
| @comvi/nuxt  |        4 | 184,255 | 66,719 |        +12,266 |           63,729 |         +14,562 |

Per package, minified bytes in the entry chunk (from the source-mapped build): `@nuxtjs/i18n`
21,479 + `@intlify/message-compiler` 16,905 + `@intlify/core-base` 14,966 + `vue-i18n` 14,589 +
`@intlify/shared` 3,363 on one side; `@comvi/core` 16,262 + `@comvi/nuxt` 6,160 + `@comvi/vue`
5,706 on the other. Both pull the same `cookie-es`, `ohash` and `klona` for the locale cookie.

### Caveats

- Neither delta contains message bytes. `@nuxtjs/i18n` 10.6 fetches the catalog from a Nitro
  route at startup (`/_i18n/<hash>/en/messages.json`, one extra request; its former `lazy` option
  no longer exists). `@comvi/nuxt` inlines the catalog in the page payload.
- Both compile messages in the browser. On the `@nuxtjs/i18n` side that is why
  `@intlify/message-compiler` is in the client chunk; the run did not precompile messages. The
  Comvi app runs core's default compiler; `icuCompiler` was not composed, and adds about 1,058 B
  gzipped (see the esbuild table).
- The entry-chunk delta is larger than the total delta because in both i18n apps the prefetched
  error-404 chunk shrinks (NuxtLink and router helpers move into the entry chunk).
- The HTML of `/` is 2,157 B for `@nuxtjs/i18n` (inline runtime config) and 1,711 B for Comvi; not
  counted. `@nuxtjs/i18n` has one extra 45 B prefetched `i18n.config` chunk.
- The apps are hand-scaffolded without `pages/`; the Comvi README example uses `NuxtPage`, the
  module renders without it.
- Every build was started with `node .output/server/index.mjs` and `/` returned
  `<p>Hello, world!</p>` for all three before the numbers were taken.
