/**
 * Types without generated catalogs (an ungenerated project): any key, any params. A t()
 * call with text params returns `string`; a call with a tag handler or an element param is
 * `string | ReactElement` — the message decides at run time (lot 4b: honest types; lot 1c
 * typed it `string`, so `.toUpperCase()` on an element compiled and threw).
 */
import type { ReactElement, ReactNode } from "react";
import { createI18n, I18nProvider, T, useI18n } from "../../src";
import { useFormat } from "../../src/format";

export function Component() {
  const { t } = useI18n("anything");
  const s: string = t("any.key", { any: 1, ns: "x", locale: "de" });
  const fmt = useFormat();
  const f: string = fmt.currency(1, "EUR");
  // @ts-expect-error params must be an object
  t("k", 1);
  // Inline handlers need no annotation: `chunks` is a ReactNode (README snippet, TS7006 before).
  const node: ReactNode = (
    <T i18nKey="whatever" ns="x" markers={false} anything={1} link={(c) => <b>{c}</b>} />
  );
  const rich: string | ReactElement = t("terms", { link: (c) => <a href="/terms">{c}</a> });
  // @ts-expect-error a call with a tag handler may return an element, not a string
  const notText: string = t("terms", { link: (c) => <a href="/terms">{c}</a> });
  // The handler's argument is inferred (no annotation): one React node, not `any`.
  t("terms", {
    link: (c) => {
      const inferred: ReactNode = c;
      // @ts-expect-error a ReactNode is not a number
      const wrong: number = c;
      return (
        <a>
          {inferred}
          {wrong}
        </a>
      );
    },
  });
  // Text params only (numbers, dates, lists of them): a string.
  const text: string = t("when", { at: new Date(), n: 2, list: ["a", 1] });
  // An element param can come back as is: rich.
  const withNode: string | ReactElement = t("hi", { icon: <b /> });
  // `components` renders tags of <T> by name: a tag name or a component.
  const viaComponents: ReactNode = <T i18nKey="terms" components={{ b: "strong", i: Italic }} />;
  // @ts-expect-error a component entry is not a number
  const badComponents: ReactNode = <T i18nKey="terms" components={{ b: 1 }} />;
  const { T: Bound } = useI18n("shop");
  const bound: ReactNode = <Bound i18nKey="cart.title" count={2} b={(c) => <b>{c}</b>} />;
  // @ts-expect-error the bound <T> takes no ns: it is fixed by useI18n(ns)
  const wrongNs: ReactNode = <Bound i18nKey="x" ns="other" />;
  return [s, f, node, rich, notText, text, withNode, viaComponents, badComponents, bound, wrongNs];
}

const Italic = ({ children }: { children?: ReactNode }) => <i>{children}</i>;

export const app = <I18nProvider i18n={createI18n({ locale: "en" })}>{null}</I18nProvider>;
