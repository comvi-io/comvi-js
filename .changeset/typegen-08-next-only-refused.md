---
"@comvi/next": patch
"@comvi/cli": patch
"@comvi/vite-plugin": patch
---

Generated types no longer augment `@comvi/next`, which has no root module: in an app declaring only `@comvi/next` the declaration attached to nothing (TS2882, hidden by Next's `skipLibCheck: true`) and every key compiled. `withComvi({ types })`, `comvi typegen` and `comviTypes()` now refuse such an app, say that `@comvi/next` has no root module and name the packages to declare. With the `@comvi/next` install (`npm install @comvi/next @comvi/react @comvi/core`) the types augment `@comvi/core`, and both the server `getI18n().t` and the client `useI18n()` reject an unknown key. An app that also declares `@comvi/react` or `@comvi/core` is unchanged.
