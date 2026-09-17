---
"@comvi/core": patch
"@comvi/next": patch
"@comvi/nuxt": patch
"@comvi/plugin-fetch-loader": patch
"@comvi/react": patch
"@comvi/solid": patch
"@comvi/svelte": patch
"@comvi/vue": patch
---

Docs: the CDN endpoint is named what the dashboard names it. "Distribution id" was terminology the
product does not have — the dashboard shows a **CDN Endpoint** card holding the endpoint as a full
URL with a **Copy URL** button, and the path segment is an opaque per-project token assembled
server-side. So the old placeholder `https://cdn.comvi.io/your-distribution-id` was wrong in shape
as well as in name: it asked the reader to assemble a URL out of a part they were never handed,
when what is in their clipboard is the whole thing. Every README now shows the complete endpoint
and says to paste what the card gives them; the `@example` doc comments on `fetchLoaderPlugin` and
`cdnLoaderPlugin` match. The navigation was already correct and is unchanged. 23 occurrences across
12 files, comments only in the two `.ts` files.

The root README's quick start is also runnable for the first time, which is a repository-surface
change rather than a package one: step 1 gained the `npm create vite` scaffold it never had (its
fence imports `react-dom/client`, and `@comvi/react` peer-depends on `react` only, so following the
README alone ended in `ERR_MODULE_NOT_FOUND`), gained the `src/App.tsx` that actually calls `t()`
instead of describing it in prose, and closes with the dev command and the literal strings to
expect. Step 2 now rewrites `src/main.tsx` as one copy-pasteable fence, matching the docs site
instead of inventing a second project shape around a new `src/i18n.ts`.
