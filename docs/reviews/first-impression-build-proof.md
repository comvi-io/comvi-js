# First-impression renames, build proof

Branch `feat/first-impression`, base `feat/weight-refactor-0.5` @ d694e446. Recorded 2026-10-04.
Plan: `.omc/plans/first-impression-lot.md`, with the owner decisions of 2026-10-04.

|      | Version  |
| ---- | -------- |
| Node | v24.19.0 |
| pnpm | 9.12.1   |

Platform docs source: `origin/develop` @ e475917c. Only `quick-start.mdx` and `connect-comvi.mdx`
were copied to a scratch directory, with the renames applied by the same substitution rules the
lot used (9 changed lines on each page). The real docs pages still use the old names.

| Sub-lot  | Commit   | What                                                                                    |
| -------- | -------- | --------------------------------------------------------------------------------------- |
| C2       | 13ade6f2 | `setLocaleAsync()` becomes `setLocale(): Promise<void>`                                 |
| C1       | 9be32486 | inline catalog option `translation` becomes `messages`; catalog methods follow          |
| C3       | 0d0c44df | `cdnLoader` is the fetch-loader root; `fetchLoader` and the HTTP helpers move to `/api` |
| C3 fix   | 926ca720 | plugin peers stay `^0.4.0` until the release cut                                        |
| C1 tests | 37db5e95 | Next and Nuxt reject the old catalog names at type level                                |

## Commands

```bash
pnpm build && pnpm exec turbo run test --continue --concurrency=4 && pnpm typecheck && pnpm lint
pnpm format:check && pnpm check:publint && pnpm check:types-exports && pnpm audit:package-contracts
pnpm check:inlined-version && pnpm check:snippets && node scripts/size-check.mjs && pnpm test:release-tools
pnpm examples:e2e
node scripts/examples-e2e/run.mjs --cdn --no-build --no-pack
pnpm docs:quickstart --content <scratch with the two renamed pages> --no-build
node scripts/perf.mjs --compare-ref d694e446   # from a temporary copy, see Perf
```

Every gate is green after each sub-lot, with one exception. `pnpm format:check` flags
`docs/design/README.md`, a file this lot does not touch; it fails the same way on the base.

## Red before green

C2, `packages/core/tests/types/first-impression-renames.test-d.ts` before the rename:

```text
tests/types/first-impression-renames.test-d.ts(12,8): error TS2551: Property 'setLocale' does not exist on type 'I18n<DefaultTranslationParams>'. Did you mean 'locale'?
tests/types/first-impression-renames.test-d.ts(13,14): error TS2551: Property 'setLocale' does not exist on type 'I18n<{}> & I18nLoaderApi'. Did you mean 'locale'?
tests/types/first-impression-renames.test-d.ts(14,8): error TS2551: Property 'setLocale' does not exist on type 'WrapperI18nHost'. Did you mean 'locale'?
tests/types/first-impression-renames.test-d.ts(17,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(19,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(21,1): error TS2578: Unused '@ts-expect-error' directive.
```

C1, the same file with the catalog assertions, before the rename:

```text
tests/types/first-impression-renames.test-d.ts(26,28): error TS2353: Object literal may only specify known properties, and 'messages' does not exist in type 'I18nOptions<{}>'.
tests/types/first-impression-renames.test-d.ts(27,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(30,6): error TS2339: Property 'addMessages' does not exist on type 'I18n<DefaultTranslationParams>'.
tests/types/first-impression-renames.test-d.ts(31,54): error TS2339: Property 'getMessages' does not exist on type 'I18n<DefaultTranslationParams>'.
tests/types/first-impression-renames.test-d.ts(32,6): error TS2339: Property 'clearMessages' does not exist on type 'I18n<DefaultTranslationParams>'.
tests/types/first-impression-renames.test-d.ts(33,51): error TS2339: Property 'reloadMessages' does not exist on type 'I18n<{}> & I18nLoaderApi'.
tests/types/first-impression-renames.test-d.ts(34,9): error TS2345: Argument of type '"messagesCleared"' is not assignable to parameter of type 'I18nEvent'.
tests/types/first-impression-renames.test-d.ts(36,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(38,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(40,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(42,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(44,1): error TS2578: Unused '@ts-expect-error' directive.
```

C1, `packages/next/tests/types/first-impression-renames.test-d.ts` run on the base checkout:

