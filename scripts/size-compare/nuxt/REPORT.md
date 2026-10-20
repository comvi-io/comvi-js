# Nuxt client-bundle cost: @nuxtjs/i18n vs @comvi/nuxt (real `nuxi build`)

> **Sizes superseded on 2026-10-20.** This report is the 2026-10-14 run, on 0.6.0 release tarballs built before publication. The same four apps were rebuilt on 2026-10-20 against 0.6.0 from npm with the commands below; the cited figures are now `measure-2026-10-20.txt` and `attribute-2026-10-20.txt`, and the README's Nuxt section quotes them.

Date: **2026-10-14, all four apps, on Comvi 0.6.0** (first run 2026-10-10 for three apps and
2026-10-11 for `comvi-nuxt-icu`, both on 0.5.0). Minimal Nuxt 4 apps, identical except for the i18n layer, built with
`nuxi build` (production). Every `.js` under `.output/public/_nuxt/` was measured (recursively;
`builds/meta/*.json` is not JS). gzip = node `zlib.gzipSync` level 9 per file, summed.
brotli = `zlib.brotliCompressSync` quality 11 per file, summed. **Node 24.20.0** for the builds and
the measurement, Node 24 being the major CI uses and the major of the earlier runs; Node 26 gzips
the same bytes to a different size, so a figure taken there is not comparable with one taken here.
24.19.0 and 24.20.0 produce byte-identical output, checked on 2026-10-14. `measure.mjs` prints the
Node version and the load average in its first line.

The 0.6.0 run measured the release tarballs built from `a74da136` before they were published, via
pnpm `overrides` pointing at `file:` paths; the app manifests name `0.6.0`, the form to install from
the registry once the release is out. The run is to be repeated against npm after the release.

## 1. Results

### All client JS

| app            | JS files | min bytes | gzip-9 bytes | brotli-11 bytes | Δ min vs base | Δ gzip vs base | Δ brotli vs base |
| -------------- | -------- | --------- | ------------ | --------------- | ------------- | -------------- | ---------------- |
| bare           | 4        | 144943    | 54453        | 48953           | +0            | +0             | +0               |
| nuxt-i18n      | 5        | 229147    | 82572        | 73113           | +84204        | +28119         | +24160           |
| comvi-nuxt     | 4        | 184727    | 66879        | 59708           | +39784        | +12426         | +10755           |
| comvi-nuxt-icu | 4        | 187891    | 68064        | 60847           | +42948        | +13611         | +11894           |

The bare and `nuxt-i18n` apps reproduce their 2026-10-10 minified totals to the byte, 144943 and
229147, so the Nuxt toolchain did not drift between the runs; their gzip and brotli totals move by
one byte and by 70 because the chunk hashes in the build differ. On the Comvi side 0.5.0 → 0.6.0 is
+160 gzip bytes with the default compiler (66719 → 66879) and +372 with `icu: true`
(67692 → 68064).

### Entry-file bytes only; excludes other chunks and prefetch

The entry chunk is the one `<script type="module" src>` + `modulepreload` in the server-rendered HTML.
The other chunks are `rel="prefetch"` (error-404, error-500, a tiny `__vccOpts` helper and, for
nuxt-i18n, the 45-byte `i18n.config` chunk). A browser may fetch prefetched resources in the
background, so this table is "entry-file bytes, excluding other chunks and background prefetch",
not "everything a page view downloads"; the totals table above is the whole build.

| app            | entry chunk | min    | gzip-9 | brotli-11 | Δ min vs base | Δ gzip vs base | Δ brotli vs base |
| -------------- | ----------- | ------ | ------ | --------- | ------------- | -------------- | ---------------- |
| bare           | C-8B2RTK.js | 132192 | 49167  | 44299     | +0            | +0             | +0               |
| nuxt-i18n      | Dwd1TLcO.js | 222313 | 79516  | 70544     | +90121        | +30349         | +26245           |
| comvi-nuxt     | C1isYjhQ.js | 177938 | 63888  | 57187     | +45746        | +14721         | +12888           |
| comvi-nuxt-icu | C7QfuNT8.js | 181102 | 65073  | 58326     | +48910        | +15906         | +14027           |

