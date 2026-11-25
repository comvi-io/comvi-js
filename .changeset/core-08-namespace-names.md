---
"@comvi/core": minor
"@comvi/react": minor
"@comvi/vue": minor
"@comvi/solid": minor
"@comvi/svelte": minor
"@comvi/next": minor
"@comvi/nuxt": minor
---

In an app with generated types, a namespace name the schema does not declare is now a type error on the call that names it: `useI18n("acount")` in React, Vue, Solid, Svelte and a Next Client Component, `getI18n({ ns: "acount" })` and every name of `getI18n({ ns: ["account", "acount"] })` on the Next server, and `useTranslation(event, { ns: "acount" })` in a Nuxt server route. The message lists the declared names. Before, the typo compiled: `t` became `never` and the error showed at the first `t()` call as "This expression is not callable", and a misspelt second name in the `getI18n` list had no type error at all, only a failed load at run time. A variable of type `string` is no declared name either: with generated types, pass a declared name or a union of them. An app without generated types is unchanged: any string still compiles, in every form. The types of a correct call are the same as before, and nothing changes at run time. `@comvi/core` exports the type these signatures use, `NsArg<NS>`.
