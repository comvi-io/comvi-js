---
"@comvi/plugin-in-context-editor": patch
---

The in-context editor's placeholder check no longer invents a `{name` variable for `{{name}}`.

`validateTranslations()` compares the placeholders of each plural form against the first form and
warns when they differ. It extracted `{{name}}` with two patterns at once: the double-brace one
gave `name`, and the single-brace one — whose name class allowed an opening brace — also matched
the inner `{name}` of the doubled pair and gave `{name`. Every double-brace placeholder therefore
counted twice, once under a name that does not exist.

Two visible consequences, both fixed:

- A translation written `{{name}}` in one form and `{name}` in another was reported as a
  mismatch: `Placeholders differ from the first form; missing: {name`. Those are the same
  variable, and no warning is raised now.
- A genuine mismatch between two double-brace forms listed each variable twice, as
  `missing: name, {name; unexpected: nom, {nom`. It now names `name` and `nom` once each.

The single-brace pattern excludes braces from the variable name, which makes it match the inner
`{name}` of `{{name}}` on its own, so the separate double-brace pattern is gone.
