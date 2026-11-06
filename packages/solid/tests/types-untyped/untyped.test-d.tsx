/**
 * Types without generated catalogs (an ungenerated project): any key, any params. A t() call
 * with text params returns `string`; a call with a tag handler is `string | JSX.Element`: the
 * message decides at run time. A plain `{x}` is always text (04.11.2026): a JSX element is no
 * param, a tag around the text renders markup.
 */
import type { JSX, ParentProps } from "solid-js";
import { createI18n, I18nProvider, T, useI18n } from "../../src";
import { useFormat } from "../../src/format";

export function Component() {
  const { t } = useI18n("anything");
  const s: string = t("any.key", { any: 1, ns: "x", locale: "de" });
  const fmt = useFormat();
  const f: string = fmt.currency(1, "EUR");
  // @ts-expect-error params must be an object
  t("k", 1);
  // Inline handlers need no annotation: `chunks` is a JSX element.
  const node = (
    <T i18nKey="whatever" ns="x" markers={false} anything={1} link={(c) => <b>{c}</b>} />
  );
  const rich: JSX.Element = t("terms", { link: (c) => <a href="/terms">{c}</a> });
  // @ts-expect-error a call with a tag handler may return a node, not a string
  const notText: string = t("terms", { link: (c) => <a href="/terms">{c}</a> });
  t("terms", {
    link: (c) => {
      const inferred: JSX.Element = c;
      return <a>{inferred}</a>;
    },
  });
  // Text params only (numbers, dates, lists of them): a string.
  const text: string = t("when", { at: new Date(), n: 2, list: ["a", 1] });
  // @ts-expect-error a JSX element in a plain {x} would print String(element)
  t("hi", { icon: <b /> });
  // @ts-expect-error the same in <T>: render markup through a tag and `components`
  const nodeProp = <T i18nKey="hi" icon={<b />} />;
  const replaced = <T i18nKey="hi" name="Olena" components={{ strong: "strong" }} />;
  // `components` renders tags of <T> by name: a tag name or a component.
  const viaComponents = <T i18nKey="terms" components={{ b: "strong", i: Italic }} />;
  // @ts-expect-error a component entry is not a number
  const badComponents = <T i18nKey="terms" components={{ b: 1 }} />;
  // The handler gets the tag's content as JSX (a list of parts), never a string: a narrower
  // annotation throws at run time (`c.toUpperCase is not a function`), so the types refuse it.
  // @ts-expect-error a handler's argument is a JSX.Element, not a string
  t("message", { strong: (c: string) => c.toUpperCase() });
  // @ts-expect-error the same in <T>
  const narrowProp = <T i18nKey="message" strong={(c: string) => c.toUpperCase()} />;
  // An annotation that matches what the binding delivers stays a handler.
  const annotated = <T i18nKey="message" strong={(c: JSX.Element) => <b>{c}</b>} />;
  t("message", { strong: (c: JSX.Element) => <b>{c}</b> });
  const { T: Bound } = useI18n("shop");
  const bound = <Bound i18nKey="cart.title" count={2} b={(c) => <b>{c}</b>} />;
  // @ts-expect-error the bound <T> takes no ns: it is fixed by useI18n(ns)
  const wrongNs = <Bound i18nKey="x" ns="other" />;
  return [
    ...[s, f, node, rich, notText, text, nodeProp, replaced],
    ...[viaComponents, badComponents, bound, wrongNs, narrowProp, annotated],
  ];
}

const Italic = (p: ParentProps) => <i>{p.children}</i>;

export const app = <I18nProvider i18n={createI18n({ locale: "en" })}>{null}</I18nProvider>;
