// Navigation utilities for i18n
// Use these for SEO (sitemap, hreflang) and programmatic navigation

import { createGetPathname } from "@comvi/next/routing";
import { routing } from "./config";

/**
 * Get localized pathname for a given locale
 *
 * @example
 * ```ts
 * getPathname({ locale: 'en', href: '/about' })  // '/about' (default locale, as-needed mode)
 * getPathname({ locale: 'uk', href: '/about' })  // '/uk/about'
 * getPathname({ locale: 'de', href: '/' })       // '/de'
 * ```
 */
export const getPathname = createGetPathname(routing);

// Re-export Link and hooks from @comvi/next/navigation for convenience
export { Link, usePathname, useLocalizedRouter } from "@comvi/next/navigation";
