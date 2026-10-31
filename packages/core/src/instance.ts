/**
 * `createI18n` — the instance (design §2.4, §3.1; synthesis §4.2, R4-1, R4-11, R4-12,
 * R4-15, R4-17). A factory over closures: no class, no `#private` (contract test).
 *
 * State is ONE immutable snapshot (state.ts) replaced on every change and announced to
 * `on()` subscribers synchronously. Nothing on a read path (`t`, `has`, `locale`, `dir`,
 * `ready`, `rev`) publishes: a binding may read inside a reactive derivation (Svelte
 * `$derived`, Vue `computed`) where a synchronous emit is an error (R4-17).
 *
 * Catalog keys and loader requests use the locale AS THE APP SPELLS IT (`pt-BR`, `iw`):
 * the platform canonicalizes separator and case only, so `canonicalize()`'s output
 * (`he` for `iw`) would address a catalog that does not exist. The canonical form is
 * computed alongside and is what Intl receives; a tag that does not canonicalize is
 * rejected BEFORE anything renders it (`invalid_locale`).
 *
 * Loading: one flight per (locale, namespace), deduped; each pair settles on its own
 * (R4-11). `setLocale(l)` switches when the target needs nothing (synchronously, inside
 * the call) or when its loads settle with a catalog of `l`'s own chain (`l` or a parent:
 * `pt-BR` → `pt`) in place for at least one active namespace; fallback-locale failures
 * never block. The switch waits for the namespaces active when it was called; one activated
 * while it is pending loads for the locale on screen, then for the target right after the
 * switch (lot 4b). A failed pair is remembered (no refetch on every switch)
 * until `setLocale()` targets its locale again or `load()` names its namespace. A switch
 * superseded by a later one, and every load of a locale that left the chain, is aborted.
 * A parent's failed load (`pt` while switching to `pt-BR`) is reported only when the
 * locale's own load of that namespace failed too: a regional catalog published without
 * its parent is not a failure. A fallback locale's failure is always reported.
 *
 * The reporter is isolated: an `onError` that throws neither breaks the render nor the
 * load bookkeeping (its error is rethrown from a `setTimeout`, like a subscriber's).
 */
import { render, type Catalog, type Compiled, type Rendered } from "./compile/cache";
import { arg, type Env, type Params } from "./compile/scanner";
import { defaultOnError, noop, type I18nError, type OnError } from "./errors";
import { canonicalize, dir as dirOf, parents } from "./locale";
import { find, mk, N, put, type Mark, type State, type Store } from "./state";
import type { RichParts, TFor } from "./types";

declare const __DEV__: boolean;

/** Loads one catalog: flat keys → ICU messages. Rejects to report `load_failed`. */
export type Loader = (locale: string, ns: string, signal: AbortSignal) => Promise<Catalog>;

/** A plugin: set up once by `createI18n`; the returned function runs on `destroy()`. */
export interface Plugin {
  name: string;
  setup(i18n: I18n): void | (() => void);
}

