---
"@comvi/react": minor
"@comvi/solid": minor
"@comvi/next": patch
---

**`<I18nProvider fallback>` gates the first paint.** Neither provider used to gate it, each README prescribed a different loading gate, and every CDN quickstart as written painted raw keys once before the catalog arrived. `fallback` — `ReactNode` in react, `JSX.Element` in solid — renders instead of the children until the host is INITIALIZED, and the children replace it when initialization finishes. The axis is `isInitialized` (the same host state `useI18n().isInitialized` reads), deliberately not `isInitializing`: `init()` starts from an effect, after the first render, so a gate on "is it initializing" is open for exactly the frame the raw keys would paint in. With `autoInit: false` the gate therefore holds until the app calls `i18n.init()` itself. Both branches render inside the provider, so the fallback may use the hooks. React's server snapshot keeps its contract — `ssrInitialIsInitializing` is `false` by default, so a server render is never gated and the hydration render reads that same snapshot; solid has no such snapshot, so `renderToString` (where no effect runs) paints the fallback, hydrates it consistently, and swaps once the client host initializes. `fallback={undefined}` is the same as omitting it in BOTH bindings — the gate is
`fallback !== undefined`, so a wrapper that forwards its own optional prop does not turn into a
blank gate — while `fallback={null}` still is one. React's server render is not gated by default;
pass `ssrInitialIsInitializing={true}` beside `fallback` to gate it, which is the recipe for a
server render whose catalog is not in yet (`@comvi/next` passes `false` for you, so a `fallback`
there is a post-hydration gate only). Purely additive — omit the prop and the rendered tree is
what it was. Svelte has no provider component and vue's equivalent is a `<Suspense>`-shaped question; both document the three-line `{#if $isInitializing}` / `v-if="isInitializing"` gate in their README instead of growing an API, which is sound there because both start init synchronously before the first paint.
