---
"@comvi/svelte": minor
---

**BREAKING** (types only) — with generated catalogs, `t()` of `useI18n()` no longer takes a key whose message has tags: `t("terms", { link: (c) => … })` is now a type error on the key, as a key the catalog lacks is, and the rich text goes through `<T>` with `components` or a snippet of the tag's name (`<T i18nKey="terms">{#snippet link(children)}<a href="/terms">{children}</a>{/snippet}</T>`). A key with no tag, its params, `{ ns }`, `{ locale }` and `{ markers }` type as before, and `t()` still returns a string. Without generated catalogs nothing changes: any key compiles and a tag handler's output joins into the string. The runtime is unchanged.
