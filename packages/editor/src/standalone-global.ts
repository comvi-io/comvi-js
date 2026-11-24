/**
 * The entry of `dist/standalone.iife.js`: puts the editor on `window.ComviInContextEditor`.
 * It exports nothing, so the IIFE declares no `var` of its own over the global.
 *
 * An editor already on the page is kept, of this version or another: the extension retries a
 * load that timed out, and the first script may run after the retry's copy was activated, so
 * replacing the global would hide the active editor behind an inactive one; an editor of
 * another version stays visible, so the extension still refuses it (`bad-version`).
 *
 * The rule: a value is an editor when it has what the editor exposes — `activate`,
 * `deactivate` and `isActive` functions and a string `version`. Anything else (null, `{}`, an
 * element whose id names the global, an object with only an unrelated `activate`) is replaced.
 * This trusts nothing new: a page object that imitates the whole shape is kept, as a page
 * could already put one there before this script ran, and the extension then drives it only
 * when its `version` is the exact one it was built for.
 */
import { activate, deactivate, isActive, version } from "./standalone";

type MaybeEditor = Partial<Record<"activate" | "deactivate" | "isActive" | "version", unknown>>;

function isEditor(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as MaybeEditor;
  return (
    typeof v.activate === "function" &&
    typeof v.deactivate === "function" &&
    typeof v.isActive === "function" &&
    typeof v.version === "string"
  );
}

if (typeof window !== "undefined" && !isEditor(window.ComviInContextEditor)) {
  window.ComviInContextEditor = { activate, deactivate, isActive, version };
}
