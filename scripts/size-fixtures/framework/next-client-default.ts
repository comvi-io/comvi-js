// Framework size fixture: the DEFAULT Next.js CLIENT bundle.
import { createI18n, I18nProvider, useI18n } from "@comvi/next/client";

const i18n = createI18n({ locale: "en" });

// Hydration path: the server-serialized catalog arrives as plain data.
i18n.addTranslations("en", { greeting: "Hello, {name}!" } as never);

console.log(i18n.t("greeting" as never, { name: "world" } as never), I18nProvider, useI18n);
