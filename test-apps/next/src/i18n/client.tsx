"use client";

import { I18nProvider, type I18nProviderProps } from "@comvi/next/client";
import type { Loader } from "@comvi/core";
import { options } from "./routing";

/**
 * The optional browser loader (C2): a public source the browser may ask for a catalog no
 * payload brought. A function, so it lives in this client module, never in a server prop.
 */
const loader: Loader = async (locale, ns, signal) => {
  const res = await fetch(`${process.env.NEXT_PUBLIC_COMVI_E2E_CATALOGS}/${ns}/${locale}.json`, {
    signal,
  });
  if (!res.ok) throw new Error(`${ns}/${locale}: ${res.status}`);
  return res.json();
};

export function Provider(props: Omit<I18nProviderProps, "options">) {
  return <I18nProvider {...props} options={{ ...options, loader }} />;
}
