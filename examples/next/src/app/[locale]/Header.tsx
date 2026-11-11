import { getI18n } from "@/i18n/server";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** The title, one sentence about the page, and the switcher: shared by both pages. */
export async function Header({ locale }: { locale: string }) {
  // A Server Component has no hooks: `getI18n({ locale })` returns this
  // request's instance and a `t` bound to it.
  const { t } = await getI18n({ locale });
  return (
    <header>
      <h1>{t("app.title")}</h1>
      <p className="intro">{t("demo.intro")}</p>
      <LocaleSwitcher />
      <p className="note">{t("demo.rtl.body")}</p>
    </header>
  );
}
