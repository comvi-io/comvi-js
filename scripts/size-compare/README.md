# Cross-library size and ICU runtime comparison

What the comparison pages on comvi.io cite when they put a Comvi figure next to a figure for
another library. Everything here runs on **published npm packages** (Comvi included, pinned to
0.6.0), with one bundler configuration for every row, so the numbers are comparable with each
other. They are not comparable with figures produced elsewhere with a different bundler, fixture
or gzip level, and a ratio between two minimal fixtures describes those fixtures, not every app.

This directory is a standalone package, deliberately outside the pnpm workspace, so the competitor
packages never enter the monorepo lockfile.

**The 2026-10-14 run measured 0.6.0 before it was published.** The six `@comvi/*` entries in
`package.json` name 0.6.0, which is the form to install once the release is on npm; the run itself
installed the twelve release tarballs built from `a74da136` with pnpm `overrides` pointing at
`file:` paths, so the bytes measured are the bytes npm receives. The run is to be repeated against
the registry after the release and the artifacts replaced if anything moves. Every other package
is a registry install at the pinned version.

The committed lockfiles, here and in the four Nuxt apps, still resolve `@comvi/*` at 0.5.0: no
lockfile can name a version that is not published yet, and one carrying local `file:` paths would
be worse than a stale one. The post-publish re-run regenerates all five. Until then `pnpm install`
re-resolves the `@comvi/*` entries, because the manifests say 0.6.0 and the lockfiles say 0.5.0.

## Run

```sh
cd scripts/size-compare
pnpm install                          # the local pnpm-workspace.yaml makes this dir its own root
node measure.mjs                      # writes results-<date>.json and results-<date>.md
NODE_ENV=production node bench.mjs    # refuses to run without NODE_ENV=production; run it three times
```

`pnpm-workspace.yaml` carries the build-script approvals esbuild needs (`allowBuilds`); pnpm 12
fails the install without them. The `overrides` key is where a pre-publish run points the
`@comvi/*` packages at local tarballs; it is not committed.

**The Node version is part of the measurement.** esbuild produces the same minified bytes on any
Node, but gzip does not: Node 26.9.0 ships a zlib that compresses these bundles about 0.1 % smaller
than Node 24.19.0 does. The 2026-10-14 run used **Node 24.19.0**, the version of the 2026-10-11
run, so a row-to-row delta against the earlier artifacts is the library change and nothing else;
every unchanged package reproduced its earlier byte count exactly. `results-2026-10-14-node26.json`
and `-node26.md` are the same run on Node 26.9.0, kept only to show that difference. `pnpm size`,
the size gate in the repository root, must be run on the same Node as this harness for the two to
be compared.

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
  carry their plural engine, so their ICU compiler enabled is the Comvi row **with** ICU.
- What ICU adds is measured on each side with the message text held constant: the plural message
  on Comvi's simple compiler against the same message on `icuCompiler`, and the same message on
  bare `i18next` against `i18next` + `i18next-icu`. Subtracting two fixtures with different texts
  gives a slightly different number (1,234 B instead of 1,221 B for Comvi); the pages cite the
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
median reported, run three times. The 2026-10-14 run was made five times instead, because the
machine was shared with other builds: the five agree within a few per cent and the table reports
the median of the five. A sixth run, taken while another process drove the load average to 71, was
discarded before anything was read from it; it is not among the committed artifacts. Scenarios:

- **warm, static key**: `t("key")` on a message with no parameters, the most common call in a UI;
  the `intl-messageformat` row is a reused formatter instance with no key lookup, so it is a floor
  for the formatting step, not a library figure.
- **warm, one parameter**: `t("key", { name })` on `Hello, {name}!` (`{{name}}` in i18next's own
  syntax), the second most common call.
- **warm, same output** (the row the pages cite for plurals): the `#` message
  (`{count, plural, one {# item} other {# items}} in {name}`), written the same way on every
  library. From `@comvi/core` 0.6.0 Comvi formats `#` for the locale as ICU MessageFormat defines
  it, so this is one message text, one kind of work and one output on every side; in 0.5.0 the
  Comvi side had to pass the count through `formatNumber()` as `{n}` to reach the same string, and
  that fixture is kept as a second Comvi row so the two shapes can be compared. Every library
  produces the same localized string, `1,234 items in cart`, checked by assertion. vue-i18n has no
  `#`; it formats through its named number format (`n(x, "decimal")`), its documented cached path,
  into `{n}`; `n(x)` without a name is about 8 times slower and is not used.
