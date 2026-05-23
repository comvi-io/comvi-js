import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useI18nInstance } from "./I18nProvider";

export interface UseSetLocaleTransitionReturn {
  /** True while a setLocale transition is pending */
  isPending: boolean;
  /** Initiate a locale change inside a React transition (non-blocking) */
  setLocale: (locale: string) => void;
}

/**
 * Wraps `i18n.setLocaleAsync()` in a React `useTransition` so the old UI
 * remains interactive while the new locale loads. Returns `{ isPending, setLocale }`.
 *
 * @example
 * function LangSwitcher() {
 *   const { isPending, setLocale } = useSetLocaleTransition();
 *   return (
 *     <button onClick={() => setLocale("fr")} disabled={isPending}>
 *       {isPending ? "Loading…" : "Français"}
 *     </button>
 *   );
 * }
 */
export function useSetLocaleTransition(): UseSetLocaleTransitionReturn {
  const { i18n } = useI18nInstance();
  const [isTransitionPending, startTransition] = useTransition();
  const [isAsyncPending, setIsAsyncPending] = useState(false);
  const mountedRef = useRef(true);
  const pendingCountRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLocale = useCallback(
    (locale: string) => {
      startTransition(() => {
        pendingCountRef.current += 1;
        if (mountedRef.current) {
          setIsAsyncPending(true);
        }

        i18n
          .setLocaleAsync(locale)
          .catch((err) => {
            const error = err instanceof Error ? err : new Error(String(err));
            i18n.reportError(error, { source: "setLocale", locale });
          })
          .finally(() => {
            pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
            if (mountedRef.current && pendingCountRef.current === 0) {
              setIsAsyncPending(false);
            }
          });
      });
    },
    [i18n, startTransition],
  );

  return { isPending: isTransitionPending || isAsyncPending, setLocale };
}
