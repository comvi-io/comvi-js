---
"@comvi/nuxt": minor
---

The `comvi.setup` context now hands you the instance directly as `core`.

`context.i18n` is a union — a `VueI18n` in the app plugin, the instance itself in a server utility —
so every capability call needed a `'core' in i18n` narrowing first, even though the JSDoc example
did not show one. `core` is that instance on both runtimes:

```ts
export default (({ core }) => {
  core.registerLoader(myLoader);
}) satisfies NuxtI18nSetup<I18n & I18nLoaderApi>;
```

`i18n` is unchanged, so existing hooks keep working.
