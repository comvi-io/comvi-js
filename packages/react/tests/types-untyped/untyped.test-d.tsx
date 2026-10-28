/**
 * Types without generated catalogs (an ungenerated project): any key, any params; t() is
 * typed `string` — the documented narrowing of lot 1c (a rich call returns an element at
 * runtime; render rich text with <T>, typed ReactNode).
 */
import type { ReactNode } from "react";
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
  const rich: string = t("terms", { link: (c) => <a href="/terms">{c}</a>, at: new Date() });
  const { T: Bound } = useI18n("shop");
  const bound: ReactNode = <Bound i18nKey="cart.title" count={2} b={(c) => <b>{c}</b>} />;
  // @ts-expect-error the bound <T> takes no ns: it is fixed by useI18n(ns)
  const wrongNs: ReactNode = <Bound i18nKey="x" ns="other" />;
  return [s, f, node, rich, bound, wrongNs];
}

export const app = <I18nProvider i18n={createI18n({ locale: "en" })}>{null}</I18nProvider>;
