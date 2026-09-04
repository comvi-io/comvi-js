---
"@comvi/core": patch
---

The development warning for a tag that renders as literal text no longer tells you to import a
module you already imported.

Tag syntax accepts `<b>` and `<b/>` but not attributes, so `t('see <a href="/x">docs</a>')` leaves
the `<a>` unclaimed and it renders verbatim. The warning explained that as "no tag extension
claims `<`" and prescribed `import "@comvi/core/tags"` — advice that could not help an app whose
whole problem was that the extension was present and had refused the tag.

When the tag extension is registered and the refused tag carries attributes, the warning now says
so, and points at the fix that works:

```
[i18n] Tag syntax in "see <a href="/x">docs</a>" is rendering as literal text: attributes are
not supported in tag syntax; pass them via the `components` config (`{ tag: "a", props: { href } }`).
```

An app with no tag extension registered still gets the original message. Development only, and
the production bundle is byte-identical.
