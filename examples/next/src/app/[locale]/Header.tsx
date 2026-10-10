import { getI18n } from "@comvi/next/server";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** The title, one sentence about the page, and the switcher: shared by both pages. */
export async function Header({ locale }: { locale: string }) {
  // The server side of the story. `getI18n({ locale })` returns `t`,
  // `hasTranslation` and `locale`, bound to the locale passed here: the instance
  // lives at module scope and is shared by every concurrent request, so the
  // locale belongs to the request and never to the instance.
  const { t } = await getI18n({ locale });
  return (
    <header>
      <h1>{t("app.title")}</h1>
      <p className="intro">{t("demo.intro")}</p>
      <LocaleSwitcher />
    </header>
  );
}
