import { withComvi } from "@comvi/next/plugin";

// `types` writes src/types/i18n.d.ts from the English catalogs: once before `next build`
// type-checks, and on every catalog change in `next dev`, so `t()` checks keys and parameters.
export default withComvi({ types: { from: "./src/locales", sourceLocale: "en" } })({});
