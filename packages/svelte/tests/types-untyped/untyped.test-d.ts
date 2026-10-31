/** Types of the binding with no generated catalogs: any key, any params. */
import type { Component } from "svelte";
import { T, useI18n, type TComponent } from "../../src";

export function setup() {
  const { t, T: B, locale } = useI18n("shop");
  const s: string = t("any.key", { n: 1, at: new Date() });
  // A rich call is a string too: there is no node to come back.
  const r: string = t("k", { b: (c) => `[${String(c)}]` });
  const l: string = locale;
  return [s, r, l, T, B];
}
export const inMarkup: TComponent extends Component<any> ? true : false = true;
