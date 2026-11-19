/**
 * The entry of `dist/standalone.iife.js`: puts the editor on `window.ComviInContextEditor`.
 * It exports nothing, so the IIFE declares no `var` of its own over the global.
 *
 * A page that already has an editor keeps it. The extension retries a load that timed out,
 * and the first script may run after the retry's copy was activated: replacing the global
 * then would hide the active editor behind an inactive one. An editor of another version
 * stays too, so the extension still sees it and refuses it (`bad-version`).
 */
import { activate, deactivate, isActive, version } from "./standalone";

if (typeof window !== "undefined" && window.ComviInContextEditor === undefined) {
  window.ComviInContextEditor = { activate, deactivate, isActive, version };
}
