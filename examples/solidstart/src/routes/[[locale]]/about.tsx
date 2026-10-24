import { useI18n } from "@comvi/solid";
import { localePath } from "~/lib/i18n";

export default function About() {
  const { t, locale } = useI18n();

  return (
    <>
      <p data-testid="about">{t("about.body")}</p>
      <p>
        <a data-testid="nav-home" href={localePath(locale())}>
          {t("nav.home")}
        </a>
      </p>
    </>
  );
}
