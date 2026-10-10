import { getI18n } from "@comvi/next/server";

const SOURCE = "https://github.com/comvi-io/comvi-js/tree/main/examples/next";

export async function Footer({ locale }: { locale: string }) {
  const { t } = await getI18n({ locale });
  return (
    <footer>
      <a href="https://comvi.io/docs/i18n">{t("demo.footer.docs")}</a>
      <a href={SOURCE}>{t("demo.footer.source")}</a>
      <span>
        {t("demo.footer.install")} <code>npm i @comvi/next</code>
      </span>
    </footer>
  );
}
