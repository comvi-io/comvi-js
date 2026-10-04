# `<T>` renders structurally; string-API tags are a separate, ambient opt-in

Status: accepted · Date: 2026-09-14 · Owner decision(s): 0.5.0 rich-text/tags split

## Context

A sentence with a link in the middle of it has to stay one translation unit, or translators get
fragments they cannot order. Doing that with an HTML string means a sanitiser in the render path and
an escape hatch someone will forget. It also raises a separate question: should a plain
`t("Click <b>here</b>")` parse those tags at all? One mechanism cannot answer both, because `<T>`
knows its tag map per call while `t()` returns a string and has nowhere to put one.

## Decision

- **`<T>` renders structurally**, from real nodes built out of the parsed translation tree. There is
  no HTML-string sink in the path, so no sanitiser to configure and no escape hatch to forget: a
  translator can only produce text and the tags the app mapped, and an unmapped tag falls back to
  its inner text.
- **`<T>` registers nothing.** It goes through the pure `@comvi/core/rich-text` path, which takes
  the tag grammar per call, so rendering it never changes what `t()` does with `<b>` markup.
- **Making `t()` parse tags is a separate opt-in, `import "@comvi/core/tags"`**, and it is a
  property of the BUNDLE: the grammar registers process-wide and retroactively, including for
  instances built before the import ran. There is no per-instance opt-out.
- **No framework entry re-exports `@comvi/core/tags`.** A named re-export of a side-effectful module
  would put a process-wide grammar change one autocomplete away from a reader who wanted a
  component.
- **Without a tag extension, markup stays literal** — dev warns once per template, production stays
  quiet. A literal `<b>` is visibly broken in review, whereas a wrong plural is not.
- **The tag grammar's escapes travel with it.** `&lt;`, `&gt;`, `&amp;` and `\<` are decoded only
  where `<` is syntax.

## Consequences

Each binding maps tags with its own idiom, and a map built outside the template is typed as
`ComponentMap` in all four. `tagInterpolation: { strict: "warn" }` on `createI18n` catches
translations referencing tags the app forgot to handle, before they ship.

**A tags-less graph returns markup and escapes verbatim**, so the two mechanisms are never confused
for one:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  messages: { en: { hi: "Hi, <b>{who}</b>!", legal: "a &lt;b&gt; &amp; c" } },
});

i18n.t("hi", { who: "Alice" }); // "Hi, <b>Alice</b>!"  — with a tag extension: "Hi, Alice!"
i18n.t("legal"); // "a &lt;b&gt; &amp; c"           — with a tag extension: "a <b> & c"
```

Tag parsing returns the moment an extension is in the graph: `import "@comvi/core/tags"` for the
ambient registration, `registerTagSyntax` from `@comvi/core/rich-text` to opt into the same thing
explicitly beside `prepareTranslation`, or `tagInterpolation.extensions` per call. **An SSR app has
two bundles and must import the ambient module in both.** ICU apostrophe quoting is not part of
this: `'{literal}'` and `''` are core grammar and work on every graph.

**Non-primitive parameter values are a separate axis** and behave identically on every graph: `t()`
always returns a string, coercing the parts, and `tRaw()` preserves them as a parts array.

**`<T skipPostProcess>` skips post-processors for one call**, notably the in-context editor's
invisible markers. `raw` is the same prop under its 0.4 name: deprecated, one development warning,
removed in 0.6 — and in Vue and Svelte template markup it is a by-hand rename.

## Alternatives rejected

- **One mechanism for both** — `t()` has nowhere to carry a per-call tag map, so unifying them meant
  making the ambient grammar the only grammar.
- **HTML passthrough with a sanitiser** — keeps a markup sink in the render path and an option to
  get wrong. There is no sink at all instead.
- **A per-instance opt-out for ambient tags** — the registration is a property of the bundle; a flag
  pretending otherwise would be a lie on every host built before the import ran.
- **Re-exporting `@comvi/core/tags` by name from a framework entry** — puts a process-wide side
  effect next to component exports in autocomplete.
- **Throwing on literal markup in production** — a visibly literal `<b>` is cheaper than a crash,
  and unlike a plural it cannot read as correct.

## Where it lives

- pure toolbox: `prepareTranslation`, the VirtualNode types, `registerTagSyntax`,
  `tagSyntaxExtension` — `packages/core/src/rich-text.ts`; ambient registration —
  `packages/core/src/tags.ts` and `packages/core/src/register-tags.ts`
- the tag parser, escapes and `tagInterpolation.strict` — `packages/core/src/core/translate/tags.ts`
- `<T>` per binding — `packages/react/src/T.tsx`, `packages/solid/src/T.tsx`,
  `packages/svelte/src/T.svelte`, `packages/vue/src/components/T.ts`

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Formatting](formatting.md) ·
  [Limitations](limitations.md)
