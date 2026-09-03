---
"@comvi/svelte": minor
---

`<T>` now takes interpolation params as direct props, the way `@comvi/react`'s `<T>` always has.

```svelte
<T i18nKey="cart.items" count={2} name="Ada" />
```

Anything that is not one of `<T>`'s own props (`i18nKey`, `params`, `ns`, `locale`, `fallback`,
`raw`, `components`, `children`) is passed to the translation as a param, so a one-value message
no longer needs a `params={{ … }}` object. `params` still works and can be combined with direct
props; on a name collision the direct prop wins, matching react. A direct prop whose value
changes re-renders the translation.
