import { Link } from "@comvi/next/navigation";
import { getI18n } from "@comvi/next/server";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { StartGreeting } from "./StartGreeting";

/** The whole integration on one screen: a title, a switcher, one translated line. */
export default async function StartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  // A Server Component has no hooks: `getI18n({ locale })` returns a `t` bound
  // to this request's locale.
  const { t } = await getI18n({ locale });

  return (
    <main>
      <header>
        <h1>{t("app.title")}</h1>
        <LocaleSwitcher />
      </header>
      <p className="intro">{t("demo.start.intro")}</p>
      <StartGreeting />
      <p>
        <Link className="cta" data-testid="nav-features" href="/features">
          {t("demo.start.cta")}
        </Link>
      </p>
    </main>
  );
}
