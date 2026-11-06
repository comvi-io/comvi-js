import { handover } from "@comvi/core/ssr";
import { Link } from "@comvi/next/navigation";
import { getI18n } from "@/i18n/server";
import { Provider } from "@/i18n/client";
import { Footer } from "../Footer";
import { Header } from "../Header";
import { Namespaces } from "../cards/Namespaces";
import { Account } from "./Account";

/**
 * The second page, with a namespace of its own. `getI18n({ locale, ns: "account" })`
 * loads `account` for the locale and its fallback chain; the page hands its
 * payload to its client components with a provider of its own, so a page
 * outside this route never receives the `account` catalog.
 */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });
  const account = await getI18n({ locale, ns: "account" });

  return (
    <main>
      <Header locale={locale} />
      <section className="card">
        <h2 className="eyebrow">{t("demo.navigation.title")}</h2>
        <p className="widget" data-testid="about-body">
          {t("about.body")}
        </p>
        {/* One `account` row rendered here on the server, two in a client component. */}
        <p className="widget" data-testid="account-devices">
          {account.t("profile.devices", { count: 3 })}
        </p>
        <Provider payload={handover(account.i18n)}>
          <Account />
        </Provider>
        <p className="widget">
          <Link data-testid="nav-home" href="/features">
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
