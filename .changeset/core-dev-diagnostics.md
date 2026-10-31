---
"@comvi/core": patch
---

Development diagnostics. The `syntax` report of an unclosed `<br>` now says to write `<br/>`, and that `<br/>` renders nothing without a `br` handler or `components` entry; the message still renders its key, and production is unchanged. The default development reporter prints a `load_failed` with its namespace and cause, as `[@comvi/core] load_failed (de, namespace "shop"): 404 shop`, so two namespaces failing in one locale no longer print the same line. The `I18nError` shape and other codes' output are unchanged.