- **warm, equal work**: the count passed pre-formatted as `{n}` and interpolated in both plural
  branches; every library does plural selection plus interpolation and no number formatting.
- **warm, small count**: the same `#` message with counts 0..3 instead of 1234..1237. Both sides
  localize `#`, so the work is equal; what the row shows is the integer fast path Comvi's `#` takes
  for counts under 1000. Until 0.6.0 this row compared unequal work (Comvi inserted
  `String(count)`) and was shown but not cited.
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
page formats hundreds of strings, not millions, and on the client the difference is invisible. Where
it shows is server-side rendering and edge functions, which pay the per-call cost on every request
for every string on the page, and cold starts that create an instance and parse a catalog per
request or per isolate, which is the catalog row.

## Results

### Size, min+gz bytes, measured 2026-10-14 on Comvi 0.6.0

Node v24.19.0, esbuild 0.28.0. The full table with the packages inside each bundle is in
`results-2026-10-14.md`; the raw data in `results-2026-10-14.json`. The 0.5.0 run of 2026-10-11 is
kept beside it under its own date.

| Group                                                                                                                           |                            Comvi |                                                                        Other | Ratio |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------: | ---------------------------------------------------------------------------: | ----: |
| core, interpolation only on the Comvi side                                                                                      |              `@comvi/core` 5,608 |                                                             `i18next` 14,070 |  2.5× |
| core+icu                                                                                                                        |        `@comvi/core` + ICU 6,842 |                                             `i18next` + `i18next-icu` 25,749 |  3.8× |
| core+icu                                                                                                                        |                            6,842 |                                                       `use-intl/core` 11,277 |  1.6× |
| what ICU adds, same message text on both sides                                                                                  |           +1,221 (6,842 − 5,621) | `i18next-icu` + `intl-messageformat` on `i18next`: +11,674 (25,749 − 14,075) |  9.6× |
| the ICU engine alone, no ratio                                                                                                  |                                — |                                   `intl-messageformat` with its parser 9,894 |     — |
| react, without the ICU compiler on the Comvi side and without `i18next-icu` on the other (i18next keeps its suffix-key plurals) |             `@comvi/react` 7,605 |                                           `i18next` + `react-i18next` 19,660 |  2.6× |
| react, ICU on both sides                                                                                                        |       `@comvi/react` + ICU 8,806 |                                                            `use-intl` 11,567 |  1.3× |
| react+icu+loader                                                                                                                |                           12,157 |                      `i18next` + `react-i18next` + ICU + http-backend 33,865 |  2.8× |
| vue, plural engine on both sides                                                                                                |         `@comvi/vue` + ICU 8,932 |                                      `vue-i18n` runtime compiler kept 18,693 |  2.1× |
| vue, plural engine on both sides                                                                                                |                            8,932 |             `vue-i18n` precompiled message function, compiler dropped 13,764 |  1.5× |
| vue, Comvi without ICU, for reference                                                                                           |               `@comvi/vue` 7,712 |                                                                            — |     — |
| next-client, ICU on both sides                                                                                                  | `@comvi/next/client` + ICU 9,427 |                                                    `next-intl` client 12,512 |  1.3× |
| next-client, Comvi without ICU, for reference                                                                                   |       `@comvi/next/client` 8,209 |                                                                            — |     — |

What moved between 0.5.0 and 0.6.0: every Comvi row with the ICU compiler grew by about 330 bytes
and every row without it by about 155, which is `#` being formatted for the locale plus the editor
loader `devtools()` installs. `@comvi/next` root composed went **down** 54 bytes, because
`createNextI18n` no longer composes discovery. On the other side only `i18next` moved, from 26.4.3
to 26.4.4; `intl-messageformat`, `use-intl`, `next-intl` and `vue-i18n` reproduced their 2026-10-11
bytes exactly, which is the control that says the toolchain did not drift.

