"use client";

import { useRouter, usePathname as useNextPathname } from "next/navigation";
import { useLocale } from "@comvi/react";
import { useCallback } from "react";
import { useRoutingConfig } from "./context";
import { getCanonicalPathname, localizeHref, stripLocalePrefix } from "./utils";
import { getSwitchRouting, writeLocaleCookie } from "./localeSwitch";

/**
 * Get pathname without locale prefix.
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
  const locale = useLocale();

  if (routing) {
    const publicPathname = stripLocalePrefix(pathname, routing.locales);
    return getCanonicalPathname(publicPathname, routing, locale);
  }

  // No routing config: strip the current locale only.
  if (pathname.startsWith(`/${locale}/`)) {
    return pathname.slice(locale.length + 1);
  }
  if (pathname === `/${locale}`) {
    return "/";
  }
  return pathname;
}

export interface LocalizedRouter {
  /** Navigate to a localized path */
  push: (href: string, locale?: string) => void;
  /** Replace current history entry with a localized path */
  replace: (href: string, locale?: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  /** Prefetch a localized path */
  prefetch: (href: string, locale?: string) => void;
}

/**
 * Wraps Next.js useRouter and adds locale prefixes to the navigation methods.
 *
 * `push` and `replace` with a locale record it in the locale cookie, and with
 * another locale than the current one they navigate to the locale-prefixed URL,
 * which the middleware redirects to the public one. That is what lets a switch
 * to the default locale win under `localePrefix: "as-needed"`. `prefetch`
 * does neither.
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
  const locale = useLocale();
  const routing = useRoutingConfig();

  // The href to navigate to. Naming a locale records it in the locale cookie,
  // and naming ANOTHER locale is a switch, which goes to the locale-prefixed
  // URL: see `localeSwitch.ts`.
  const localizeNavigation = useCallback(
    (href: string, targetLocale?: string): string => {
      if (targetLocale === undefined) {
        return localizeHref(href, locale, routing ?? undefined);
      }
      writeLocaleCookie(routing, targetLocale);
      const isSwitch = routing !== null && targetLocale !== locale;
      return localizeHref(
        href,
        targetLocale,
        isSwitch ? getSwitchRouting(routing) : (routing ?? undefined),
      );
    },
    [locale, routing],
  );

  const push = useCallback(
    (href: string, targetLocale?: string) => {
      router.push(localizeNavigation(href, targetLocale));
    },
    [router, localizeNavigation],
  );

  const replace = useCallback(
    (href: string, targetLocale?: string) => {
      router.replace(localizeNavigation(href, targetLocale));
    },
    [router, localizeNavigation],
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
