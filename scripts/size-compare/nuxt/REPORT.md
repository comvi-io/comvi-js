# Nuxt client-bundle cost: @nuxtjs/i18n vs @comvi/nuxt (real `nuxi build`)

Date: 2026-10-10 (three apps) and 2026-10-11 (the `comvi-nuxt-icu` app). Minimal Nuxt 4 apps, identical except for the i18n layer, built with
`nuxi build` (production). Every `.js` under `.output/public/_nuxt/` was measured (recursively;
`builds/meta/*.json` is not JS). gzip = node `zlib.gzipSync` level 9 per file, summed.
brotli = `zlib.brotliCompressSync` quality 11 per file, summed.

## 1. Results

### All client JS

| app        | JS files | min bytes | gzip-9 bytes | brotli-11 bytes | Δ min vs base | Δ gzip vs base | Δ brotli vs base |
| ---------- | -------- | --------- | ------------ | --------------- | ------------- | -------------- | ---------------- |
| bare       | 4        | 144943    | 54453        | 48953           | +0            | +0             | +0               |
| nuxt-i18n  | 5        | 229147    | 82571        | 73043           | +84204        | +28118         | +24090           |
| comvi-nuxt | 4        | 184255    | 66719        | 59630           | +39312        | +12266         | +10677           |

### Entry-file bytes only; excludes other chunks and prefetch

The entry chunk is the one `<script type="module" src>` + `modulepreload` in the server-rendered HTML.
The other chunks are `rel="prefetch"` (error-404, error-500, a tiny `__vccOpts` helper and, for
nuxt-i18n, the 45-byte `i18n.config` chunk). A browser may fetch prefetched resources in the
background, so this table is "entry-file bytes, excluding other chunks and background prefetch",
not "everything a page view downloads"; the totals table above is the whole build.

| app        | entry chunk | min    | gzip-9 | brotli-11 | Δ min vs base | Δ gzip vs base | Δ brotli vs base |
| ---------- | ----------- | ------ | ------ | --------- | ------------- | -------------- | ---------------- |
| bare       | C-8B2RTK.js | 132192 | 49167  | 44299     | +0            | +0             | +0               |
| nuxt-i18n  | CWPVvClJ.js | 222313 | 79515  | 70474     | +90121        | +30348         | +26175           |
| comvi-nuxt | B9fGpTWr.js | 177466 | 63729  | 57108     | +45274        | +14562         | +12809           |

The entry-chunk delta is larger than the total delta because in both i18n apps the error-404
prefetch chunk shrank from 9 981 B to 4 029 B min: both i18n plugins pull NuxtLink/router helpers
into the entry chunk, so error-404 no longer carries its own copy. Quote either number, but say which.

### Comvi with the ICU compiler composed (added 2026-10-11)

The `comvi-nuxt` app runs core's default compiler. `apps/comvi-nuxt-icu` is the same app with
`comvi.icu: true` and a plural message (`{count, plural, one {# item} other {# items}} for {name}`),
built and measured the same way on 2026-10-11 (`measure-2026-10-11.txt`); its server rendered
`2 items for world` and the catalog is in the HTML payload, as before.

| App                           | JS files | min bytes | gzip-9 bytes | brotli-11 bytes | Δ gzip vs bare | entry chunk gzip | Δ entry vs bare |
| ----------------------------- | -------- | --------- | ------------ | --------------- | -------------- | ---------------- | --------------- |
| comvi-nuxt (default compiler) | 4        | 184 255   | 66 719       | 59 630          | +12 266        | 63 729           | +14 562         |
| comvi-nuxt-icu (`icu: true`)  | 4        | 186 945   | 67 692       | 60 506          | +13 239        | 64 702           | +15 535         |
| nuxt-i18n                     | 5        | 229 147   | 82 571       | 73 043          | +28 118        | 79 515           | +30 348         |

The ICU compiler costs 973 B gzip in this build (2 690 B minified). The nuxt-i18n app always
carries vue-i18n's message compiler and plural rules, so the ICU row is the configuration whose
runtime is capable of the same work. The messages themselves differ (`Hello, world!` in the
nuxt-i18n app, `2 items for world` here) and sit outside the measured JavaScript in both apps.
The 973 B is the observed increment of this configuration (`icu: true` plus the plural call site);
a reader who wants identical rendered output should give the nuxt-i18n app a pipe-plural message
and rebuild.

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
| CWPVvClJ.js | 222313 | 79515  | 70474     | intlify, vue-i18n |
| C9kFx0sp.js | 4029   | 1714   | 1434      | —                 |
| C4dHYqXI.js | 2676   | 1178   | 998       | —                 |
| BDNMzG2s.js | 84     | 99     | 88        | —                 |
| CNnXW_bn.js | 45     | 65     | 49        | —                 |

#### comvi-nuxt — chunks (largest first)

| file        | min    | gzip-9 | brotli-11 | markers |
| ----------- | ------ | ------ | --------- | ------- |
| B9fGpTWr.js | 177466 | 63729  | 57108     | comvi   |
| DUJqYKrM.js | 4029   | 1714   | 1435      | —       |
| ABsu161V.js | 2676   | 1177   | 999       | —       |
| BDNMzG2s.js | 84     | 99     | 88        | —       |

### Per-package attribution (min bytes, sourcemap-based)

A second build of each app with `sourcemap: { client: true, server: false }` (directories `sm-*`)
was analysed with `attribute.mjs`, which walks the Vite sourcemap mappings and credits every
generated byte to the source package. The sourcemap builds differ from the plain ones only by the
`//# sourceMappingURL` comment (+111 B bare, +148 B nuxt-i18n, +111 B comvi-nuxt). Only
i18n-related rows are shown. The framework packages are the same code in all three apps but not
byte-identical after minification: `@vue/runtime-core` is 47,330 B in bare and 47,467 B in
nuxt-i18n, and `@vue/reactivity` differs by a similar few hundred bytes, because chunk-level
minification and the extra Nuxt runtime each app pulls in shift the shared code slightly. Those
differences are inside the headline deltas; this table lists only the i18n packages.

