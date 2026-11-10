---
"@comvi/core": patch
---

Without generated catalogs, `i18n.t()` types a tag handler's argument as `RichParts`, the list of parts the core passes it: `t("terms", { link: (children) => children.join("") })` needs no annotation under strict TypeScript, and `(children: string) => …`, which compiled and then got an array, is refused. The params contract is now exact: a value is text (`string`, `number`, `bigint`, `boolean`, `Date`, `null`, `undefined`, or a list of them), a handler of `RichParts`, or an object that is not a function. `Record<string, string | number>` passes; `Record<string, unknown>` is refused, because an `unknown` value may be a handler that expects a string. Type a dictionary built at run time with the new `CoreUntypedParams` export: `const params: CoreUntypedParams = { name }; params.count = 2; i18n.t("key", params);`; that call is typed `string | RichParts`, because the dictionary may hold a tag handler. The bindings' own `t()` are unchanged.
