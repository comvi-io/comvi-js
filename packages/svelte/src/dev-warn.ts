/**
 * The PRODUCTION half of `#dev-warn` (see the `imports` map in package.json).
 * Deliberately a set of no-ops: the warning texts are not in this file, so
 * they are not in the published production artifact either.
 *
 * WHY A SEPARATE MODULE AT ALL. The other three bindings bake `__DEV__` per
 * artifact and publish a second `.dev` bundle behind the `"development"`
 * export condition. `@comvi/svelte` cannot: it is published by
 * `svelte-package`, which COPIES `src/` to `dist/` (TS stripped, `.svelte`
 * files verbatim) and substitutes no defines at all — that is how
 * `dist/T.svelte` came to ship `typeof __DEV__ !== 'undefined' && __DEV__`
 * unsubstituted, which no consumer defines, so the diagnostic was dead even
 * in development. A `.svelte` file is reached RELATIVELY from `dist/index.js`,
 * so an export condition on the package root cannot switch it either.
 *
 * Package `imports` can: `#dev-warn` is resolved against THIS package's
 * `imports` map by Node, webpack, vite/rollup and esbuild alike, with the
 * `development` condition selecting `dev-warn.dev.ts`'s artifact. Two hand-
 * written halves rather than one define-substituted source, because that keeps
 * the production half provably free of the strings instead of relying on every
 * consumer's bundler to fold an imported `const` away.
 *
 * KEEP THE TWO EXPORT SURFACES EQUAL — `tests/dev-warn.test.ts` asserts it. A
 * name added to only one half breaks the other artifact at import time.
 */

/**
 * No-op counterpart of the `<T raw>` deprecation warning. The parameter is
 * named (and `_`-prefixed) because the SIGNATURE is the contract with
 * `dev-warn.dev.ts`, which does use it.
 */
export function warnDeprecatedRawProp(_host: object): void {}
