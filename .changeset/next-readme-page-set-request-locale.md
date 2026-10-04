---
"@comvi/next": patch
---

**The README quickstart's `page.tsx` now calls `setRequestLocale(locale)` too — the layout's call
does not cover the page, and without it the first load of `/en` was an HTTP 500.** A previous fix
added the call to the quickstart's layout fence and a probe that reads it, and that probe passed
while the page fence beside it still went straight to `await getI18n()`. React can begin rendering
the page while the layout is still awaiting its own `params`, so the page reached `getI18n()` with
React's per-request cache still empty — `packages/next/src/server/getI18n.ts` says so in a comment
("A page can render before its layout completes") and then throws
`[@comvi/next] Locale not set. Call setRequestLocale(locale) in your layout/page first, or configure
middleware.`

Observed, not reasoned. The six quickstart fences extracted verbatim into a Next App Router app
served `/en` as **HTTP 500** with that exact error — on `next@16.3.5` and on `next@15.5.9` alike, so
it was never version-specific. With the call added, `/en` and `/uk` are both **200** and render
`Hello, Server!` / `Привіт, Server!` with a clean server log.

The prose above the fences said "the layout calls it", which is what made the hole look closed; it
now says to call it at the top of **every** layout and page that later reaches a server helper, and
says why the layout's call is not a guarantee.

Docs only — no runtime change. **Pre-existing:** the page fence has never had the call.

`packages/next/tests/readme-inline-quickstart.test.ts` now reads the quickstart's **page** fence as
well as its layout fence, and asserts the call is there, that it comes from `@comvi/next/server`,
that it precedes `await getI18n()`, and that the page takes `locale` from its own `params`. The
probe was observed failing against the pre-fix README (2 failed / 4 passed) before it was kept.
Neither `pnpm check:snippets` nor `pnpm check:snippets:types` could have caught this: the fence
resolved every import and compiled clean, and what was missing was a statement, not a symbol — the
same blind spot the layout fix recorded.
