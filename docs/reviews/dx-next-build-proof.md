# DX-Next build proof

Proof that the `withComvi` + server `<ComviProvider>` setup builds and runs on a real Next
build, recorded on commit `ec2ff3d9` of `feat/dx-next`. It is a merge gate for the DX-Next lot:
re-run it and replace this file when the setup changes.

- Node: v24.19.0 (macOS).
- Docs probe: Next 16.3.8 from `create-next-app@latest`. The Next tab of the scratch
  `quick-start.mdx` holds the plan's files: `next.config.ts` with
  `withComvi({ config: './src/i18n/config.ts' })({})`, `src/i18n/routing.ts`,
  `src/i18n/config.ts`, a layout rendering `<ComviProvider locale={locale}>` from
  `@comvi/next/server`, `src/middleware.ts`, and a page calling `getI18n({ locale })`. There is
  no `server.ts` and no client wrapper. Each kept project was checked for exactly those files.
- `examples/next`: `next@^15.5.9` (the registry's newest match on the run date is 15.5.27),
  built with webpack, on the same setup (`next.config.ts` with `withComvi`, `<ComviProvider>`,
  `getI18n({ locale })`).

Commands, from the js-sdk root:

```bash
pnpm docs:quickstart --content <scratch>/docs-dx-next --only next --keep
pnpm docs:quickstart --content <scratch>/docs-dx-next --only next --keep --next-webpack --no-build --no-pack
pnpm examples:e2e --only next
pnpm examples:e2e --only next --cdn
```

## Which bundler built what, and where the catalog landed

The client bundle carries the user's catalog, so the alias reached the client graph:

```text
quick-start   turbopack  .next/turbopack present, trace span turbopack-build-events  catalog in .next/static/chunks/0uf-9g8zgutik.js
connect-comvi turbopack  .next/turbopack present, trace span turbopack-build-events  catalog in .next/static/chunks/1y5vy2--wupp0.js
quick-start   webpack    no .next/turbopack, trace spans build-module-*              catalog in .next/static/chunks/app/[locale]/layout-5404ef2706c595f1.js
connect-comvi webpack    no .next/turbopack, trace spans build-module-*              catalog in .next/static/chunks/807-a5c295194fb17ea9.js
```

The client host hydrates with the aliased config: e2e steps `b` (the switcher changes the
greeting), `f` and `o` (server-rendered text survives hydration) and `i` (locale switch through
the URL, then Back) run in the hydrated client. Every one is `ok` in both modes below.

## Docs probe, Turbopack (Next 16 default)

```text

> comvi@0.1.0 docs:quickstart <js-sdk>
> node scripts/docs-quickstart/run.mjs "--content" "<scratch>/docs-dx-next" "--only" "next" "--keep"

docs-quickstart: next / quick-start...
docs-quickstart: next / connect-comvi...
docs-quickstart: next / connect-comvi: pass
docs-quickstart: next / quick-start: pass
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| next      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| next      | connect-comvi | pass     | pass    | pass  | pass      | pass   |

Notes:
- next / quick-start: scaffold: default
- next / quick-start: scaffold flags added: create-next-app: --yes (defaults, empty HOME so no saved preferences) --skip-install --disable-git
- next / connect-comvi: scaffold: default
- next / connect-comvi: scaffold flags added: create-next-app: --yes (defaults, empty HOME so no saved preferences) --skip-install --disable-git

Local CDN http://127.0.0.1:52991/docs-quickstart served 3 request(s).
Wall time: 54s
kept: <tmp>/comvi-docs-quickstart/run-next-quick-start-4Qqwvp
kept: <tmp>/comvi-docs-quickstart/run-next-connect-comvi-JLjY7I
```

## Docs probe, webpack (`--next-webpack`)

```text

> comvi@0.1.0 docs:quickstart <js-sdk>
> node scripts/docs-quickstart/run.mjs "--content" "<scratch>/docs-dx-next" "--only" "next" "--keep" "--next-webpack" "--no-build" "--no-pack"

docs-quickstart: next / quick-start...
docs-quickstart: next / connect-comvi...
docs-quickstart: next / quick-start: pass
docs-quickstart: next / connect-comvi: pass
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| next      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| next      | connect-comvi | pass     | pass    | pass  | pass      | pass   |

Notes:
- next / quick-start: scaffold: default
- next / quick-start: scaffold flags added: create-next-app: --yes (defaults, empty HOME so no saved preferences) --skip-install --disable-git
- next / connect-comvi: scaffold: default
- next / connect-comvi: scaffold flags added: create-next-app: --yes (defaults, empty HOME so no saved preferences) --skip-install --disable-git

Local CDN http://127.0.0.1:53351/docs-quickstart served 3 request(s).
Wall time: 52s
kept: <tmp>/comvi-docs-quickstart/run-next-quick-start-grh4Lo
kept: <tmp>/comvi-docs-quickstart/run-next-connect-comvi-VCMGsZ
```

## `pnpm examples:e2e --only next`

```text

> comvi@0.1.0 examples:e2e <js-sdk>
> node scripts/examples-e2e/run.mjs "--only" "next"

examples-e2e: tarballs under test (sha256):
  a9b0a1bcdd12f3d2aafb380c1b4b30627296dc56eef5640989acd0b5f14e32de  comvi-cli-0.4.0.tgz
  02657df5e41991f1f3cf70cfbc09835b00bef6eefae22e689efda92d7046cf9b  comvi-core-0.4.0.tgz
  9f09ee3ba32a3ed9e9886e3674296f2202cee806337f1a0814f15e08be6bd411  comvi-next-0.4.0.tgz
  d7ea28c0fe8e964edd4355b916c23981ff84d5c58fcb2c1e2debb0b0a1a6b817  comvi-nuxt-0.4.0.tgz
  ad8aaa6017067b5e4ea7021e21a76731e36eba08fd30b501ef1f3c69fa3da2fd  comvi-plugin-fetch-loader-0.4.0.tgz
  fe400181feeb29787053d1743b228b3660bbefaa80c88737706e54f6e685ae38  comvi-plugin-in-context-editor-0.4.0.tgz
  fca434a7efb52cc4f99d06fce8974419bccb2f93c320be4d6b2efa49c668b684  comvi-plugin-locale-detector-0.4.0.tgz
  65b6b976e1c609b137851f21c791faebd307be0e16e5c131282c7ffb5b2631c2  comvi-react-0.4.0.tgz
  095199978c3be680fa94f6ae94550ec344da48032a51c9c56740b21dd6834512  comvi-solid-0.4.0.tgz
  564db4168deaa1b5fefbf28e3597535bc67761dc93305f7d4f8250c8053849b8  comvi-svelte-0.4.0.tgz
  c6fc5918228cb5fbac768a0bb9a8b12e95a7208ea231085141f0bc52c49deca1  comvi-vite-plugin-0.4.0.tgz
  51d6208d488be788b571c697202ecee49d88e200529aeef08ae2ceeca3af3673  comvi-vue-0.4.0.tgz
examples-e2e: @comvi scope served from the candidate at http://127.0.0.1:53688/
examples-e2e: next: install…
examples-e2e: next: build…
examples-e2e: next: serving http://127.0.0.1:53887, running the main phase…
examples-e2e: next: build…
examples-e2e: next: serving http://127.0.0.1:54092, running the f15 phase…
examples-e2e: next: done in 47s

examples:e2e: 1 example(s), 12 local tarballs, wall time 0m51s (next 47s)

framework  build  a   b   c   d   e   f   g   g2    h   i   j   k     k2    k3    l   m   n   o   p   q   r   s
---------  -----  --  --  --  --  --  --  --  ----  --  --  --  ----  ----  ----  --  --  --  --  --  --  --  --
next       ok     ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  skip  skip  ok  ok  ok  ok  ok  ok  ok  ok

a   initial render shows real text, no raw keys
b   switcher en → uk → de changes the greeting
c   plural 0/1/2/5 in en, uk (one/few/many) and de
d   <T> renders a real <a href> with translated text
e   catalogs load lazily, one per visited locale
f   SSR: plain-HTTP /uk already translated, then hydrates
g   no console.error or uncaught error in g's own pass (every step also fails on its own)
g2  --cdn: the same in the dead-CDN phase, past a narrow allowlist of network messages
h   a second page is translated and the locale survives navigation and Back
i   locale in the URL: /de renders German, switching navigates, Back restores
j   a locale's catalog is requested only when first needed, then renders
k   --cdn: every catalog came from the mock CDN, nothing 404'd
k2  --cdn: CDN unreachable → the bundled `fallback` imports serve the catalogs
k3  --cdn: the CDN's uk bundle lacks a key → the en value renders, not the key
l   fallbackLocale: en-only key renders en under uk; unknown key renders as itself
m   persistence: reload keeps uk; a fresh de browser starts in de
n   <html lang dir> follow the locale, dir=rtl for ar
o   SSR: the greeting text is right from first paint through hydration
p   a missing parameter renders as its own placeholder
q   an HTML-like parameter renders as text: no element, no handler run
r   DOM states during en → uk → de: never a raw key or a mixed-language frame
s   F-15: defaultLocale uk, /uk renders the en value of an en-only key, SSR and hydrated
ok = passed, FAIL = failed, skip = not applicable (reason below), xfail = a listed expected failure that failed (reference below), · = not reached

skipped:
next/g2,k,k2,k3: needs --cdn

findings (recorded, not failed): a mixed-language or raw-key state that is replaced before the next animation frame is recorded, not failed
next/r (main): en text under <html lang="uk">; lang=uk, greeting="Hello, Ada! Good to see you again.", 1 mutation batch(es)
next/r (main): uk text under <html lang="de">; lang=de, greeting="Привіт, Ada! Раді бачити знову.", 1 mutation batch(es)

report: test-results/examples-e2e/report.json
```

## `pnpm examples:e2e --only next --cdn`

```text

> comvi@0.1.0 examples:e2e <js-sdk>
> node scripts/examples-e2e/run.mjs "--only" "next" "--cdn"

examples-e2e: tarballs under test (sha256):
  a9b0a1bcdd12f3d2aafb380c1b4b30627296dc56eef5640989acd0b5f14e32de  comvi-cli-0.4.0.tgz
  02657df5e41991f1f3cf70cfbc09835b00bef6eefae22e689efda92d7046cf9b  comvi-core-0.4.0.tgz
  3e909dbb952638c50ebed3d066c5a19518910027d514372f86a0ac0d3f3ade64  comvi-next-0.4.0.tgz
  d7ea28c0fe8e964edd4355b916c23981ff84d5c58fcb2c1e2debb0b0a1a6b817  comvi-nuxt-0.4.0.tgz
  4b81da032403567b057b4fc43a83759b930d33cefa35645245805829b57febb6  comvi-plugin-fetch-loader-0.4.0.tgz
  743db2cea1eb72414c19fd48dce9dc671b6eeed9e0f51eaaf4c8689c4465348a  comvi-plugin-in-context-editor-0.4.0.tgz
  fca434a7efb52cc4f99d06fce8974419bccb2f93c320be4d6b2efa49c668b684  comvi-plugin-locale-detector-0.4.0.tgz
  65b6b976e1c609b137851f21c791faebd307be0e16e5c131282c7ffb5b2631c2  comvi-react-0.4.0.tgz
  095199978c3be680fa94f6ae94550ec344da48032a51c9c56740b21dd6834512  comvi-solid-0.4.0.tgz
  564db4168deaa1b5fefbf28e3597535bc67761dc93305f7d4f8250c8053849b8  comvi-svelte-0.4.0.tgz
  a5e1da1cc859777ca601e542e83f5e73f2d279e94b9ce2f5be45c61b70221dae  comvi-vite-plugin-0.4.0.tgz
  51d6208d488be788b571c697202ecee49d88e200529aeef08ae2ceeca3af3673  comvi-vue-0.4.0.tgz
examples-e2e: @comvi scope served from the candidate at http://127.0.0.1:54127/
examples-e2e: mock CDN at http://127.0.0.1:54128/cdn/e2e (serving <js-sdk>/examples/locales)
examples-e2e: next: install…
examples-e2e: next: build (catalogs from http://127.0.0.1:54128/cdn/e2e)…
examples-e2e: next: serving http://127.0.0.1:54317, running the main phase…
examples-e2e: next: build (catalogs from http://127.0.0.1:54520/cdn/e2e)…
examples-e2e: next: serving http://127.0.0.1:54559, running the cdn-down phase…
examples-e2e: next: done in 43s

examples:e2e --cdn: 1 example(s), 12 local tarballs, wall time 0m47s (next 43s)

framework  build  a   b   c   d   e   f   g   g2  h   i   j   k   k2  k3  l   m   n   o   p   q   r   s
---------  -----  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  --  ----
next       ok     ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  skip

a   initial render shows real text, no raw keys
b   switcher en → uk → de changes the greeting
c   plural 0/1/2/5 in en, uk (one/few/many) and de
d   <T> renders a real <a href> with translated text
e   catalogs load lazily, one per visited locale
f   SSR: plain-HTTP /uk already translated, then hydrates
g   no console.error or uncaught error in g's own pass (every step also fails on its own)
g2  --cdn: the same in the dead-CDN phase, past a narrow allowlist of network messages
h   a second page is translated and the locale survives navigation and Back
i   locale in the URL: /de renders German, switching navigates, Back restores
j   a locale's catalog is requested only when first needed, then renders
k   --cdn: every catalog came from the mock CDN, nothing 404'd
k2  --cdn: CDN unreachable → the bundled `fallback` imports serve the catalogs
k3  --cdn: the CDN's uk bundle lacks a key → the en value renders, not the key
l   fallbackLocale: en-only key renders en under uk; unknown key renders as itself
m   persistence: reload keeps uk; a fresh de browser starts in de
n   <html lang dir> follow the locale, dir=rtl for ar
o   SSR: the greeting text is right from first paint through hydration
p   a missing parameter renders as its own placeholder
q   an HTML-like parameter renders as text: no element, no handler run
r   DOM states during en → uk → de: never a raw key or a mixed-language frame
s   F-15: defaultLocale uk, /uk renders the en value of an en-only key, SSR and hydrated
ok = passed, FAIL = failed, skip = not applicable (reason below), xfail = a listed expected failure that failed (reference below), · = not reached

skipped:
next/s: the F-15 variant runs in the bundled mode

findings (recorded, not failed): a mixed-language or raw-key state that is replaced before the next animation frame is recorded, not failed
next/r (main): en text under <html lang="uk">; lang=uk, greeting="[CDN] Hello, Ada! Good to see you again.", 1 mutation batch(es)
next/r (main): uk text under <html lang="de">; lang=de, greeting="[CDN] Привіт, Ada! Раді бачити знову.", 1 mutation batch(es)

report: test-results/examples-e2e/report-cdn.json
```

## Observed and unexplained: `--cdn --no-build --no-pack` integrity failure

Once, on 27128a54, `pnpm examples:e2e --only next --cdn --no-build --no-pack`, run right after a
default `pnpm examples:e2e --only next` that had built and packed, failed before the build step
with:

```text
next/build: @comvi/react: the lockfile's integrity sha512-cKjdGOIZ+NBOYBVwfFHcDuoWG0XnAsBzpxBU+uo+idwkuAScPHoK7fnT/U8rZYhvjek3gk5+69949Vq4ZZYkCg== is not the candidate tarball's sha512-9O82CHLFeW0o4yQQvRujokhrzIp/OCu6QxTDwXGtLqiRPfuoLSnYFjHv0WMW1fITIwhDQovCVMlg6DcPk1yTJQ==
```

No source changed between the two runs. The same `--cdn` run with its own build and pack passed
at once. The same `--no-build --no-pack` sequence had passed on 0f4030b0. The cause is not
known: reusing tarballs across runs, and how the runner's registry serves them, is where to look.
The `--cdn` result above comes from a run with its own build and pack.
