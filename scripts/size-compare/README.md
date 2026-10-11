# Cross-library size and ICU runtime comparison

What the comparison pages on comvi.io cite when they put a Comvi figure next to a figure for
another library. Everything here runs on **published npm packages** (Comvi included, pinned to
0.5.0), with one bundler configuration for every row, so the numbers are comparable with each
other. They are not comparable with figures produced elsewhere with a different bundler, fixture
or gzip level, and a ratio between two minimal fixtures describes those fixtures, not every app.

This directory is a standalone package, deliberately outside the pnpm workspace, so the competitor
packages never enter the monorepo lockfile.

## Run

```sh
cd scripts/size-compare
pnpm install --ignore-workspace
node measure.mjs                      # writes results-<date>.json and results-<date>.md
NODE_ENV=production node bench.mjs    # refuses to run without NODE_ENV=production; run it three times
```

## Method: bundle size

The esbuild settings are those of `scripts/size-check.mjs`, the gate that guards Comvi's own sizes:
esbuild 0.28.0, `bundle`, `minify`, `format: esm`, `platform: browser`, `target: es2020`,
`process.env.NODE_ENV` defined as `"production"` and `__DEV__` as `false`, the framework marked
external in every framework row (`react`, `react-dom`, `next`, `vue`), the single output file
measured minified and gzipped at level 9. One difference: the gate resolves `@comvi/*` imports
through its own exports-map plugin, this harness passes the conditions
`production, import, module, browser` to esbuild and lets it resolve the installed tarballs. On the
gate's own fixtures the two agree to the byte on all but one (see the Comvi-only table below).

The metafile lists every package that landed in each bundle; the results table prints them with
the resolved version, so a figure can be traced to what it contains.

Each library fixture is the smallest app that does the same job: one message with one parameter,
one `t()` call, plus whatever the library needs to make that call. The exceptions are named in the
results table: `use-intl (react)` and `next-intl (client)` are retention fixtures that import the
provider and the hook and reference them, with no message of their own, because those entries are
the framework glue and a `t()` call there would not change what the bundler keeps; the Comvi-only
rows reuse the size gate's fixtures as they are (the server-provider and middleware fixtures also
retain exports rather than call `t()`); the ICU Nuxt app's message has two parameters.

| Group            | Comvi                                                                                                    | Other                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| core             | `@comvi/core`, simple compiler (interpolation only)                                                      | `i18next` (interpolation and suffix-key plurals in its own syntax)                                                                           |
| core+icu         | `@comvi/core` + `compiler: icuCompiler`; and the same plural text on the simple compiler, as the control | `i18next` + `i18next-icu`; the same plural text without the plugin, as the control; `intl-messageformat` alone; `use-intl/core`              |
| react            | `@comvi/react`, with and without ICU                                                                     | `i18next` + `react-i18next` (`initReactI18next`, `I18nextProvider`, `useTranslation`); `use-intl` (`IntlProvider`, `useTranslations`)        |
| react+icu+loader | `@comvi/react` + ICU + `cdnLoader`                                                                       | `i18next` + `react-i18next` + `i18next-icu` + `i18next-http-backend`                                                                         |
| vue              | `@comvi/vue`, with and without ICU                                                                       | `vue-i18n` 11, Composition API: a raw-string message with the runtime compiler, and a precompiled message function with the compiler dropped |
| next-client      | `@comvi/next/client`, with and without ICU                                                               | `next-intl` client entry (`NextIntlClientProvider`, `useTranslations`)                                                                       |

### Caveats a reader should know

- The core row compares two libraries that each do interpolation in their own syntax; i18next's
  bare core also carries suffix-key plurals, Comvi's simple compiler does not. The rows with ICU on
  the Comvi side are the plural-to-plural comparison; `use-intl`, `next-intl` and `vue-i18n` always
  carry their plural engine, so their equal-work pair is the Comvi row **with** ICU.
- What ICU adds is measured on each side with the message text held constant: the plural message
  on Comvi's simple compiler against the same message on `icuCompiler`, and the same message on
  bare `i18next` against `i18next` + `i18next-icu`. Subtracting two fixtures with different texts
  gives a slightly different number (1,058 B instead of 1,043 B for Comvi); the pages cite the
  constant-text figure. `intl-messageformat` alone is listed as a fact about that package and
  carries no ratio, because Comvi has no standalone equivalent to put next to it.
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
  table, and neither are `@comvi/next/server` or `@comvi/next/middleware` in a paired row.
