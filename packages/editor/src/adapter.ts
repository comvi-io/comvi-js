/**
 * The editor's side of protocol 2 (`contracts/chrome-extension-proxy.json`, `discovery` and
 * `handle`): the one module that reads `window.__COMVI__`, judges its entries, follows later
 * and destroyed instances, marks each instance through its handle and writes saved messages
 * back. Every object it touches is page-controlled, so every read of one is guarded.
 */
import type { ComviHandle, HandleState, Mark } from "@comvi/core/devtools";
import { encodeFrame } from "./marker";

/** What the editor calls on an instance: `add()` only. */
interface EditorInstance {
  add(locale: string, messages: Record<string, string>, ns?: string): void;
}

/** One instance the editor drives. */
export interface Target {
  /** Editor-internal id: empty while the page has one instance, `comvi-<n>` otherwise. */
  inst: string;
  readonly i: EditorInstance;
  x: ComviHandle;
}

/** Why `activate()` did nothing. */
export type ActivateFailureCode =
  /** No window or document (not a browser). */
  | "no-window"
  /** An editor session is already active on the page. */
  | "already-active"
  /** No `window.__COMVI__` entry at all: the app does not compose `devtools()`. */
  | "no-instance"
  /** Only entries of an older Comvi (0.5–0.7 `{ v, i }`, the v1 registry, the 0.7 hook). */
  | "old-protocol"
  /** An entry with a handle this editor does not drive (`x.p !== 2` or another `kind`). */
  | "unknown-protocol";

const own = (o: object, k: PropertyKey): boolean => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v: unknown): v is object => typeof v === "object" && v !== null;

type Verdict = { i: EditorInstance; x: ComviHandle } | "old" | "unknown" | null;

/** One queue entry, judged on its own: two copies of core share the array. */
function judge(entry: unknown): Verdict {
  try {
    if (!isObject(entry)) return null;
    const i = own(entry, "i") ? (entry as { i: unknown }).i : undefined;
    if (!own(entry, "x")) return isObject(i) ? "old" : null;
    const x = (entry as { x: unknown }).x;
    if (!isObject(x)) return "unknown";
    const p = own(x, "p") ? (x as { p: unknown }).p : undefined;
    const kind = own(x, "kind") ? (x as { kind: unknown }).kind : undefined;
    if (p !== 2 || kind !== "comvi" || !isObject(i)) return "unknown";
    return { i: i as EditorInstance, x: x as ComviHandle };
  } catch {
    return null;
  }
}

/** The page's queue array, or what a non-array global says about the page. */
function readQueue(): { q: unknown[] } | "old" | null {
  try {
    const g: unknown = window.__COMVI__;
    if (Array.isArray(g)) {
      // The 0.7 editor's and extension's hook: an array carrying its own marker.
      return own(g, "__comviEditorHook") ? "old" : { q: g };
    }
    // The v1 registry of 0.4–0.5.
    if (isObject(g) && (own(g, "register") || own(g, "instances"))) return "old";
  } catch {
    /* a throwing global is no queue */
  }
  return null;
}

/**
 * Judges the page without changing it: the compatible entries, or why there are none.
 * Nothing is called on any entry here.
 */
export function discover():
  | { ok: true; q: unknown[]; found: { i: EditorInstance; x: ComviHandle; e: unknown }[] }
  | { ok: false; code: ActivateFailureCode } {
  const read = readQueue();
  if (read === "old") return { ok: false, code: "old-protocol" };
  if (!read) return { ok: false, code: "no-instance" };
  const found: { i: EditorInstance; x: ComviHandle; e: unknown }[] = [];
  let old = false;
  let unknown = false;
  let length = 0;
  try {
    length = read.q.length;
  } catch {
    /* treated as empty */
  }
  for (let k = 0; k < length; k++) {
    let e: unknown;
    try {
      e = read.q[k];
    } catch {
      continue;
    }
    const v = judge(e);
    if (v === "old") old = true;
    else if (v === "unknown") unknown = true;
    else if (v) found.push({ ...v, e });
  }
  if (found.length > 0) return { ok: true, q: read.q, found };
  return { ok: false, code: unknown ? "unknown-protocol" : old ? "old-protocol" : "no-instance" };
}

/** The marking hook of one instance: a suffix frame on a string, a pair around rich parts. */
function markWith(inst: string): Mark {
  return (out, key, ns) => {
    if (typeof out === "string") return out + encodeFrame(inst, ns, key);
    if (Array.isArray(out))
      return [encodeFrame(inst, ns, key), ...out, encodeFrame(inst, ns, key, true)];
    return out;
  };
}

/** A pair loaded successfully — an empty catalog included — and not loading now. */
export function isLoaded(s: HandleState, ns: string, locale: string): boolean {
  return Boolean(s.c[ns]?.[locale]) && !s.ld.includes(locale + "\0" + ns);
}

/** A live editor session over the page's instances. */
export class Session {
  private targets = new Map<object, Target & { entries: unknown[] }>();
  private next = 0;
  private live = true;
  private restore: (() => void)[] = [];