The entry-chunk delta is larger than the total delta because in both i18n apps the error-404
prefetch chunk shrank from 9 981 B to 4 029 B min: both i18n plugins pull NuxtLink/router helpers
into the entry chunk, so error-404 no longer carries its own copy. Quote either number, but say which.

### Comvi with the ICU compiler composed

The `comvi-nuxt` app runs core's default compiler. `apps/comvi-nuxt-icu` is the same app with
`comvi.icu: true` and a plural message (`{count, plural, one {# item} other {# items}} for {name}`),
built and measured the same way (`measure-2026-10-14.txt`); its server rendered
`2 items for world` and the catalog is in the HTML payload, as before. From 0.6.0 that `#` is
formatted for the locale; the count is 2, so the rendered string is the same.

| App                           | JS files | min bytes | gzip-9 bytes | brotli-11 bytes | Δ gzip vs bare | entry chunk gzip | Δ entry vs bare |
| ----------------------------- | -------- | --------- | ------------ | --------------- | -------------- | ---------------- | --------------- |
| comvi-nuxt (default compiler) | 4        | 184 727   | 66 879       | 59 708          | +12 426        | 63 888           | +14 721         |
| comvi-nuxt-icu (`icu: true`)  | 4        | 187 891   | 68 064       | 60 847          | +13 611        | 65 073           | +15 906         |
| nuxt-i18n                     | 5        | 229 147   | 82 572       | 73 113          | +28 119        | 79 516           | +30 349         |

The ICU compiler costs 1 185 B gzip in this build (3 164 B minified), up from 973 B on 0.5.0
because `#` is now formatted for the locale. This is a comparison of
configurations, not of equal work: the nuxt-i18n app formats `Hello, {name}!` and this app formats
a plural, so the two rows do not perform the same message-formatting work. What they share is a
runtime able to do it (vue-i18n always carries its message compiler and plural rules). The messages
sit outside the measured JavaScript in both apps; the 1 185 B is the observed increment of this
configuration (`icu: true` plus the plural call site). A reader who wants identical rendered output
should give the nuxt-i18n app a pipe-plural message and rebuild.

### Per-chunk listing with string attribution

#### bare — chunks (largest first)

| file        | min    | gzip-9 | brotli-11 | markers |
| ----------- | ------ | ------ | --------- | ------- |
| C-8B2RTK.js | 132192 | 49167  | 44299     | —       |
| CS05VzLg.js | 9981   | 4004   | 3563      | —       |
| cDayVJAM.js | 2686   | 1183   | 1003      | —       |
| BDNMzG2s.js | 84     | 99     | 88        | —       |

#### nuxt-i18n — chunks (largest first)

| file        | min    | gzip-9 | brotli-11 | markers           |
| ----------- | ------ | ------ | --------- | ----------------- |
| Dwd1TLcO.js | 222313 | 79516  | 70544     | intlify, vue-i18n |
| C9kFx0sp.js | 4029   | 1714   | 1434      | —                 |
| C4dHYqXI.js | 2676   | 1178   | 998       | —                 |
| BDNMzG2s.js | 84     | 99     | 88        | —                 |
| CNnXW_bn.js | 45     | 65     | 49        | —                 |

#### comvi-nuxt — chunks (largest first)

| file        | min    | gzip-9 | brotli-11 | markers |
| ----------- | ------ | ------ | --------- | ------- |
| C1isYjhQ.js | 177938 | 63888  | 57187     | comvi   |
| Djq9hwur.js | 4029   | 1714   | 1434      | —       |
| 775LOUQa.js | 2676   | 1178   | 999       | —       |
| BDNMzG2s.js | 84     | 99     | 88        | —       |

#### comvi-nuxt-icu — chunks (largest first)

