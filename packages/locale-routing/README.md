<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="../../.github/assets/header-logo-dark.png">
    <img alt="Comvi" src="../../.github/assets/header-logo-light.png" width="860">
  </picture>
</p>

<h1 align="center">locale-routing (internal)</h1>

<p align="center">The one copy of Comvi's locale-routing primitives. A private workspace package — it is never published.</p>

---

> **Workspace-private.** `"private": true` in `package.json`, and in the `ignore`
> list of `.changeset/config.json`. There is no npm package, no version to
> install, and no compatibility promise: this directory exists so the routing
> rules live in ONE place instead of two.

## Who uses it, and how

| Consumer      | Mechanism                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@comvi/next` | **Inlined at build time.** Absent from the rolldown `external` list in `packages/next/vite.shared.ts`, so the module is emitted into next's `dist` |
| `@comvi/nuxt` | **Vendored.** `nuxt-module-build` transpiles `src/runtime/` file by file and leaves bare specifiers alone, so there is nothing to inline with      |

Nuxt's copy is generated and committed:

```bash
pnpm --filter @comvi/nuxt vendor
```

That writes `packages/nuxt/src/runtime/_vendor/locale-routing.ts` from
`src/index.ts`. Edit this package, run that command, commit both — the copy must
be in the published tarball and must exist on a fresh clone before
`nuxt-module-build` runs. `packages/nuxt/tests/vendor-parity.test.ts` fails if
the two ever disagree, and names the command in its failure message.

## What consumers use instead

The public routing API for Next.js is three subpaths of `@comvi/next`:
`@comvi/next/routing` (`defineRouting`, `hasLocale`, `createGetPathname`),
`@comvi/next/navigation` (`Link`, `usePathname`, `useLocalizedRouter`) and
`@comvi/next/middleware` (`createMiddleware`). For Nuxt it is the module's own
auto-imported composables: `useLocalePath`, `useLocaleRoute`,
`useSwitchLocalePath`, `<NuxtLinkLocale>`.

## Semantics this package pins

- Locale matching is **segment-based**: `/ensemble` never matches locale `en`.
- Trailing slashes are **preserved**: `/de/` → `/`, `/de/about/` → `/about/`.
- Inputs are normalized to a leading slash; interior bytes are never rewritten.

Its own tests (`pnpm --filter @comvi/locale-routing test`) are where those rules
are pinned; next's and nuxt's tests pin the adapters over them.

## License

[MIT](https://github.com/comvi-io/comvi-js/blob/main/LICENSE) © Comvi
