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
 * never block. A namespace activated while the switch is pending is loaded for the
 * target before it switches. A failed pair is remembered (no refetch on every switch)
 * until `setLocale()` targets its locale again or `load()` names its namespace. A switch
 * superseded by a later one, and every load of a locale that left the chain, is aborted.
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
  /** Flat catalogs of the `default` namespace, by locale. */
  messages?: Readonly<Record<string, Catalog>>;
  /** Flat catalogs by namespace, then locale. */
  catalogs?: Readonly<Record<string, Readonly<Record<string, Catalog>>>>;
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
  /** Epoch ms that `formatRelativeTime` (`@comvi/core/format`) counts from; SSR bindings serialise it. Default: the clock. */
  now?: number;
  /** Named Intl options for `@comvi/core/format`: `formatNumber(i18n, n, "price")`. */
  formats?: {
    number?: Readonly<Record<string, Intl.NumberFormatOptions>>;
    date?: Readonly<Record<string, Intl.DateTimeFormatOptions>>;
  };
  /** Every problem, as a coded {@link I18nError}. Default: development console, production silent. */
  onError?: OnError;
  /** What a missing key renders. Default: the key. */
  missing?: (key: string, locale: string, ns: string) => string;
}

export interface I18n {
  /** The current locale, as the app spells it. */
  readonly locale: string;
  readonly dir: "ltr" | "rtl";
  /**
   * Settles when the catalog loads in flight now have settled (never rejects). The same
   * promise object for as long as the set of loads in flight does not change (a binding
   * may throw it for Suspense); one shared resolved promise when nothing loads.
   */
  readonly ready: Promise<void>;
  /**
   * Translates in the `default` namespace; `{ ns, locale }` in the params switch them per
   * call and `{ markers: false }` keeps an editor session from marking the output. `ns`,
   * `locale` and `markers` are reserved names: a message cannot have params called so.
   */
  t: TFor<"default", RichParts>;
  /** `t()` bound to namespace `name`. */
  ns<N extends string>(name: N): TFor<N, RichParts>;
  /** Loads what `locale` needs, then switches. Rejects only when no catalog of `locale` itself loaded. */
  setLocale(locale: string): Promise<void>;
  /** Activates namespace `ns` and loads it for the current locale's chain. */
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
  /** The lookup chain of a locale. */
  ch(locale: string): Chain;
  /** The options the instance was made with (`timeZone`, `now`, `formats` for `/format`). */
  o: I18nOptions;
  /** The active namespaces. */
  n: ReadonlySet<string>;
  /**
   * Activates namespace `ns` and loads what the current locale's chain lacks of it, like
   * `load()` but WITHOUT asking its failed loads again: a binding activating on every mount
   * must not turn one failure into a refetch per mount (`load()` is the explicit retry).
   */
  a(ns: string): Promise<void>;
  /** Namespace `ns` is still coming in `state` (see `coming` in createI18n). */
  w(state: State, ns: string): unknown;
  /**
   * Sets (or, with `null`, clears) the marking hook and publishes a new state carrying it
   * (R3-14 H4). Reached only by the `/devtools` handle `x.mark`; nothing else marks.
   */
  m(fn: Mark | null): void;
}

/** Instance → its internal seam; read by `@comvi/core/internal` only. */
export const CORE = new WeakMap<object, Core>();

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