### Comvi-only rows that the pages cite, 0.6.0, min+gz bytes

The same fixtures and externals as the size gate, bundled from the release tarballs with the
configuration above:

| Row                                                        |  Bytes |
| ---------------------------------------------------------- | -----: |
| `@comvi/next` root composed (fw-next-root-composed)        | 10,101 |
| `@comvi/next/server` provider (fw-next-server-provider)    |  1,980 |
| `@comvi/next/middleware` (fw-next-middleware-edge)         |  2,045 |
| `@comvi/nuxt` client runtime (fw-nuxt-client-default)      |  8,728 |
| `@comvi/nuxt/i18n` entry, nothing external (fw-nuxt-i18n)  |  9,647 |
| `@comvi/nuxt` everything composed (fw-nuxt-full-composite) | 14,499 |

Five of the six match `scripts/size-check.mjs` on the same code to the byte, Node 24.19.0 on both
sides. The server-provider row is 1,980 B here and 2,052 B in the gate: the gate resolves
`@comvi/*` imports through its own exports-map plugin, this harness lets esbuild resolve the
installed tarballs, and the two walk the `*/client/ComviClientProvider.js` external slightly
differently. The pages cite the harness figure, because the page states this harness as its method;
both numbers are recorded here. The two Nuxt entries that compose `devtools()` carry the editor
loader, which is why `fw-nuxt-i18n` and `fw-nuxt-full-composite` are about 1,120 bytes larger than
on 0.5.0 while `fw-nuxt-client-default`, which does not compose it, grew by 165.

### ICU runtime, 2026-10-14, five runs, each the median of 7 rounds

Apple M1 Max, darwin arm64, Node v24.19.0, `NODE_ENV=production`. Warm rows in million calls per
second, catalog rows in thousand messages per second (5,000 distinct messages, parse plus format,
one instance). Higher is better in every row. `intl-messageformat` is not an i18n library; it is
the ICU engine inside `i18next-icu`, `use-intl` and `next-intl`, kept here as the reference for what the
formatting step alone costs, and the pages do not cite it in the plain `t()` rows. The pages cite the median of the five runs for the static-key, one-parameter, same-output and
catalog rows; every run in this table comes from the same five invocations of `bench.mjs`.

