/**
 * Types without generated catalogs (an ungenerated project): any key, any params. A t()
 * call with text params returns `string`; a call with a tag handler is
 * `string | VNodeArrayChildren` — the message decides at run time (lot 4b: honest types;
 * lot 4 typed it `string`). A plain `{x}` is always text (04.11.2026): a VNode is no param, a
 * tag around the text renders markup. Templates: Untyped.vue.
 */
import { defineComponent, h, type VNodeArrayChildren, type VNodeChild } from "vue";
import type { Children } from "../../src";
import { createI18n, T, useI18n } from "../../src";
import { useFormat } from "../../src/format";

export function setup() {
  const { t } = useI18n("anything");
  const s: string = t("any.key", { any: 1, ns: "x", locale: "de" });
  const fmt = useFormat();
  const f: string = fmt.currency(1, "EUR");
  // @ts-expect-error params must be an object
  t("k", 1);
  // Inline handlers need no annotation: `children` is text or the parts.
  const node: VNodeChild = T({
    i18nKey: "whatever",
    ns: "x",
    markers: false,
    anything: 1,
    link: (c) => h("b", c),
  });
  const rich: string | VNodeArrayChildren = t("terms", {
    link: (c) => h("a", { href: "/terms" }, c),
  });
  // @ts-expect-error a call with a tag handler may return the parts, not a string
  const notText: string = t("terms", { link: (c) => h("a", c) });
  // The handler's argument is inferred (no annotation): the tag's children.
  t("terms", {
    link: (c) => {
      const inferred: Children = c;
      // @ts-expect-error children are text or parts, not a number
      const wrong: number = c;
      return h("a", [inferred as string, wrong]);
    },
  });
  // A handler gets a string only for text-only content and a list of children around nested
  // tags (`<b>Hi <i>you</i></b>`), so a `string` annotation would throw there: refused.
  // @ts-expect-error a handler's argument is Children, not a string
  t("message", { b: (c: string) => c.toUpperCase() });
  // @ts-expect-error the same in <T>
  T({ i18nKey: "message", b: (c: string) => c.toUpperCase() });
  // An annotation that matches what the binding delivers stays a handler.
  t("message", { b: (c: Children) => h("b", c) });
  T({ i18nKey: "message", b: (c: Children) => h("b", c) });
  // Text params only (numbers, dates, lists of them): a string.
  const text: string = t("when", { at: new Date(), n: 2, list: ["a", 1] });
  // @ts-expect-error a VNode in a plain {x} would print String(vnode)
  t("hi", { icon: h("b") });
  // @ts-expect-error the same in <T>: render markup through a tag and `components`
  T({ i18nKey: "hi", icon: h("b") });
  const replaced: VNodeChild = T({
    i18nKey: "hi",
    name: "Olena",
    components: { strong: "strong" },
  });
  // `components` renders tags of <T> by name: an HTML tag name or a component.
  const viaComponents: VNodeChild = T({
    i18nKey: "terms",
    components: { b: "strong", i: Italic },
  });
  // @ts-expect-error a component entry is not a number
  T({ i18nKey: "terms", components: { b: 1 } });
  const { T: Bound } = useI18n("shop");
  const bound: VNodeChild = Bound({ i18nKey: "cart.title", count: 2, b: (c) => h("b", c) });
  // @ts-expect-error the bound <T> takes no ns: it is fixed by useI18n(ns)
  Bound({ i18nKey: "x", ns: "other" });
  return [s, f, node, rich, notText, text, replaced, viaComponents, bound];
}

const Italic = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("i", slots.default?.()),
});

export const i18n = createI18n({ locale: "en" });
