// §7.2-3 — the three first-party factories that gained a lowercase installer.
// `.use(X(o))` becomes `.with(x(o))` IN PLACE, so the composition order the
// author wrote is the order the host installs in, and the uppercase import
// leaves with its last reference.
//
// The report still names the one thing the codemod cannot see: whatever the
// loader fetches at runtime (§7.3).
import { createI18n } from "@comvi/react";
import { fetchLoader } from "@comvi/plugin-fetch-loader";
import { localeDetector } from "@comvi/plugin-locale-detector";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

export const i18n = createI18n({ locale: "en" })
  .with(fetchLoader({ cdnUrl: "https://cdn.comvi.io/demo" }))
  .with(localeDetector({ order: ["cookie", "navigator"] }))
  .with(inContextEditor({ apiKey: "demo" }));