| file        | min    | gzip-9 | brotli-11 | markers |
| ----------- | ------ | ------ | --------- | ------- |
| C7QfuNT8.js | 181102 | 65073  | 58326     | comvi   |
| Djq9hwur.js | 4029   | 1714   | 1434      | —       |
| 775LOUQa.js | 2676   | 1178   | 999       | —       |
| BDNMzG2s.js | 84     | 99     | 88        | —       |

### Per-package attribution (min bytes, sourcemap-based)

A second build of each app with `sourcemap: { client: true, server: false }` (directories `sm-*`)
was analysed with `attribute.mjs`, which walks the Vite sourcemap mappings and credits every
generated byte to the source package. The sourcemap builds differ from the plain ones only by the
`//# sourceMappingURL` comment (+111 B bare, +148 B nuxt-i18n, +111 B for each Comvi app). Only
i18n-related rows are shown. The framework packages are the same code in all four apps but not
byte-identical after minification: `@vue/runtime-core` is 47,330 B in bare and 47,467 B in
nuxt-i18n, and `@vue/reactivity` differs by a similar few hundred bytes, because chunk-level
minification and the extra Nuxt runtime each app pulls in shift the shared code slightly. Those
differences are inside the headline deltas; this table lists only the i18n packages.

| package                                                 | nuxt-i18n  | comvi-nuxt | comvi-nuxt-icu |
| ------------------------------------------------------- | ---------- | ---------- | -------------- |
| @nuxtjs/i18n                                            | 21 479     | —          | —              |
| @intlify/message-compiler                               | 16 905     | —          | —              |
| @intlify/core-base                                      | 14 966     | —          | —              |
| vue-i18n                                                | 14 589     | —          | —              |
| @intlify/shared                                         | 3 363      | —          | —              |
| @comvi/core                                             | —          | 16 734     | 19 873         |
| @comvi/nuxt                                             | —          | 6 160      | 6 160          |
| @comvi/vue                                              | —          | 5 706      | 5 706          |
| cookie-es                                               | 3 482      | 3 478      | 3 478          |
| ohash                                                   | 3 158      | 3 158      | 3 158          |
| klona                                                   | 891        | 891        | 891            |
| defu                                                    | 629        | —          | —              |
| extra `nuxt` runtime pulled in (useCookie, NuxtLink, …) | +3 256     | +2 756     | +2 756         |
| **total build delta over bare (all chunks)**            | **84 204** | **39 784** | **42 948**     |

Every `nuxt-i18n` figure is unchanged from 2026-10-10. `@comvi/core` grew 472 B minified with the
default compiler; the ICU app's 19 873 B is the same package with `icuCompiler` composed.

The last row is the whole-build delta from the totals table, not the sum of the listed rows: the
listed rows add to 82,718 B (nuxt-i18n) and 38,883 B (comvi-nuxt); the remaining 1,486 B and
901 B are packages under the 300 B display threshold, the shifted framework bytes described
above, and chunk boilerplate.

Full per-package tables (all packages ≥ 300 B) for all four apps are in `attribute-2026-10-14.txt`;
the three 0.5.0 apps of 2026-10-10 are in `attribute-2026-10-10.txt`.

### The harness install contaminates the @nuxtjs/i18n build

The apps live under `scripts/size-compare/nuxt/apps/`, so Node resolution walks up into
`scripts/size-compare/node_modules`, the esbuild harness's own install, which has its own copy of
`vue-i18n`. With that install present, Vite bundles **two** copies of `vue-i18n` into the
`nuxt-i18n` app: 24 939 B attributed to `vue-i18n` instead of 14 589, and a build total of
239 509 B instead of 229 147. All 10 350 extra bytes are charged to the competitor, so the error
flatters Comvi and must never reach a page.