```text
tests/types/first-impression-renames.test-d.ts(5,15): error TS2305: Module '"@comvi/next/server"' has no exported member 'LoadMessagesOptions'.
tests/types/first-impression-renames.test-d.ts(5,36): error TS2305: Module '"@comvi/next/server"' has no exported member 'MessagesMap'.
tests/types/first-impression-renames.test-d.ts(7,56): error TS2353: Object literal may only specify known properties, and 'messages' does not exist in type 'CreateNextI18nOptions<{}>'.
tests/types/first-impression-renames.test-d.ts(8,1): error TS2578: Unused '@ts-expect-error' directive.
tests/types/first-impression-renames.test-d.ts(12,10): error TS2339: Property 'loadMessages' does not exist on type 'typeof import("…/base/packages/next/src/server")'.
tests/types/first-impression-renames.test-d.ts(13,1): error TS2578: Unused '@ts-expect-error' directive.
```

C1, `packages/nuxt/tests/first-impression-renames.test-d.ts` run on the base checkout:

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
TypeCheckError: Object literal may only specify known properties, and 'messages' does not exist in type 'NuxtI18nOptions'.
TypeCheckError: Unused '@ts-expect-error' directive.
TypeCheckError: Argument of type '"messages"' is not assignable to parameter of type '"defaultLocale" | "localePrefix" | "localeCookie" | "localeDetection" | "locales" | "ns" | "translation" | "localeObjects" | "head" | "defaultNs" | "fallbackLocale" | "defaultParams" | "basicHtmlTags"'.
TypeCheckError: This expression is not callable. Type 'ExpectFunction<any>' has no call signatures.
TypeCheckError: Unused '@ts-expect-error' directive.
      Tests  2 failed (2)
Type Errors  2 failed
```

C1, the Nuxt env-override test in `packages/nuxt/tests/module.test.ts`, before the rename:

```text
× publishes the inline catalog as public runtime config `messages`, the key NUXT_PUBLIC_COMVI_MESSAGES overrides
AssertionError: expected undefined to deeply equal { en: { greeting: 'Hello' } }
```

C3, `packages/plugin-fetch-loader/tests/entry-points.test.ts` run on the base checkout:

```text
Error: Failed to resolve import "../src/api" from "tests/entry-points.test.ts". Does the file exist?
      Tests  no tests
