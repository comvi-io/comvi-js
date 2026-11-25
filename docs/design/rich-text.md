# Tags are part of the message syntax; markup comes only from handlers and mapped components

Status: accepted · Date: 2026-11-25 · Rewritten for 0.8. The 0.5–0.7 record (`@comvi/core/rich-text`,
the ambient `@comvi/core/tags` import) described subpaths that 0.8 removed; that version is in git
history. The rule that a plain `{name}` is always text dates from 04.11.2026.

## Context

A sentence with a link in the middle has to stay one translation unit, or translators get fragments
they cannot order. An HTML string would need a sanitiser in the render path. Up to 0.7, `<T>` and
`t()` parsed tags by different rules, and `t()` parsed them only after a process-wide import.

## Decision

- **Tags are always parsed.** `<b>…</b>` and the self-closing `<br/>` are part of the one message
  syntax ([icu.md](icu.md)), in `t()` and in every binding's `<T>`, with no import or option.
- **A tag renders through what the app gives for its name**, else as its content:
  - `t()`: a param named like the tag is its handler and gets the tag's children as an array
    (`RichParts`); with any handler the result is an array of parts. A tag with no handler renders
    its content as text. A self-closing tag with no handler renders nothing.
  - `<T>`: a handler prop of the tag's name, else its `components` entry (a tag name, a component,
    or `{ component, props }`), else its content as text. Vue also takes a slot of the tag's name;
    Svelte takes `components` and named snippets, no handler.
- **No HTML sink.** A translation can produce text and the tags the app mapped, nothing else: an
  unmapped tag is its inner text, and text that looks like markup stays text.
- **A plain `{name}` is always text**, in the core and in every binding: a number, a Date, a list,
  an object and a framework node (React element, Vue VNode, Solid JSX) all print as `String(value)`.
  Markup goes in a tag around the param: `"Hello, <strong>{name}</strong>!"`.
- **An unclosed tag is text.** `a <b>bold` renders `a <b>bold`; development warns, production does
  not report. Nesting is limited to 200 levels; deeper renders the key and reports `syntax`.
- **`markers: false`** on a call (`t(key, { markers: false })`, `<T markers={false}>`) keeps the
  in-context editor's invisible markers out of that one result.

```ts title="src/terms.ts"
import { createI18n } from "@comvi/core";

const i18n = createI18n({
  locale: "en",
  messages: { en: { terms: "Read <b>the <i>new</i> terms</b>.", lines: "a<br/>b" } },
});

i18n.t("terms"); // "Read the new terms." — no handler: the content as text
i18n.t("terms", { b: (children) => ({ bold: children }) }); // ["Read ", { bold: ["the new terms"] }, "."]
i18n.t("lines"); // "ab" — a self-closing tag with no handler renders nothing
```

## Consequences

- A catalog with tags renders the same text under `t()` and `<T>`; only the handlers differ.
- A translator cannot inject markup: the worst a translation can do is show a tag's content
  unstyled.
- An app that renders `t()` output with tags outside a framework turns the parts into nodes itself
  (the vanilla example's `toDom()`).

## Alternatives rejected

- **HTML passthrough with a sanitiser.** A markup sink in the render path and an option to get wrong.
- **Framework nodes as `{name}` values.** They hydrate differently on server and client (Solid) and
  blur what a translator can change; markup belongs to a tag.
- **Throwing on an unclosed tag in production.** Text that is visibly literal is cheaper than a
  failed render.

## Where it lives

`packages/core/src/compile/scanner.ts` (tags, the depth limit), `packages/core/src/types.ts`
(`RichParts`, `Tag`); `<T>` per binding: `packages/react/src/binding.ts`, `packages/vue/src/T.ts`,
`packages/svelte/src/T.svelte`, `packages/solid/src/T.ts`.