It was caught on 2026-10-14 by the source-mapped build, whose map named
`../../../../../node_modules/.pnpm/vue-i18n@11.4.14_vue@3.5.44/...` — five directories up, and a
`vue` peer suffix no app here uses. Every app was rebuilt with the harness install moved aside and
every map re-checked; the Comvi apps had never been affected. **Check for it on every run:** any
source in a client sourcemap whose path has four or more `../` segments is a leak from outside the
app.

### SSR verification

Each `.output/server/index.mjs` was started with `PORT=3451` (bare), `3452` (nuxt-i18n), `3453`
(comvi-nuxt), `3454` (comvi-nuxt-icu). `curl http://localhost:<port>/` returned
`<p>Hello, world!</p>` for the first three and `<p>2 items for world</p>` for the ICU app. The
`nuxt-i18n` catalog route still returns the 36-byte `{"en":{"greeting":"Hello, {name}!"}}`, and the
Comvi app's HTML still carries `__comvi_messages__` in its payload. HTML of `/`: 2 157 B
(nuxt-i18n), 1 711 B (comvi-nuxt), 1 799 B (comvi-nuxt-icu).
Each server was stopped by its own PID (taken from `$!`, checked with `ps -p`); `ps` showed no
leftover `.output/server/index.mjs` processes afterwards.

## 2. Versions (from installed package.json files)

- Node 24.20.0, pnpm 12.4.2 (the 0.5.0 run used Node 24.19.0 and pnpm 10.33.2; the resolved tree is
  identical, the lockfiles did not change, and the two Node minors produce identical bytes)
- nuxt 4.6.1, vue 3.5.43, vue-router 5.4.0, vite 8.3.4, nitropack 2.13.4
- @nuxtjs/i18n 10.6.0 → vue-i18n 11.4.14, @intlify/core-base 11.4.14,
  @intlify/message-compiler 11.4.14, @intlify/shared 11.4.14, @intlify/h3 0.7.4. Checked against
  npm on 2026-10-14: nuxt, @nuxtjs/i18n and vue-router are all still the newest published versions.
- @comvi/nuxt 0.6.0, @comvi/vue 0.6.0, @comvi/core 0.6.0 (dependency h3 1.15.11, server-side only),
  installed from the release tarballs of `a74da136`

## 3. Caveats

1. **`lazy: false` is a no-op in @nuxtjs/i18n v10.6.** The option is not in the module's type
   definitions any more (the dist only mentions "lazy-loaded messages" under
   `experimental.prerenderMessages`). Locale files are never bundled into client JS. The catalog
   is served by a Nitro route and fetched by the client i18n plugin at startup:
   `GET /_i18n/abe11550/en/messages.json` → 36 bytes `{"en":{"greeting":"Hello, {name}!"}}`.
   So nuxt-i18n's JS numbers exclude the catalog and the app makes one extra request per locale.
   The HTML payload only carries `$si18n:cached-locale-configs` and `$si18n:resolved-locale`.
2. **@comvi/nuxt serializes the catalog into the HTML payload** (`__comvi_messages__` in
   `__NUXT_DATA__`): no extra request, and the catalog is not in the client JS either. Neither
   app's JS delta includes message bytes; the comparison is runtime-only on both sides.
3. **Both compile messages at runtime in the browser.** nuxt-i18n delivers the raw string
   `"Hello, {name}!"`, so the 16.9 KB `@intlify/message-compiler` is in the client chunk (the
   runtime-only vue-i18n build is not used, because messages come from the Nitro route rather
   than from build-time bundling). In the `comvi-nuxt` app @comvi/core uses its default compiler
   and `icuCompiler` is absent from the chunk; the `comvi-nuxt-icu` app composes it. Neither setup
   gets a precompilation edge.
4. HTML for `/` differs: 2 157 B (nuxt-i18n, which inlines a large `public.i18n` runtime-config
   block) vs 1 711 B (comvi-nuxt) and 1 799 B (comvi-nuxt-icu). Not counted in the tables above.
