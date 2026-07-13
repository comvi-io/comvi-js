---
"@comvi/core": minor
---

ICU apostrophe handling switched to DOUBLE_OPTIONAL mode (same as ICU4J, FormatJS, i18next and Tolgee):

- A bare `'` starts quoted literal text only when it immediately precedes a syntax character. Everywhere else it is literal, so real-world content like `Superiors' behavior`, a trailing `l'` or `Gib' eine Bewertung` inside a select branch no longer breaks parsing or loses characters.
- `{` and `}` are syntax characters everywhere; `#` counts as one only inside plural/selectordinal sub-messages (including select sub-messages nested in them), exactly like ICU4J. At the top level and in standalone selects `'#'` stays two literal characters.
- `''` still collapses to a literal apostrophe, and `'{...}'` still escapes ICU syntax.
- Plural/select branches that contain apostrophes but no `{`/`<` are now routed through the parser too, so `''` inside a flat branch renders as `'` instead of leaking the doubled apostrophe.
- Fixed a template-cache bug where a message whose parsed output differs from its source (quoting, `&lt;`, `\<`) was flagged static after the first render and returned raw (with quoting artifacts) on every subsequent `t()` call.
- Context-sensitive template and plural-choice caches now namespace both parser modes, preventing control-character-prefixed source text from colliding with internal cache markers.

Behavior change: previously `o' clock` rendered as `o clock` (the bare apostrophe opened a quoted section). It now renders as `o' clock`. Messages relying on single-quote hiding of arbitrary text must either double the apostrophes or quote ICU syntax characters directly.
