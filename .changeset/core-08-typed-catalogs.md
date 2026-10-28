---
"@comvi/core": minor
"@comvi/react": minor
---

Types for generated catalogs (typegen v2): a binding registers what a tag handler receives in the new `TagChildren` interface, and `@comvi/react` registers `ReactNode`, so with a generated `comvi.d.ts` an inline `(chunks) => <a>{chunks}</a>` needs no annotation (it was `any`). `@comvi/react` re-exports `Catalogs` and `Tag`, which a generated file that augments `@comvi/react` imports. Without generated catalogs, `t()` with an object or function param is typed `string | RichParts`, which is what it can return; calls whose params are all printed as text stay `string`. No runtime change: production bundles are byte-identical.