5. nuxt-i18n emits one extra 45-byte chunk (`i18n.config`: `{legacy:false}`), hence 5 JS files
   vs 4; it is prefetched (so it may be fetched in the background), not executed on `/`.
6. All four apps share the exact same Nuxt/Vite/Vue versions, so framework bytes cancel. The only
   non-library drift is the extra Nuxt runtime each module pulls in (+3.3 KB vs +2.8 KB min),
   which is included in the headline deltas.
7. Apps were scaffolded by hand (no `nuxi init`), with no `pages/` directory; app.vue renders the
   string directly. @comvi/nuxt's README example uses `<NuxtPage />` + `pages/index.vue`; the
   module built and rendered fine without pages.

## 4. Exact app sources

The sources of the four apps (no node_modules / .nuxt / .output) are under `apps/<app>/`; `comvi-nuxt-icu` differs from `comvi-nuxt` only by `icu: true` and a plural message.

### bare

`package.json`

```json
{
  "name": "bare",
  "private": true,
  "type": "module",
  "scripts": { "build": "nuxi build" },
  "dependencies": { "nuxt": "4.6.1", "vue": "3.5.43", "vue-router": "5.4.0" }
}
```

`nuxt.config.ts`

```ts
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
});
```

`app/app.vue`

```vue
<script setup lang="ts">
const name = "world";
</script>

<template>
  <p>Hello, {{ name }}!</p>
</template>
```

### nuxt-i18n

`package.json`

```json
{
  "name": "nuxt-i18n",
  "private": true,
  "type": "module",
  "scripts": { "build": "nuxi build" },
  "dependencies": {
    "nuxt": "4.6.1",
    "vue": "3.5.43",
    "vue-router": "5.4.0",
    "@nuxtjs/i18n": "10.6.0"
  }
}
```

`nuxt.config.ts`

```ts
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@nuxtjs/i18n"],
  i18n: {
    locales: [{ code: "en", file: "en.json" }],
    defaultLocale: "en",
    strategy: "no_prefix",
    lazy: false,
    vueI18n: "./i18n.config.ts",
  },
});
```

`i18n/i18n.config.ts`

```ts
export default defineI18nConfig(() => ({
  legacy: false,
}));
```

`i18n/locales/en.json`

```json
{ "greeting": "Hello, {name}!" }
```

`app/app.vue`

```vue
<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <p>{{ t("greeting", { name: "world" }) }}</p>
</template>
```

### comvi-nuxt

Configured per the installed `node_modules/@comvi/nuxt/README.md` "Setup" section: inline `comvi.messages` in nuxt.config.ts (the README prescribes inline messages, nested or flat; no `comvi.i18n.ts` file is needed for local messages, so none was created).

`package.json`

```json
{
  "name": "comvi-nuxt",
  "private": true,
  "type": "module",
  "scripts": { "build": "nuxi build" },
  "dependencies": {
    "nuxt": "4.6.1",
    "vue": "3.5.43",
    "vue-router": "5.4.0",
    "@comvi/nuxt": "0.6.0",
    "@comvi/vue": "0.6.0",
    "@comvi/core": "0.6.0"
  }
}
```

`nuxt.config.ts`

```ts
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: false },
  modules: ["@comvi/nuxt"],
  comvi: {
    defaultLocale: "en",
    locales: ["en"],
    messages: {
      en: { greeting: "Hello, {name}!" },
    },
  },
});
```

`app/app.vue`

```vue
<script setup lang="ts">
const { t } = useI18n();
</script>

<template>
  <p>{{ t("greeting", { name: "world" }) }}</p>
</template>
```

## 5. Exact commands

