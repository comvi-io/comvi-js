import { useMemo, useSyncExternalStore } from "react";
import { formatCurrency, formatDate, formatNumber, formatRelativeTime } from "@comvi/core";
import type { LocaleSource } from "@comvi/core";
import { useLocale, useI18nInstanceContext, useSubscribe } from "./I18nProvider";

export interface UseFormattersReturn {
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string;
  formatCurrency(value: number, currency: string, options?: Intl.NumberFormatOptions): string;
  formatRelativeTime(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ): string;
}

/**
 * Formatter helpers bound to the React-tracked locale. Output updates
 * automatically when locale changes; identity is stable per `(i18n, locale, fallback chain)`.
 *
 * @example
 * ```tsx
 * const { formatCurrency } = useFormatters();
 * <p>Price: {formatCurrency(price, "USD")}</p>
 * ```
 */
export function useFormatters(): UseFormattersReturn {
  const { i18n } = useI18nInstanceContext();
  const locale = useLocale();
  const subscribeConfig = useSubscribe(i18n, "configChanged");
  const getChain = () => JSON.stringify(i18n.getFallbackLocales());
  const chain = useSyncExternalStore(subscribeConfig, getChain, getChain);
  return useMemo<UseFormattersReturn>(() => {
    const source: LocaleSource = {
      locale,
      get fallbackLocales() {
        return i18n.fallbackLocales;
      },
    };
    return {
      formatNumber: (v, o) => formatNumber(source, v, o),
      formatDate: (v, o) => formatDate(source, v, o),
      formatCurrency: (v, c, o) => formatCurrency(source, v, c, o),
      formatRelativeTime: (v, u, o) => formatRelativeTime(source, v, u, o),
    };
  }, [i18n, locale, chain]);
}