export interface I18nOptions {
  /** The locale, as the app spells it (`en`, `pt-BR`). */
  locale: string;
  /**
   * Locales `t()` falls back to after the locale's own parents (`pt-BR` → `pt`): one, a
   * list, or a list per locale with a `default` list for the others.
   */
  fallbackLocale?: string | readonly string[] | Readonly<Record<string, readonly string[]>>;
  /**
   * Flat catalogs of the `default` namespace, by locale. Merged per locale with `catalogs`:
   * a `default` slot of a locale that `catalogs` also has is the `catalogs` one (a server
   * payload wins over inline messages), the other locales come from here.
   */
  messages?: Readonly<Record<string, Catalog>>;
  /**
   * Flat catalogs by namespace, then locale. A `null` slot is one whose load failed on the
   * server (`handover()`): not asked for again until `load(ns)` or a switch to its locale.
   * For the `default` namespace a slot here wins over `messages` of the same locale, a
   * `null` one too; the slots are merged by locale, never key by key.
   */
  catalogs?: Readonly<Record<string, Readonly<Record<string, Catalog | null>>>>;
  loader?: Loader;
  /** Namespaces loaded from the start. Default `["default"]`. */
  namespaces?: readonly string[];
  /**
   * Params every `t()` call gets unless the call passes its own value. Copied: a later
   * mutation of the object changes nothing (`setDefaultParams` replaces them). `ns`,
   * `locale` and `markers` are reserved: they are per-call options, never message params.
   */
  defaultParams?: Readonly<Record<string, unknown>>;
  plugins?: readonly Plugin[];
  /**
   * IANA time zone of the Date formatters of `@comvi/core/format` (SSR bindings pass the
   * server's). A plain `{x}` prints a Date as `String(date)`, without it (R3-17).
   */
  timeZone?: string;
  /**
   * Epoch ms that `formatRelativeTime` (`@comvi/core/format`) counts from, fixed for the
   * instance's life (tests, a pinned server clock). Default: the clock.
   */
  now?: number;
  /**
   * The server's clock at its render, from `handover()` (`createI18n({ ...options,
   * ...payload })`): `formatRelativeTime` counts from it, so the browser renders what the
   * server rendered. A binding's `useFormat()` counts from it for a component's hydration
   * only, from the browser's clock for every other render (a component mounted after the
   * hydration too). `now` wins over it.
   */
  serverNow?: number;
  /** Named Intl options for `@comvi/core/format`: `formatNumber(i18n, n, "price")`. */
  formats?: {
    number?: Readonly<Record<string, Intl.NumberFormatOptions>>;
    date?: Readonly<Record<string, Intl.DateTimeFormatOptions>>;
  };
  /**
   * Every problem, as a coded {@link I18nError}. Default: development console, production
   * silent. `missing_key`: the key is absent, a catalog of the namespace is in place for the
   * read's chain (its locale, parents, fallback locales; a per-call `{ locale }` / `{ ns }`
   * counts), and every pair of that chain is settled — in place or failed, with no load of it
   * in flight (a request has priority over a catalog `add()`ed meanwhile; a retry makes the
   * pair unknown again); with a loader a pair never requested or still loading keeps it
   * unknown (no report), without one the catalogs in place are complete. Reported at the
   * read. `load_failed`: a load failed. A namespace with no catalog of the read's chain (a
   * typo) is no report; development warns.
   */
  onError?: OnError;
  /**
   * What a read with no message for the key renders — a missing key, and a namespace still
   * loading or with no catalog. Default: the key.
   */
  missing?: (key: string, locale: string, ns: string) => string;
}

export interface I18n {
  /** The current locale, as the app spells it. */
  readonly locale: string;
  readonly dir: "ltr" | "rtl";
  /**
   * Settles when the catalog loads in flight now have settled — loaded, failed or aborted
   * (never rejects). It says nothing about a namespace's catalog: a binding's `isReady`
   * tells whether one is in place for the locale on screen. The same promise object for as
   * long as the set of loads in flight does not change (a binding may throw it for
   * Suspense); one shared resolved promise when nothing loads.
   */
  readonly ready: Promise<void>;
  /**
   * Translates in the `default` namespace; `{ ns, locale }` in the params switch them per
   * call and `{ markers: false }` keeps an editor session from marking the output. `ns`,
   * `locale` and `markers` are reserved names: a message cannot have params called so.
   *
   * With no message for the key in the locale's chain it returns what `missing(key, locale,
   * ns)` returns (default: the key) — also while the key's namespace is still loading or has
   * no catalog of the chain, when no `missing_key` is reported (see `onError`). `t()` never
   * returns a placeholder: a UI that should not show that text while loading checks
   * `isLoading` (bindings) and renders its own.
   */
  t: TFor<"default", RichParts>;
  /** `t()` bound to namespace `name`. */
  ns<N extends string>(name: N): TFor<N, RichParts>;
  /**
   * Loads what `locale` needs for the namespaces active NOW — those of the `namespaces`
   * option and those a component's `useI18n(ns)` holds; one held later loads after the
   * switch — keeping the current locale on screen meanwhile, then switches — inside the
   * call when nothing needs loading. A later call wins from the moment it is made: this one
   * then never switches and resolves once its loads settle or are aborted, a failed one too.
   * Called from a subscriber, a loader or an abort listener while the instance publishes,
   * switches or starts a load, it runs when that work ends, before the outermost call returns:
   * `locale` does not change inside the callback, and every subscriber is told of each state
   * in order. The latest call switches when at least
   * one namespace it waited for has a catalog of `locale`'s own chain in place (`de-AT`, or
   * its parent `de`); a namespace whose load failed then renders its fallback. It rejects
   * with the loader's error, keeping the old locale, only when EVERY namespace it waited
   * for has none; an invalid tag rejects with a `RangeError`. Failures are reported through
   * `onError` either way.
   */
  setLocale(locale: string): Promise<void>;
  /**
   * Loads namespace `ns` for the current locale's chain, asking its failed loads again (the
   * explicit retry): a route's preload, a server's before it renders. It does not keep `ns`
   * active — a later `setLocale()` loads it only while a component's `useI18n(ns)` holds it
   * (or the `namespaces` option names it); the loaded catalogs stay cached. Rejects with the
   * loader's error when, as its loads settle, the locale's own load of `ns` failed and no
   * catalog of `ns` from the locale's own chain (`de-AT`, its parent `de`) is in place; else
   * resolves `undefined` — a parent's or a fallback locale's failure alone does not reject,
   * nor does a load a switch aborted. A binding's hold never rejects.
   */
  load(ns: string): Promise<void>;
  /** Adds messages to (locale, ns) — by reference into an empty pair, else as a patch layer. */
  add(locale: string, messages: Catalog, ns?: string): void;
  /**
   * Whether `key` has a message in namespace `ns` (default `default`) for `locale` (default:
   * the current one) or its fallback chain. `fallback: false` looks in `locale` alone —
   * neither its parents (`pt-BR` → `pt`) nor the fallback locales.
   */
  has(key: string, opts?: { ns?: string; locale?: string; fallback?: boolean }): boolean;
  /** Subscribes to every published change. Returns the unsubscribe function. */
  on(fn: () => void): () => void;
  /** Revision of the published state. */
  rev(): number;
  /** Aborts every load, runs plugin teardowns, drops subscribers. Idempotent. */
  destroy(): void;
  setDefaultParams(params: Readonly<Record<string, unknown>>): void;
}

