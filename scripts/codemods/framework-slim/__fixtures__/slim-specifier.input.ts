// static ESM imports and re-exports move off the retired `/slim`
// host tier. Every binding keeps the same API on the converged root entry.
import { createI18n } from "@comvi/core/slim";
import { useI18n } from "@comvi/react/slim";

export { useI18nLoader } from "@comvi/react/slim";

export const i18n = createI18n({ locale: "en" });

export { useI18n };
