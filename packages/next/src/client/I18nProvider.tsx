"use client";

import React, { useLayoutEffect, useEffect, useRef } from "react";
import { I18nProvider as ReactI18nProvider } from "@comvi/react";

// Safe isomorphic layout effect to avoid React warnings during SSR
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import type { I18nProviderProps as ReactI18nProviderProps } from "@comvi/react";
import type { TranslationValue } from "@comvi/core";
import type { RoutingConfig } from "../routing/types";
import { RoutingProvider } from "../routing/context";

/**
 * Translations result keyed by "locale:namespace"
 */
export type MessagesMap = Record<string, Record<string, TranslationValue>>;

export interface I18nProviderProps extends Omit<ReactI18nProviderProps, "ssrInitialLocale"> {
  /** Locale passed from server (from params.locale) */
  locale: string;

  /**
   * Pre-loaded messages from loadTranslations().
   * These will be added to the i18n cache on mount.
   *
   * @example
   * ```tsx
   * const messages = await loadTranslations(locale);
   * <I18nProvider i18n={i18n} locale={locale} messages={messages}>
   * ```
   */
  messages?: MessagesMap;

  /**
   * Routing configuration for locale prefixing and pathnames.
   * Pass the `routing` value returned by createNextI18n().
   */
  routing?: RoutingConfig;
}

// Check if we're on the server
const isServer = typeof window === "undefined";

/**
 * I18nProvider for Next.js App Router
 *
 * This provider handles hydration by syncing the server locale with the client
 * i18n instance, preventing hydration mismatches.
 *
 * Translations should be pre-loaded in the i18n instance via the `translation`
 * option in `createI18n()`.
 *
 * @example
 * ```tsx
 * // i18n/index.ts
 * import { createI18n } from '@comvi/next';
 * import { setI18n } from '@comvi/next/server';
 * import { translations } from './translations';
 *
 * export const i18n = createI18n({
 *   locale: 'en',
 *   defaultNs: 'default',
 *   translation: translations, // Pre-loaded translations
 * });
 *
 * setI18n(i18n);
 * ```
 *
 * @example
 * ```tsx
 * // app/[locale]/layout.tsx
 * import { I18nProvider } from '@comvi/next/client';
 * import { i18n } from '@/i18n';
 *
 * export default async function LocaleLayout({
 *   children,
 *   params
 * }: {
 *   children: React.ReactNode;
 *   params: Promise<{ locale: string }>;
 * }) {
 *   const { locale } = await params;
 *
 *   return (
 *     <html lang={locale}>
 *       <body>
 *         <I18nProvider i18n={i18n} locale={locale}>
 *           {children}
 *         </I18nProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function I18nProvider({
  children,
  i18n,
  locale,
  messages,
  autoInit = true,
  routing,
  ...props
}: I18nProviderProps) {
  // Track which messages object we've already added (by reference)
  const lastAddedMessagesRef = useRef<MessagesMap | undefined>(undefined);
  const isFirstRenderRef = useRef(true);

  // Synchronize locale and messages during render (before children render)
  //
  // On SERVER: Always sync - each request needs correct locale.
  // On CLIENT (first render): Sync once for hydration - i18n.t() reads i18n.locale directly,
  //   so we must set it before render to avoid using defaultLocale on first paint.
  // On CLIENT (subsequent): Use useIsomorphicLayoutEffect to avoid "setState during render".
  const shouldSyncDuringRender = isServer || isFirstRenderRef.current;

  if (shouldSyncDuringRender) {
    if (i18n.locale !== locale) {
      i18n.locale = locale;
    }

    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages);
      lastAddedMessagesRef.current = messages;
    }

    if (!isServer) {
      isFirstRenderRef.current = false;
    }
  }

  // For ALL subsequent renders (client-side navigation, HMR, etc.),
  // update in useIsomorphicLayoutEffect to avoid "setState during render" errors.
  useIsomorphicLayoutEffect(() => {
    if (i18n.locale !== locale) {
      i18n.locale = locale;
    }

    if (messages && messages !== lastAddedMessagesRef.current) {
      i18n.addTranslations(messages);
      lastAddedMessagesRef.current = messages;
    }
  }, [i18n, locale, messages]);

  const content = (
    <ReactI18nProvider
      i18n={i18n}
      autoInit={autoInit}
      ssrInitialLocale={locale}
      ssrInitialIsLoading={false}
      ssrInitialIsInitializing={false}
      {...props}
    >
      {children}
    </ReactI18nProvider>
  );

  return routing ? <RoutingProvider routing={routing}>{content}</RoutingProvider> : content;
}

// Add display name for React DevTools
I18nProvider.displayName = "I18nProvider";
