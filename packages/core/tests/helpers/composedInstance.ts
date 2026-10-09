// The COMPOSED host — `src/core/full.ts` plus ambient tag registration — for
// the suites that exercise composed behaviour.
//
// `@comvi/core` itself is the BASE host: simple compiler, no ambient tags, no
// loader/plugin/devtools capability. This helper exists so a suite about ICU
// plurals, ambient tags, the plugin host or the loader keeps testing the
// composed implementation instead of silently re-testing the base host.
//
// Equivalence with the PUBLISHED composition recipe is pinned separately, by
// the composite-parity suite.
import "../../src/register-tags";

export * from "../../src";
export { createI18n, I18n } from "../../src/core/full";
