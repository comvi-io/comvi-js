---
"@comvi/react": minor
"@comvi/solid": minor
---

**`<I18nProvider fallback>` gates the first paint.** Neither provider used to gate it, each README prescribed a different loading gate, and every CDN quickstart as written painted raw keys once before the catalog arrived. `fallback` — `ReactNode` in react, `JSX.Element` in solid — renders instead of the children while the host is initializing, and the children replace it when initialization finishes. It reads the provider's own `isInitializing` (react's `useIsLoading()` value, solid's signal), so a hand-rolled gate and this one cannot disagree, and both branches render inside the provider, so the fallback may use the hooks. On react's server-snapshot path `ssrInitialIsInitializing` decides, and it is `false` by default: `renderToString` is never gated. Purely additive — omit the prop and the rendered tree is what it was. Svelte has no provider component and vue's equivalent is a `<Suspense>`-shaped question; both document the three-line `{#if $isInitializing}` / `v-if="isInitializing"` gate in their README instead of growing an API.
