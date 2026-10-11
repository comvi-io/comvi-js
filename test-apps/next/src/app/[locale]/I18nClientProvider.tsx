"use client";

import { I18nProvider } from "@comvi/next/client";
import type { MessagesMap } from "@comvi/next/client";
import { i18n } from "../../i18n/config";

interface I18nClientProviderProps {
  children: React.ReactNode;
  locale: string;
  messages?: MessagesMap;
}

/**
 * Client-side wrapper that imports the i18n instance: Next.js cannot pass class
 * instances from Server Components to Client Components.
 */
export function I18nClientProvider({ children, locale, messages }: I18nClientProviderProps) {
  return (
    <I18nProvider i18n={i18n} locale={locale} messages={messages}>
      {children}
    </I18nProvider>
  );
}
