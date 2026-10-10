import { Demo } from "./Demo";
import { Footer } from "./Footer";
import { Header } from "./Header";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  return (
    <main>
      <Header locale={locale} />
      {/* The feature cards are a client component, because most of them are
          interactive. They still render on the SERVER for the first paint:
          <ComviProvider> seeded the catalog before this subtree ran, so the
          HTML that leaves the server is already in the right language. */}
      <Demo />
      <Footer locale={locale} />
    </main>
  );
}
