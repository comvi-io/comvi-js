/**
 * The ONE component tree both halves of the hydration test render.
 *
 * It is compiled twice — server-flavoured when reached from `render.server.tsx`,
 * client-flavoured when imported by the test — and hydration keys are a
 * deterministic walk of the tree, so sharing the source is what makes the two
 * paints comparable at all.
 */
import type { AnyI18nHost } from "@comvi/core";
import { I18nProvider } from "../../src/context";
import { useI18n } from "../../src/useI18n";

const Greeting = () => {
  const { t, locale } = useI18n();
  return <span data-locale={locale()}>{t("greeting" as never)}</span>;
};

export interface AppProps {
  i18n: AnyI18nHost;
  ssrLocale?: string;
}

export const App = (props: AppProps) => (
  <I18nProvider i18n={props.i18n} autoInit={false} ssrLocale={props.ssrLocale}>
    <Greeting />
  </I18nProvider>
);
