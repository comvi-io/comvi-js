import { useI18n } from "@comvi/react";

export function Footer() {
  const { t } = useI18n();

  return (
    <footer>
      <a href="https://comvi.io/docs/i18n">{t("demo.footer.docs")}</a>
      <a href="https://github.com/comvi-io/comvi-js/tree/main/examples/react">
        {t("demo.footer.source")}
      </a>
      <span>
        {t("demo.footer.install")}
        <code>npm i @comvi/react</code>
      </span>
    </footer>
  );
}
