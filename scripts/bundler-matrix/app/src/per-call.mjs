// /tags subpath: ambient registration on import, then the per-call channel
// (plan §1.1 dual-channel rule / amendment 6 assertion (b)).
//
// 1. Importing "@comvi/core/tags" must register tag syntax ambiently — the
//    registration lives in the sideEffects-listed chunk, so a bundler that
//    strips it breaks the first assertion.
// 2. After disposing the ambient registration, the per-call channel
//    (tagInterpolation.extensions) must still render tags on its own —
//    ordering-proof and immune to side-effect stripping by construction.
import { createI18n } from "@comvi/core";
import { registerTagSyntax, tagSyntaxExtension } from "@comvi/core/tags";

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(
      `FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
    process.exit(1);
  }
}

const TEMPLATE = "<link>hi</link>";
const translation = { en: { msg: TEMPLATE } };
const linkHandler = ({ children }) => `[${children}]`;

// Ambient channel: importing /tags registered the extension module-globally.
const ambient = createI18n({ locale: "en", translation });
assertEqual(
  ambient.t("msg", { link: linkHandler }),
  "[hi]",
  "ambient tag rendering via the /tags import side effect",
);

// Tear ambient down (registerTagSyntax is idempotent and returns a disposer).
const dispose = registerTagSyntax();
dispose();

// With ambient gone a plain instance renders the tag literally...
const plain = createI18n({ locale: "en", translation });
assertEqual(
  plain.t("msg", { link: linkHandler }),
  TEMPLATE,
  "literal rendering once the ambient registration is disposed",
);

// ...while the per-call channel keeps rendering tags with zero ambient state.
const perCall = createI18n({
  locale: "en",
  translation,
  tagInterpolation: { extensions: [tagSyntaxExtension] },
});
assertEqual(
  perCall.t("msg", { link: linkHandler }),
  "[hi]",
  "per-call channel (tagInterpolation.extensions) with no ambient registration",
);

console.log("BUNDLER_MATRIX_OK per-call");
