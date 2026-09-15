---
"@comvi/core": patch
---

A catalog built with `Object.create(null)` is now flattened like any other nested catalog.

Such a catalog used to be adopted whole on the strength of its missing prototype, so a nested
one was stored with an object where a string belonged: `t("nav.home")` answered with the key and
`t("nav")` threw. An already-flat prototype-less catalog is still adopted without a copy.

Extension syntax inside a plural or select branch is now parsed exactly as it is at the top level.

Only `{`, `<` and `'` used to send a selected sub-message back through the parser, so a branch of
plain text kept `&amp;` escaped while the same text one level up rendered `&` — and adding a
parameter to the branch changed the entity's rendering. The parser's syntax characters are now one
shared list. A bare `&` is not one of them: it is ordinary copy, so "Terms & Conditions" in a
branch costs exactly what it did before, while `&amp;` and `&#38;` are decoded.

ICU exact plural selectors are now matched as numbers, and a non-numeric one is rejected.

`{n, plural, =1.0 {…} one {…} other {…}}` with `n = 1` used to render the `one` branch, because
the selector was compared as the string it was written as. `=1.0` and `=01` are now both the
`n = 1` branch. Where two selectors name the same number — `=1.0` and `=1`, or `=-0` and `=0` —
the one written last wins, as two identical selectors always did.

Explicit selectors are now held to ICU's grammar, which is a sign, digits and at most one
fractional part. This is a behaviour break on values that are not ICU numbers but happened to
match before, because the old comparison was a plain string match against `String(count)`:
`=Infinity` with `n = Infinity` matched and now does not. `=Infinity`, `=0x1`, `=1e3`, `=+1`,
`=.5`, `=1.` and `=abc` all raise `E_ICU_SYNTAX` when the catalog is ingested in development, and
in production render the argument as written and report once, like every other unsupported ICU
argument. Write the branch as a plain number, or move the special case into `select`.

A closing tag written inside ICU-quoted literal text no longer ends the tag around it.

The closing-tag scanner skipped backslash escapes but not apostrophe quoting, so
`<b>'{x </b> y}'</b>` rendered `{x y}'</b>` instead of the literal `{x </b> y}` inside the bold
tag. It now skips quoted sections through the message parser's own helper, in the same
`#`-is-syntax context the tag was parsed in.

An apostrophe whose own quote never closes is treated as the literal it looks like, so elision
before a placeholder keeps working. `<b>l'{name}</b>` in French and `dell'{item}` in Italian are
ordinary copy, and ICU's rule that an unmatched apostrophe quotes to the end of the message would
have left the tag unclosed and shown its markup as text. The judgement is made per apostrophe, so
a balanced quote in the same message still protects a `</b>` inside it.

Catalog ingestion now enumerates own locale keys only.

`addTranslations` and the `translation` option walked the prototype chain of the outer
`{ locale: catalog }` map, so a map built on a prototype carrying locale entries had those
adopted as if they had been passed in.
