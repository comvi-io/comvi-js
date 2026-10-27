// @comvi/core/plugins: detect() + persist() with the instance.
import { createI18n } from "@comvi/core";
import { detect, persist } from "@comvi/core/plugins";

export const out = createI18n({
  locale: detect({ supported: ["en", "de"] }),
  plugins: [persist()],
});
