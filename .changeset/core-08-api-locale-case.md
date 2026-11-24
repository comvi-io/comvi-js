---
"@comvi/core": patch
---

`api()` loads a locale the platform answers in another case: `locale: "pt-br"` now renders the `pt-BR` catalog the platform returns instead of failing with `[@comvi/core/cdn] pt-br/<ns> is not in the response` and rendering the parent or fallback locale. A key with the exact spelling still wins; two keys that differ only in case, with neither spelled exactly, are still refused with that error.
