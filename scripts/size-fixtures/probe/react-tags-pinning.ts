// Tags-pinning probe: `useI18n` from @comvi/react plus a bare host, asserting from the
// esbuild metafile (module IDs, never output text) that core's tag chunks stay out of a
// graph that never renders <T>.
import { createI18n } from "@comvi/core";
import { useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
