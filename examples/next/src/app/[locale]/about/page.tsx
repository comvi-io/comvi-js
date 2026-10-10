import { Link } from "@comvi/next/navigation";
import { getI18n } from "@comvi/next/server";
import { Footer } from "../Footer";
import { Header } from "../Header";
import { Namespaces } from "../cards/Namespaces";
import { Account } from "./Account";

/**
 * The second page: a Server Component, translated through `getI18n()` like
 * the header. <Link> prefixes `/` with the current locale, so the way back
 * lands on the same language.
 */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });
  // A second namespace on the server: `ns` scopes this `t()` to `account` and
  // loads it for the locale and its fallback chain.
  const account = await getI18n({ locale, ns: "account" });

  return (
    <main>
      <Header locale={locale} />
      <section className="card">
        <h2 className="eyebrow">{t("demo.navigation.title")}</h2>
        <p className="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        {/* One `account` row rendered here on the server, two in a client
            component. */}
        <p className="widget" data-testid="account-devices">
          {account.t("profile.devices", { count: 3 })}
        </p>
        <Account />
        <p className="widget">
          <Link data-testid="nav-home" href="/">
            {t("nav.home")}
          </Link>
        </p>
      </section>
      <section className="card">
        <h2 className="eyebrow">{t("demo.lazy.title")}</h2>
        <p className="body">{t("demo.lazy.body")}</p>
        <div className="network">
          <Namespaces />
        </div>
      </section>
      <Footer locale={locale} />
    </main>
  );
}
