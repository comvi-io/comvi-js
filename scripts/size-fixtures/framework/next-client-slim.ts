// Framework size fixture (plan P0.7 / §4.6): the next CLIENT recipe graph —
// the server loads, the client pays the bare-slim price and is hydrated via
// `addTranslations`. The client layer is react's D' host, re-exported by
// `@comvi/next/client`.
// PENDING until Phase 5 (which inherits Phase 2's react retarget).
import { createI18n } from "@comvi/core/slim";
import { I18nProvider, useI18n } from "@comvi/next/client";

const i18n = createI18n({ locale: "en" });

// Hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations("en", { greeting: "Hello, {name}!" } as never);

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
