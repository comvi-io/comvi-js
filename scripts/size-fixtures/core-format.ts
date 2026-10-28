// @comvi/core/format: every formatter, the delta an app pays for formatting on top of
// the instance (measured with the instance in the graph, as an app imports it).
import { createI18n } from "@comvi/core";
import * as format from "@comvi/core/format";

const i18n = createI18n({ locale: "en" });
export const out = [
  format.formatNumber(i18n, 1),
  format.formatCurrency(i18n, 1, "EUR"),
  format.formatDate(i18n, 0),
  format.formatDateRange(i18n, 0, 1),
  format.formatRelativeTime(i18n, 0, 1),
  format.formatList(i18n, ["a"]),
  format.displayName(i18n, "de"),
];
