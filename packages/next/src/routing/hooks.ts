"use client";

import { useRouter, usePathname as useNextPathname } from "next/navigation";
import { useI18n } from "@comvi/react";
import { useCallback } from "react";
import { useRoutingConfig } from "./context";
import { getCanonicalPathname, localizeHref, stripLocalePrefix } from "./utils";

/**
 * Get pathname without locale prefix
 *
 * This hook returns the current pathname with the locale prefix removed,
 * making it easier to work with routes in a locale-agnostic way.
 *
 * @returns Pathname without locale prefix
 *
 * @example
 * ```tsx
 * import { usePathname } from '@comvi/next/navigation';
 *
 * function MyComponent() {
 *   const pathname = usePathname();
 *   // If URL is /en/about, pathname is /about
 *   return <p>Current page: {pathname}</p>;
 * }
 * ```
 */
export function usePathname(): string {
  const pathname = useNextPathname() ?? "/";
  const routing = useRoutingConfig();
  const { locale } = useI18n();

  if (routing) {
    const publicPathname = stripLocalePrefix(pathname, routing.locales);
    return getCanonicalPathname(publicPathname, routing, locale);
  }

  // Fallback: remove locale prefix based on current locale only
  if (pathname.startsWith(`/${locale}/`)) {
    return pathname.slice(locale.length + 1);
  }
  if (pathname === `/${locale}`) {
    return "/";
  }
  return pathname;
}

/**
 * Return type for useLocalizedRouter
 */
export interface LocalizedRouter {
  /** Navigate to a localized path */
  push: (href: string, locale?: string) => void;
  /** Replace current history entry with a localized path */
  replace: (href: string, locale?: string) => void;
  /** Navigate back */
  back: () => void;
  /** Navigate forward */
  forward: () => void;
  /** Refresh the current page */
  refresh: () => void;
  /** Prefetch a localized path */
  prefetch: (href: string, locale?: string) => void;
}

/**
 * Localized router with automatic locale prefixing
 *
 * This hook wraps Next.js useRouter and automatically adds locale
 * prefixes to navigation methods.
 *
 * @returns Localized router object
 *
 * @example
 * ```tsx
 * import { useLocalizedRouter } from '@comvi/next/navigation';
 *
 * function MyComponent() {
 *   const router = useLocalizedRouter();
 *
 *   const handleClick = () => {
 *     router.push('/about'); // Navigates to /en/about (or current locale)
 *   };
 *
 *   const handleGerman = () => {
 *     router.push('/about', 'de'); // Navigates to /de/about
 *   };
 *
 *   return <button onClick={handleClick}>Go to About</button>;
 * }
 * ```
 */
export function useLocalizedRouter(): LocalizedRouter {
  const router = useRouter();
  const { locale } = useI18n();
  const routing = useRoutingConfig();

  const push = useCallback(
    (href: string, targetLocale?: string) => {
      const resolvedLocale = targetLocale ?? locale;
      const localizedHref = localizeHref(href, resolvedLocale, routing ?? undefined);
      router.push(localizedHref);
    },
    [router, locale, routing],
  );

  const replace = useCallback(
    (href: string, targetLocale?: string) => {
      const resolvedLocale = targetLocale ?? locale;
      const localizedHref = localizeHref(href, resolvedLocale, routing ?? undefined);
      router.replace(localizedHref);
    },
    [router, locale, routing],
  );

  const prefetch = useCallback(
    (href: string, targetLocale?: string) => {
      const resolvedLocale = targetLocale ?? locale;
      const localizedHref = localizeHref(href, resolvedLocale, routing ?? undefined);
      router.prefetch(localizedHref);
    },
    [router, locale, routing],
  );

  return {
    push,
    replace,
    back: router.back,
    forward: router.forward,
    refresh: router.refresh,
    prefetch,
  };
}
