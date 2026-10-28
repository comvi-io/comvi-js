/**
 * The exported `<T>` (design §3.5, R3-5): its own module and chunk, so an app that never
 * imports it carries none of it — `useI18n(ns).T` is the functional bound one (binding.ts).
 */
import { watchEffect } from "vue";
import { activate } from "@comvi/core/internal";
import { render, use, type TComponent } from "./binding";

const setup = (
  p: { i18nKey: string },
  c: { attrs: Record<string, unknown>; slots: Record<string, any> },
) => {
  const i = use();
  // `attrs` is tracked: a new `ns` activates that namespace (after the render).
  watchEffect(() => c.attrs.ns && activate(i, c.attrs.ns as string), { flush: "post" });
  return () => render(i, undefined, p.i18nKey, c.attrs, c.slots);
};

/**
 * Renders one message; params are attributes, a tag handler is an attribute or a slot of
 * the tag's name (`<T i18nKey="terms"><template v-slot:link="{ children }"><a href="/terms">{{
 * children }}</a></template></T>`). Every attribute but `i18nKey` and the per-call options
 * `ns`, `locale` and `markers` is a message param — `class` too. `ns` is explicit: `<T>` never
 * takes the namespace of a `useI18n(ns)` above it (R3-5); `useI18n(ns).T` is the bound one.
 * `<T ns>` activates that namespace after it mounts, and again when the attribute changes.
 * `:markers="false"` opts the message out of an in-context editor session (R3-14 H9).
 */
// `i18nKey` is the one prop (a template spells it `i18n-key`).
export const T = { props: ["i18nKey"], inheritAttrs: false, setup } as unknown as TComponent;
