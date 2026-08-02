// Tags-pinning probe (plan P0.3, quantifying byte caveat §2.1(1)).
//
// A wrapper runtime module that value-imports from the ROOT `@comvi/core`
// entry keeps that entry — and with it the side-effectful `import
// "./register-tags"` — alive in the app graph, no matter which core entry the
// APP chose. This fixture is exactly that shape: `useI18n` from @comvi/react
// plus a bare-slim host.
//
// The gate asserts SENTINEL MODULE IDS from the esbuild metafile (never an
// output-text substring): the tags chunks pinned by core's `sideEffects`
// array. Expected PRESENT today; expected ABSENT after the Phase-2 retarget,
// at which point `expectSentinels` flips and the module-ID diff recorded in
// this fixture's `baseline` block is the named input for P2's diagnosis cycle.
import { createI18n } from "@comvi/core/slim";
import { useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