| Scenario                         | Library                                                                       | run 1 | run 2 | run 3 | run 4 | run 5 |           median |
| -------------------------------- | ----------------------------------------------------------------------------- | ----: | ----: | ----: | ----: | ----: | ---------------: |
| warm, static key                 | `@comvi/core`, simple compiler                                                | 59.95 | 59.07 | 58.91 | 58.62 | 59.23 |     **59.1 M/s** |
| warm, static key                 | `@comvi/core` + `icuCompiler`                                                 | 44.32 | 43.75 | 44.13 | 43.22 | 43.91 |     **43.9 M/s** |
| warm, static key                 | reference, not a library: `intl-messageformat` instance reused, no key lookup | 50.12 | 50.51 | 52.93 | 51.62 | 50.97 |         51.0 M/s |
| warm, static key                 | `i18next`, no plugins                                                         |  0.63 |  0.61 |  0.62 |  0.61 |  0.60 |     **0.61 M/s** |
| warm, static key                 | `use-intl/core` translator                                                    |  7.54 |  7.46 |  7.55 |  7.43 |  7.47 |     **7.47 M/s** |
| warm, static key                 | `vue-i18n`                                                                    |  0.29 |  0.28 |  0.28 |  0.28 |  0.28 |     **0.28 M/s** |
| warm, one parameter              | `@comvi/core`, simple compiler                                                | 16.35 | 16.44 | 16.21 | 16.15 | 16.39 |     **16.4 M/s** |
| warm, one parameter              | `@comvi/core` + `icuCompiler`                                                 | 15.26 | 14.98 | 14.79 | 14.86 | 14.86 |     **14.9 M/s** |
| warm, one parameter              | reference, not a library: `intl-messageformat` instance reused                |  5.78 |  5.63 |  5.74 |  5.70 |  5.70 |         5.70 M/s |
| warm, one parameter              | `i18next`, no plugins, `{{name}}`                                             |  0.50 |  0.49 |  0.48 |  0.48 |  0.48 |     **0.48 M/s** |
| warm, one parameter              | `use-intl/core` translator                                                    |  0.34 |  0.34 |  0.33 |  0.33 |  0.33 |     **0.33 M/s** |
| warm, one parameter              | `vue-i18n`, `{name}`                                                          |  0.26 |  0.26 |  0.26 |  0.26 |  0.25 |     **0.26 M/s** |
| warm, same output                | `@comvi/core` + `icuCompiler`, `#`                                            |  1.39 |  1.38 |  1.36 |  1.40 |  1.38 |     **1.38 M/s** |
| warm, same output                | `@comvi/core` + `icuCompiler`, `formatNumber()` into `{n}`                    |  1.18 |  1.20 |  1.15 |  1.20 |  1.17 |         1.18 M/s |
| warm, same output                | `intl-messageformat`, instance reused, `#`                                    |  0.61 |  0.61 |  0.59 |  0.59 |  0.60 |     **0.60 M/s** |
| warm, same output                | `i18next` + `i18next-icu`, `#`                                                |  0.25 |  0.24 |  0.24 |  0.25 |  0.24 |     **0.24 M/s** |
| warm, same output                | `use-intl/core` translator, `#`                                               |  0.22 |  0.22 |  0.21 |  0.21 |  0.22 |     **0.22 M/s** |
| warm, same output                | `vue-i18n`, pipe plural, `n(x, "decimal")` into `{n}`                         |  0.17 |  0.17 |  0.16 |  0.16 |  0.17 |     **0.17 M/s** |
| warm, equal work (pre-formatted) | `@comvi/core` + `icuCompiler`                                                 |  2.12 |  2.21 |  2.18 |  2.20 |  2.17 |         2.18 M/s |
| warm, equal work (pre-formatted) | `intl-messageformat`, instance reused                                         |  0.95 |  0.96 |  0.94 |  0.92 |  0.94 |         0.94 M/s |
| warm, equal work (pre-formatted) | `i18next` + `i18next-icu`                                                     |  0.30 |  0.26 |  0.30 |  0.31 |  0.30 |         0.30 M/s |
| warm, equal work (pre-formatted) | `use-intl/core` translator                                                    |  0.25 |  0.23 |  0.25 |  0.25 |  0.25 |         0.25 M/s |
| warm, equal work (pre-formatted) | `vue-i18n`, pipe plural                                                       |  0.23 |  0.22 |  0.23 |  0.22 |  0.23 |         0.23 M/s |
| warm, small count (`#`, 0..3)    | `@comvi/core` + `icuCompiler`                                                 |  2.22 |  2.22 |  2.16 |  2.20 |  2.21 |         2.21 M/s |
| warm, small count (`#`, 0..3)    | `intl-messageformat`, instance reused                                         |  0.63 |  0.65 |  0.62 |  0.62 |  0.63 |         0.63 M/s |
| catalog                          | `@comvi/core` + `icuCompiler`                                                 | 335.6 | 324.8 | 310.1 | 306.7 | 298.1 | **310 K msgs/s** |
| catalog                          | `intl-messageformat`, new instance per message, shared formatters             |  92.7 |  97.9 |  96.4 |  95.9 |  95.0 |  **96 K msgs/s** |
| catalog                          | `intl-messageformat`, new instance per message, default formatters            |  51.7 |  46.3 |  48.6 |  48.2 |  50.5 |      49 K msgs/s |
| catalog                          | `i18next` + `i18next-icu`, one instance                                       |  39.2 |  36.2 |  35.5 |  37.1 |  36.2 |  **36 K msgs/s** |
| catalog                          | `use-intl/core`, one translator                                               |  57.8 |  56.8 |  55.0 |  54.6 |  56.3 |  **56 K msgs/s** |
| catalog                          | `vue-i18n`, one instance, pipe plural                                         |  44.8 |  44.0 |  45.1 |  43.4 |  44.8 |  **45 K msgs/s** |

