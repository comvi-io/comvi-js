// @comvi/core/devtools — browser-extension discovery, composed onto the host.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { devtools } from "@comvi/core/devtools";
//
// const i18n = createI18n({ locale: "en" }).with(devtools({ instanceId: "app" }));
// ```
//
// The capability assigns `instanceId` and publishes the instance on the
// `window.__COMVI__` discovery queue (protocol v2, mixed-version safe), and
// removes it again on `destroy()`. Configure it HERE — `instanceId` and
// `exposeGlobal` are arguments to `devtools()` / `attachDevtools`, because the
// base host carries no discovery code for `createI18n` to configure, and the
// two constructor options are inert on it.
//
// The internal composite (the CDN global) and `@comvi/next`'s composed host do
// read both options off `I18nOptions`, because they compose this capability in
// the constructor — that is the one place the 0.4 behaviour survives.
import type { I18n } from "./core/i18n";
import type { DevtoolsOptions } from "./core/devtools";
import { attachDevtools } from "./core/devtools";

export { attachDevtools } from "./core/devtools";
export type { DevtoolsOptions } from "./core/devtools";
export type { ComviQueue, ComviQueueEntry, ComviHook } from "./types";

/**
 * Discovery as a configured `.with(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).with(devtools({ exposeGlobal: false }));
 * ```
 *
 * Adds no public members — it populates `instanceId`, which the host already
 * declares — so the host type is returned unchanged. `.with(attachDevtools)`
 * is the unconfigured equivalent.
 *
 * Attaching is idempotent: a second `.with(devtools())`, or the internal
 * composite (which installs discovery in its constructor), installs nothing,
 * re-registers nothing on the discovery queue, and keeps the `instanceId`
 * already assigned.
 */
export function devtools(options?: DevtoolsOptions): <T extends I18n<any>>(i18n: T) => T {
  return (i18n) => attachDevtools(i18n, options);
}
