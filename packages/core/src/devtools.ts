// @comvi/core/devtools — browser-extension discovery for the slim entry.
//
// Pure subpath (never listed in package.json `sideEffects`): importing it has
// no effect until you compose an instance.
//
// ```ts
// import { createI18n } from "@comvi/core/slim";
// import { attachDevtools } from "@comvi/core/devtools";
//
// const i18n = attachDevtools(createI18n({ locale: "en" }));
// ```
//
// `attachDevtools` assigns `instanceId` and publishes the instance on the
// `window.__COMVI__` discovery queue (protocol v2, mixed-version safe), and
// removes it again on `destroy()`. Configure it HERE — `instanceId` and
// `exposeGlobal` are arguments to `attachDevtools`, because a bare slim
// instance carries no discovery code for `createI18n` to configure.
//
// The `@comvi/core` entry composes this capability in on the class itself,
// so `new I18n({ … })` keeps reading both options off its own options object
// and there is nothing to attach there.
export { attachDevtools } from "./core/devtools";
export type { DevtoolsOptions } from "./core/devtools";
export type { ComviQueue, ComviQueueEntry, ComviHook } from "./types";
