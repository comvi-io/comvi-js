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
 * Formatter helpers bound to the React-tracked locale. Updates automatically
 * when locale changes — no need to re-invoke. Uses core's optional `locale`
 * arg (W2a) so identity is stable per (i18n, locale) pair.
 *
 * @example
 * ```tsx
 * const { formatDate, formatCurrency } = useFormatters();
 * <p>Price: {formatCurrency(price, "USD")}</p>
 * ```
 *
 * @throws Error if called outside an `<I18nProvider>`.
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