/** A locale's lookup chain: [catalog key as spelled, canonical tag] pairs, nearest first. */
export type Chain = readonly (readonly [string, string])[] & { o: number };

/** What `@comvi/core/internal` reaches through an instance. */
export interface Core {
  /** The published state. */
  s(): State;
  /**
   * Translates against any state of this instance (a published one, or a `view()`); `j`
   * joins a tag's children for its handler (a binding's node maker).
   */
  tr(state: State, key: string, params?: Params, ns?: string, j?: Env["j"]): Rendered;
  /**
   * Development builds only: a render declared namespace `ns` (a `useI18n(ns)` in a render or
   * a setup) while nothing holds it — its hold comes at the commit or mount, which Suspense
   * may delay past the idle-read check. Until that hold, a read of `ns` is not reported as
   * idle. Not a hold: nothing loads for it, and a render that never commits keeps only this
   * development marker (Codex re-check of lot 4c, F1).
   */
  p?(ns: string): void;
  /** The lookup chain of a locale. */
  ch(locale: string): Chain;
  /** The options the instance was made with (`timeZone`, `now`, `formats` for `/format`). */
  o: I18nOptions;
  /**
   * Hold counts by namespace (lot 4c); the active set is the keys above 0. Its keys are every
   * namespace the instance ever needed (pinned, held or `load()`ed) — what `handover()` hands
   * over and the editor's `state().ns`, whatever the counts are now.
   */
  k: Record<string, number>;
  /** Pairs whose load failed (the negative cache), by `locale + "\0" + ns`. */
  b: ReadonlyMap<string, unknown>;
  /**
   * A consumer holds namespace `ns` (lot 4c): it joins the active set and what the displayed
   * locale's chain lacks of it loads, WITHOUT asking its failed loads again — a binding holding
   * on every mount must not turn one failure into a refetch per mount (`load()` is the explicit
   * retry). Counted before anything publishes. Returns the release (a second call of it does
   * nothing): at no consumer left the namespace leaves the active set (the next `setLocale()`
   * does not load it); nothing is aborted or evicted.
   */
  h(ns: string): () => void;
  /**
   * `isLoading` of namespace `ns` in `state` (see `coming` in createI18n); `f`: a load in flight
   * only — for a reader that holds nothing (Vue's `useI18n()` outside a component).
   */
  w(state: State, ns: string, f?: unknown): unknown;
  /** `isReady` of namespace `ns` in `state` (see `usable` in createI18n). */
  r(state: State, ns: string): boolean;
}

/** Instance → its internal seam; read by `@comvi/core/internal` only. */
export const CORE = new WeakMap<object, Core>();

/**
 * The marking hook's setter, per instance (R3-14 H4): it sets (or, with `null`, clears) the
 * hook of an in-context editor session and publishes a state carrying it. Keyed by the
 * instance, so an instance created during another one's plugin setup never takes its
 * setter. Only `devtools()` reads it, for the instance it is set up on — a plugin's `setup`
 * gets the instance alone, and no seam of `/internal` re-exports it, so nothing marks
 * without `devtools()` installed.
 */
export const MS = new WeakMap<object, (f: Mark | null) => void>();

const D = "default";
const K = "\0";
/** `ready` when nothing loads: one resolved promise, the same object every time. */
const R = /* @__PURE__ */ Promise.resolve();

/** Runs `f`; what it throws is rethrown outside the caller's loop, so the loop goes on. */
const safe = (f: void | (() => void)) => {
  try {
    if (f) f();
  } catch (e) {
    setTimeout(() => {
      throw e;
    });
  }
};

/** A load in flight: its promise, its abort, and whose parent it is now (see `get()`). */
type Flight = [Promise<unknown>, AbortController, (string | 0 | false)?];