  constructor(q: unknown[], found: { i: EditorInstance; x: ComviHandle; e: unknown }[]) {
    for (const f of found) this.attach(f.i, f.x, f.e);
    this.follow(q);
  }

  /** The instances, in the order they were found. */
  list(): Target[] {
    return [...this.targets.values()];
  }

  /**
   * The instance a frame's `inst` names: an empty one only while the page has exactly one
   * instance, a non-empty one by its id. `undefined` when unknown or ambiguous — never
   * "the active instance".
   */
  resolve(inst: string): Target | undefined {
    const all = this.list();
    if (inst === "") return all.length === 1 && all[0]!.inst === "" ? all[0] : undefined;
    return all.find((t) => t.inst === inst);
  }

  /**
   * Writes saved values into the instance's catalogs, one `add()` per pair that loaded
   * successfully — never a pair that failed, is still loading or never loaded: `add()`
   * there would create the pair and core would then not load its catalog.
   */
  patch(target: Target, ns: string, key: string, byLocale: Record<string, string>): void {
    if (!this.targets.has(target.i)) return;
    let s: HandleState;
    try {
      s = target.x.state();
    } catch {
      return;
    }
    for (const [locale, value] of Object.entries(byLocale)) {
      if (isLoaded(s, ns, locale)) target.i.add(locale, { [key]: value }, ns);
    }
  }

  stop(): void {
    if (!this.live) return;
    this.live = false;
    for (const t of this.targets.values()) this.unmark(t);
    this.targets.clear();
    this.restore.forEach((r) => r());
    this.restore = [];
  }

  private mark(t: Target): void {
    try {
      t.x.mark(markWith(t.inst));
    } catch {
      /* the page's handle */
    }
  }

  private unmark(t: Target): void {
    try {
      t.x.mark(null);
    } catch {
      /* the page's handle */
    }
  }

  private attach(i: EditorInstance, x: ComviHandle, e: unknown): void {
    const known = this.targets.get(i);
    if (known) {
      // A second devtools() on one instance: a second entry with the same `i`.
      known.entries.push(e);
      return;
    }
    const t = { inst: "", i, x, entries: [e] };
    if (this.targets.size > 0) {
      // A second instance: every instance gets an id and is marked again.
      for (const other of this.targets.values()) {
        if (other.inst === "") {
          other.inst = `comvi-${++this.next}`;
          this.mark(other);
        }
      }
      t.inst = `comvi-${++this.next}`;
    }
    this.targets.set(i, t);
    this.mark(t);
  }

  private detach(e: unknown): void {
    for (const [i, t] of this.targets) {
      const k = t.entries.indexOf(e);
      if (k < 0) continue;
      t.entries.splice(k, 1);
      if (t.entries.length > 0) {
        // The instance is still on the queue through its other entry.
        const v = judge(t.entries[0]);
        if (v && v !== "old" && v !== "unknown") t.x = v.x;
        return;
      }
      this.targets.delete(i);
      return;
    }
  }

  /**
   * Owns `push` and `splice` on the page's array (the only members core calls besides
   * `indexOf`), so later instances join and destroyed ones leave. The originals are called
   * first and their result returned; the editor's part never throws into page code.
   */
  private follow(q: unknown[]): void {
    type Fn = (this: unknown, ...args: unknown[]) => unknown;
    const own_ = (name: "push" | "splice", wrap: (orig: Fn) => Fn) => {
      try {
        const had = own(q, name);
        const orig = q[name] as unknown as Fn;
        const mine = wrap(orig);
        Object.defineProperty(q, name, { value: mine, configurable: true, writable: true });
        this.restore.push(() => {
          try {
            if ((q[name] as unknown) !== mine) return; // wrapped over since: stays a pass-through
            if (had)
              Object.defineProperty(q, name, { value: orig, configurable: true, writable: true });
            else delete (q as unknown as Record<string, unknown>)[name];
          } catch {
            /* the page's array */
          }
        });
      } catch {
        /* a frozen array: later instances are not followed */
      }
    };
    const { joined, left } = this;
    own_(
      "push",
      (orig) =>
        function (this: unknown, ...items: unknown[]) {
          const r = orig.apply(this, items);
          joined(items);
          return r;
        },
    );
    own_(
      "splice",
      (orig) =>
        function (this: unknown, ...args: unknown[]) {
          const removed = orig.apply(this, args);
          left(Array.isArray(removed) ? removed : []);
          joined(args.slice(2));
          return removed;
        },
    );
  }

  /** Entries pushed onto the page's array; never throws into page code. */
  private joined = (items: unknown[]): void => {
    if (!this.live) return;
    try {
      for (const e of items) {
        const v = judge(e);
        if (v && v !== "old" && v !== "unknown") this.attach(v.i, v.x, e);
      }
    } catch {
      /* never into page code */
    }
  };

  /** Entries spliced out of the page's array; never throws into page code. */
  private left = (items: unknown[]): void => {
    if (!this.live) return;
    try {
      for (const e of items) this.detach(e);
    } catch {
      /* never into page code */
    }
  };
}
