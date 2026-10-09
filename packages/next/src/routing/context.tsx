"use client";

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { extractLocaleFromPath, stripLocalePrefix } from "@comvi/locale-routing";
import type { RoutingConfig } from "./types";
import { defineRouting } from "./defineRouting";

const RoutingContext = createContext<Required<RoutingConfig> | null>(null);

export interface RoutingProviderProps {
  routing: RoutingConfig;
  children: React.ReactNode;
}

export function RoutingProvider({ routing, children }: RoutingProviderProps) {
  const value = useMemo(() => defineRouting(routing), [routing]);

  // Keep the public URL in the address bar. A locale switch navigates to the
  // locale-prefixed URL and the middleware redirects it to the public one
  // (`/en/about` → `/about` under `as-needed`), but Next 16 answers a repeated
  // switch from its client cache and keeps the URL that was asked for: the
  // right page under a URL the middleware would never leave standing. Only a
  // prefix the mode does not want is removed, so this is that same redirect.
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
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
  }, [pathname, value]);
  return <RoutingContext.Provider value={value}>{children}</RoutingContext.Provider>;
}

export function useRoutingConfig(): Required<RoutingConfig> | null {
  return useContext(RoutingContext);
}
