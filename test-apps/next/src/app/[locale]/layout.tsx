import { notFound } from "next/navigation";
import { hasLocale, routing, loadTranslations } from "../../i18n";
import { I18nClientProvider } from "./I18nClientProvider";
import { Navigation } from "../../components/Navigation";
import "../globals.css";

// SSR mode - no generateStaticParams, pages rendered on each request

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Load translations for server + pass to client (avoids extra fetch)
  const messages = await loadTranslations(locale);

  return (
    <html lang={locale}>
      <body className="min-h-screen bg-gray-50 font-sans">
        <I18nClientProvider locale={locale} messages={messages}>
          <Navigation />
          <main className="container mx-auto px-4 pb-12">
            <div className="bg-white rounded-lg shadow p-6 min-h-[300px]">{children}</div>
          </main>
        </I18nClientProvider>
      </body>
    </html>
  );
}
