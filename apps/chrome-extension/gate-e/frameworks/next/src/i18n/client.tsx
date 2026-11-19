"use client";

import { cdn } from "@comvi/core/cdn";
import { devtools } from "@comvi/core/devtools";
import { I18nProvider, type I18nProviderProps } from "@comvi/next/client";
import { CDN } from "./routing";

const loader = cdn(CDN);

/** The browser instance: the server's settings plus the loader and devtools(). */
export function WithDevtools(props: I18nProviderProps) {
  return <I18nProvider {...props} options={{ ...props.options, loader, plugins: [devtools()] }} />;
}
