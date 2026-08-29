// Type-level contract for this package's installer/factory pair, across BOTH
// export conditions.
//
// The `production` condition ships a different BODY, never a different TYPE:
// `inContextEditor` has one signature, so a `.with(inContextEditor())` chain
// type-checks identically whether the bundler picked the default entry or the
// production stub. The two mutual assignments below are that proof.
import { createI18n } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import {
  InContextEditorPlugin,
  inContextEditor,
  type InContextEditorInstaller,
} from "../../src/index";
import {
  InContextEditorPlugin as ProdEditorPlugin,
  inContextEditor as prodInContextEditor,
  type InContextEditorInstaller as ProdInstaller,
} from "../../src/entry-production";

// SAME TYPE under both conditions, in both directions.
export const defaultAsProduction: ProdInstaller = inContextEditor();
export const productionAsDefault: InContextEditorInstaller = prodInContextEditor();
export const defaultFactoryAsProduction: typeof ProdEditorPlugin = InContextEditorPlugin;

// VALID — `.with(inContextEditor(…))` hands the host back UNCHANGED. The
// editor needs no public surface from its caller, and this is the only
// widening that stays truthful under the production condition, where the
// installer attaches nothing at all.
export const edited = createI18n({ locale: "en" }).with(inContextEditor({ debug: true }));
void edited.t;
edited.locale = "de";

// @ts-expect-error — the installer promises no plugin host; compose plugins().
void edited.use;

// WRONG — the uppercase PLUGIN through `.with`. A plugin demands a plugin
// host; the pipe hands it whatever it was called on.
// @ts-expect-error — a bare host has no registerPostProcessor for the plugin to take.
createI18n({ locale: "en" }).with(InContextEditorPlugin());

// WRONG — the lowercase INSTALLER through `.use`. An installer returns a
// host, and a plugin may only return nothing or a cleanup function. This is
// the shape the production identity no-op is rejected by at runtime.
// @ts-expect-error — the installer returns a host, which is not a plugin return value.
createI18n({ locale: "en" }).with(plugins()).use(inContextEditor());

// @ts-expect-error — and identically under the production condition.
createI18n({ locale: "en" }).with(plugins()).use(prodInContextEditor());

// VALID — the uppercase factory on a host that already has the capability.
// This is the pre-existing recipe and it is unchanged.
export const manual = createI18n({ locale: "en" }).with(plugins());
manual.use(InContextEditorPlugin());
