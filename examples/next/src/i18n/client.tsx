"use client";

import { devtools } from "@comvi/core/devtools";
import { I18nProvider, type I18nProviderProps } from "@comvi/next/client";

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
 * The browser options a server cannot send (functions), added to the settings the server's
 * `<I18nProvider client={WithBrowserOptions}>` hands over (`props.options`: the fallback
 * locale). The browser has no loader: every catalog it shows came with a payload.
 */
export function WithBrowserOptions(props: I18nProviderProps) {
  return (
    <I18nProvider
      {...props}
      options={{
        ...props.options,
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
    />
  );
}
