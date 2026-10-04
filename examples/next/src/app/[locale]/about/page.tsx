import { Link } from "@comvi/next/navigation";
import { getI18n } from "@comvi/next/server";

/**
 * The second page: a Server Component, translated through `getI18n()` like
 * the title on the first. <Link> prefixes `/` with the current locale, so the
 * way back lands on the same language.
 */
export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <section>
        <h2>navigation</h2>
        <p data-testid="about-body">{t("about.body")}</p>
        <p>
          <Link data-testid="nav-home" href="/">
            {t("nav.home")}
          </Link>
        </p>
      </section>
    </main>
  );
}
