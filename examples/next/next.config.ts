import { withComvi } from "@comvi/next/plugin";

// Points `@comvi/next/config` at `src/i18n/config.ts`, under webpack and
// Turbopack alike. `getI18n()`, `loadMessages()` and `<ComviProvider>` from
// `@comvi/next/server` read the instance from there, and so does the client half
// of `<ComviProvider>`: no `setI18n()` module and no "use client" wrapper here.
export default withComvi({ config: "./src/i18n/config.ts" })({});