What moved between 0.5.0 and 0.6.0: the Comvi rows, by the template-cache partition and the
catalog-by-reference change of 0.6.0. A warm static key went from 23.4 to 59.1 M/s, one parameter
from 6.18 to 16.4, equal work from 1.46 to 2.18 and the catalog from 240 to 310 K msgs/s. The
plural row the pages cite went from 0.90 to 1.38 M/s and no longer needs `formatNumber()` to get a
localized count. Every competitor row moved by 2 to 8 %, in the same direction, on identical
package versions except `i18next` 26.4.3 → 26.4.4; that is machine variance, so the cross-library
ratios in one run are the figures to read, not a competitor's delta between the two dates.

The exact console output of each run is in `bench-2026-10-14-run1.txt` through `-run5.txt`; the
three 0.5.0 runs are in `bench-2026-10-11-run1.txt` through `-run3.txt`. An earlier version of this
benchmark (2026-10-10) used a `#` message for every library and a "cold" row that created a new
instance per call with ids repeated across rounds; a review found both unfair (unequal work; a
module-level cache in vue-i18n served later rounds; the `intl-messageformat` row paid Intl
initialization per instance). Those rows were replaced by the scenarios above and the pages
re-cited; a third review pass then made the catalog ids restart at a fixed width per library and
added the catalog assertion. On 2026-10-14 the `#` asymmetry that made one row uncitable
disappeared on its own: `@comvi/core` 0.6.0 formats `#` for the locale, so the same-output row is
now one message text on every side and the former "default `#`" row became equal work.

## Where the Comvi figures come from

The Comvi rows reproduce `scripts/size-check.mjs` on the 0.6.0 release tarballs to the byte
(`core-base` 5,608, `core-base-icu` 6,842, `fw-react-default` 7,605, `platform-path-react` 12,157,
`fw-vue-default` 7,712, `fw-next-client-default` 8,209, `fw-next-root-composed` 10,101,
`fw-next-middleware-edge` 2,045, `fw-nuxt-client-default` 8,728, `fw-nuxt-i18n` 9,647,
`fw-nuxt-full-composite` 14,499 on 2026-10-14, Node 24.19.0 on both sides). Run the gate on the
same Node: on Node 26.9.0 it reports every row 7 to 8 bytes smaller, because gzip differs, and the
two would look as if they disagreed. The `baseline` values in `scripts/size-budgets.json` are
recorded per release and are lower than the released figure; public pages should cite the figure
measured on the released version, not the baseline.

## Nuxt: measured with Nuxt's own build

`@nuxtjs/i18n` depends on Nuxt's virtual modules and cannot be bundled by esbuild on its own, so
the two Nuxt modules are compared with `nuxi build` instead. `nuxt/apps/` holds four one-string
apps (`bare`, `nuxt-i18n`, `comvi-nuxt`, `comvi-nuxt-icu`); the first three render `Hello, world!`, the ICU app renders a plural, and in the three i18n apps the messages sit outside the measured JavaScript;
`nuxt/measure.mjs` sums every client JavaScript file under `.output/public/_nuxt/` (minified, gzip
level 9, brotli 11) and reports the delta over the bare app, for the whole build and for the entry
file alone (entry-file bytes exclude the other chunks and anything a browser may prefetch in the
background). The entry chunk is read from Nuxt's client manifest
(`.nuxt/dist/server/client.manifest.mjs`, the record marked `isEntry`) or from a prerendered
`index.html`; when neither is present the entry row says so instead of guessing.
`nuxt/attribute.mjs` attributes minified bytes to packages from a source-mapped build.
`nuxt/REPORT.md` is the full run with every config, command and version.

**Delete `scripts/size-compare/node_modules` before building the Nuxt apps.** The apps sit inside
this directory, so Node resolution walks up into the esbuild harness's own install, and Vite there
bundles a _second_ copy of `vue-i18n` into the `@nuxtjs/i18n` app: 10,350 minified bytes of a
duplicate, all of it charged to the competitor. The 2026-10-14 run hit this, the source-mapped
build named the file five directories up, and every app was rebuilt with the harness install moved
aside. Any app whose source map names a path with four or more `../` segments is contaminated and
the build has to be repeated.

```sh
cd scripts/size-compare && mv node_modules ../size-compare-node_modules-parked
cd nuxt/apps/<app> && pnpm install && pnpm nuxi build
cd ../.. && node measure.mjs apps/bare apps/comvi-nuxt apps/comvi-nuxt-icu apps/nuxt-i18n
cd .. && mv ../size-compare-node_modules-parked node_modules
```

