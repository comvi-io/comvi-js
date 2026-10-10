---
"@comvi/core": patch
---

`@comvi/core/rich-text` now re-exports `registerTagSyntax` alongside `prepareTranslation`. It is
the identical function `@comvi/core/tags` calls at import time to register `<tag>` syntax
ambiently for the plain string-API `t()`; `rich-text` still registers nothing on import, since
exporting the function is not calling it. This gives a caller who only has the pure `rich-text`
entry in hand an explicit, discoverable opt-in into ambient registration without needing to know
that the `@comvi/core/tags` subpath exists.
