/** Types of the binding with no generated catalogs: any key, any params. */
import type { Component, ComponentProps, Snippet } from "svelte";
import { T, useI18n, type Children, type TComponent } from "../../src";

export function setup() {
  const { t, T: B, locale } = useI18n("shop");
  const s: string = t("any.key", { n: 1, at: new Date() });
  // A rich call is a string too: there is no node to come back.
  const r: string = t("k", { b: (c) => `[${String(c)}]` });
  // A plain {x} is always text (04.11.2026): an object is no param, a Date or a list is.
  // @ts-expect-error an object in a plain {x} would print "[object Object]"
  t("k", { x: { t: "<img src=x>" } });
  const listed: string = t("k", { at: new Date(), list: ["a", 1] });
  const l: string = locale;
  // t() is text: its handlers get the tag's text, so a string-only handler stays fine there.
  const upper: string = t("k", { b: (c: string) => c.toUpperCase() });
  return [s, r, l, listed, upper, T, B];
}
/**
 * `<T>` hands a handler the tag's `Children`: a list once a nested tag renders through
 * `components` (`<strong>Hi <i>you</i></strong>`), so a string-only handler throws there.
 */
type TProps = ComponentProps<TComponent>;
// @ts-expect-error a <T> handler's argument is Children, not a string
export const narrow: TProps = { i18nKey: "m", strong: (c: string) => c.toUpperCase() };
export const inline: TProps = {
  i18nKey: "m",
  strong: (c) => {
    const got: Children = c;
    return got;
  },
};
export const annotated: TProps = { i18nKey: "m", strong: (c: Children) => c };
// A snippet of the tag's name keeps its text contract.
export const snippet: TProps = { i18nKey: "m", strong: {} as Snippet<[children: string]> };
export const inMarkup: TComponent extends Component<any> ? true : false = true;
