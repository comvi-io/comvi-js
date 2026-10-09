---
"@comvi/nuxt": minor
---

New module option `comvi.messages` — inline catalogs, so the two-line module-options floor
produces an app that can actually show a translation.

`NuxtI18nOptions` had no inline-catalog option at all. Without `i18nModule` the generated instance is
core's BASE instance, which has no loader, so an app that configured only `locales` and
`defaultLocale` had no way to get a catalog in and every key rendered as itself. The option takes
`I18nOptions["messages"]` verbatim — keys are `locale` or `"locale:namespace"` — and travels
through `runtimeConfig.public.comvi` into BOTH construction paths: the client runtime plugin and
each per-request server instance. A `i18nModule` factory receives it in its resolved options too, so
a composed instance that spreads `options` keeps it without doing anything.

```ts
// nuxt.config.ts — a complete working app, no comvi.i18n.ts file
comvi: {
  locales: ["en", "de"],
  defaultLocale: "en",
  messages: {
    en: { greeting: "Hello" },
    de: { greeting: "Hallo" },
  },
}
```

It is public runtime config, so it must stay JSON-serializable and must not hold anything
private. Additive: an app that loads its catalogs through a `i18nModule` loader is unaffected.
