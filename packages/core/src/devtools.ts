// @comvi/core/devtools — browser-extension discovery, composed onto the instance.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core";
// import { devtools } from "@comvi/core/devtools";
//
// const i18n = createI18n({ locale: "en" }).use(devtools({ instanceId: "app" }));
// ```
//
// The capability assigns `instanceId` and publishes the instance on the
// `window.__COMVI__` discovery queue (protocol v2, mixed-version safe), then
// removes it again on `destroy()`. Configure it HERE: the base instance carries no
// discovery code, so the `instanceId` / `exposeGlobal` CONSTRUCTOR options are
// inert on it. Only the composite (the CDN global) reads both off `I18nOptions`,
// because it composes this capability in its constructor.
//
// In a browser the capability also installs the page-level editor loader the
// Comvi browser extension calls to load the in-context editor from jsDelivr
// (`contracts/chrome-extension-proxy.json`, `editorLoader`). Nothing is
// requested until the extension asks. `editorVersion` pins the editor to an
// exact version; without it the loader requests `latest`. The CDN global (the
// UMD composite) takes no such option and always loads `latest`.
import type { I18n } from "./core/i18n";
import type { DevtoolsOptions } from "./core/devtools";
import { attachDevtools } from "./core/devtools";

export { attachDevtools } from "./core/devtools";
export type { DevtoolsOptions } from "./core/devtools";
export type {
  ComviQueue,
  ComviQueueEntry,
  ComviHook,
  EditorLoadResult,
  EditorLoadFailureCode,
  EditorLoaderSlot,
} from "./types";

/**
 * Discovery as a configured `.use(…)` installer.
 *
 * ```ts
 * const i18n = createI18n({ locale: "en" }).use(devtools({ exposeGlobal: false }));
 * ```
 *
 * Adds no public members — it populates `instanceId`, which the instance already
 * declares — so the instance type is returned unchanged. `.use(attachDevtools)`
 * is the unconfigured equivalent.
 *
 * Attaching is idempotent: a second `.use(devtools())`, or the composite
 * (which installs discovery in its constructor), installs nothing, re-registers
 * nothing on the queue, and keeps the `instanceId` already assigned.
 */
export function devtools(options?: DevtoolsOptions): <T extends I18n<any>>(i18n: T) => T {
  return (i18n) => attachDevtools(i18n, options);
}
