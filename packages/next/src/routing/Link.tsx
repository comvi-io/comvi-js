"use client";

import NextLink from "next/link";
import { useI18n } from "@comvi/react";
import React, { forwardRef } from "react";
import type { ComponentProps } from "react";
import { useRoutingConfig } from "./context";
import { localizeHref, localizeUrlObject } from "./utils";

export interface LocalizedLinkProps extends Omit<ComponentProps<typeof NextLink>, "locale"> {
  /** Target locale (defaults to current locale) */
  locale?: string;
}

/**
 * Localized Link component that adds locale prefix based on routing config
 *
 * This component wraps Next.js Link and prepends the current locale
 * using localePrefix/pathnames rules from the routing configuration.
 *
 * @example
 * ```tsx
 * import { Link } from '@comvi/next/navigation';
 *
 * // Uses current locale
 * <Link href="/about">About</Link>
 *
 * // Specify different locale
 * <Link href="/about" locale="de">German About</Link>
 * ```
 */
export const Link = forwardRef<HTMLAnchorElement, LocalizedLinkProps>(function Link(
  { href, locale: targetLocale, ...props },
  ref,
) {
  const { locale: currentLocale } = useI18n();
  const locale = targetLocale ?? currentLocale;
  const routing = useRoutingConfig();

  // Prepend locale to href
  const localizedHref =
    typeof href === "string"
      ? localizeHref(href, locale, routing ?? undefined)
      : localizeUrlObject(href, locale, routing ?? undefined);

  return <NextLink ref={ref} href={localizedHref} {...props} />;
});

// Add display name for React DevTools
Link.displayName = "LocalizedLink";
