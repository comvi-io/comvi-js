---
"@comvi/next": patch
---

`NextRoutingOptions.locales` is now `readonly string[]`, so `defineRouting`'s own output can be
spread into `createNextI18n`.

Every other locale list in the package was already readonly — `RoutingConfig.locales`,
`hasLocale`, and the middleware helpers — and nothing ever mutated this one. Demanding a mutable
array made the package's documented composition uncompilable:

```ts
const routing = defineRouting({ locales: ["en", "de"], defaultLocale: "en" } as const);
createNextI18n({ ...routing, translation }); // TS2345 before this release
```

It also rejected the `as const` locale tuple `hasLocale(routing.locales, locale)` needs for
narrowing. Type-level only: no runtime behaviour changes, and a mutable `string[]` is still
accepted, so nothing that compiled before stops compiling.
