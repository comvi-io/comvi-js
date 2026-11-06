---
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
---

Without generated catalogs, a tag handler's argument is no longer narrowed by an annotation. `t("message", { strong: (children: string) => children.toUpperCase() })` compiled and then threw at run time: React passes a Fragment, Solid a list of parts, and Vue a list around nested tags. In Svelte the same holds for `<T>`, whose handler gets a list once a nested tag renders through `components`; Svelte's text `t()` keeps string handlers, and a snippet of a tag's name keeps its text `children` (with generated catalogs too). The types now refuse the narrower annotation; an inline handler still gets its argument type, and one annotated `ReactNode` (React), `Children` (Vue, Svelte) or `JSX.Element` (Solid) is accepted.
