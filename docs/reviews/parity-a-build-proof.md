# Next/Nuxt API parity, lots A2–A5 build proof

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

## Size (`node scripts/size-check.mjs`, min+gz)

| row                             | base e93168ca | after A2–A5 | budget  |
| ------------------------------- | ------------- | ----------- | ------- |
| `fw-next-middleware-edge` (new) | 1695 B        | 1911 B      | 1998 B  |
| `fw-nuxt-client-default`        | 8483 B        | 8369 B      | 8718 B  |
| `fw-nuxt-full-composite`        | 12829 B       | 12798 B     | 13270 B |
| `fw-next-server-default-loader` | 7816 B        | 7835 B      | 8207 B  |
| `fw-next-server-provider`       | 1896 B        | 1913 B      | 1991 B  |

The edge row was observed red once at a 1 B budget, then set to measured + 5 % (from 1902 B at
lot A2). The +19 B and +17 B on the two Next server rows are the longer `[@comvi/next]` prefix
and the reworded no-loader message.
