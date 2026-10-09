import { Link } from "@comvi/next/navigation";
import { getI18n } from "@comvi/next/server";
import { LocaleSwitcher } from "../LocaleSwitcher";
import { Account } from "./Account";

/**
 * The second page: a Server Component, translated through `getI18n()` like
 * the title on the first. <Link> prefixes `/` with the current locale, so the
 * way back lands on the same language.
 */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });
  // A second namespace on the server: `ns` scopes this `t()` to `account` and
  // loads it for the locale and its fallback chain.
  const account = await getI18n({ locale, ns: "account" });

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <LocaleSwitcher />
      <section>
        <h2>navigation</h2>
        <p data-testid="about-body">{t("about.body")}</p>
        <p>
          <Link data-testid="nav-home" href="/">
            {t("nav.home")}
          </Link>
        </p>
      </section>
      {/* 10 — a second namespace: one row rendered here on the server, two in
          a client component. */}
      <section>
        <h2>namespace</h2>
        <p data-testid="account-devices">{account.t("profile.devices", { count: 3 })}</p>
        <Account />
      </section>
    </main>
  );
}
