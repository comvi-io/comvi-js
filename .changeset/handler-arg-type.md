---
"@comvi/react": patch
"@comvi/vue": patch
"@comvi/solid": patch
"@comvi/svelte": patch
---

Without generated catalogs, a tag handler's argument is no longer narrowed by an annotation. `t("message", { strong: (children: string) => children.toUpperCase() })` compiled and then threw at run time: React passes a Fragment, Solid a list of parts, and Vue a list around nested tags. Svelte's text `t()` keeps string handlers (its handler gets the tag's text); Svelte's `<T>` takes no handler at all (`.changeset/svelte-t-snippets.md`). The types now refuse the narrower annotation; an inline handler still gets its argument type, and one annotated `ReactNode` (React), `Children` (Vue) or `JSX.Element` (Solid) is accepted.
