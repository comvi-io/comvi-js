# Next/Nuxt API parity, lots A2–A5 build proof (with the A2 rework)

Branch `feat/parity-a`, base `feat/weight-refactor-0.5` @ e93168ca. Recorded 2026-10-04. Plan:
`.omc/plans/next-nuxt-api-parity-audit.md`, with the owner decisions of 2026-10-04.

|                       | Version  |
| --------------------- | -------- |
| Node                  | v24.19.0 |
| pnpm                  | 10.33.2  |
| Next, `examples/next` | ^15.5.9  |
| Nuxt, `examples/nuxt` | ^4.5.2   |

Platform docs source: `origin/develop` @ bd32e4b6, `apps/www/src/content/docs/docs/i18n`, copied
to a scratch directory with `git archive` and probed unchanged.

## Commands

```bash
pnpm examples:e2e --only next
pnpm examples:e2e --only next --cdn --no-build --no-pack
pnpm examples:e2e --only nuxt --no-build --no-pack
pnpm examples:e2e --only nuxt --cdn --no-build --no-pack
pnpm docs:quickstart --content <scratch> --only next --no-build --no-pack
pnpm docs:quickstart --content <scratch> --only nuxt --no-build --no-pack
```

## The routing-policy contract (lot A3)

`tooling/test-utils/routingPolicyContract.ts` holds 32 rows. B6 detection precedence has 20,
B8 cookie control 7, and B10 server helper result 5. Each package also runs the 45 shared
`Accept-Language` rows (B5) end to end, so each fixture runs 77 cases. Every case goes through
the adapter's middleware and its server helper.

Red, against the code the table was written for:

| adapter | source tested                     | failing rows | what failed                                                                                                                                                                                                                                                              |
| ------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| next    | base e93168ca                     | 5            | the query wins; detection off; every cookie attribute; `localeCookie: false` writes nothing; development drops Secure                                                                                                                                                    |
| nuxt    | lot A2 (28a9eb90), before the fix | 9            | `useTranslation(event)` only. The path wins (`expected { middleware: 'de', helper: 'uk' } to deeply equal { middleware: 'de', helper: 'de' }`), the query wins (helper 'uk' for 'fr'), and the path rows under detection off and in B8 (helper 'en' for the path locale) |

Green: 77/77 on both adapters after the nuxt helper reads the path prefix and `queryParam` in the
route middleware's order.

## examples:e2e

```
next (default)
framework  build  a   b   c   d   e   f   g   g2    h   i   j   k     k2    k3    l   m   n   o   p   q   r   s
next       ok     ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  skip  skip  ok  ok  ok  ok  ok  ok  ok  ok

next (--cdn)
framework  build  a   b   c   d   e   f   g   g2  h   i   j   k   k2  k3  l   m   n   o   p   q   r   s
next       ok     ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  skip

nuxt (default)
framework  build  a   b   c   d   e   f   g   g2    h   i   j   k     k2    k3    l   m   n   o   p   q   r   s
nuxt       ok     ok  ok  ok  ok  ok  ok  ok  skip  ok  ok  ok  skip  skip  skip  ok  ok  ok  ok  ok  ok  ok  ok

nuxt (--cdn)
framework  build  a   b   c   d   e   f   g   g2  h   i   j   k   k2  k3  l   m   n   o   p   q   r   s
nuxt       ok     ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  ok  skip
```

Every shard exited 0. The skips are the runner's own: `g2` and `k` to `k3` need `--cdn`, and
`s` runs without it.

## Docs probe

```
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| next      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| next      | connect-comvi | pass     | pass    | pass  | pass      | pass   |
| framework | page          | scaffold | install | build | typecheck | render |
|-----------|---------------|----------|---------|-------|-----------|--------|
| nuxt      | quick-start   | pass     | pass    | pass  | pass      | pass   |
| nuxt      | connect-comvi | pass     | pass    | pass  | pass      | pass   |
```

## The A2 rework (754ac9fd): zero aliases, one options normalizer

Owner decision of 2026-10-04, applied after A3. Every alias is gone: next's
`localeDetection.cookieName` and `cookieSecure`; nuxt's `detectBrowserLanguage` with its
`redirectOnFirstVisit` and `fallbackLocale`; nuxt's `fallbackLanguage`; and `useTranslation`'s
`namespace`, along with every alias warning. `normalizeRoutingOptions` in the locale-routing source
decides every name and default, and both packages call it.

Red, then green:

