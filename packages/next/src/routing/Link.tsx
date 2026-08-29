"use client";

import NextLink from "next/link";
import { useLocale } from "@comvi/react";
import React, { forwardRef } from "react";
import type { ComponentProps } from "react";
import { useRoutingConfig } from "./context";
import { localizeHref, localizeUrlObject } from "./utils";

export interface LocalizedLinkProps extends Omit<ComponentProps<typeof NextLink>, "locale"> {
  /** Target locale (defaults to current locale) */
  locale?: string;
}

/**
 * Wraps Next.js Link and prepends the locale, using the localePrefix /
 * pathnames rules from the routing configuration.
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
  const currentLocale = useLocale();
  const locale = targetLocale ?? currentLocale;
  const routing = useRoutingConfig();

  const localizedHref =
    typeof href === "string"
      ? localizeHref(href, locale, routing ?? undefined)
      : localizeUrlObject(href, locale, routing ?? undefined);

  return <NextLink ref={ref} href={localizedHref} {...props} />;
});

Link.displayName = "LocalizedLink";
