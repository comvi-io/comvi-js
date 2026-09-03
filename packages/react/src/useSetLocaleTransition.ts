import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useI18nInstance } from "./I18nProvider";

export interface UseSetLocaleTransitionReturn {
  isPending: boolean;
  setLocale: (locale: string) => void;
}

/**
 * Wraps `i18n.setLocaleAsync()` in a React `useTransition` so the old UI
 * remains interactive while the new locale loads.
 *
 * `isPending` covers the whole switch, including the async catalog load. The
 * transition itself covers only the synchronous part of it.
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
  // Starts true, not false: layout effects run BEFORE this hook's passive
  // mount effect, so a consumer calling `setLocale` from one on mount would
  // otherwise be told the component is gone and never see `isPending`.
  const mountedRef = useRef(true);
  const pendingCountRef = useRef(0);

  useEffect(() => {
    // Re-armed on every effect run, not just initialised by `useRef`:
    // StrictMode mounts, runs the cleanup, then mounts again, and a flag that
    // only ever goes down would leave the hook believing it was unmounted.
    mountedRef.current = true;
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
