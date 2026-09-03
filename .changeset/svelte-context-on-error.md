---
"@comvi/svelte": minor
---

`setI18nContext(i18n, { onError })` reports a failed auto-init.

The auto-init runs in a microtask that nothing in the component can await, so an `init()`
rejection — an unreachable CDN, a bad distribution id — used to be swallowed by the binding.
`onError` is the per-app hook react's and solid's providers already expose as a provider prop:

```svelte
setI18nContext(i18n, { onError: (error) => reportToSentry(error) });
```

The host's own `createI18n({ onError })` handler still reports the failure first, with
`{ source: "init" }`. Without an `onError` the rejection stays swallowed, exactly as before.