| test                                         | against                        | red text                                                                                     |
| -------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| next `tests/types/routing-options.test-d.ts` | cb7e9686 `middleware/types.ts` | `Type 'false' does not satisfy the constraint 'true'`, `Unused '@ts-expect-error' directive` |
| nuxt `tests/routing-options.test-d.ts`       | cb7e9686 `types.ts`            | `Unused '@ts-expect-error' directive` (×2)                                                   |

Removed source, lines deleted / added at 754ac9fd against cb7e9686:

| file                                                  | −   | +   |
| ----------------------------------------------------- | --- | --- |
| next `middleware/createMiddleware.ts`                 | 68  | 18  |
| next `middleware/types.ts`                            | 11  | 0   |
| nuxt `locale-options.ts` (the alias resolver)         | 104 | 1   |
| nuxt `types.ts`                                       | 166 | 27  |
| nuxt `runtime/server/utils/useTranslation.ts`         | 38  | 4   |
| nuxt `runtime/middleware/i18n.global.ts`              | 13  | 2   |
| locale-routing `src/index.ts` (the shared normalizer) | 0   | 198 |

The e2e shards and the docs probe were re-run on 754ac9fd with the same results as above: all
four shards exit 0, and every probe step passes.

## Lot A7: review fixes

- **Header names match whatever their case.** Nuxt's `useRequestHeaders` keys its result in lower
  case, so the route middleware never read `localeDetection.headerName: "X-Locale"`, while next and
  nuxt's `useTranslation(event)` match case-insensitively. A new contract row, "a configured
  header name matches whatever its case", failed on nuxt first, on the middleware only:
  `expected { middleware: 'de', helper: 'uk' } to deeply equal { middleware: 'uk', helper: 'uk' }`.
  The test mock now lowercases keys as Nuxt does, and the middleware reads the lower-case name.
  The table now has 33 rows; 78 cases per adapter pass.
- **`defineRouting` is declarative again.** Only `createMiddleware` reads `localeCookie`, and it
  normalizes it through the shared schema. The client rows are back at the base figures.
- **Smaller fixes.** There is one `NEXT_LOCALE_COOKIE` constant. Nuxt checks for unknown keys in
  BOTH `comvi` and `runtimeConfig.public.comvi`, each named in its own error. App config's
  `cookieName` is `false` when no cookie is kept. The page-cloning code reuses the normalized
  `localePrefix`. The ADR records that `useTranslation(event)` does not read a prefixless path as
  the default locale.
- **Re-run on A7:** all four e2e shards (next and nuxt, default and `--cdn`) exit 0 with every step
  ok, and the docs probe passes every step for next and nuxt.
- **Left as is:** a `NUXT_PUBLIC_COMVI_LOCALE_COOKIE` environment value over `localeCookie: false`
  reaches the runtime as a bare string, which the plugin and middleware read as an object with no
  `name`. A guard that maps the string onto a name needs the cookie defaults at runtime, so it is not
  a one-line change. Set `localeCookie` in `nuxt.config` instead, or override
  `NUXT_PUBLIC_COMVI_LOCALE_COOKIE_NAME` on a cookie that is on.

## Size (`node scripts/size-check.mjs`, min+gz)

| row                             | base e93168ca | A2–A5 (cb7e9686) | rework (754ac9fd) | A7      | budget  |
| ------------------------------- | ------------- | ---------------- | ----------------- | ------- | ------- |
| `fw-next-middleware-edge` (new) | 1695 B        | 1911 B           | 1997 B            | 1999 B  | 2097 B  |
| `fw-next-root-composed`         | 9807 B        | 9807 B           | 9911 B            | 9807 B  | 9923 B  |
| `fw-next-client-default`        | 7446 B        | 7450 B           | 7548 B            | 7450 B  | 7722 B  |
| `fw-next-server-default-loader` | 7816 B        | 7835 B           | 7938 B            | 7835 B  | 8207 B  |
| `fw-nuxt-client-default`        | 8483 B        | 8369 B           | 8369 B            | 8369 B  | 8718 B  |
| `fw-nuxt-full-composite`        | 12829 B       | 12798 B          | 12935 B           | 12935 B | 13270 B |

The edge row was observed red once at a 1 B budget. Its budget is measured + 5 % of the rework's
1997 B. On a first try the rework took `fw-next-root-composed` to 10071 B, over budget, because
`defineRouting` pulled the whole normalizer into client bundles. The normalizer was split per
option, and `defineRouting` calls only `normalizeLocaleCookie`. Lot A7 then made `defineRouting` declarative again, so it calls nothing from the schema and the
client rows are back at their base figures. The +19 B and +17 B on the two Next server rows are the longer `[@comvi/next]` prefix
and the reworded no-loader message.
