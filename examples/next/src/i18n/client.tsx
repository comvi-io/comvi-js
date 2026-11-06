"use client";

import type { ReactNode } from "react";
import { devtools } from "@comvi/core/devtools";
import { I18nProvider, type I18nProviderProps } from "@comvi/next/client";
import { options, routing } from "./routing";

/** A tiny store for the demo's own counter, read with useSyncExternalStore. */
function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** Distinct keys reported missing in this browser. In your app, send them to an error tracker. */
export const missingKeys = store<ReadonlySet<string>>(new Set());

/**
 * The browser side of a page: the payload the server rendered with, and the
 * options a server cannot send (functions). The browser has no loader: every
 * catalog it shows came with a payload.
 */
export function Provider({
  payload,
  children,
}: Pick<I18nProviderProps, "payload"> & { children: ReactNode }) {
  return (
    <I18nProvider
      payload={payload}
      routing={routing}
      options={{
        ...options,
        // Makes the instance visible to the Comvi browser extension.
        plugins: [devtools()],
        // t() never throws: every problem is reported here.
        onError(error) {
          if (error.code !== "missing_key" || typeof window === "undefined") return;
          const id = `${error.ns}:${error.key}`;
          queueMicrotask(() => {
            if (!missingKeys.get().has(id)) missingKeys.set(new Set(missingKeys.get()).add(id));
          });
        },
      }}
    >
      {children}
    </I18nProvider>
  );
}
