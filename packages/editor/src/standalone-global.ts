/**
 * The entry of `dist/standalone.iife.js`: puts the editor on `window.ComviInContextEditor`.
 * It exports nothing, so the IIFE declares no `var` of its own over the global.
 *
 * A page that already has an editor (a value with a function `activate`) keeps it. The extension retries a load that timed out,
 * and the first script may run after the retry's copy was activated: replacing the global
 * then would hide the active editor behind an inactive one. An editor of another version
 * stays too, so the extension still sees it and refuses it (`bad-version`).
 */
import { activate, deactivate, isActive, version } from "./standalone";

const existing = (typeof window !== "undefined" ? window.ComviInContextEditor : undefined) as
  { activate?: unknown } | null | undefined;
// Only an editor counts as one: a stale value (null, `{}`, an element whose id names the
// global) is replaced.
if (typeof window !== "undefined" && typeof existing?.activate !== "function") {
  window.ComviInContextEditor = { activate, deactivate, isActive, version };
}
