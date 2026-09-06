"use client";

import { I18nProvider, type MessagesMap } from "@comvi/next/client";
import { i18n, routing } from "@/i18n/config";

/**
 * The hydration boundary. Next cannot serialize a class instance across it, so
 * the host is imported HERE, inside a `"use client"` module, and the server
 * hands over only two serializable things: the locale it rendered and the
 * catalog it loaded.
 *
 * `messages` is seeded into the cache before children render, which is what
 * makes the client components below render the right language on the server's
 * first paint instead of flashing English. `routing` is what makes
 * `localePrefix` work for <Link> and `useLocalizedRouter()`; with no routing in
 * context they prefix unconditionally.
 */
export function ComviProvider({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages?: MessagesMap;
}) {
  return (
    <I18nProvider i18n={i18n} locale={locale} messages={messages} routing={routing}>
      {children}
    </I18nProvider>
  );
}
