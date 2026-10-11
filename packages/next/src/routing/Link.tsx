"use client";

import NextLink from "next/link";
import { useLocale } from "@comvi/react";
import React, { forwardRef } from "react";
import type { ComponentProps } from "react";
import { useRoutingConfig } from "./context";
import { localizeHref, localizeUrlObject } from "./utils";
import { getSwitchRouting, writeLocaleCookie } from "./localeSwitch";

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
 *
 * A link that names a locale records it in the locale cookie when clicked. A
 * link to another locale than the current one points at the locale-prefixed
 * URL, which the middleware redirects to the public one, and is not prefetched.
 */
export const Link = forwardRef<HTMLAnchorElement, LocalizedLinkProps>(function Link(
  { href, locale: targetLocale, onClick, prefetch, ...props },
  ref,
) {
  const currentLocale = useLocale();
  const locale = targetLocale ?? currentLocale;
  const routing = useRoutingConfig();

  // A link to ANOTHER locale is a locale switch (see `localeSwitch.ts`). It
  // goes to the locale-prefixed URL, and it is never prefetched: a prefetch is
  // a real request through the middleware, which would move the locale cookie
  // to that locale without a click.
  const isLocaleSwitch = targetLocale !== undefined && targetLocale !== currentLocale;
  const hrefRouting =
    routing && isLocaleSwitch ? getSwitchRouting(routing) : (routing ?? undefined);

  const localizedHref =
    typeof href === "string"
      ? localizeHref(href, locale, hrefRouting)
      : localizeUrlObject(href, locale, hrefRouting);

  // A link that names a locale records it in the locale cookie when clicked.
  const handleClick: LocalizedLinkProps["onClick"] = (event) => {
    onClick?.(event);
    if (targetLocale !== undefined && !event.defaultPrevented) {
      writeLocaleCookie(routing, targetLocale);
    }
  };

  return (
    <NextLink
      ref={ref}
      href={localizedHref}
      prefetch={isLocaleSwitch ? false : prefetch}
      onClick={handleClick}
      {...props}
    />
  );
});

Link.displayName = "LocalizedLink";
