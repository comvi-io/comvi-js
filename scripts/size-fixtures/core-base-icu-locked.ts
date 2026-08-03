// Informational fixture: the ICU installer's FAILURE path. Same module graph as
// `core-base-icu-installer` — the lock and its error live in the same modules —
// so this row exists to keep the cost of the loud late-call behaviour visible,
// not as a second gate.
import { createI18n } from "@comvi/core";
import { icu } from "@comvi/core/icu";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

try {
  i18n.with(icu());
} catch (error) {
  console.log((error as { code?: string }).code);
}

console.log(i18n.t("greeting" as never, { name: "world" } as never));