/**
 * A shallow own copy of a params object; `null` for none or an empty one (so `pub()`'s
 * default does not apply, and `{}` keeps the `t()` fast path).
 */
const own = (v?: Readonly<Record<string, unknown>>) =>
  v && Object.keys(v).length ? { ...v } : null;

export const createI18n = (o: I18nOptions): I18n => {
  // An own copy: the caller mutating its list later changes nothing.
  const fb = JSON.parse(JSON.stringify(o.fallbackLocale || 0)) as I18nOptions["fallbackLocale"];
  const h = o.onError || defaultOnError;
  /** Reports; what the reporter throws is rethrown outside the render or the load. */
  const report: OnError = (e) => safe(() => h(e));
  const env: Env = { r: report };
  const load = o.loader;
  const subs = new Set<() => void>();
  /** Loads in flight, by `locale + "\0" + ns`. */
  const fl = new Map<string, Flight>();
  /** Loads that failed — the negative cache — with their errors. */
  const bad = new Map<string, unknown>();
  /**
   * Hold counts by namespace (lot 4c). A namespace of the `namespaces` option starts at 1,
   * a pin never released; a key at 0 is a namespace needed once (held, `load()`ed, handed
   * over), no longer active. The active set is the keys above 0.
   */
  const cnt = N<number>();
  for (const n of o.namespaces || [D]) cnt[n] = 1;
  const act = () => Object.keys(cnt).filter((n) => cnt[n]);
  /**
   * Development: namespaces whose idle read was warned about (once each, per instance); and,
   * as `K + ns`, namespaces a render declared (`Core.p`) that no hold has followed yet.
   */
  const idle = new Set<string>();
  const downs: (void | (() => void))[] = [];
  let chains: Record<string, Chain> = N();
  let nch = 0;
  /** `ready` for the current set of flights; cleared whenever that set changes. */
  let rd: Promise<void> | 0 = 0;
  let seq = 0;
  let dead = 0;
  /** A section is running (`sec()`); what starts work waits in `q`. */
  let busy = 0;
  const q: (() => void)[] = [];
  /** The marking hook (R3-14 H4); every state built from now on carries it. */
  let mf: Mark | null | undefined;
  let S: State;

  const err = (
    code: I18nError["code"],
    locale?: string,
    ns?: string,
    key?: string,
    cause?: unknown,
  ) => report({ code, key, locale, ns, cause });

  /** The canonical tag of `l`, or nothing after reporting `invalid_locale` (R3-1, R4-10). */
  const valid = (l: string): string | void => canonicalize(l) || void err("invalid_locale", l);

  /**
   * `l` and its parents (`o` of them), then each fallback locale and its parents. A tag
   * that does not canonicalize is reported (`invalid_locale`) and left out.
   */
  const chain = (l: string): Chain => {
    let ch = chains[l];
    if (!ch) {
      // A per-call locale may come from user input: the memo is bounded.
      if (++nch > 500) {
        chains = N();
        nch = 1;
      }
      const out = (chains[l] = ch = [] as unknown as Chain) as unknown as [string, string][];
      const walk = (k: string, c = valid(k)) =>
        c &&
        // Parents are canonical already; only the entry itself keeps the app's spelling.
        [k, ...parents(c)].forEach((x, i) => ch.some((y) => y[0] == x) || out.push([x, i ? x : c]));
      walk(l);
      ch.o = ch.length;
      ([] as string[])
        .concat(
          // `fb` is never null: a JSON copy of the option, `0` for none.
          (typeof fb != "object" || Array.isArray(fb)
            ? fb
            : (fb as Record<string, readonly string[]>)[l] ||
              (fb as Record<string, readonly string[]>)[D]) || [],
        )
        .forEach((k) => walk(k));
    }
    return ch;
  };

  /** A state for locale `l` (an invalid locale has no entry of its own in its chain). */
  const st = (rev: number, lrev: number, l: string, c: Store, dp: State["dp"]) => {
    const h = chain(l);
    return mk(
      rev,
      lrev,
      l,
      h.o ? dirOf(h[0][1]) : "ltr",
      c,
      [...fl.keys()],
      dp,
      h.o ? h[0][1] : l,
      mf,
    );
  };

  /**
   * One section: while `f` runs, what user code it calls synchronously (a subscriber, a loader,
   * an abort listener) starts — a switch, a load, a hold — waits in `q`. The queue runs when
   * `f` ends, each entry inside the same section, before the outermost call returns; nothing
   * here waits for the network. A new `setLocale()` is the latest from its call, queued or
   * not, so the steps of a switch still check `seq` after running user code.
   */
  const sec = <T>(f: () => T): T => {
    if (busy) return f();
    busy = 1;
    try {
      return f();
    } finally {
      while (q[0]) q.shift()!();
      busy = 0;
    }
  };

  /** `f` as a section: now, or when the running one ends (then settling with its result). */
  const later = <T>(f: () => T | PromiseLike<T>): T | PromiseLike<T> =>
    busy ? new Promise<T>((y) => q.push(() => y(new Promise<T>((z) => z(f()))))) : sec(f);

  /**
   * Replaces the state (its loads in flight are `fl`'s keys), aborts `a` when a flight left it,
   * and tells the subscribers, as one section: each sees the state it was told of. A throwing
   * subscriber does not stop the rest.
   */
  const pub = (l = S.locale, c = S.c, dp = S.dp, a?: AbortController) => {
    S = st(S.rev + 1, S.lrev + +(l != S.locale), l, c, dp);
    a?.abort();
    sec(() => subs.forEach(safe));
  };

  /**
   * `c` with `m` layered at (l, n), after checking the locale (and, in development, the
   * values); with `u` (a load landing) under what the pair holds (R3-14 H8).
   */
  const ing = (c: Store, l: string, m: Catalog, n: string, u?: unknown): Store => {
    if (__DEV__)
      for (const k in m)
        if (typeof m[k] != "string")
          report({
            code: "syntax",
            key: k,
            locale: l,
            ns: n,
            message: `the value of "${k}" is not a string; catalogs are flat (flatten nested objects, or use the \`catalogs\` option for namespaces)`,
          });
    return valid(l) ? put(c, n, l, m, u) : c;
  };

  let c0: Store = N();
  const cats: Record<string, Readonly<Record<string, Catalog | null>>> = N(o.catalogs);
  // `messages` fills the `default` slots that `catalogs` leaves out: per locale, `catalogs`
  // wins (a `null` slot too), never the whole namespace (Codex re-check HIGH B). With
  // neither, `default` is an empty record: nothing to ingest.
  cats[D] = N(o.messages, cats[D]);
  // A `null` slot failed to load on the server (`handover()`): it starts in the negative
  // cache, so the browser asks for it only on an explicit retry (`load(ns)`, a switch to
  // its locale), and a consumer of it is not loading at hydration (a known result, as on
  // the server). The cached value is never read: a switch clears its target's failures
  // before it could throw one, `load(ns)` its namespace's.
  for (const n in cats)
    for (const l in cats[n])
      if (cats[n][l]) c0 = ing(c0, l, cats[n][l]!, n);
      else bad.set(l + K + n, (cnt[n] |= 0));
  // An invalid start locale is reported (by its chain); it renders through its fallback
  // locales only.
  S = st(0, 0, o.locale, c0, own(o.defaultParams));

  /**
   * `isReady` (lot 4c): a catalog of namespace `n` from the chain of the state's locale (the
   * locale on screen, its parents, the fallback locales) is in place — an empty one too. A
   * catalog of a locale outside the chain does not count.
   */
  const usable = (s: State, n: string) => chain(s.locale).some((x) => s.c[n]?.[x[0]]);

  /**
   * `isLoading` (lot 4c): a load of `n` is in flight in `s` (for any locale: a parent, a
   * fallback, the target of a pending switch), or the
   * instance has a loader and a pair of the chain of the state's locale is neither in place
   * nor failed — the load a consumer's hold makes (React holds at commit, Vue at mount, after
   * the render). A failed pair is a known result, so no catalog and nothing in flight is never
   * an endless loading state.
   */
  const coming = (s: State, n: string, f?: unknown): unknown =>
    s.ld.some((x) => x.endsWith(K + n)) ||
    (!f && load && chain(s.locale).some((x) => !s.c[n]?.[x[0]] && !bad.has(x[0] + K + n)));

  /** The message `look()` found last; copied by the caller before anything can call back. */
  let hit: Compiled;

  /** The chain index where `key` is found in namespace `n` (its message in `hit`), or -1. */
  const look = (s: State, key: string, n: string, ch: Chain): number => {
    const cs = s.c[n];
    for (let i = 0, x; cs && i < ch.length; i++)
      if ((x = cs[ch[i][0]]) && (hit = find(x, key)!) != null) return i;
    return -1;
  };

  /** The env with a binding's joiner: one per instance, rebuilt only for another joiner. */
  let ej: Env = env;
  const tr = (s: State, key: string, p?: Params, n = D, j?: Env["j"]): Rendered => {
    let l = s.locale;
    let r: Rendered;
    let x: unknown;
    // Per-call options are read from the params object's OWN properties (R4-17). An invalid
    // per-call locale is reported once (its chain is memoized), then falls back to `l`.
    if (p) {
      n = (arg(p, "ns") as string) || n;
      if ((x = arg(p, "locale")) && chain(x as string).o) l = x as string;
      x = arg(p, "markers");
    }
    // An empty namespace is the default one (`i18n.ns("")`, `useI18n("")` and its `<T>`).
    n ||= D;
    // The state's own copy of defaultParams (R4-12: an older snapshot keeps its own).
    if (s.dp) p = N(s.dp, p);
    const ch = chain(l);
    const i = look(s, key, n, ch);
    if (i >= 0) {
      // Kept before the report: an `onError` that calls has() or t() moves `hit`.
      const m = hit;
      if (i >= ch.o) err("fallback_used", l, n, key);
      r = render(m, p, ch[i][1], j ? (ej.j == j ? ej : (ej = { ...env, j })) : env);
    } else {
      // Development (lot 4c, brief §6): a read of a namespace with no catalog in the chain —
      // with a loader: no consumer, no load in flight and no failed load (a known result), so
      // nothing will load it; without one: nothing ever will. A render's `useI18n(ns)` marks
      // `ns` declared until its hold (`Core.p`). Checked again after the render's task (a
      // timer): a component's hold lands at its commit or mount, after the render that read —
      // a `<T ns>` beside `useI18n(ns)` is not idle. Once per instance and namespace.
      if (__DEV__ && !idle.has(n)) {
        const q = (s: State) =>
          (!load || (!cnt[n] && !idle.has(K + n) && !s.ld.some((x) => x.endsWith(K + n)))) &&
          !chain(l).some((x) => s.c[n]?.[x[0]] || bad.has(x[0] + K + n));
        if (q(s)) {
          idle.add(n);
          setTimeout(() =>
            dead || !q(S)
              ? idle.delete(n)
              : console.warn(
                  `[@comvi/core] "${key}" reads namespace "${n}", which has no catalog for "${l}" and which nothing loads: ` +
                    (load
                      ? `hold it with useI18n(${JSON.stringify(n)}) in a component, call i18n.load(${JSON.stringify(n)}), or add it to the \`namespaces\` option`
                      : `no loader is configured — add its catalog to the \`messages\` or \`catalogs\` option`),
                ),
          );
        }
      }
      // Missing (lot 4c, owner 30.10): no message, a catalog of the namespace in place for the
      // read's chain (a per-call `{ locale }`/`{ ns }` included), and every pair of that chain
      // SETTLED — in place or failed (the negative cache), and no load of it in flight: a
      // request has priority (a catalog `add()`ed meanwhile, a retry of a failure). With a
      // loader, a pair never requested or still loading is unknown: no report
      // (an unconfirmed error is not reported; one nobody ever requests never is). Without a
      // loader the catalogs in place are the complete set. No catalog of the chain at all is
      // the development warning above (a failed load is `load_failed`). Reported at the read,
      // never replayed. With no reporter to call (production without `onError`:
      // `defaultOnError` is silent there) nothing is checked or built: a missing key costs the
      // lookup only.
      if (
        h != noop &&
        ch.some(([x]) => s.c[n]?.[x]) &&
        (!load ||
          ch.every(([x]) => (s.c[n]?.[x] || bad.has(x + K + n)) && !s.ld.includes(x + K + n)))
      )
        err("missing_key", l, n, key);
      // A missing key is marked too: the translator clicks keys no catalog has (H4).
      r = o.missing ? o.missing(key, l, n) : key;
    }
    // The marking hook of an editor session (R3-14 H4); `{ markers: false }` is checked
    // BEFORE it, so the hook never sees the call's options. A destroyed instance marks
    // nothing (protocol 2 `afterDestroy`).
    return s.mk && x !== false && !dead ? s.mk(r, key, n) : r;
  };

  /**
   * Forgets flight `f` of key `k` and publishes (with `c`, the catalogs it brought). Only that
   * flight: a newer request of the same pair stays. With `a`, its controller, the flight is
   * aborted once it has left `fl` and the state, so its abort listeners see neither.
   */
  const drop = (k: string, f: Flight, c?: Store, a?: AbortController) => {
    if (fl.get(k) == f) {
      fl.delete(k);
      rd = 0;
      pub(S.locale, c, undefined, a);
    }
  };

  /**
   * The flight of (l, n), started unless the pair is in place or failed before (not
   * published here). `p`: `l` is a parent in `p`'s chain (`pt` of `pt-BR`), so its failure
   * is reported only when `p`'s own load of `n` fails too — a regional catalog published
   * without its parent is not a failure. The role is the LATEST caller's, re-bound on every
   * call: a flight started for one locale and reused by a switch to another (`pt` for
   * `pt-BR`, then for `pt-PT` or `pt` itself) reports for the locale the instance is going to.
   */
  const get = (l: string, n: string, p?: string | 0 | false): Promise<unknown> | void => {
    const k = l + K + n;
    let f = fl.get(k);
    if (!f && load && !dead && !S.c[n]?.[l] && !bad.has(k)) {
      const a = new AbortController();
      const no = () => a.signal.aborted;
      let y!: (m: Catalog) => void;
      let x!: (e: unknown) => void;
      fl.set(
        k,
        (f = [
          // Settles on abort even when the loader ignores its signal.
          new Promise<Catalog>((u, v) => {
            y = u;
            a.signal.onabort = x = v;
          })
            // Under what `add()` put in the pair meanwhile: a saved edit survives (H8).
            .then((m) => no() || drop(k, f!, ing(S.c, l, m, n, 1)))
            // Also takes what layering a value that is not a catalog throws.
            // A parent's failure waits for `p`'s own load of `n` and is reported only if
            // that failed too.
            .catch(
              (e, c = f![2] && f![2] + K + n) =>
                no() ||
                (bad.set(k, e),
                c
                  ? (fl.get(c)?.[0] || R).then(
                      () => bad.has(c) && err("load_failed", l, n, undefined, e),
                    )
                  : err("load_failed", l, n, undefined, e),
                drop(k, f!)),
            ),
          a,
        ]),
      );
      rd = 0;
      // Registered first: what the loader does synchronously finds a whole flight.
      try {
        Promise.resolve(load(l, n, a.signal)).then(y, x);
      } catch (e) {
        x(e);
      }
    }
    return f && ((f[2] = p), f[0]);
  };

  /**
   * Starts what `l`'s chain needs for `nss`, publishing ONE "loading" state for all the
   * flights it started; the flights to wait for.
   */
  const ensure = (l: string, nss: Iterable<string>, g?: unknown) => {
    const n = fl.size;
    const ch = chain(l);
    const ps = ch
      .flatMap(([k], i) => [...nss].map((x) => get(k, x, i && i < ch.o && l)))
      .filter(Boolean);
    // `g`: a namespace needed for the first time — a published change even when nothing
    // starts loading (protocol 2: `state().ns` lists it).
    if (!dead && (g || fl.size > n)) pub();
    return ps;
  };

  /** Clears the failures whose `i`-th key part (0 locale, 1 namespace) is `v`. */
  const retry = (i: number, v: string) =>
    bad.forEach((_, k) => k.split(K)[i] == v && bad.delete(k));

  /**
   * Loads what the current chain lacks of `n` (failed pairs stay failed); with `x` (`load()`)
   * rejects by the rule of `load()`. `n` is needed from now on (`handover()` hands it over);
   * the first time, in the one publish of `ensure()`. `y`: a consumer's hold, counted BEFORE
   * anything publishes — a subscriber that switches the locale in that publish sees `n` in
   * the active set (Codex review of lot 4c, HIGH).
   */
  const use = (n: string, x?: unknown, y = 0): Promise<void> => {
    const g = !(n in cnt);
    cnt[n] = (cnt[n] | 0) + y;
    return dead
      ? R
      : (later(() =>
          Promise.all(ensure(S.locale, [n], g)).then(() => {
            if (x && lost(n)) throw bad.get(S.locale + K + n);
          }),
        ) as Promise<void>);
  };

  const lost = (n: string, l = S.locale, ch = chain(l)) =>
    bad.has(l + K + n) && !ch.slice(0, ch.o).some((x) => S.c[n]?.[x[0]]);

  const i18n: I18n = {
    get locale() {
      return S.locale;
    },
    get dir() {
      return S.dir;
    },
    get ready() {
      return fl.size ? rd || (rd = Promise.all([...fl.values()].map((f) => f[0])).then(noop)) : R;
    },
    // Fast path (R4-1d): a message already compiled in the primary record (default
    // namespace at the locale), called without per-call options or defaultParams. An empty
    // string is untranslated and takes the full path (the fallback chain).
    t: ((key: string, p?: Params, f = S.pr?.[key]) =>
      f && !(p && (p.ns || p.locale)) && !S.dp
        ? render(f, p, S.tg, env)
        : tr(S, key, p)) as I18n["t"],
    ns: ((n: string) => (key: string, p?: Params) => tr(S, key, p, n)) as I18n["ns"],
    setLocale(l) {
      if (dead) return R;
      // Production names the tag only (the report says `invalid_locale`).
      if (!valid(l))
        return Promise.reject(RangeError(__DEV__ ? `[@comvi/core] invalid locale "${l}"` : l));
      // The last call is decided here, whenever its body runs.
      const my = ++seq;
      const ch = chain(l);
      // The active set at the call: what this switch waits for (never rebuilt meanwhile).
      const ns = act();
      /**
       * Aborts the loads of locales outside `l`'s chain. A drop runs user code, which may call
       * `setLocale()`: from then on this call is stale and leaves the rest to the newer one.
       */
      const prune = () =>
        fl.forEach(
          (f, k) =>
            my != seq || ch.some((x) => x[0] == k.split(K)[0]) || drop(k, f, undefined, f[1]),
        );
      // Every step of a switch that runs user code is checked against `seq` after it: a stale
      // call leaves the flights, the failure cache and the locale to the newer one.
      const go = (): unknown => {
        if (my == seq && !dead) {
          // Also what a load(ns) started while this switch was pending needs (re-checked
          // until nothing is left to load).
          const ps = ensure(l, ns);
          // The continuation is a section too: its cleanup, publish and loads run user code.
          if (ps.length) return Promise.all(ps).then(() => sec(go));
          // Partial failure switches (R4-11): a namespace is missing only when the target
          // itself failed AND no catalog of its own chain (`de-AT` → `de`) is in place. The
          // locale kept on screen gets back what this switch's start aborted. Stale after that
          // recovery's publish: it resolves, like any superseded call.
          if (ns.length && ns.every((n) => lost(n, l, ch))) {
            ensure(S.locale, act());
            if (my == seq) throw bad.get(l + K + ns[0]);
            return;
          }
          // Loads of the old locale a load(ns) started meanwhile are obsolete now.
          prune();
          // A subscriber told of that cleanup, or of this publish, may have switched again:
          // the newer call wins, and a stale call starts nothing.
          if (my == seq && l != S.locale) pub(l);
          // The active set NOW reacts to the new locale: a consumer that appeared while this
          // switch was pending (it loaded for the locale on screen) gets `l`'s catalog.
          if (my == seq) ensure(l, act());
        }
      };
      // Nothing to load: the switch happens inside this call, or, from user code inside
      // another section, right after it.
      return new Promise((y) =>
        y(
          later(() => {
            prune();
            // The target's own failures are asked for again.
            if (my == seq) retry(0, l);
            return go() as void;
          }),
        ),
      );
    },
    load(n) {
      // The namespace's failed loads are asked for again (an explicit retry).
      retry(1, n);
      return use(n, 1);
    },
    add(l, m, n = D) {
      // A load of the same pair in flight goes on (R3-14 H8): when it lands its catalog
      // goes UNDER these messages, so they win and nothing the editor saved is lost.
      if (!dead) {
        const c = ing(S.c, l, m, n);
        // Nothing changed (the slot already holds `m`, or an invalid locale): no publish.
        if (c != S.c) pub(S.locale, c);
      }
    },
    has: (key, q = {}) => {
      const ch = chain(q.locale || S.locale);
      return (
        look(
          S,
          key,
          q.ns || D,
          q.fallback === false ? (ch.slice(0, ch.o && 1) as unknown as Chain) : ch,
        ) >= 0
      );
    },
    on(f) {
      subs.add(f);
      return () => void subs.delete(f);
    },
    rev: () => S.rev,
    destroy() {
      if (!dead) {
        dead = ++seq;
        // Detached first, as in a switch: abort listeners find no flight in the state or in
        // `ready`, the shared resolved promise from now on. Nobody is told: it is the end.
        const a = [...fl.values()];
        fl.clear();
        rd = 0;
        subs.clear();
        if (a[0]) pub();
        a.forEach((f) => f[1].abort());
        // Every teardown runs, last plugin first, even when one throws.
        downs.reverse().forEach(safe);
      }
    },
    setDefaultParams(v) {
      // A copy, published as part of the next state; after destroy() nothing changes.
      if (!dead) pub(S.locale, S.c, own(v));
    },
  };

  const c: Core = {
    s: () => S,
    tr,
    ch: chain,
    o,
    k: cnt,
    b: bad,
    h: (n, a = 1) => {
      if (__DEV__) idle.delete(K + n);
      void use(n, 0, 1);
      // Once: a second call of the same release changes nothing.
      return () => void (a && ((a = 0), cnt[n]--));
    },
    w: coming,
    r: usable,
  };
  if (__DEV__) c.p = (n) => void (cnt[n] || idle.add(K + n));
  CORE.set(i18n, c);

  // The marking hook's setter, for `devtools()` only (R3-14 H4).
  MS.set(i18n, (f) => {
    mf = f;
    pub();
  });
  for (const p of o.plugins || [])
    try {
      downs.push(p.setup(i18n));
    } catch (e) {
      // Transactional: what the earlier plugins set up is torn down before the throw.
      i18n.destroy();
      throw e;
    }
  // A plugin may have switched the locale already, which loaded what that needs; without a
  // loader nothing can start.
  if (!seq && load) sec(() => ensure(S.locale, act()));
  return i18n;
};
