import { Link } from "@comvi/next/navigation";
import { getI18n } from "@comvi/next/server";
import { FeatureCards } from "../FeatureCards";
import { Footer } from "../Footer";
import { Header } from "../Header";

export default async function FeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { t } = await getI18n({ locale });

  return (
    <main>
      <Header locale={locale} />
      <p className="note">
        <Link data-testid="nav-start" href="/">
          {t("demo.start.back")}
        </Link>
      </p>
      {/* Client components, and still rendered on the server: the layout's
          <ComviProvider> seeded this locale's catalog, so the first HTML is
          already translated. */}
      <FeatureCards />
      <Footer locale={locale} />
    </main>
  );
}
