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
// A SEPARATE MODULE on purpose. The tests must be able to reach the guard
// without re-importing `core/i18n`: re-evaluating the host's static graph
// inside a running test pulls every module-level initializer in it out of
// Stryker's `Ignored` bucket and reports it as a survivor (`ignoreStatic: true`
// runs such a "hybrid" mutant against its covering tests only, and a test that
// watches `console.warn` cannot kill one). That cost 49 phantom survivors
// across the package when the guard lived in `i18n.ts`.
import { warn } from "../logger";

declare const __VERSION__: string | undefined;

const VERSION_KEY = Symbol.for("comvi.core.version");

/**
 * Claim the version slot for this copy of core, or warn that another copy
 * already holds it. Called once per evaluation of the host module.
 */
export function assertSingleCopy(): void {
  const slot = globalThis as unknown as Record<symbol, unknown>;
  const version = typeof __VERSION__ !== "undefined" ? __VERSION__ : "";
  const loaded = slot[VERSION_KEY];
  if (loaded === undefined) slot[VERSION_KEY] = version;
  else if (loaded !== version)
    warn(
      `[i18n] Two copies of @comvi/core are loaded, ${String(loaded)} and ${version}. Ambient tags (@comvi/core/tags), the window.__COMVI__ devtools handshake and the template cache belong to one copy each and will not be shared. Align the @comvi/core version your framework binding depends on with the one you installed directly.`,
    );
}