```sh
# versions re-checked on 2026-10-14; all three were already the newest published
npm view nuxt version            # 4.6.1
npm view @nuxtjs/i18n version    # 10.6.0
npm view vue-router version      # 5.4.0

# FIRST: move the esbuild harness's install out of the way, or Vite bundles a second
# copy of vue-i18n from it into the nuxt-i18n app (see "The harness install contaminates…").
cd .. && mv node_modules ../size-compare-node_modules-parked && cd nuxt

# per app (bare, nuxt-i18n, comvi-nuxt, comvi-nuxt-icu)
cd apps/<app> && pnpm install && pnpm nuxi build

# sizes + entry file + per-chunk tables (first arg is the baseline)
node measure.mjs apps/bare apps/nuxt-i18n apps/comvi-nuxt apps/comvi-nuxt-icu

# SSR check, one app at a time. Change directory first, then start the server and capture
# ITS pid in the same shell (a backgrounded `cd … && node …` list would give the subshell's pid).
cd apps/<app>
EXPECT='Hello, world!'            # '2 items for world' for comvi-nuxt-icu
PORT=3451 node .output/server/index.mjs &
SERVER_PID=$!
sleep 2
curl -s http://localhost:3451/ | grep -c "$EXPECT"   # expect 1
kill "$SERVER_PID"                # only the pid you started
cd ../..

# nuxt-i18n runtime catalog request. The hash is build-specific: read it from the built entry chunk,
# then request it from the running server (same pattern as the SSR check, nuxt-i18n on port 3452).
cd apps/nuxt-i18n
HASH=$(grep -oh '_i18n/[A-Za-z0-9]*' .output/public/_nuxt/*.js | head -1 | cut -d/ -f2)
PORT=3452 node .output/server/index.mjs &
SERVER_PID=$!
sleep 2
curl -s "http://localhost:3452/_i18n/$HASH/en/messages.json"   # {"en":{"greeting":"Hello, {name}!"}}
kill "$SERVER_PID"
cd ../..

# per-package attribution: copies of the apps with sourcemap: { client: true, server: false }.
# Create them first (they are not committed): copy the app, add the option, install, build.
for a in bare nuxt-i18n comvi-nuxt comvi-nuxt-icu; do
  rm -rf sm-$a && cp -R apps/$a sm-$a && rm -rf sm-$a/.output sm-$a/.nuxt
  perl -pi -e 's/defineNuxtConfig\(\{/defineNuxtConfig({\n  sourcemap: { client: true, server: false },/' sm-$a/nuxt.config.ts
  (cd sm-$a && pnpm install && pnpm nuxi build)
done
node attribute.mjs sm-bare sm-nuxt-i18n sm-comvi-nuxt sm-comvi-nuxt-icu > attribute-<date>.txt

# every client sourcemap must name only paths inside its own app
node -e 'const fs=require("fs");for(const a of ["sm-bare","sm-nuxt-i18n","sm-comvi-nuxt","sm-comvi-nuxt-icu"]){const d=a+"/.output/public/_nuxt";for(const f of fs.readdirSync(d).filter(x=>x.endsWith(".map")))for(const s of JSON.parse(fs.readFileSync(d+"/"+f,"utf8")).sources)if(/(\.\.\/){4,}/.test(s))console.log("LEAK",a,s);}'

# LAST: put the harness install back
cd .. && mv ../size-compare-node_modules-parked node_modules
```

Files in this directory: `measure.mjs` and its saved outputs `measure-2026-10-14.txt` and
`measure-2026-10-10.txt`, `attribute.mjs` and its saved outputs `attribute-2026-10-14.txt` and
`attribute-2026-10-10.txt`, `REPORT.md`, and `apps/<app>/`
(sources only; `pnpm install && pnpm nuxi build` recreates the builds). The
sourcemap builds (`sm-*`) are copies of the apps with `sourcemap: { client: true, server: false }`
added to `nuxt.config.ts`; they are not committed. The two Comvi apps have no committed
`pnpm-lock.yaml`: their manifests name 0.6.0, which no lockfile can resolve until the release is on
npm, and keeping the old 0.5.0 lockfiles made a clean clone fail with a message about `react` and
`vue` instead of about the unpublished package. Run `pnpm install` in each after the release and
commit what it writes. `bare` and `nuxt-i18n` depend on no `@comvi` package and keep theirs.
