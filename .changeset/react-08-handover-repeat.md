---
"@comvi/react": minor
"@comvi/core": minor
---

`<I18nHandover catalogs locale>` now treats a server payload the same way on every render. A slot this handover handed over before becomes the new catalog: a key the server no longer has is gone, and an empty catalog empties the slot. A slot it hands over for the first time is still layered over what the instance had, and `add()` is still a patch. A `null` slot fails the pair and aborts a load of that pair in flight, so a late answer cannot restore the catalog. The handover's own locale switch keeps the failures the payload brought, while `setLocale()` and `load(ns)` still ask for them again. The core's internal seam does this; there is no new public API. With no binding registered, a rich-text `Tag` handler's argument is now typed as the rich parts the core passes (`RichParts`), not `any`.
