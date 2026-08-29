// Report-only — three constructor shapes the codemod refuses to guess at:
// options built somewhere else, a catalog built somewhere else (it cannot see
// whether either carries ICU syntax, nested keys or the two discovery options),
// and discovery options next to a chain that already composes `devtools(…)`,
// where merging them would decide a precedence the author never wrote.
import { createI18n, devtools } from "@comvi/react";
import { catalogs, hostOptions } from "./options";

export const elsewhere = createI18n(hostOptions);

export const fromModule = createI18n({ locale: "en", translation: catalogs });

export const twice = createI18n({ locale: "en", instanceId: "app" }).with(
  devtools({ exposeGlobal: false }),
);
