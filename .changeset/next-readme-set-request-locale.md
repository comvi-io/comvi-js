---
"@comvi/next": patch
---

**The README quickstart now calls `setRequestLocale(locale)`, without which it threw on first
render.** Both quickstart layouts read `locale` from `params` and rendered, and the page then called
`await getI18n()` — which reads the request locale from React's per-request cache and rejects with
`[comvi/next] Locale not set. Call setRequestLocale(locale) in your layout/page first, or configure
middleware.` when nothing filled it. Step 1 has no middleware, so nothing did. The name appeared
nowhere in the README, not even in the `/server` entry's export list, while
`examples/next/src/app/[locale]/layout.tsx` has called it all along.

Docs only — no runtime change. **Pre-existing:** the base the wave-5 restructure started from
(`7860364`) had no `setRequestLocale` either, so this is wave 4's hole carried forward rather than a
wave-5 regression.

`packages/next/tests/readme-inline-quickstart.test.ts` now reads the quickstart's layout fence and
asserts the call is there, and that it comes from `@comvi/next/server`, before the provider renders.
Neither `pnpm check:snippets` nor the type-checker could have caught this: the fence resolved every
import and compiled clean, and what was missing was a statement, not a symbol.
