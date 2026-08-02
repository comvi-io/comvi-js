import { useMemo } from "react";
import { formatCurrency, formatDate, formatNumber, formatRelativeTime } from "@comvi/core/slim";
import { useLocale, useI18nInstance } from "./I18nProvider";

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
 * automatically when locale changes; identity is stable per `(i18n, locale)`.
 *
 * @example
 * ```tsx
 * const { formatCurrency } = useFormatters();
 * <p>Price: {formatCurrency(price, "USD")}</p>
 * ```
 */
export function useFormatters(): UseFormattersReturn {
  const { i18n } = useI18nInstance();
  const locale = useLocale();
  return useMemo<UseFormattersReturn>(
    () => ({
      formatNumber: (v, o) => formatNumber(i18n, v, o, locale),
      formatDate: (v, o) => formatDate(i18n, v, o, locale),
      formatCurrency: (v, c, o) => formatCurrency(i18n, v, c, o, locale),
      formatRelativeTime: (v, u, o) => formatRelativeTime(i18n, v, u, o, locale),
    }),
    [i18n, locale],
  );
}
