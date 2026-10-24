// Framework size fixture: `@comvi/svelte/format`, what a plain-Node module imports.
import { formatRelativeTime } from "@comvi/svelte/format";

console.log(formatRelativeTime({ locale: "en" }, -1, "day"));
