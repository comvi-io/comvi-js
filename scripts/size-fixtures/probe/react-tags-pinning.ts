// Tags-pinning probe (plan P0.3, quantifying byte caveat §2.1(1)).
//
// HISTORICAL SHAPE, stated as of P0.3 and PRE-CONVERGENCE: back then core's
// root was the batteries-included entry that ran `import "./register-tags"`
// itself, so a wrapper runtime module which value-imported it kept that entry
// — and with it the side-effectful registration — alive in the app graph, no
// matter which core entry the APP chose. That is the shape this fixture was
// built to catch: `useI18n` from @comvi/react plus a bare host.
//
// Post-convergence the root is the pure BASE host and registers nothing, so
// value-importing it pins bytes only; core's tag chunks now enter a graph just
// through an explicit `@comvi/core/tags` import, which lives in the `<T>`
// chunk this fixture never renders.
//
// The gate asserts SENTINEL MODULE IDS from the esbuild metafile (never an
// output-text substring): the tags chunks pinned by core's `sideEffects`
// array. They were expected PRESENT at P0.3 and ABSENT after the Phase-2
// retarget, at which point `expectSentinels` flipped; the module-ID diff
// recorded in this fixture's `baseline` block was the named input for P2's
// diagnosis cycle.
import { createI18n } from "@comvi/core";
import { useI18n } from "@comvi/react";

const i18n = createI18n({
  locale: "en",
  translation: { en: { greeting: "Hello, {name}!" } },
});

console.log(i18n.t("greeting" as never, { name: "world" } as never), useI18n);
