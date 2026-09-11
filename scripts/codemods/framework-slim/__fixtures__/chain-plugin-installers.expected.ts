// the three first-party factories that gained a lowercase installer.
// `.use(X(o))` becomes `.use(x(o))` IN PLACE — only the callee changes, since
// `.use` is already the one composition verb — so the composition order the
// author wrote is the order the host installs in, and the uppercase import
// leaves with its last reference.
//
// The report still names the one thing the codemod cannot see: whatever the
// loader fetches at runtime.
import { createI18n } from "@comvi/react";
import { fetchLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

export const i18n = createI18n({ locale: "en" })
  .use(fetchLoader({ cdnUrl: "https://cdn.comvi.io/demo" }))
  .use(localeDetector({ order: ["cookie", "navigator"] }))
  .use(inContextEditor({ apiKey: "demo" }));