- `@nuxtjs/i18n` cannot be bundled by esbuild outside Nuxt (it depends on Nuxt's virtual modules),
  so it is not in this table. See the Nuxt section for a comparison made with Nuxt's own build.
- A minimal fixture is a floor. A real app pulls in more of every library, and the ratio between two
  floors describes these fixtures, not an app in general.

## Method: ICU runtime

`bench.mjs`, Node, `NODE_ENV=production` (the script refuses to run otherwise, so every library
takes its production branch), the same message text for every library that speaks ICU, 7 rounds,
median reported, run three times. Four scenarios:

- **warm, same output** (the row the pages cite): the `#` message on the libraries that localize
  `#` (`{count, plural, one {# item} other {# items}} in {name}`), and on the Comvi side the count
  formatted with Comvi's own `formatNumber()` (Intl.NumberFormat, cached) and passed as `{n}`.
  Every library produces the same localized string, `1,234 items in cart`, checked by assertion, so
  the work and the output are equal. vue-i18n formats through its named number format
  (`n(x, "decimal")`), its documented cached path; `n(x)` without a name is about 8 times slower
  and is not used.
- **warm, equal work**: the count passed pre-formatted as `{n}` and interpolated in both plural
  branches; every library does plural selection plus interpolation and no number formatting.
- **warm, default `#`**: the same message written with `#` on both sides. Comvi inserts `#` as plain
  digits (`String(count)`); `intl-messageformat` localizes it. The two do different work here by
  design, so this row is shown but not cited.
- **catalog**: one instance per library holding 5,000 distinct messages, each formatted exactly
  once per round; the timer covers building the instance with its catalog, parsing and the first
  format of every message, with the count passed pre-formatted (`{n}`), so it measures setup and
  parsing, not number formatting. Message ids are unique across warmup and all rounds, so no
  module-level cache from an earlier round can serve a later one, and they restart at the same
  fixed width for every library so none parses longer text than another; one message of a fresh
  catalog is asserted before timing. `intl-messageformat` appears
  twice, with a formatters object shared across its instances (its best case) and with the default
  per-instance formatters. This is the "first render of a catalog" case.
- `vue-i18n` has no ICU; it runs on its own pipe-plural syntax
  (`{n} item in {name} | {n} items in {name}`), so its rows are "the same job in its own format",
  not an ICU implementation.

Micro-benchmarks of a formatter that takes under a microsecond per call do not decide a UI; a
page formats hundreds of strings, not millions. The catalog row is the one closest to what a user
sees.

## Results

### Size, min+gz bytes, measured 2026-10-10 and 2026-10-11 on the same packages

Node v24.19.0, esbuild 0.28.0. The full table with the packages inside each bundle is in
`results-2026-10-11.md`; the raw data in `results-2026-10-11.json`.

| Group                                          |                            Comvi |                                                                        Other | Ratio |
| ---------------------------------------------- | -------------------------------: | ---------------------------------------------------------------------------: | ----: |
| core, interpolation only on the Comvi side     |              `@comvi/core` 5,452 |                                                             `i18next` 14,032 |  2.6× |
| core+icu                                       |        `@comvi/core` + ICU 6,510 |                                             `i18next` + `i18next-icu` 25,707 |  3.9× |
| core+icu                                       |                            6,510 |                                                       `use-intl/core` 11,277 |  1.7× |
| what ICU adds, same message text on both sides |           +1,043 (6,510 − 5,467) | `i18next-icu` + `intl-messageformat` on `i18next`: +11,670 (25,707 − 14,037) | 11.2× |
| the ICU engine alone, no ratio                 |                                — |                                   `intl-messageformat` with its parser 9,894 |     — |
| react, no plural engine on either side         |             `@comvi/react` 7,425 |                                           `i18next` + `react-i18next` 19,615 |  2.6× |
| react, ICU on both sides                       |       `@comvi/react` + ICU 8,470 |                                                            `use-intl` 11,567 |  1.4× |
| react+icu+loader                               |                           11,837 |                      `i18next` + `react-i18next` + ICU + http-backend 33,826 |  2.9× |
| vue, plural engine on both sides               |         `@comvi/vue` + ICU 8,605 |                                      `vue-i18n` runtime compiler kept 18,693 |  2.2× |
| vue, plural engine on both sides               |                            8,605 |             `vue-i18n` precompiled message function, compiler dropped 13,764 |  1.6× |
| vue, Comvi without ICU, for reference          |               `@comvi/vue` 7,540 |                                                                            — |     — |
| next-client, ICU on both sides                 | `@comvi/next/client` + ICU 9,092 |                                                    `next-intl` client 12,512 |  1.4× |
| next-client, Comvi without ICU, for reference  |       `@comvi/next/client` 8,044 |                                                                            — |     — |

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

### ICU runtime, 2026-10-11, three runs, each the median of 7 rounds

Apple M1 Max, darwin arm64, Node v24.19.0, `NODE_ENV=production`. Warm rows in million calls per
second, catalog rows in thousand messages per second (5,000 distinct messages, parse plus format,
one instance). The pages cite the median of the three runs for the same-output and catalog rows.

| Scenario                         | Library                                                            | run 1 | run 2 | run 3 |           median |
| -------------------------------- | ------------------------------------------------------------------ | ----: | ----: | ----: | ---------------: |
| warm, same output                | `@comvi/core` + `icuCompiler`, `formatNumber()` into `{n}`         |  0.92 |  0.94 |  0.87 |     **0.92 M/s** |
| warm, same output                | `intl-messageformat`, instance reused, `#`                         |  0.64 |  0.61 |  0.44 |     **0.61 M/s** |
| warm, same output                | `i18next` + `i18next-icu`, `#`                                     |  0.25 |  0.25 |  0.23 |     **0.25 M/s** |
| warm, same output                | `use-intl/core` translator, `#`                                    |  0.21 |  0.21 |  0.21 |     **0.21 M/s** |
| warm, same output                | `vue-i18n`, pipe plural, `n(x, "decimal")` into `{n}`              |  0.17 |  0.16 |  0.17 |     **0.17 M/s** |
| warm, equal work (pre-formatted) | `@comvi/core` + `icuCompiler`                                      |  1.50 |  1.31 |  1.51 |         1.50 M/s |
| warm, equal work (pre-formatted) | `intl-messageformat`, instance reused                              |  0.93 |  0.92 |  0.93 |         0.93 M/s |
| warm, equal work (pre-formatted) | `i18next` + `i18next-icu`                                          |  0.30 |  0.30 |  0.30 |         0.30 M/s |
| warm, equal work (pre-formatted) | `use-intl/core` translator                                         |  0.24 |  0.25 |  0.15 |         0.24 M/s |
| warm, equal work (pre-formatted) | `vue-i18n`, pipe plural                                            |  0.23 |  0.23 |  0.22 |         0.23 M/s |
| warm, default `#` (unequal work) | `@comvi/core` + `icuCompiler`                                      |  1.67 |  1.53 |  1.63 |         1.63 M/s |
| warm, default `#` (unequal work) | `intl-messageformat`, instance reused                              |  0.66 |  0.60 |  0.64 |         0.64 M/s |
| catalog                          | `@comvi/core` + `icuCompiler`                                      | 283.1 | 226.1 | 269.0 | **269 K msgs/s** |
| catalog                          | `intl-messageformat`, new instance per message, shared formatters  |  99.4 |  93.7 |  95.5 |  **96 K msgs/s** |
| catalog                          | `intl-messageformat`, new instance per message, default formatters |  50.7 |  47.1 |  47.6 |      48 K msgs/s |
| catalog                          | `i18next` + `i18next-icu`, one instance                            |  38.3 |  34.4 |  36.8 |  **37 K msgs/s** |
| catalog                          | `use-intl/core`, one translator                                    |  54.8 |  54.0 |  55.8 |  **55 K msgs/s** |
| catalog                          | `vue-i18n`, one instance, pipe plural                              |  45.5 |  42.1 |  43.3 |  **43 K msgs/s** |

The exact console output of each run is in `bench-2026-10-11-run1.txt`, `-run2.txt` and
`-run3.txt`. An earlier version of this benchmark (2026-10-10) used a `#` message for every library
and a "cold" row that created a new instance per call with ids repeated across rounds; a review
found both unfair (unequal work; a module-level cache in vue-i18n served later rounds; the
`intl-messageformat` row paid Intl initialization per instance). Those rows were replaced by the
scenarios above and the pages re-cited.

## Where the Comvi figures come from

The Comvi rows reproduce `scripts/size-check.mjs` on the published 0.5.0 tarballs to the byte
(`core-base` 5,452, `fw-react-default` 7,425, `platform-path-react` 11,837, `fw-vue-default` 7,540,
`fw-next-client-default` 8,044 on 2026-10-10). The `baseline` values in `scripts/size-budgets.json`
were recorded between 2026-09-12 and 2026-10-05 and are 1–4 % lower than 0.5.0; the budgets still
hold. Public pages should cite the figure measured on the released version, not the baseline.

## Nuxt: measured with Nuxt's own build

`@nuxtjs/i18n` depends on Nuxt's virtual modules and cannot be bundled by esbuild on its own, so
the two Nuxt modules are compared with `nuxi build` instead. `nuxt/apps/` holds four one-string
apps (`bare`, `nuxt-i18n`, `comvi-nuxt`, `comvi-nuxt-icu`); the first three render `Hello, world!`, the ICU app renders a plural, and the messages sit outside the measured JavaScript in every app;
`nuxt/measure.mjs` sums every client JavaScript file under `.output/public/_nuxt/` (minified, gzip
level 9, brotli 11) and reports the delta over the bare app, for the whole build and for the entry
file alone (entry-file bytes exclude the other chunks and anything a browser may prefetch in the
background). The entry chunk is read from Nuxt's client manifest
(`.nuxt/dist/server/client.manifest.mjs`, the record marked `isEntry`) or from a prerendered
`index.html`; when neither is present the entry row says so instead of guessing.
`nuxt/attribute.mjs` attributes minified bytes to packages from a source-mapped build.
`nuxt/REPORT.md` is the full run of 2026-10-10 with every config, command and version, plus the
ICU variant of 2026-10-11.

```sh
cd scripts/size-compare/nuxt/apps/<app> && pnpm install --ignore-workspace && pnpm nuxi build
cd ../.. && node measure.mjs apps/bare apps/comvi-nuxt apps/comvi-nuxt-icu apps/nuxt-i18n
```

### Results (Nuxt 4.6.1, @nuxtjs/i18n 10.6.0, @comvi/nuxt 0.5.0)

| App                                        | JS files |   min B | gzip B | Δ gzip vs bare | entry file gzip | Δ entry vs bare |
| ------------------------------------------ | -------: | ------: | -----: | -------------: | --------------: | --------------: |
| bare                                       |        4 | 144,943 | 54,453 |              — |          49,167 |               — |
| @nuxtjs/i18n                               |        5 | 229,147 | 82,571 |        +28,118 |          79,515 |         +30,348 |
| @comvi/nuxt, default compiler              |        4 | 184,255 | 66,719 |        +12,266 |          63,729 |         +14,562 |
| @comvi/nuxt, `icu: true` (equal-work pair) |        4 | 186,945 | 67,692 |        +13,239 |          64,702 |         +15,535 |

Per package, minified bytes in the entry chunk (from the source-mapped build of the default-compiler
app): `@nuxtjs/i18n` 21,479 + `@intlify/message-compiler` 16,905 + `@intlify/core-base` 14,966 +
`vue-i18n` 14,589 + `@intlify/shared` 3,363 on one side; `@comvi/core` 16,262 + `@comvi/nuxt` 6,160 +
`@comvi/vue` 5,706 on the other. Both pull the same `cookie-es`, `ohash` and `klona` for the locale
cookie.

### Caveats

- Neither delta contains message bytes. `@nuxtjs/i18n` 10.6 fetches the catalog from a Nitro
  route at startup (`/_i18n/<hash>/en/messages.json`, one extra request, 36 B here; its former
  `lazy` option no longer exists). `@comvi/nuxt` inlines the catalog in the page payload. Both were
  confirmed against the running servers.
- Both compile messages in the browser. On the `@nuxtjs/i18n` side that is why
  `@intlify/message-compiler` is in the client chunk; the run did not precompile messages, which
  `@nuxtjs/i18n` can do with `@intlify/unplugin-vue-i18n`. The `comvi-nuxt-icu` app composes the
  ICU compiler and renders a plural; the default-compiler app is kept for reference.
- The entry-chunk delta is larger than the total delta because in every i18n app the prefetched
  error-404 chunk shrinks (NuxtLink and router helpers move into the entry chunk).
- The HTML of `/` is 2,157 B for `@nuxtjs/i18n` (inline runtime config) and 1,711 B for Comvi; not
  counted. `@nuxtjs/i18n` has one extra 45 B prefetched `i18n.config` chunk.
- The apps are hand-scaffolded without `pages/`; the Comvi README example uses `NuxtPage`, the
  module renders without it. This is one configuration of each module; the official options of
  both change what lands in the client, so the deltas describe these apps, not every Nuxt app.
- Every build was started with `node .output/server/index.mjs` and `/` returned the expected
  string (`Hello, world!`, or `2 items for world` for the ICU app) before the numbers were taken.
