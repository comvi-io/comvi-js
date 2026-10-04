// The DEV-only duplicate-copy guard, in a module of its own.
//
// Everything module-scoped in core belongs to ONE copy of it: ambient tag
// registration (`@comvi/core/tags`), the `window.__COMVI__` devtools queue and
// the static template cache. A binding pinned to a different `@comvi/core`
// patch than the one installed directly puts two copies in the app, and those
// features then work in only half of it, silently.
//
// Keyed on the VERSION, not on module identity: a second evaluation of the
// SAME copy is routine — `vi.resetModules()` in a test, a dev server re-running
// a module graph — and warning about it would be noise. The mismatch is also
// what the message asks the reader to fix.
//
// A FUNCTION, not a bare module side effect: `core/i18n.ts` calls it once at
// module scope under its own `IS_DEV`, so production drops the call, then the
// import, then this module. A bare `import "./duplicateGuard"` was tried and
// the build tree-shook it away — the guard reached no dist chunk at all.
//
// A SEPARATE MODULE on purpose, and its tests call the function rather than
// importing anything dynamically. FIRST evaluating a module inside a running
// test — with `vi.resetModules()`, or with an `await import()` of something the
// test file does not already import statically — gives every module-level
// initializer in that graph per-test coverage. Under `ignoreStatic: true` such
// a mutant stops being `Ignored` and is run against those covering tests only,
// where a test watching `console.warn` cannot kill it, so it reports
// `Survived`. That cost 49 phantom survivors across the package when the guard
// lived in `i18n.ts` and its tests re-imported the host.
import { warn } from "../logger";

const VERSION_KEY = Symbol.for("comvi.core.version");

/**
 * @internal Claim the shared slot for this copy of core, or warn that another
 * copy already holds it. `core/i18n.ts` calls this once at module scope, with
 * its own build's version.
 *
 * Takes the version rather than reading `__VERSION__` itself so a test can
 * drive it with two explicit versions — no build define, no module reset, and
 * nothing re-evaluated inside a running test.
 */
export function claimCoreInstance(version: string): void {
  const slot = globalThis as unknown as Record<symbol, unknown>;
  const loaded = slot[VERSION_KEY];
  if (loaded === undefined) slot[VERSION_KEY] = version;
  else if (loaded !== version)
    warn(
      `[@comvi/core] Two copies of @comvi/core are loaded, ${String(loaded)} and ${version}. Ambient tags (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template cache belong to one copy each and will not be shared. Align the @comvi/core version your framework binding depends on with the one you installed directly.`,
    );
}
