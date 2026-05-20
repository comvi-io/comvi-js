import { useCallback, useTransition } from "react";
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
  const [isPending, startTransition] = useTransition();

  const setLocale = useCallback(
    (locale: string) => {
      startTransition(() => {
        i18n.setLocaleAsync(locale).catch((err) => {
          const error = err instanceof Error ? err : new Error(String(err));
          i18n.reportError(error, { source: "init", locale });
        });
      });
    },
    [i18n, startTransition],
  );

  return { isPending, setLocale };
}
