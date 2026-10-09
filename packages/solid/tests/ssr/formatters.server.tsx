/** Server half: a formatter rendered through `renderToString`. */
import { renderToString } from "solid-js/web";
import type { AnyI18nInstance } from "@comvi/core";
import { I18nProvider } from "../../src/context";
import { useI18n } from "../../src/useI18n";

const Price = () => {
  const { formatCurrency } = useI18n();
  return <span>{formatCurrency(1234.5, "EUR")}</span>;
};

export function renderPrice(i18n: AnyI18nInstance, ssrLocale?: string): string {
  return renderToString(() => (
    <I18nProvider i18n={i18n} autoInit={false} ssrLocale={ssrLocale}>
      <Price />
    </I18nProvider>
  ));
}
