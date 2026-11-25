---
"@comvi/core": patch
---

With generated catalogs and a binding installed, a tag handler of the instance's own `i18n.t()` (and of the `t` that `i18n.ns(name)` returns) is now typed with `RichParts`, the list of parts the core passes it: `i18n.t("terms", { link: (children) => children.join("") })` compiles in a React, Vue, Solid, Svelte or Next app. Before, the handler took the binding's type (`ReactNode` in React), so using the array was a type error. The `t` of `useI18n()` and `<T>` keep the binding's type (one React node in React). Nothing changes at run time.