type Flight = [Promise<unknown>, AbortController];

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
  const act = new Set(o.namespaces || [D]);
  const downs: (void | (() => void))[] = [];
  let chains: Record<string, Chain> = N();
  let nch = 0;
  /** `ready` for the current set of flights; cleared whenever that set changes. */
  let rd: Promise<void> | 0 = 0;
  let seq = 0;
  let dead = 0;
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
   * Replaces the state (its loads in flight are `fl`'s keys) and tells the subscribers; a
   * throwing subscriber does not stop the rest.
   */
  const pub = (l = S.locale, c = S.c, dp = S.dp) => {
    S = st(S.rev + 1, S.lrev + +(l != S.locale), l, c, dp);
    subs.forEach(safe);
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
  const cats: Record<string, Readonly<Record<string, Catalog>>> = N(o.catalogs);
  if (o.messages) cats[D] = o.messages;
  for (const n of Object.keys(cats))
    for (const l of Object.keys(cats[n])) c0 = ing(c0, l, cats[n][l], n);
  // An invalid start locale is reported (by its chain); it renders through its fallback
  // locales only.
  S = st(0, 0, o.locale, c0, own(o.defaultParams));

  /**
   * Namespace `n` is still coming in state `s`, so a key of it is not missing yet: a load
   * of it is in flight (for any locale: a parent, a fallback, the target of a pending
   * switch), or the instance has a loader and nobody activated `n` yet while it holds no
   * catalog of the state's locale — the activation will load it. `useI18n(n)` renders
   * before it activates `n` after commit (lot 1d).
   */
  const coming = (s: State, n: string): unknown =>
    s.ld.some((x) => x.endsWith(K + n)) || (load && !act.has(n) && !s.c[n]?.[s.locale]);

  /** The message `look()` found last; copied by the caller before anything can call back. */
  let hit: Compiled;

  /** The chain index where `key` is found in namespace `n` (its message in `hit`), or -1. */
  const look = (s: State, key: string, n: string, ch: Chain): number => {
    const cs = s.c[n];
    for (let i = 0, x; cs && i < ch.length; i++)
      if ((x = cs[ch[i][0]]) && (hit = find(x, key)!) !== undefined) return i;
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
      // A key of a namespace still coming is not missing yet. With no reporter to call
      // (production without `onError`: `defaultOnError` is silent there) nothing is checked
      // or built: a missing key costs the lookup only.
      if (h != noop && !coming(s, n)) err("missing_key", l, n, key);
      // A missing key is marked too: the translator clicks keys no catalog has (H4).
      r = o.missing ? o.missing(key, l, n) : key;
    }
    // The marking hook of an editor session (R3-14 H4); `{ markers: false }` is checked
    // BEFORE it, so the hook never sees the call's options. A destroyed instance marks
    // nothing (protocol 2 `afterDestroy`).
    return s.mk && x !== false && !dead ? s.mk(r, key, n) : r;
  };

  /** Forgets flight `k` and publishes (with `c`, the catalogs it brought). */
  const drop = (k: string, c?: Store) => {
    fl.delete(k);
    rd = 0;
    pub(S.locale, c);
  };

  /** The flight of (l, n), started unless the pair is in place or failed before (not published here). */
  const get = (l: string, n: string): Promise<unknown> | void => {
    const k = l + K + n;
    let f = fl.get(k);
    if (!f && load && !S.c[n]?.[l] && !bad.has(k)) {
      const a = new AbortController();
      const no = () => a.signal.aborted;
      fl.set(
        k,
        (f = [
          // Settles on abort even when the loader ignores its signal.
          new Promise<Catalog>((y, x) => {
            a.signal.onabort = x;
            Promise.resolve(load(l, n, a.signal)).then(y, x);
          })
            // Under what `add()` put in the pair meanwhile: a saved edit survives (H8).
            .then((m) => no() || drop(k, ing(S.c, l, m, n, 1)))
            // Also takes what layering a value that is not a catalog throws.
            .catch((e) => no() || (bad.set(k, e), err("load_failed", l, n, undefined, e), drop(k))),
          a,
        ]),
      );
    }
    return f && f[0];
  };

  /**
   * Starts what `l`'s chain needs for `nss`, publishing ONE "loading" state for all the
   * flights it started; the flights to wait for.
   */
  const ensure = (l: string, nss: Iterable<string>, g?: boolean) => {
    const n = fl.size;
    const ps = chain(l)
      .flatMap(([k]) => [...nss].map((x) => get(k, x)))
      .filter(Boolean);
    // `g`: the active set grew — a published change even when nothing starts loading.
    if (g || fl.size > n) {
      rd = 0;
      pub();
    }
    return ps;
  };

  /** Clears the failures whose `i`-th key part (0 locale, 1 namespace) is `v`. */
  const retry = (i: number, v: string) =>
    bad.forEach((_, k) => k.split(K)[i] == v && bad.delete(k));

  /**
   * Activates `n` and loads what the current chain lacks of it (failed pairs stay failed).
   * A namespace joining the active set publishes (protocol 2: `ns` is part of the state),
   * in the one publish of `ensure()`.
   */
  const use = (n: string): Promise<void> =>
    dead ? R : Promise.all(ensure(S.locale, [n], act.size < act.add(n).size)).then(noop);

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
      if (!valid(l)) return Promise.reject(RangeError(`[@comvi/core] invalid locale "${l}"`));
      const my = ++seq;
      const ch = chain(l);
      /** Aborts the loads of locales outside `l`'s chain. */
      const prune = () =>
        fl.forEach((f, k) => ch.some((x) => x[0] == k.split(K)[0]) || (f[1].abort(), drop(k)));
      prune();
      // The target's own failures are asked for again.
      retry(0, l);
      const go = (): unknown => {
        if (my == seq && !dead) {
          // Also what a load(ns) started while this switch was pending needs (re-checked
          // until nothing is left to load).
          const ps = ensure(l, act);
          if (ps.length) return Promise.all(ps).then(go);
          // Partial failure switches (R4-11): a namespace is missing only when the target
          // itself failed AND no catalog of its own chain (`de-AT` → `de`) is in place.
          const ns = [...act];
          if (
            ns.length &&
            ns.every((n) => bad.has(l + K + n) && !ch.slice(0, ch.o).some((x) => S.c[n]?.[x[0]]))
          )
            throw bad.get(l + K + ns[0]);
          // Loads of the old locale a load(ns) started meanwhile are obsolete now.
          prune();
          if (l != S.locale) pub(l);
        }
      };
      // Nothing to load: the switch happens inside this call.
      return new Promise((y) => y(go() as void));
    },
    load(n) {
      // The namespace's failed loads are asked for again (an explicit retry).
      retry(1, n);
      return use(n);
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
        fl.forEach((f) => f[1].abort());
        fl.clear();
        rd = 0;
        subs.clear();
        // Every teardown runs, last plugin first, even when one throws.
        downs.reverse().forEach(safe);
      }
    },
    setDefaultParams(v) {
      // A copy, published as part of the next state; after destroy() nothing changes.
      if (!dead) pub(S.locale, S.c, own(v));
    },
  };

  CORE.set(i18n, {
    s: () => S,
    tr,
    ch: chain,
    o,
    n: act,
    a: use,
    w: coming,
    m(f) {
      mf = f;
      pub();
    },
  });

  for (const p of o.plugins || [])
    try {
      downs.push(p.setup(i18n));
    } catch (e) {
      // Transactional: what the earlier plugins set up is torn down before the throw.
      i18n.destroy();
      throw e;
    }
  // A plugin may have switched the locale already, which loaded what that needs.
  if (!seq) ensure(S.locale, act);
  return i18n;
};