| package                                                 | nuxt-i18n  | comvi-nuxt |
| ------------------------------------------------------- | ---------- | ---------- |
| @nuxtjs/i18n                                            | 21 479     | —          |
| @intlify/message-compiler                               | 16 905     | —          |
| @intlify/core-base                                      | 14 966     | —          |
| vue-i18n                                                | 14 589     | —          |
| @intlify/shared                                         | 3 363      | —          |
| @comvi/core                                             | —          | 16 262     |
| @comvi/nuxt                                             | —          | 6 160      |
| @comvi/vue                                              | —          | 5 706      |
| cookie-es                                               | 3 482      | 3 478      |
| ohash                                                   | 3 158      | 3 158      |
| klona                                                   | 891        | 891        |
| defu                                                    | 629        | —          |
| extra `nuxt` runtime pulled in (useCookie, NuxtLink, …) | +3 256     | +2 756     |
| **total build delta over bare (all chunks)**            | **84 204** | **39 312** |

The last row is the whole-build delta from the totals table, not the sum of the listed rows: the
listed rows add to 82,718 B (nuxt-i18n) and 38,411 B (comvi-nuxt); the remaining 1,486 B and
901 B are packages under the 300 B display threshold, the shifted framework bytes described
above, and chunk boilerplate.

Full per-package tables (all packages ≥ 300 B) for the three 2026-10-10 apps are in `attribute-2026-10-10.txt`; the ICU app was not attributed.

### SSR verification

Each `.output/server/index.mjs` was started with `PORT=3451` (bare), `3452` (nuxt-i18n), `3453`
(comvi-nuxt). `curl http://localhost:<port>/` returned `<p>Hello, world!</p>` for all three.
Each server was stopped by its own PID (taken from `$!`, checked with `ps -p`); `ps` showed no
leftover `.output/server/index.mjs` processes afterwards.

## 2. Versions (from installed package.json files)

- Node 24.19.0, pnpm 10.33.2
- nuxt 4.6.1, vue 3.5.43, vue-router 5.4.0, vite 8.3.4, nitropack 2.13.4
- @nuxtjs/i18n 10.6.0 → vue-i18n 11.4.14, @intlify/core-base 11.4.14,
  @intlify/message-compiler 11.4.14, @intlify/shared 11.4.14, @intlify/h3 0.7.4
- @comvi/nuxt 0.5.0, @comvi/vue 0.5.0, @comvi/core 0.5.0 (dependency h3 1.15.11, server-side only)

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
   than from build-time bundling). @comvi/core uses its default compiler; no ICU compiler was
   included (`icuCompiler` is absent from the chunk). Neither setup gets a precompilation edge.
4. HTML for `/` differs: 2 157 B (nuxt-i18n, which inlines a large `public.i18n` runtime-config
   block) vs 1 711 B (comvi-nuxt). Not counted in the tables above.
5. nuxt-i18n emits one extra 45-byte chunk (`i18n.config`: `{legacy:false}`), hence 5 JS files
   vs 4; it is prefetched (so it may be fetched in the background), not executed on `/`.
6. All three apps share the exact same Nuxt/Vite/Vue versions, so framework bytes cancel. The only
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
  "dependencies": { "nuxt": "4.6.1", "vue": "latest", "vue-router": "latest" }
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
    "vue": "latest",
    "vue-router": "latest",
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
    "vue": "latest",
    "vue-router": "latest",
    "@comvi/nuxt": "0.5.0",
    "@comvi/vue": "0.5.0",
    "@comvi/core": "0.5.0"
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
# versions checked before scaffolding
npm view nuxt version            # 4.6.1
npm view @nuxtjs/i18n version    # 10.6.0
npm view @comvi/nuxt versions    # ... 0.5.0

# per app (bare, nuxt-i18n, comvi-nuxt, comvi-nuxt-icu)
cd apps/<app> && pnpm install --ignore-workspace && pnpm nuxi build

# sizes + entry file + per-chunk tables (first arg is the baseline)
node measure.mjs apps/bare apps/nuxt-i18n apps/comvi-nuxt apps/comvi-nuxt-icu

# SSR check, one app at a time (kill only the PID you started); expect `Hello, world!`,
# and `2 items for world` for comvi-nuxt-icu
cd apps/<app> && PORT=3451 node .output/server/index.mjs & echo $! > server.pid
curl -s http://localhost:3451/ | grep -c "$EXPECT"   # expect 1; EXPECT='Hello, world!' for the
                                                       # first three apps, '2 items for world' for comvi-nuxt-icu
kill "$(cat server.pid)"

# nuxt-i18n runtime catalog request (hash is build-specific, read it from the entry chunk)
curl -s http://localhost:3452/_i18n/abe11550/en/messages.json

# per-package attribution: copies with sourcemap: { client: true, server: false }
for a in bare nuxt-i18n comvi-nuxt; do (cd sm-$a && pnpm install --offline && pnpm nuxi build); done
node attribute.mjs > attribute.out
```

Files in this directory: `measure.mjs` and its saved output `measure-2026-10-10.txt`,
`attribute.mjs` and its saved output `attribute-2026-10-10.txt`, `REPORT.md`, and `apps/<app>/`
(sources only; `pnpm install --ignore-workspace && pnpm nuxi build` recreates the builds). The
sourcemap builds (`sm-*`) are copies of the apps with `sourcemap: { client: true, server: false }`
added to `nuxt.config.ts`; they are not committed.
