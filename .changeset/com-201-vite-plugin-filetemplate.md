---
"@comvi/vite-plugin": patch
---

A `fileTemplate` without `{namespace}` (`{languageTag}.json`, `{languageTag}/messages.json`) generated keys like `"undefined:hello"`, so the typed keys never matched. Such a template is one catalog per locale: its keys now land in `defaultNs` (default `"default"`), the same as root files under the default template.