### Results (Nuxt 4.6.1, @nuxtjs/i18n 10.6.0, @comvi/nuxt 0.6.0, 2026-10-14, Node 24.19.0)

| App                                             | JS files |   min B | gzip B | Δ gzip vs bare | entry file gzip | Δ entry vs bare |
| ----------------------------------------------- | -------: | ------: | -----: | -------------: | --------------: | --------------: |
| bare                                            |        4 | 144,943 | 54,453 |              — |          49,167 |               — |
| @nuxtjs/i18n                                    |        5 | 229,147 | 82,572 |        +28,119 |          79,516 |         +30,349 |
| @comvi/nuxt, default compiler                   |        4 | 184,727 | 66,879 |        +12,426 |          63,888 |         +14,721 |
| @comvi/nuxt, `icu: true` (ICU compiler enabled) |        4 | 187,891 | 68,064 |        +13,611 |          65,073 |         +15,906 |

The bare and `@nuxtjs/i18n` apps reproduce their 2026-10-10 minified bytes exactly, 144,943 and
229,147, which is the control that says this build is the same build; their gzip totals differ by
one byte, from the chunk hashes in the manifest. On the Comvi side 0.6.0 adds 160 gzip bytes with
the default compiler and 372 with `icu: true` over 0.5.0.

Per package, minified bytes in the entry chunk (from the source-mapped build of the default-compiler
app): `@nuxtjs/i18n` 21,479 + `@intlify/message-compiler` 16,905 + `@intlify/core-base` 14,966 +
`vue-i18n` 14,589 + `@intlify/shared` 3,363 on one side; `@comvi/core` 16,734 + `@comvi/nuxt` 6,160 +
`@comvi/vue` 5,706 on the other (19,873 for `@comvi/core` in the `icu: true` app). Every
`@nuxtjs/i18n`-side figure is unchanged from 2026-10-10. Both pull the same `cookie-es`, `ohash`
and `klona` for the locale cookie.

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

## `eval` and `new Function`

`scan-eval.mjs` reads every `.js`, `.mjs` and `.cjs` file of each compared package as installed and
reports the ones that contain `eval(` or `new Function(` (whitespace before the parenthesis allowed), the two constructs a Content Security
Policy without `'unsafe-eval'` blocks. Result on 2026-10-14 (`scan-eval-2026-10-14.txt`): **not one
of the thirteen compared packages contains either construct, anywhere**, browser or Node. On
2026-10-11 there was a single match, `@comvi/nuxt/dist/module.mjs`, the Nuxt build-time module that
ran in Node during `nuxi build` and used `new Function` to check that a user-supplied
`resolveAcceptLanguage` function re-parsed before writing it into the generated template. 0.6.0
does that check with `vm.Script`, which parses the source and never executes it, so the match is
gone. This is a fact about Comvi that the pages may state, not a difference from the compared
libraries, whose current builds have none either.

`scan-eval-wider/` applies the same scan to a wider set of i18n libraries that are not on the
compare pages (`scan-eval-wider/package.json` pins what was installed; results in
`scan-eval-wider/results-2026-10-11.txt`, not re-run for 0.6.0 because none of those packages is
Comvi). Where the construct sits in a browser runtime path it
means the app needs `'unsafe-eval'` in its CSP: `vue-i18n` 9 (`@intlify/core-base` 9.14.5
compiles each message with `new Function` at runtime; vue-i18n 10 and 11 do not), `ttag`
(plural rules compiled with `new Function`), `globalize` (message compiler) and
`@messageformat/core` (its compiler). `i18n-js` only carries the usual `Function("return this")`
globalThis shim inside a try/catch. `@nuxtjs/i18n` has one in its Node-side build module, where
`@comvi/nuxt` had one until 0.6.0; `typesafe-i18n` only in its Node importer, exporter and CLI; `@inlang/paraglide-js`
and `jed` only in test files. Tolgee, Lingui, react-intl, intlayer, svelte-i18n and
`@solid-primitives/i18n` have none.
