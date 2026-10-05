/**
 * The tree the `ssrLocale` + loader acceptance tests render on both halves:
 * every way a component reads the locale, side by side, so a disagreement
 * between them shows up in one string.
 */
import type { AnyI18nHost } from "@comvi/core";
import { I18nProvider } from "../../src/context";
import { useI18n } from "../../src/useI18n";
import { T } from "../../src/T";

const View = () => {
  const { t, locale, formatNumber } = useI18n();
  return (
    <p data-locale={locale()}>
      <span data-part="t">{t("greeting" as never)}</span>
      <span data-part="T">
        <T i18nKey={"greeting" as never} />
      </span>
      <span data-part="number">{formatNumber(1234.5)}</span>
    </p>
  );
};

export interface LoaderAppProps {
  i18n: AnyI18nHost;
  ssrLocale?: string;
}

export const LoaderApp = (props: LoaderAppProps) => (
  <I18nProvider i18n={props.i18n} autoInit={false} ssrLocale={props.ssrLocale}>
    <View />
  </I18nProvider>
);
