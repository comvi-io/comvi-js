---
"@comvi/core": patch
---

Without generated catalogs, `i18n.t()` types a tag handler's argument as `RichParts`, the list of parts the core passes it: `t("terms", { link: (children) => children.join("") })` needs no annotation under strict TypeScript, and `(children: string) => …`, which compiled and then got an array, is refused. A param value of type `unknown` is refused too, since it may be such a handler: give the params a concrete type (text values, a handler, or an object). The bindings' own `t()` are unchanged.
