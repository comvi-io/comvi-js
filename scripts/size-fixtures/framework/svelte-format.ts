// Framework size fixture: `@comvi/svelte/format`, what a plain-Node module imports. The
// formatters take a real instance (lot 4d), so the row carries `createI18n` too.
import { createI18n } from "@comvi/core";
import { formatRelativeTime } from "@comvi/svelte/format";

console.log(formatRelativeTime(createI18n({ locale: "en" }), Date.now() - 86_400_000));
