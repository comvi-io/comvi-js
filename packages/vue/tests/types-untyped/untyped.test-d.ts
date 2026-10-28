/**
 * Types without generated catalogs (an ungenerated project): any key, any params; t() is
 * typed `string` — the documented narrowing of @comvi/react (lot 1c): a rich call returns a
 * node at runtime; render rich text with <T>. Templates: Untyped.vue.
 */
import { h, type VNode } from "vue";
import { createI18n, T, useI18n } from "../../src";
import { useFormat } from "../../src/format";

export function setup() {
  const { t } = useI18n("anything");
  const s: string = t("any.key", { any: 1, ns: "x", locale: "de" });
  const fmt = useFormat();
  const f: string = fmt.currency(1, "EUR");
  // @ts-expect-error params must be an object
  t("k", 1);
  // Inline handlers need no annotation: `children` is text or a node.
  const node: VNode = T({
    i18nKey: "whatever",
    ns: "x",
    markers: false,
    anything: 1,
    link: (c) => h("b", c),
  });
  const rich: string = t("terms", { link: (c) => h("a", { href: "/terms" }, c), at: new Date() });
  const { T: Bound } = useI18n("shop");
  const bound: VNode = Bound({ i18nKey: "cart.title", count: 2, b: (c) => h("b", c) });
  // @ts-expect-error the bound <T> takes no ns: it is fixed by useI18n(ns)
  Bound({ i18nKey: "x", ns: "other" });
  return [s, f, node, rich, bound];
}

export const i18n = createI18n({ locale: "en" });
