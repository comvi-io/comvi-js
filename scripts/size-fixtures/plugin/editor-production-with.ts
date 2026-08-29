// Informational: `.with(inContextEditor())` under the package's `production`
// export condition — which is the condition this gate always applies
// (`PRODUCTION_CONDITIONS` in scripts/size-check.mjs).
//
// The row exists to prove a NEGATIVE in bytes. Under `production` the
// installer is `(host) => host`: it imports neither `@comvi/core/devtools` nor
// `@comvi/core/plugins`, attaches nothing and registers nothing, so this graph
// must sit on top of `core-base` with only the identity function and the
// package's production stub in it — no discovery, no plugin host, and none of
// the editor runtime. The sentinels are the assertion; the byte number is the
// evidence behind it.
//
// The DEFAULT condition is not a byte row: the editor runtime dominates it and
// the gate cannot select a non-production condition per fixture. Its behaviour
// — ensure devtools, ensure plugins, register the editor — is pinned by
// packages/plugin-in-context-editor/tests/installer.test.ts instead.
import { createI18n } from "@comvi/core";
import { inContextEditor } from "@comvi/plugin-in-context-editor";

const i18n = createI18n({ locale: "en" }).with(inContextEditor());

console.log(i18n.t("hello" as never));
