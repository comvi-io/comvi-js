import { getI18n, setRequestLocale } from "@/i18n/server";
import { Demo } from "./Demo";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // The server side of the story. `getI18n()` is exactly two members, `t` and
  // `hasTranslation`, bound once to THIS request's locale — the host lives at
  // module scope and is shared by every concurrent request, so the locale
  // belongs to the request and never to the instance.
  const { t } = await getI18n();

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
