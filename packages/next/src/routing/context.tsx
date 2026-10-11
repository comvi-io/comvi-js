"use client";

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { extractLocaleFromPath, stripLocalePrefix } from "@comvi/locale-routing";
import type { RoutingConfig } from "./types";
import { defineRouting } from "./defineRouting";

const RoutingContext = createContext<Required<RoutingConfig> | null>(null);

export interface RoutingProviderProps {
  routing: RoutingConfig;
  /** The locale the tree renders in: a new one means a navigation landed. */
  locale: string;
  children: React.ReactNode;
}

export function RoutingProvider({ routing, locale, children }: RoutingProviderProps) {
  const value = useMemo(() => defineRouting(routing), [routing]);

  // Keep the public URL in the address bar. A locale switch navigates to the
  // locale-prefixed URL and the middleware redirects it to the public one
  // (`/en/about` → `/about` under `as-needed`), but Next 16 answers a repeated
  // switch from its client cache and keeps the URL that was asked for: the
  // right page under a URL the middleware would never leave standing. Only a
  // prefix the mode does not want is removed, so this is that same redirect.
  //
  // It reads the browser's URL when `locale` changes, not `usePathname()`: this
  // module is in the client entry's static graph, which must import in plain
  // Node ESM, and `next/navigation` does not resolve there.
  useEffect(() => {
    const { pathname } = location;
    const { locales, defaultLocale, localePrefix } = value;
    const pathLocale = extractLocaleFromPath(pathname, locales);
    if (
      pathLocale !== undefined &&
      (localePrefix === "never" || (localePrefix === "as-needed" && pathLocale === defaultLocale))
    ) {
      window.history.replaceState(
        null,
        "",
        stripLocalePrefix(pathname, locales) + location.search + location.hash,
      );
    }
  }, [locale, value]);
  return <RoutingContext.Provider value={value}>{children}</RoutingContext.Provider>;
}

export function useRoutingConfig(): Required<RoutingConfig> | null {
  return useContext(RoutingContext);
}
