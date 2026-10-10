import { Footer } from "./Footer";
import { FeatureCards } from "./FeatureCards";
import { Header } from "./Header";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <main>
      <Header locale={locale} />
      {/* Client components, and still rendered on the server: the layout's
          <ComviProvider> seeded this locale's catalog, so the first HTML is
          already translated. */}
      <FeatureCards />
      <Footer locale={locale} />
    </main>
  );
}
