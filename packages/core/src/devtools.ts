/**
 * @comvi/core/devtools — the browser-extension hook, kept as thin as it can be (design
 * R3-14 H1, R3-15, R3-16): it ships to every visitor, the editor only to whoever opens it,
 * so everything that can live in the editor or the extension lives there.
 *
 * ```ts
 * import { createI18n } from "@comvi/core";
 * import { devtools } from "@comvi/core/devtools";
 *
 * const i18n = createI18n({ locale: "en", plugins: [devtools()] });
 * ```
 *
 * In a browser `setup` pushes one queue entry `{ v, i, x }` onto `window.__COMVI__`
 * (creating the array when there is none) and `destroy()` splices that same entry out
 * again. Without a window (SSR) it does nothing. `x` is the handle an in-context editor
 * drives the instance through (protocol 2, `contracts/chrome-extension-proxy.json`):
 * thin delegates to the core plus `load()`, which puts the editor on the page.
 */
import type { Rendered } from "./compile/cache";
import { CORE, MS, type I18n, type Plugin } from "./instance";
import type { Mark, Slot } from "./state";

declare const __VERSION__: string;

/** The core version, inlined at build time (checked by `pnpm check:inlined-version`). */
export const VERSION: string = __VERSION__;

export type { Mark, Rendered };

/** What an in-context editor drives an instance through (protocol 2). */
export interface ComviHandle {
  /** The handle protocol: 2. An editor picks its driver by `p` and `kind`. */
  readonly p: 2;
  /** The library behind the handle; an editor refuses a kind it does not know. */
  readonly kind: "comvi";
  /** The messages of (ns, locale) as the catalogs hold them: keys to ICU source, no markers. */
  read(ns: string, locale: string): Record<string, string>;
  /**
   * The instance's published state as of the call, with its active namespaces (`ns`) —
   * a fresh object on every call (compare `rev`, not identity). Protocol 2 guarantees
   * only the fields of {@link HandleState}; the rest of `State` is internal.
   */
  state(): HandleState;
  /**
   * Sets the marking hook and publishes a new state, so every binding re-renders: output
   * rendered from then on is marked, or no longer marked. `null` — or anything that is
   * not a function — clears it. Messages already compiled stay compiled. After the
   * instance's `destroy()` it does nothing.
   */
  mark(fn: Mark | null): void;
  /**
   * Puts the editor on the page and resolves with its global (`window.ComviInContextEditor`)
   * once it is available. `version` is an exact version (`1.2.3`, `1.2.3-rc.1`) or `latest`
   * (the default) — never a URL: where the editor comes from is the core's business.
   * Rejects — it never throws — for anything else, when the script fails, or when it ran
   * and left no editor. Nothing is cached or retried here; a second call loads again.
   */
  load(version?: string): Promise<unknown>;
}

/**
 * What `x.state()` guarantees for the lifetime of protocol 2 (the editor may read these
 * by name; every other field of `State` may change in any release).
 */
export interface HandleState {
  /** Moves on every published change. */
  readonly rev: number;
  /** The current locale, as the app spells it. */
  readonly locale: string;
  /**
   * The catalogs: namespace → locale → slot; a slot's `m` (base) and optional `p` (patch
   * on top) are flat key → ICU source maps. `x.read()` is the merged view of one pair.
   */
  readonly c: Readonly<Record<string, Readonly<Record<string, Pick<Slot, "m" | "p">>>>>;
  /** Loads in flight, as `locale + "\0" + ns`. */
  readonly ld: readonly string[];
  /** The active namespaces — loaded, still loading, failed or empty alike. */
  readonly ns: readonly string[];
}

/** The entry pushed onto the `window.__COMVI__` queue (protocol 2). */
export interface ComviQueueEntry {
  /** Core library version that produced the entry. */
  v: string;
  /** The exposed instance. */
  i: I18n;
  /** Its handle. */
  x: ComviHandle;
}

declare global {
  interface Window {
    __COMVI__?: ComviQueueEntry[];
    ComviInContextEditor?: unknown;
  }
}

// Host and path are constants: the only variable part of the editor URL is a version
// that matched this pattern: `latest` or an exact SemVer 2.0 version without build
// metadata (no leading zeros, no empty or `_` identifiers; no `/`, `?`, `#`, `:`, `%`).
const SRC = "https://cdn.jsdelivr.net/npm/@comvi/editor@";
const VER =
  /^(latest|(0|[1-9]\d*)(\.(0|[1-9]\d*)){2}(-(0|[1-9]\d*|\d*[a-zA-Z-][\da-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][\da-zA-Z-]*))*)?)$/;

/** The devtools plugin: makes the instance discoverable by the Comvi browser extension. */
export const devtools = (): Plugin => ({
  name: "devtools",
  setup(i18n) {
    if (typeof window == "undefined") return;
    const c = CORE.get(i18n)!;
    // The marking hook's setter of this instance: `createI18n` holds it out to its plugins'
    // setup only, and only this module reads it (R3-14 H4).
    const m = MS as (f: Mark | null) => void;
    /** Set by destroy(): the handle an editor may still hold marks nothing. */
    let d: unknown;
    const e: ComviQueueEntry = {
      v: VERSION,
      i: i18n,
      x: {
        p: 2,
        kind: "comvi",
        read: (ns, l) => {
          const s = c.s().c[ns]?.[l];
          return { ...s?.m, ...s?.p };
        },
        state: () => ({ ...c.s(), ns: [...c.n] }),
        mark: (f) => d || m(typeof f == "function" ? f : null),
        load: (v = "latest") =>
          // Everything runs inside the executor: what throws here — a version that is not
          // one, no document, a Trusted Types policy refusing the `src` — rejects.
          new Promise((y, n) => {
            // The length check first: the pattern is never run on a long page-supplied string.
            if ((v += "").length > 64 || !VER.test(v))
              throw TypeError("[@comvi/core/devtools] bad version " + v);
            const s = document.createElement("script");
            s.onload = () =>
              window.ComviInContextEditor
                ? y(window.ComviInContextEditor)
                : n(Error("[@comvi/core/devtools] no editor"));
            s.onerror = () => n(Error("[@comvi/core/devtools] load failed"));
            s.src = SRC + v + "/dist/standalone.iife.js";
            document.documentElement.append(s);
          }),
      },
    };
    try {
      (window.__COMVI__ ||= []).push(e);
    } catch {
      /* discovery must never break setup */
    }
    return () => {
      d = 1;
      try {
        const q = window.__COMVI__!;
        // -1 >>> 0 is 2^32 - 1: a splice past the end removes nothing.
        q.splice(q.indexOf(e) >>> 0, 1);
      } catch {
        /* removal must never break destroy */
      }
    };
  },
});
