/**
 * Protocol 2 as this extension speaks it (contracts/chrome-extension-proxy.json, `discovery`
 * and `handle`). Imported by the MAIN-world detector only: a module shared with an extension
 * page would become a chunk, and a content script cannot import one.
 */

/** Stamped by vite.config.ts / vitest.config.ts from the workspace `@comvi/editor` version. */
declare const __COMVI_EDITOR_VERSION__: string;

/** The page global core pushes its queue entries onto. */
export const QUEUE_GLOBAL = "__COMVI__";

/** The handle protocol this extension drives: `x.p`. */
export const HANDLE_PROTOCOL = 2;

/** The handle kind this extension drives: `x.kind`. */
export const HANDLE_KIND = "comvi";

/**
 * The exact `@comvi/editor` version this build works with (owner decision D3): baked in at
 * build time, passed to `x.load()`. Never `latest`, never looked up at runtime.
 */
export const EDITOR_VERSION: string = __COMVI_EDITOR_VERSION__;
