---
"@comvi/svelte": minor
---

Drop Svelte 4; migrate to Svelte 5 runes only.

**BREAKING:** `@comvi/svelte` now requires Svelte 5 (`peerDependencies.svelte` is `^5.0.0`). Svelte 4 is no longer supported — stay on the previous minor if you need it.

- `<T>` (`T.svelte`) is rewritten with runes (`$props()`, `$derived`/`$derived.by`, `{@render children()}`) so it compiles cleanly under both runes-default and global `runes: true` consumers, with no deprecation warnings. The previous legacy syntax (`export let`, `$:`, `$$props`, `$$slots`, `<slot>`) broke under `compilerOptions.runes: true`.
- Explicit-prop forwarding semantics for `ns`/`locale`/`fallback`/`raw` are preserved via an internal sentinel (replacing the removed `$$props`), guarded by a characterization test.
- `<T>` now injects safe defaults for `{@html}` output: `rel="noopener noreferrer"` on `<a target="_blank">` and an empty `alt=""` on `<img>` without one.
- New exported type `TProps` for the `<T>` component props.
- Docs/examples use Svelte 5 idiom (`onclick`/`onchange`, `$state`, `{@render}`); added an SSR (SvelteKit) section documenting the per-request instance pattern and `await i18n.init()`.
- Build no longer runs a redundant `tsc --emitDeclarationOnly` pass (`svelte-package` emits complete declarations); `svelte-preprocess` replaced with `vitePreprocess`. No change to published output.
- Stores (`useI18n`, `createLocaleStore`, etc.) are unchanged — `svelte/store` remains fully supported in Svelte 5.