```

## Size

Bytes are min+gz. The two fetch-loader rows were renamed and measure the same graphs as before:
`plugin-fetch-loader-cdn-lite` is now `plugin-fetch-loader`, and `plugin-fetch-loader-cdn` is now
`plugin-fetch-loader-api`. No budget moved.

| Row                           |  Base | Final |   Δ | Budget |
| ----------------------------- | ----: | ----: | --: | -----: |
| core-base                     |  5317 |  5315 |  -2 |   5534 |
| core-base-icu                 |  6377 |  6374 |  -3 |   6493 |
| core-full-composite           |  9089 |  9097 |  +8 |   9318 |
| fw-next-client-default        |  7450 |  7441 |  -9 |   7722 |
| fw-next-middleware-edge       |  1999 |  1999 |  +0 |   2097 |
| fw-next-plugin-node           |   912 |   912 |  +0 |    932 |
| fw-next-root-composed         |  9807 |  9809 |  +2 |   9923 |
| fw-next-server-default-loader |  7835 |  7840 |  +5 |   8207 |
| fw-next-server-provider       |  1913 |  1913 |  +0 |   1991 |
| fw-nuxt-client-default        |  8369 |  8362 |  -7 |   8718 |
| fw-nuxt-full-composite        | 12935 | 12941 |  +6 |  13270 |
| fw-nuxt-host                  |  8197 |  8200 |  +3 |   8405 |
| fw-react-default              |  7020 |  7020 |  +0 |   7248 |
| fw-react-full-composite       | 11913 | 11917 |  +4 |  12150 |
| fw-solid-default              |  6729 |  6725 |  -4 |   6921 |
| fw-solid-full-composite       | 11475 | 11478 |  +3 |  11692 |
| fw-svelte-default             |  6909 |  6898 | -11 |   7035 |
| fw-svelte-full-composite      | 12136 | 12139 |  +3 |  12302 |
| fw-vue-default                |  7356 |  7342 | -14 |   7636 |
| fw-vue-full-composite         | 12070 | 12068 |  -2 |  12381 |
| platform-path-react           | 11186 | 11191 |  +5 |  11333 |
| plugin-fetch-loader           |  9506 |  9510 |  +4 |   9632 |
| plugin-fetch-loader-api       | 11443 | 11450 |  +7 |  11696 |

## Examples e2e

`pnpm examples:e2e`:

```text
framework  build  a   b   c   d   e   f     g   g2    h   i     j   k     k2    k3    l   m   n   o     p   q   r   s
---------  -----  --  --  --  --  --  ----  --  ----  --  ----  --  ----  ----  ----  --  --  --  ----  --  --  --  ----
next       ok     ok  ok  ok  ok  ok  ok    ok  skip  ok  ok    ok  skip  skip  skip  ok  ok  ok  ok    ok  ok  ok  ok
nuxt       ok     ok  ok  ok  ok  ok  ok    ok  skip  ok  ok    ok  skip  skip  skip  ok  ok  ok  ok    ok  ok  ok  ok
react      ok     ok  ok  ok  ok  ok  skip  ok  skip  ok  skip  ok  skip  skip  skip  ok  ok  ok  skip  ok  ok  ok  skip
solid      ok     ok  ok  ok  ok  ok  skip  ok  skip  ok  skip  ok  skip  skip  skip  ok  ok  ok  skip  ok  ok  ok  skip
svelte     ok     ok  ok  ok  ok  ok  skip  ok  skip  ok  skip  ok  skip  skip  skip  ok  ok  ok  skip  ok  ok  ok  skip
vanilla    ok     ok  ok  ok  ok  ok  skip  ok  skip  ok  skip  ok  skip  skip  skip  ok  ok  ok  skip  ok  ok  ok  skip
vue        ok     ok  ok  ok  ok  ok  skip  ok  skip  ok  skip  ok  skip  skip  skip  ok  ok  ok  skip  ok  ok  ok  skip
```

`--cdn`:

```text
framework  build  a   b   c   d   e   f     g   g2  h   i     j   k   k2  k3  l   m   n   o     p   q   r   s
---------  -----  --  --  --  --  --  ----  --  --  --  ----  --  --  --  --  --  --  --  ----  --  --  --  ----
next       ok     ok  ok  ok  ok  ok  ok    ok  ok  ok  ok    ok  ok  ok  ok  ok  ok  ok  ok    ok  ok  ok  skip
nuxt       ok     ok  ok  ok  ok  ok  ok    ok  ok  ok  ok    ok  ok  ok  ok  ok  ok  ok  ok    ok  ok  ok  skip
react      ok     ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip
solid      ok     ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip
svelte     ok     ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip
vanilla    ok     ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip
vue        ok     ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip
```

Both passes record the same finding without failing it. `svelte/r` shows raw keys
(`greeting.hello`) in one mutation batch before the first catalog lands. The lot's diff to the
Svelte example and binding is behaviour-identical (the import specifier and renamed members), and
a base run of the Svelte example could not complete from the scratch path (pnpm
`ENAMETOOLONG`), so the finding is not attributed. The `next/r` lines also appear in
`dx-next-build-proof.md`.

## Docs probe

```text
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| react     | quick-start   | pass     | pass    | pass  | pass      | pass   |
| react     | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| next      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| next      | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| vue       | quick-start   | pass     | pass    | pass  | pass      | pass   |
| vue       | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| nuxt      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| nuxt      | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| svelte    | quick-start   | pass     | pass    | pass  | pass      | pass   |
| svelte    | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| solid     | quick-start   | pass     | pass    | pass  | pass      | pass   |
| solid     | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| vanilla   | quick-start   | pass     | pass    | pass  | pass      | pass   |
| vanilla   | connect-comvi | pass     | pass    | pass  | pass      | pass   |
```

## Perf

The checked-in `scripts/perf.mjs` seeds its catalogs with `messages`, which the base core ignores.
Its cases therefore do not map across the rename. The comparison ran from an uncommitted copy that
passes each catalog as both `messages` and `translation`, so each side reads the name it knows.

```text
| case                                 | A µs/op | B µs/op | Δ% |
| ------------------------------------ | ---: | ---: | ---: |
| constructor (200-key catalog)        | 8.775 | 8.648 | -1.44% |
| t() static key                       | 0.114 | 0.113 | -0.88% |
| t() with {name}                      | 0.140 | 0.141 | +0.84% |
| t() ICU plural (icuCompiler)         | 0.542 | 0.544 | +0.49% |
| t() ICU plural, branch with a bare & | 0.587 | 0.593 | +1.10% |
| prepareTranslation(<b>)              | 0.356 | 0.352 | -0.91% |

{"constructor (200-key catalog)":-1.444,"t() static key":-0.875,"t() with {name}":0.837,"t() ICU plural (icuCompiler)":0.488,"t() ICU plural, branch with a bare &":1.096,"prepareTranslation(<b>)":-0.913}
```

Perf gate passed: no case regressed more than 5%.

## Notes for the docs writer

- The docs-snippets module hash changed. Pin
  `7594732151d7ad32ba69696fdd050948da437f63868a258ace1c0e17d5e6b0f7` in www's parity spec when the
  copy is updated.
- `scripts/mutation/accepted.json` has 42 stale entries on the base already. This lot leaves that
  count unchanged.
