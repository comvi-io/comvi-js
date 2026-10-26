// `@comvi/svelte/format`: the standalone formatters for code that runs in plain
// Node (tests, scripts). The root re-exports `T.svelte`, which only a
// Svelte-aware bundler can load; this entry imports nothing but `@comvi/core`.
export { formatNumber, formatDate, formatCurrency, formatRelativeTime } from "@comvi/core";
export type { LocaleSource } from "@comvi/core";
