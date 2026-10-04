---
"@comvi/core": patch
---

The development catalog preflight no longer warns about tag syntax on a host that has not
registered a tag extension.

Adding a catalog with `"Hi <b>{name}</b>"` in it used to print
`[@comvi/core] Tag syntax in "…" is rendering as literal text: no tag extension claims "<". Render it
with your framework's <T> component …` for every such entry, at `addMessages` time. In an app
that renders those strings through `<T>` / `prepareTranslation` — which hands the tag grammar to
core per call and registers nothing on the host — that advice was telling the user to do exactly
what they were already doing, once per catalog entry, on every load. Because the warning dedupes
per template, it also consumed the one warning the render path would have emitted if a `t()` call
really had rendered the markup literally.

What still warns, unchanged: a `t()` call that renders tag markup as literal text, once per
template, naming both fixes; and, on a host that imported `@comvi/core/tags`, a tag the extension
refuses for carrying attributes. The preflight keeps raising `E_ICU_SYNTAX` at ingestion for an
argument the host's compiler cannot compile — that verdict does not depend on how the string is
rendered. All of this is development-only; production bundles are unaffected.
