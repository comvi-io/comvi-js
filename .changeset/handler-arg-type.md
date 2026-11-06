---
"@comvi/react": patch
"@comvi/vue": patch
---

Without generated catalogs, a tag handler's argument is no longer narrowed by an annotation. In React the handler gets a React node (a Fragment of the tag's content), so `t("message", { strong: (children: string) => children.toUpperCase() })` compiled and then threw at run time; in Vue a handler gets a string only for text-only content and a list of children around nested tags. The types now refuse the narrower annotation; an inline handler still gets its argument type, and one annotated `ReactNode` (React) or `Children` (Vue) is accepted.
