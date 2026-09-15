---
"@comvi/vite-plugin": patch
---

Type generation now reads ICU apostrophe quoting the way the runtime does, so a quoted placeholder no longer becomes a required parameter. A message like `'{name}' stays literal` renders those five characters as text and consumes nothing, but the extractor still asked for a `name` string — the generated types demanded an argument the message would ignore, and a key whose placeholders are all quoted could not be called without inventing values. Quoted sections are skipped when scanning for placeholders and when matching braces, `''` is one literal apostrophe, and `'#'` opens a quote only inside a plural or selectordinal branch, where `#` is syntax.
