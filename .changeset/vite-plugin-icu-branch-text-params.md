---
"@comvi/vite-plugin": patch
---

**Text inside a plural or select branch is no longer generated as a required
parameter.** The extractor scanned every `{…}` in a message, so the branch
bodies of an ICU argument became parameters of their own:

```jsonc
// en.json
{ "greeting": "{gender, select, male {he} other {they}}" }
```

```ts
// generated before: he and they are not parameters, and strictParams made
// them required — so every call site failed to typecheck
"greeting": { "gender": string; "he": string; "they": string };

// generated now
"greeting": { "gender": string };
```

The same happened to any plural whose branches are words rather than `#…`:
`{count, plural, one {item} other {items}}` produced `item` and `items`.

Only branch text changes. An argument whose type the extractor does not
recognise, such as `{x, wobble, other {a}}`, still contributes no parameter of
its own — as before — and now no longer contributes the `a` from its branch
either.

Placeholders that really are nested inside a branch are still found:
`{count, plural, other {# of {total}}}` keeps both `count` and `total`.

Re-run your build to regenerate the declaration file. If your code passes the
phantom parameters today, those arguments become excess properties and can be
deleted.
