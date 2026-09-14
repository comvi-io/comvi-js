/**
 * The DEVELOPMENT half of `#dev-warn` (see the `imports` map in package.json).
 * A consumer reaches this file only when its bundler resolves the
 * `"development"` condition — a vite dev server, a `NODE_ENV=development`
 * vite build, `webpack --mode development`, or `--conditions=development`.
 * `dev-warn.ts` is the production no-op; read its header for why the split
 * exists at all.
 *
 * KEEP THE TWO EXPORT SURFACES EQUAL — `tests/dev-warn.test.ts` asserts it.
 */

// Keyed by HOST identity, not one module-wide flag: a single boolean would
// leak across unrelated hosts (two apps' worth on one page, or two test files
// sharing a worker's module cache). `/* @__PURE__ */` so the allocation is not
// a side effect that pins the module (pattern: core/src/utils/lateCompose.ts).
const warnedRawProp = /* @__PURE__ */ new WeakSet<object>();

/** Warns once per host that `<T raw>` is deprecated. */
export function warnDeprecatedRawProp(host: object): void {
  if (!warnedRawProp.has(host)) {
    warnedRawProp.add(host);
    console.warn(
      "[i18n] <T raw> is deprecated. Use <T skipPostProcess> instead — `raw` will be removed in a future release.",
    );
  }
}

// A separate WeakSet from `warnedRawProp`: an unrelated deprecation on the
// same host must not suppress or be suppressed by this one.
const warnedAllowedTagsProp = /* @__PURE__ */ new WeakSet<object>();

/** Warns once per host that `<T allowedTags>` is gone and the prop is dropped. */
export function warnDeprecatedAllowedTagsProp(host: object): void {
  if (!warnedAllowedTagsProp.has(host)) {
    warnedAllowedTagsProp.add(host);
    console.warn(
      "[i18n] <T allowedTags> is gone. <T> renders structurally now; tag handlers come from `components`. The prop is dropped and ignored — delete it.",
    );
  }
}
