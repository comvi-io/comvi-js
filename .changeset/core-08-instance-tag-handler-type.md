---
"@comvi/core": minor
---

With generated catalogs and a binding installed, a tag handler of the instance's own `i18n.t()` (and of the `t` that `i18n.ns(name)` returns) is now typed with `RichParts`, the list of parts the core passes it: `i18n.t("terms", { link: (children) => children.join("") })` compiles in a React, Next, Vue, Nuxt, Solid or Svelte app. In Nuxt this covers the server's `useTranslation().t` too, which receives the same list. Before, the handler took the binding's type (`ReactNode` in React), so using the list was a type error.

What stops compiling: in a React, Next, Vue, Nuxt or Solid app with generated catalogs, a handler of the instance's `i18n.t()` that uses its argument as the binding's node, such as `(c) => <a>{c}</a>`, `h("a", c)`, a handler annotated `(c: ReactNode)`, or a handler typed with the exported `Tag`, compiled before and is a type error now. It already was one in an app without generated catalogs. The argument is the list of parts: to render a tag as a node, call `useI18n().t` or `<T>`, whose handlers keep the binding's type (one React node in React). Nothing changes at run time.
