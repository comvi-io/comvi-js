import { useMemo } from "react";
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
      formatNumber: (v, o) => i18n.formatNumber(v, o, locale),
      formatDate: (v, o) => i18n.formatDate(v, o, locale),
      formatCurrency: (v, c, o) => i18n.formatCurrency(v, c, o, locale),
      formatRelativeTime: (v, u, o) => i18n.formatRelativeTime(v, u, o, locale),
    }),
    [i18n, locale],
  );
}
