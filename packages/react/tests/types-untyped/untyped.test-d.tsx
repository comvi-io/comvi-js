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
  const node: ReactNode = (
    <T i18nKey="whatever" ns="x" anything={1} link={(c: ReactNode) => <b>{c}</b>} />
  );
  return [s, f, node];
}

export const app = <I18nProvider i18n={createI18n({ locale: "en" })}>{null}</I18nProvider>;
