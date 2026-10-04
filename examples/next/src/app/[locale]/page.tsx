import { getI18n } from "@comvi/next/server";
import { Demo } from "./Demo";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;

  // The server side of the story. `getI18n({ locale })` returns `t`,
  // `hasTranslation` and `locale`, bound to the locale passed here — the host
  // lives at module scope and is shared by every concurrent request, so the
  // locale belongs to the request and never to the instance. Passing it
  // explicitly means the page does not depend on the layout rendering first.
  const { t } = await getI18n({ locale });

  return (
    <main>
      <h1>{t("app.title")}</h1>
      {/* The six rows are a client component, because five of them are
          interactive. They still render on the SERVER for the first paint:
          <I18nProvider messages> seeded the catalog before this subtree ran, so
          the HTML that leaves the server is already in the right language. */}
      <Demo />
    </main>
  );
}
