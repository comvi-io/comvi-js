# Cross-library size and ICU runtime comparison

What the comparison pages on comvi.io cite when they put a Comvi figure next to a figure for
another library. Everything here runs on **published npm packages** (Comvi included, pinned to
0.6.0), with one bundler configuration for every row, so the numbers are comparable with each
other. They are not comparable with figures produced elsewhere with a different bundler, fixture
or gzip level, and a ratio between two minimal fixtures describes those fixtures, not every app.

This directory is a standalone package, deliberately outside the pnpm workspace, so the competitor
packages never enter the monorepo lockfile.

**The size figures are from 2026-10-20, on 0.6.0 as published.** This directory installs every
package from the registry at the version `package.json` pins, `@comvi/*` included, and the three
lockfiles (here, `nuxt/apps/comvi-nuxt` and `nuxt/apps/comvi-nuxt-icu`) are committed. The
2026-10-14 run had measured 0.6.0 before publication, from release tarballs built at `a74da136`;
two changes landed after it (comvi-js #94 and #95). On the published packages ten Comvi rows moved
by −3 to +4 gzip bytes and three more changed only in minified bytes. No row of another library
moved.

**The runtime figures are still the 2026-10-14 run**, the median of eight, on that pre-publish
build. Comvi's runtime code changed after it only by a `try`/`finally` around one plural branch
(#95), which the core's A/B perf gate measured as no change. A 2026-10-20 re-run on the same
machine and Node 24.20.0 is kept as `bench-2026-10-20-run*.txt` and **cited nowhere**. It
recorded 18 to 24 % lower throughput for `vue-i18n` in its four warm scenarios and 5.5 % lower in
the catalog one, with the same resolved `vue-i18n` and `@intlify/*` 11.4.14, while the other cited
rows ranged from 0.5 % faster to 6.1 % slower. Both runs pass `bench-table.mjs`. Until that
difference is explained, the pages keep the 2026-10-14 runtime figures.

Deleting a lockfile loses a pinned transitive resolution, which matters for reproducing a
measurement, so note where that record actually lives: `package.json` pins every competitor to an
exact version, and `results-<date>.json` records the resolved version of every package that
landed in every measured bundle. The figures can be traced without the lockfile; the lockfile only
makes re-installing faster.

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

**The Node version is part of the measurement, and every result file names it.** esbuild emits the
same minified bytes on any Node, but zlib does not gzip them to the same size on every Node major.
Measured on these 27 rows on 2026-10-14, with the minified bytes identical on every one of them,
Node 26.9.0 against Node 24.20.0 runs from **118 B smaller to 8 B larger**, 25 rows smaller and 2
larger, at most 0.71 % of the row. The direction is not uniform and the size is not negligible, so
a figure is comparable only with another taken on the same Node major, and **every run here is made
on Node 24**, the major CI uses. Within that major the minor does not matter: 24.19.0 and 24.20.0
produce byte-identical output on all 27 rows, also checked on 2026-10-14, so the 2026-10-11
artifacts stay directly comparable with these. The artifacts of 2026-10-14 were taken on
**24.20.0**; those of 2026-10-11 on 24.19.0.

`results-2026-10-14-node26.json` and `-node26.md` are that same run on Node 26.9.0, kept as the
evidence for the paragraph above and for nothing else. **No public page cites a figure from those
two files.** Every number on the comparison pages comes from `results-2026-10-20.json`,
`nuxt/measure-2026-10-20.txt` and `nuxt/attribute-2026-10-20.txt` for sizes and from the
`bench-2026-10-14-run*.txt` files for runtime, all taken on Node 24.20.0.

`pnpm size`, the size gate in the repository root, has to be run on the same Node as this harness
for the two to be compared. Measured on its own 25 rows on 2026-10-14, Node 26.9.0 against Node
24.20.0 runs from 24 B smaller to 9 B larger, 21 rows smaller and 4 larger, so run them on
different Nodes and the gate and the harness look as if they disagreed. The same goes for `pnpm test:commit`, which is
red on Node 26.9.0 (the locale-detector suite's `localStorage` setup) and green on Node 24.

### The competitor control

Before trusting a 0.5.0-to-0.6.0 delta, the competitor rows have to be shown not to have moved for
any other reason. On 2026-10-14, with `i18next` pinned back to the baseline 26.4.3 and everything
else as installed for the 0.6.0 run, **all eleven rows that contain no `@comvi/*` package
reproduced their 2026-10-11 minified and gzip bytes exactly** on Node 24.20.0: `i18next` 14,032,
`i18next` + `i18next-icu` 25,707, the same plural text without the plugin 14,037,
`intl-messageformat` 9,894, `use-intl/core` 11,277, `i18next` + `react-i18next` 19,615,
`use-intl` (react) 11,567, the React ICU loader stack 33,826, `vue-i18n` 18,693 and 13,764, and
`next-intl` (client) 12,512. That also proves the `react` 19.1.0 → 19.3.0 and `vue`
3.5.43 → 3.5.44 bumps change nothing, as expected of a package marked external. The only competitor
figure that moves between the two dates is `i18next`, from 26.4.3 to 26.4.4.

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
  gives a slightly different number (1,236 B instead of 1,223 B for Comvi); the pages cite the
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
median reported. The 2026-10-14 figures are the median of eight runs. Scenarios:

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

### What these runtime numbers are, and when one may be cited

**The machine is a desktop under normal use, not an idle benchmark host.** An Apple M1 Max running
a browser, a container runtime and whatever else the day involves; its one-minute load average sits
around 5 to 8 and waiting for it to go idle is not something that happens. Two consequences, and
both belong on the label rather than in a footnote:

- **The comparison is within-run; the absolute rates are specific to this machine.** Every library
  in a cited comparison is measured inside the same invocation of `bench.mjs`, seconds apart, so a
  load disturbance moves both sides of a comparison together and the ratio survives it. Read
  "Comvi's compiler formats this plural N times faster than i18next-icu does"; do not read the
  absolute million-calls-a-second figure as what your server will do.
- **A run disturbed unevenly is thrown away, not published.** That is what the spread check below
  is for, and it is the real guarantee here, stronger than a quiet-machine claim nobody else could
  reproduce.

`bench-table.mjs` enforces the following rather than leaving it to whoever runs the harness.

- **A sane run, or no table.** Every run prints its one-, five- and fifteen-minute load average in
  its first line and again at its last, together with its Node version and `NODE_ENV`. A run is
  refused outright if its header is missing, if it did not finish, if it was not a production run,
  or if its one-minute load average was 9 or more at the start. That threshold rejects a
  pathological run, not a busy one, and busy is the normal state of this machine.
- **A real window on every cited row, or no table.** No cited sample may be shorter than 450 ms.
- **Precision matched to the measurement.** A cited figure is the median of every run passed, at
  two significant figures. The run-to-run range of a cited row is 2.1 % to 9.9 %, so at two
  significant figures the variation sits at or below the last printed digit; a third digit would
  be claiming precision that is not there. The full range of each row is printed beside it.
- **The spread is reported, not enforced.** An earlier version of this script refused to emit a
  table unless three consecutive runs agreed within 3 % on all eighteen cited rows. That is a
  conjunction over eighteen rows against a per-row floor of up to 10 %, so it failed almost surely
  however good the measurement was: six triples failed in a row on rotating offenders, which is
  the signature of a noise floor rather than of a broken row. Printing fewer digits is the correct
  response to noise; refusing to print is not.

**Why the window is 500 ms, and not whatever a round happens to take.** The first 0.6.0 attempt at
this table used one fixed count of 200,000 calls for every library and one instance of 5,000
messages for every catalog row. That made a sample last anywhere from 3 ms to 1,200 ms depending on
the library, and the short samples would not hold still: run to run, the catalog row for
`intl-messageformat` moved 25 % on a 52 ms sample and the one for `i18next` + `i18next-icu` moved
24 % on a 136 ms sample, while every sample over 500 ms stayed inside 2 %. A sample of a few tens
of milliseconds cannot average out one scheduler slice handed to something else on the machine, and
taking more runs does not fix that, it only decides the question by luck. So the per-sample work
was raised, per library, until no single scheduler slice could move a row.

Which rows that made fragile is the opposite of what one might guess, and it is worth recording.
Comvi's warm rows were the steadiest in the set all along, fast enough that seven rounds average
cleanly. The **catalog** rows were the fragile ones on every side, Comvi's and the competitors'
alike, purely because each sample was short.

### Why the harness checks what it checks

Each guard here exists because something passed without it. They are written down because the
next person to touch this file will otherwise relax them, and all four share one shape: a
measurement that looked fine because nothing failed.

**The id width is derived, not chosen.** A catalog id is part of the message text, and the message
text is what the compiler caches on, so every id has to be the same number of characters, or the
later messages of a run parse longer text than the earlier ones and a library that needs more
blocks parses longer text than one that needs fewer. The ids were padded to six digits, which was
right while a sample was one block of 5,000 and silently stops padding at 1,000,000. Scaling to a
500 ms sample costs millions of ids per library, so the first version of that change crossed the
line and nothing failed; the numbers would simply have been quietly unfair, in Comvi's favour on
the rows where Comvi needs the most blocks. The width now comes from the block ceiling and is
checked there: 204,805,000 ids, first and last the same length.

**Stability is measured on throughput, not on elapsed time.** While every library ran a fixed
200,000 calls, elapsed time was the measurement and comparing it run to run was right. Once the
sample size is calibrated per run, a run that chose a larger count simply takes longer, so two
runs agreeing on throughput to 1 % can differ by 80 % in milliseconds. Scored that way the runs
looked hopeless, worst spread 97 %; scored on `n / ms` the same runs came out at 8 %. The rate
column cannot be used either, being rounded to two decimals, which is 6 % of a figure like
0.17 M ops/s. Only full-precision throughput is invariant to both.

**The window is checked against the timed median, not the calibration.** Calibration stops at the
first pass that reaches the target, so a pass slowed by something else on the machine settles on a
count that is too small, and the timed rounds then come in under the window on a quieter moment.
That is what put the `i18next` static-key row at 352 ms against a 450 ms floor, and it is what
both failures in the best triple traced back to. The count is now raised until the reported median
really spans the window.

**A guard is only as strict as the claim it protects.** The stability requirement first covered
every row in the table, including every `intl-messageformat` row and the equal-work and
small-count scenarios, none of which any page prints a figure for. That did not make the published
numbers safer; it blocked work on rows nothing rested on. The requirement now covers the eighteen
rows the pages actually cite, listed in `bench-table.mjs` as `CITED` and keyed by scenario as well
as by library, because the same library is cited in one scenario and reference-only in another.

### What one sample consists of

Each line of a run file ends with the count that line measured, as `n=`, so the exact figure behind
every number is in the artifact. The counts are chosen by the harness, not written down here: a
library gets as many calls as it needs to fill the window, and the work per call is identical on
every side of a comparison.

`node bench-table.mjs bench-<date>-run1.txt bench-<date>-run2.txt bench-<date>-run3.txt` prints
the table below on stdout and the per-row spread on stderr, and exits non-zero if any condition
fails. No median in this file is typed by hand.

Micro-benchmarks of a formatter that takes under a microsecond per call do not decide a UI; a
page formats hundreds of strings, not millions, and on the client the difference is invisible. Where
it shows is server-side rendering and edge functions, which pay the per-call cost on every request
for every string on the page, and cold starts that create an instance and parse a catalog per
request or per isolate, which is the catalog row.

## Results

### Size, min+gz bytes, measured 2026-10-20 on Comvi 0.6.0 from npm

Node v24.20.0, esbuild 0.28.0. The full table with the packages inside each bundle is in
`results-2026-10-20.md`; the raw data in `results-2026-10-20.json`. The pre-publish run of
2026-10-14 and the 0.5.0 run of 2026-10-11 are kept beside it under their own dates.

| Group                                                                                                                           |                            Comvi |                                                                        Other | Ratio |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------: | ---------------------------------------------------------------------------: | ----: |
| core, interpolation only on the Comvi side                                                                                      |              `@comvi/core` 5,607 |                                                             `i18next` 14,070 |  2.5× |
| core+icu                                                                                                                        |        `@comvi/core` + ICU 6,843 |                                             `i18next` + `i18next-icu` 25,749 |  3.8× |
| core+icu                                                                                                                        |                            6,843 |                                                       `use-intl/core` 11,277 |  1.6× |
| what ICU adds, same message text on both sides                                                                                  |           +1,223 (6,843 − 5,620) | `i18next-icu` + `intl-messageformat` on `i18next`: +11,674 (25,749 − 14,075) |  9.5× |
| the ICU engine alone, no ratio                                                                                                  |                                — |                                   `intl-messageformat` with its parser 9,894 |     — |
| react, without the ICU compiler on the Comvi side and without `i18next-icu` on the other (i18next keeps its suffix-key plurals) |             `@comvi/react` 7,606 |                                           `i18next` + `react-i18next` 19,660 |  2.6× |
| react, ICU on both sides                                                                                                        |       `@comvi/react` + ICU 8,808 |                                                            `use-intl` 11,567 |  1.3× |
| react+icu+loader                                                                                                                |                           12,157 |                      `i18next` + `react-i18next` + ICU + http-backend 33,865 |  2.8× |
| vue, plural engine on both sides                                                                                                |         `@comvi/vue` + ICU 8,935 |                                      `vue-i18n` runtime compiler kept 18,693 |  2.1× |
| vue, plural engine on both sides                                                                                                |                            8,935 |             `vue-i18n` precompiled message function, compiler dropped 13,764 |  1.5× |
| vue, Comvi without ICU, for reference                                                                                           |               `@comvi/vue` 7,709 |                                                                            — |     — |
| next-client, ICU on both sides                                                                                                  | `@comvi/next/client` + ICU 9,427 |                                                    `next-intl` client 12,512 |  1.3× |
| next-client, Comvi without ICU, for reference                                                                                   |       `@comvi/next/client` 8,209 |                                                                            — |     — |

What moved between 0.5.0 and 0.6.0: every Comvi row with the ICU compiler grew by 320 to 338 bytes
and every row without it by 153 to 181, which is `#` being formatted for the locale plus the editor
loader `devtools()` installs. `@comvi/next` root composed went **down** 50 bytes, because
`createNextI18n` no longer composes discovery. On the other side only `i18next` moved, from 26.4.3
to 26.4.4; `intl-messageformat`, `use-intl`, `next-intl` and `vue-i18n` reproduced their 2026-10-11
bytes exactly, which is the control that says the toolchain did not drift.

### Comvi-only rows that the pages cite, 0.6.0, min+gz bytes

The same fixtures and externals as the size gate, bundled from the published packages with the
configuration above:

| Row                                                        |  Bytes |
| ---------------------------------------------------------- | -----: |
| `@comvi/next` root composed (fw-next-root-composed)        | 10,105 |
| `@comvi/next/server` provider (fw-next-server-provider)    |  1,980 |
| `@comvi/next/middleware` (fw-next-middleware-edge)         |  2,045 |
| `@comvi/nuxt` client runtime (fw-nuxt-client-default)      |  8,729 |
| `@comvi/nuxt/i18n` entry, nothing external (fw-nuxt-i18n)  |  9,646 |
| `@comvi/nuxt` everything composed (fw-nuxt-full-composite) | 14,499 |

Five of the six match `scripts/size-check.mjs` on the same code to the byte, Node 24.20.0 on both
sides. The server-provider row is 1,980 B here and 2,052 B in the gate: the gate resolves
`@comvi/*` imports through its own exports-map plugin, this harness lets esbuild resolve the
installed tarballs, and the two walk the `*/client/ComviClientProvider.js` external slightly
differently. The pages cite the harness figure, because the page states this harness as its method;
both numbers are recorded here. The two Nuxt entries that compose `devtools()` carry the editor
loader, which is why `fw-nuxt-i18n` grew 1,121 bytes over 0.5.0 and `fw-nuxt-full-composite` 1,138,
while `fw-nuxt-client-default`, which does not compose it, grew 166.

### ICU runtime, 2026-10-14, the median of eight runs, on 0.6.0 before publication (`a74da136`)

Apple M1 Max, darwin arm64, Node v24.20.0, `NODE_ENV=production`, one-minute load average at the
start of each run 3.09, 4.35, 4.42, 4.51, 5.09, 3.95, 3.86, 4.50. Warm rows in million calls per
second, catalog rows in thousand messages per second. Higher is better in every row. Bold is a row
a comparison page prints a figure for; the rest are reference. `intl-messageformat` is not an i18n
library, it is the ICU engine inside `i18next-icu`, `use-intl` and `next-intl`, kept as the
reference for what the formatting step alone costs, and no page cites it.

**Every cited figure is the median of the eight runs, rounded to two significant figures**, which
is the precision this measurement supports: the run-to-run range of a cited row is 2.1 % to 9.9 %,
and at two significant figures that variation sits at or below the last printed digit. The fourth
column is the full range across the eight runs, so the rounding hides nothing. Both tables below
come from `node bench-table.mjs bench-2026-10-14-run*.txt`; no figure in them is typed by hand.

| Scenario                         | Library                                                            | Median of 8 runs | Range over the 8 |
| -------------------------------- | ------------------------------------------------------------------ | ---------------: | ---------------: |
| warm, static key                 | `@comvi/core`, simple compiler                                     |       **59 M/s** |      57.50-59.36 |
| warm, static key                 | `@comvi/core` + `icuCompiler`                                      |       **44 M/s** |      42.43-46.49 |
| warm, static key                 | reference, not a library: `intl-messageformat` instance reused     |           51 M/s |      48.86-51.19 |
| warm, static key                 | `i18next`, no plugins                                              |     **0.60 M/s** |        0.59-0.62 |
| warm, static key                 | `use-intl/core` translator                                         |      **7.3 M/s** |        7.28-7.44 |
| warm, static key                 | `vue-i18n`                                                         |     **0.36 M/s** |        0.33-0.36 |
| warm, one parameter              | `@comvi/core`, simple compiler                                     |       **16 M/s** |      14.86-16.48 |
| warm, one parameter              | `@comvi/core` + `icuCompiler`                                      |       **15 M/s** |      13.80-14.97 |
| warm, one parameter              | reference, not a library: `intl-messageformat` instance reused     |          5.8 M/s |        5.20-5.79 |
| warm, one parameter              | `i18next`, no plugins, `{{name}}`                                  |     **0.49 M/s** |        0.47-0.50 |
| warm, one parameter              | `use-intl/core` translator                                         |     **0.34 M/s** |        0.33-0.34 |
| warm, one parameter              | `vue-i18n`, `{name}`                                               |     **0.32 M/s** |        0.30-0.33 |
| warm, same output                | `@comvi/core` + `icuCompiler`, `#`                                 |      **1.4 M/s** |        1.33-1.39 |
| warm, same output                | `@comvi/core` + `icuCompiler`, `formatNumber()` into `{n}`         |          1.2 M/s |        1.13-1.19 |
| warm, same output                | `intl-messageformat`, instance reused, `#`                         |         0.61 M/s |        0.59-0.62 |
| warm, same output                | `i18next` + `i18next-icu`, `#`                                     |     **0.25 M/s** |        0.24-0.25 |
| warm, same output                | `use-intl/core` translator, `#`                                    |     **0.22 M/s** |        0.21-0.22 |
| warm, same output                | `vue-i18n`, pipe plural, `n(x, "decimal")` into `{n}`              |     **0.20 M/s** |        0.19-0.20 |
| warm, equal work (pre-formatted) | `@comvi/core` + `icuCompiler`                                      |          2.3 M/s |        2.24-2.34 |
| warm, equal work (pre-formatted) | reference, not a library: `intl-messageformat` instance reused     |         0.95 M/s |        0.94-0.97 |
| warm, equal work (pre-formatted) | `i18next` + `i18next-icu`                                          |         0.30 M/s |        0.29-0.31 |
| warm, equal work (pre-formatted) | `use-intl/core` translator                                         |         0.25 M/s |        0.24-0.25 |
| warm, equal work (pre-formatted) | `vue-i18n`, pipe plural                                            |         0.28 M/s |        0.26-0.28 |
| warm, small count (`#`, 0..3)    | `@comvi/core` + `icuCompiler`, `#`                                 |          2.2 M/s |        2.19-2.25 |
| warm, small count (`#`, 0..3)    | `intl-messageformat`, instance reused, `#`                         |         0.63 M/s |        0.62-0.64 |
| catalog                          | `@comvi/core` + `icuCompiler`                                      | **350 K msgs/s** |      340.3-361.1 |
| catalog                          | `intl-messageformat`, new instance per message, shared formatters  |      99 K msgs/s |       94.3-106.9 |
| catalog                          | `intl-messageformat`, new instance per message, default formatters |      50 K msgs/s |        46.3-50.9 |
| catalog                          | `i18next` + `i18next-icu`, one instance                            |  **38 K msgs/s** |        37.3-38.6 |
| catalog                          | `use-intl/core`, one translator                                    |  **57 K msgs/s** |        55.8-58.5 |
| catalog                          | `vue-i18n`, one instance, pipe plural                              |  **44 K msgs/s** |        43.0-44.9 |

| Scenario                         | One sample, per library                                                                                |      Window |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------: |
| warm, static key                 | 200 k calls (`vue-i18n`) to 22.8 M-44.9 M (`@comvi/core` + `icuCompiler`)                              | 508-1028 ms |
| warm, one parameter              | 200 k calls (`use-intl/core` translator) to 13.9 M-15.1 M (`@comvi/core`, simple compiler)             |  519-941 ms |
| warm, same output                | 200 k calls (`i18next` + `i18next-icu`, `#`) to 725 k-1.2 M (`@comvi/core` + `icuCompiler`, `#`)       | 538-1074 ms |
| warm, equal work (pre-formatted) | 200 k calls (`i18next` + `i18next-icu`) to 1.2 M (`@comvi/core` + `icuCompiler`)                       |  510-848 ms |
| warm, small count (`#`, 0..3)    | 400 k calls (`intl-messageformat`, instance reused, `#`) to 1.2 M (`@comvi/core` + `icuCompiler`, `#`) |  536-648 ms |
| catalog                          | 20 k messages (`i18next` + `i18next-icu`, one instance) to 180 k-320 k (`@comvi/core` + `icuCompiler`) |  505-930 ms |

Run-to-run spread of each cited row, worst first, as a fraction of its median:

```
    9.9 %  warm, one parameter / `@comvi/core`, simple compiler   14.86-16.48
    9.2 %  warm, static key / `@comvi/core` + `icuCompiler`   42.43-46.49
    9.0 %  warm, same output / `vue-i18n`, pipe plural, `n(x, "decimal")` into `{n}`   0.19-0.20
    8.3 %  warm, static key / `vue-i18n`   0.33-0.36
    7.9 %  warm, one parameter / `vue-i18n`, `{name}`   0.30-0.33
    7.9 %  warm, one parameter / `@comvi/core` + `icuCompiler`   13.80-14.97
    6.0 %  catalog / `@comvi/core` + `icuCompiler`   340.3-361.1
    5.7 %  warm, one parameter / `i18next`, no plugins, `{{name}}`   0.47-0.50
    5.1 %  warm, one parameter / `use-intl/core` translator   0.33-0.34
    4.9 %  catalog / `use-intl/core`, one translator   55.8-58.5
    4.8 %  warm, static key / `i18next`, no plugins   0.59-0.62
    4.7 %  warm, same output / `@comvi/core` + `icuCompiler`, `#`   1.33-1.39
    4.3 %  catalog / `vue-i18n`, one instance, pipe plural   43.0-44.9
    4.1 %  warm, same output / `i18next` + `i18next-icu`, `#`   0.24-0.25
    3.4 %  catalog / `i18next` + `i18next-icu`, one instance   37.3-38.6
    3.2 %  warm, static key / `@comvi/core`, simple compiler   57.50-59.36
    2.9 %  warm, same output / `use-intl/core` translator, `#`   0.21-0.22
    2.1 %  warm, static key / `use-intl/core` translator   7.28-7.44
```

The exact console output of each run is in `bench-2026-10-14-run1.txt` through `-run8.txt`, each
with its Node version, its load average and its per-row sample size; the three 0.5.0 runs are in
`bench-2026-10-11-run1.txt` through `-run3.txt`, taken with a fixed sample size and so not
comparable row for row with these. An earlier version of this
benchmark (2026-10-10) used a `#` message for every library and a "cold" row that created a new
instance per call with ids repeated across rounds; a review found both unfair (unequal work; a
module-level cache in vue-i18n served later rounds; the `intl-messageformat` row paid Intl
initialization per instance). Those rows were replaced by the scenarios above and the pages
re-cited; a third review pass then made the catalog ids restart at a fixed width per library and
added the catalog assertion. On 2026-10-14 the `#` asymmetry that made one row uncitable
disappeared on its own: `@comvi/core` 0.6.0 formats `#` for the locale, so the same-output row is
now one message text on every side and the former "default `#`" row became equal work.

## Where the Comvi figures come from

The Comvi rows reproduce `scripts/size-check.mjs` on the published 0.6.0 packages to the byte
(`core-base` 5,607, `core-base-icu` 6,843, `fw-react-default` 7,606, `platform-path-react` 12,157,
`fw-vue-default` 7,709, `fw-next-client-default` 8,209, `fw-next-root-composed` 10,105,
`fw-next-middleware-edge` 2,045, `fw-nuxt-client-default` 8,729, `fw-nuxt-i18n` 9,646,
`fw-nuxt-full-composite` 14,499 on 2026-10-20, 0.6.0 from npm, Node 24.20.0 on both sides). Run the gate on the
same Node: on Node 26.9.0 its 25 rows run from 24 B smaller to 9 B larger, because gzip differs,
and the two would look as if they disagreed. The `baseline` values in `scripts/size-budgets.json` record
the size gate's own measurement of the released bytes; the rows above match the harness except
`fw-next-server-provider` (2,052 in the gate, 1,980 here), whose external imports the two resolvers
walk differently. Public pages cite the harness figure, the method they state.

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

### Results (Nuxt 4.6.1, @nuxtjs/i18n 10.6.0, @comvi/nuxt 0.6.0 from npm, 2026-10-20, Node 24.20.0)

| App                                             | JS files |   min B | gzip B | Δ gzip vs bare | entry file gzip | Δ entry vs bare |
| ----------------------------------------------- | -------: | ------: | -----: | -------------: | --------------: | --------------: |
| bare                                            |        4 | 144,943 | 54,453 |              — |          49,165 |               — |
| @nuxtjs/i18n                                    |        5 | 229,147 | 82,572 |        +28,119 |          79,516 |         +30,351 |
| @comvi/nuxt, default compiler                   |        4 | 184,796 | 66,882 |        +12,429 |          63,890 |         +14,725 |
| @comvi/nuxt, `icu: true` (ICU compiler enabled) |        4 | 187,965 | 68,071 |        +13,618 |          65,079 |         +15,914 |

The bare and `@nuxtjs/i18n` apps reproduce their 2026-10-10 minified bytes exactly, 144,943 and
229,147, which is the control that says this build is the same build; their gzip totals differ by
a few bytes, from the chunk hashes in the manifest. On the Comvi side 0.6.0 adds 163 gzip bytes with
the default compiler and 379 with `icu: true` over 0.5.0.

Per package, minified bytes in the entry chunk (from the source-mapped build of the default-compiler
app): `@nuxtjs/i18n` 21,479 + `@intlify/message-compiler` 16,905 + `@intlify/core-base` 14,966 +
`vue-i18n` 14,589 + `@intlify/shared` 3,363 on one side; `@comvi/core` 16,734 + `@comvi/nuxt` 6,127 +
`@comvi/vue` 5,706 on the other (19,878 for `@comvi/core` in the `icu: true` app); in the Comvi apps
3,568 bytes no longer map to a source file, against none on 2026-10-14. Every
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
