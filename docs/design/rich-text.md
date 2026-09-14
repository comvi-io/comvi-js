# Rich text: `<T>` renders structurally, and `t()` tags are a separate opt-in

Design note. The package READMEs show the `components` shape for each framework. This file is why
there are two mechanisms rather than one, and what the difference costs.

The host is the object `createI18n` returns: it holds the catalog, the current locale and `t()`.

## Components inside a sentence, without an HTML sink

Embed components inside translation strings without raw HTML, without unsafe DOM injection, and
without splitting a sentence across several template fragments. Translators see clean markup, and
you control the rendering.

```json
{ "help": "Click <link>here</link> for support, or <bold>read the docs</bold>." }
```

`<T>` renders the translation **structurally**: real nodes built from the parsed translation tree,
with no HTML-string sink anywhere in the path. A translator can only ever produce text and the tags
you mapped; a tag with no mapping falls back to its inner text. That is the whole XSS story — there
is no sanitiser to configure and no escape hatch to forget, because no code path ever turns a
translation into markup.

Each binding maps tags with its own idiom, and each README shows its own:
[react](../../packages/react/README.md), [vue](../../packages/vue/README.md),
[solid](../../packages/solid/README.md), [svelte](../../packages/svelte/README.md).
React takes elements to clone, vue takes named slots, solid takes functions, svelte takes tag names,
components or `{ tag, props }` configs. A map built outside the template is typed as `ComponentMap`
in all four.

`tagInterpolation: { strict: "warn" }` on `createI18n` catches translations referencing tags you
forgot to handle, before they ship.

## Two mechanisms, and the ambient one is the loud one

`<T>` is self-contained: it renders through the pure `@comvi/core/rich-text` path, which takes the
tag grammar per call and registers nothing. Rendering it never changes what a plain `t()` does with
`<b>` markup.

Making `t("Click <b>here</b>")` itself parse tags is a separate, ambient opt-in:
`import "@comvi/core/tags"` once.

That import registers the tag grammar **process-wide and retroactively**: it is a property of the
bundle, not of one host, so every instance in the graph, including ones built before the import was
evaluated, starts parsing `<tag>` markup the moment the module runs. There is no per-instance
opt-out. An SSR app must therefore import it in the **server** graph too, or the same string renders
literally on the server and with markup on the client.

No framework entry re-exports `@comvi/core/tags`, and that is deliberate: a named re-export of a
side-effectful module would put a process-wide grammar change one autocomplete away from a reader
who wanted a component.

## Tags-less graphs: markup stays literal

In any graph without a tag extension (the base host, with or without `/icu`), `<tag>…</tag>` is not
syntax. It stays in the output as literal text:

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { hi: "Hi, <b>{who}</b>!" } },
});

i18n.t("hi", { who: "Alice" }); // "Hi, <b>Alice</b>!"  — with a tag extension: "Hi, Alice!"
```

Development warns once per template that the markup is rendering literally. Production stays literal
and never throws: a literal `<b>` is visibly broken in review, whereas a wrong plural is not.

The tag grammar's **escapes travel with it**: `&lt;`, `&gt;`, `&amp;` and `\<` are decoded only
where `<` is syntax. With no tag extension there is nothing to escape from, so they are ordinary
characters and `t()` returns them verbatim.

```ts
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  translation: { en: { legal: "a &lt;b&gt; &amp; c" } },
});

i18n.t("legal"); // "a &lt;b&gt; &amp; c"  — with a tag extension: "a <b> & c"
```

ICU apostrophe quoting is **not** part of that: `'{literal}'` and `''` are core grammar and work on
every graph, the bare base host included.

Tag parsing comes back the moment a tag extension is in the graph:
`import "@comvi/core/tags"` for ambient registration, or `tagInterpolation.extensions` per call.

## Non-primitive parameter values are a separate axis

They behave identically on every graph: `t()` always returns a string (parts are coerced), `tRaw()`
preserves them as a parts array.

```ts
import { createI18n } from "@comvi/core";
import type { VirtualNode } from "@comvi/core";

const i18n = createI18n({ locale: "en", translation: { en: { hi: "Hi, {who}!" } } });

const someVNode: VirtualNode = { type: "text", text: "Alice" };

i18n.t("hi", { who: someVNode }); // string — coerced
i18n.tRaw("hi", { who: someVNode }); // ["Hi, ", someVNode, "!"]
```

## `skipPostProcess`

`<T skipPostProcess>` skips post-processors for that one call — notably the in-context editor's
invisible markers. `raw` is the same prop under its old 0.4 name: it still works, but is deprecated,
prints a one-time development warning, and is removed in 0.6. Rename it wherever you render
`<T>`, JSX and Vue / Svelte template markup alike.

## Related

- [Composition](composition.md) · [ICU](icu.md) · [Formatting](formatting.md) ·
  [Limitations](limitations.md)
