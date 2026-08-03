// The COMPOSED host, for the suites that exercise composed behaviour.
//
// Since the single-entry convergence `@comvi/core` is the BASE host: simple
// compiler, no ambient tags, no loader/plugin/devtools capability. The 0.4
// batteries-included semantics survive as `src/core/full.ts` — the internal
// composite the CDN global ships and `@comvi/next`'s builder mirrors — plus
// the ambient tag registration the old root performed on import.
//
// This helper is that pair, and nothing else. It exists so a suite about ICU
// plurals, ambient tags, the plugin host or the loader keeps testing the
// composed implementation rather than silently re-testing the base host.
//
// Equivalence with the PUBLISHED recipe (`@comvi/core` + `/tags` + `/icu` +
// `.with(loader())` + `.with(plugins())` + `.with(devtools())`, in the parity
// order) is pinned separately by `tests/features/composite-parity.test.ts`.
import "../../src/register-tags";

export * from "../../src";
export { createI18n, I18n } from "../../src/core/full";
