/**
 * The exported `<T>` (design §3.5, R3-5): its own module and chunk, so an app that never
 * imports it carries none of it — `useI18n(ns).T` is the functional bound one (binding.ts).
 */
import { render, use, type TComponent } from "./binding";

const setup = (_: unknown, c: { attrs: Record<string, unknown>; slots: Record<string, any> }) => {
  const i = use();
  // It reads only (lot 4c): no hold, no load — in a browser or on a server.
  return () => render(i, c.attrs.ns, c.attrs, c.slots);
};

/**
 * Renders one message; params are attributes. A tag renders through an attribute of its
 * name (a handler), else its entry in `components` (`:components="{ b: 'strong' }"`, nested
 * tags render too), else a slot of its name (`<template v-slot:link="{ children }"><a
 * href="/terms">{{ children }}</a></template>`, `children` the tag's text when it holds
 * text only — for nested markup use `components`); an attribute
 * that is `undefined` leaves the tag to the next. Every attribute but `i18nKey`,
 * `components` and the per-call options `ns`, `locale` and `markers` is a message param —
 * `class` too (nothing falls through). `ns` is explicit: `<T>` never takes the namespace of
 * a `useI18n(ns)` above it (R3-5); `useI18n(ns).T` is the bound one. `<T>` reads only: it
 * loads nothing, `<T ns="account">` neither — `useI18n("account")` in the component (or
 * `i18n.load`, the `namespaces` option) loads it (lot 4c).
 * `:markers="false"` opts the message out of an in-context editor session (R3-14 H9).
 */
// No props: every attribute, `i18nKey` (`i18n-key` in a template) too, is read camelized.
export const T = { inheritAttrs: false, setup } as unknown as TComponent;
