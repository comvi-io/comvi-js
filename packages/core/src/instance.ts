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
 * the call) or when its loads settle with at least one catalog of `l` itself in place;
 * fallback-locale failures never block. A failed pair is remembered (no refetch on
 * every switch) until `setLocale()` targets its locale again or `load()` names its
 * namespace. A switch superseded by a later one, and every load of a locale that left
 * the chain, is aborted.
 */
import { render, type Catalog, type Compiled, type Rendered } from "./compile/cache";
import type { Env, Params } from "./compile/scanner";
import { defaultOnError, type I18nError, type OnError } from "./errors";
import { canonicalize, dir as dirOf, parents } from "./locale";
import { find, mk, N, put, type State, type Store } from "./state";
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
  /** Params every `t()` call gets unless the call passes its own value. */
  defaultParams?: Readonly<Record<string, unknown>>;
  plugins?: readonly Plugin[];
  /** IANA time zone for Date values (SSR bindings pass the server's). */
  timeZone?: string;
  /** Every problem, as a coded {@link I18nError}. Default: development console, production silent. */
  onError?: OnError;
  /** What a missing key renders. Default: the key. */
  missing?: (key: string, locale: string, ns: string) => string;
}

export interface I18n {
  /** The current locale, as the app spells it. */
  readonly locale: string;
  readonly dir: "ltr" | "rtl";
  /** Settles when the catalog loads in flight now have settled (never rejects). */
  readonly ready: Promise<void>;
  /** Translates in the `default` namespace; `{ ns, locale }` in the params switch them per call. */
  t: TFor<"default", RichParts>;
  /** `t()` bound to namespace `name`. */
  ns<N extends string>(name: N): TFor<N, RichParts>;
  /** Loads what `locale` needs, then switches. Rejects only when no catalog of `locale` itself loaded. */
  setLocale(locale: string): Promise<void>;
  /** Activates namespace `ns` and loads it for the current locale's chain. */
  load(ns: string): Promise<void>;
  /** Adds messages to (locale, ns) — by reference into an empty pair, else as a patch layer. */
  add(locale: string, messages: Catalog, ns?: string): void;
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
  /** Translates against any state of this instance (a published one, or a `view()`). */
  tr(state: State, key: string, params?: Params, ns?: string): Rendered;
  /** The lookup chain of a locale. */
  ch(locale: string): Chain;
  /** The instance time zone. */
  z?: string;
}

/** Instance → its internal seam; read by `@comvi/core/internal` only. */
export const CORE = new WeakMap<object, Core>();

const D = "default";
const K = "\0";
const noop = (): void => {};

type Flight = [Promise<unknown>, AbortController];

export const createI18n = (o: I18nOptions): I18n => {
  const fb = o.fallbackLocale;
  const report = o.onError || defaultOnError;
  const env: Env = { z: o.timeZone, r: report };
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
  let dp = o.defaultParams;
  let seq = 0;
  let dead = 0;
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

  /** `l` and its parents (`o` of them), then each fallback locale and its parents. */
  const chain = (l: string): Chain => {
    let ch = chains[l];
    if (!ch) {
      // A per-call locale may come from user input: the memo is bounded.
      if (++nch > 500) {
        chains = N();
        nch = 1;
      }
      const out = (chains[l] = ch = [] as unknown as Chain) as unknown as [string, string][];
      const walk = (k: string, c = canonicalize(k)) =>
        c &&
        // Parents are canonical already; only the entry itself keeps the app's spelling.
        [k, ...parents(c)].forEach((x, i) => ch.some((y) => y[0] == x) || out.push([x, i ? x : c]));
      walk(l);
      ch.o = ch.length;
      ([] as string[])
        .concat(
          (fb && typeof fb == "object" && !Array.isArray(fb)
            ? (fb as Record<string, readonly string[]>)[l] ||
              (fb as Record<string, readonly string[]>)[D]
            : fb) || [],
        )
        .forEach((k) => walk(k));
    }
    return ch;
  };

  /** Replaces the state and tells the subscribers; a throwing subscriber does not stop the rest. */
  const pub = (l = S.locale, c = S.c, ld = S.ld) => {
    const h = chain(l);
    S = mk(S.rev + 1, S.lrev + +(l != S.locale), l, h.o ? dirOf(h[0][1]) : "ltr", c, ld);
    subs.forEach((f) => {
      try {
        f();
      } catch (e) {
        setTimeout(() => {
          throw e;
        });
      }
    });
  };

  /** `c` with `m` layered at (l, n), after checking the locale (and, in development, the values). */
  const ing = (c: Store, l: string, m: Catalog, n: string): Store => {
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
    return valid(l) ? put(c, n, l, m) : c;
  };

  let c0: Store = N();
  const cats: Record<string, Readonly<Record<string, Catalog>>> = Object.assign(N(), o.catalogs);
  if (o.messages) cats[D] = o.messages;
  for (const n of Object.keys(cats))
    for (const l of Object.keys(cats[n])) c0 = ing(c0, l, cats[n][l], n);
  // An invalid start locale is reported; it renders through its fallback locales only.
  valid(o.locale);
  const h0 = chain(o.locale);
  S = mk(0, 0, o.locale, h0.o ? dirOf(h0[0][1]) : "ltr", c0, []);

  /** The compiled message for `key` in namespace `n` along `ch`, and its chain index. */
  const look = (s: State, key: string, n: string, ch: Chain): [Compiled, number] | void => {
    const cs = s.c[n];
    for (let i = 0, f; cs && i < ch.length; i++)
      if (cs[ch[i][0]] && (f = find(cs[ch[i][0]], key)) !== undefined) return [f, i];
  };

  const tr = (s: State, key: string, p?: Params, n = D): Rendered => {
    let l = s.locale;
    // Per-call options are read from the params object itself (R4-17).
    if (p) {
      n = (p.ns as string) || n;
      if (p.locale && valid(p.locale as string)) l = p.locale as string;
    }
    if (dp) p = Object.assign(N(), dp, p);
    const ch = chain(l);
    const r = look(s, key, n, ch);
    if (r) {
      if (r[1] >= ch.o) err("fallback_used", l, n, key);
      return render(r[0], p, ch[r[1]][1], env);
    }
    // A key of a catalog still loading is not missing yet.
    if (!s.ld.includes(l + K + n)) err("missing_key", l, n, key);
    return o.missing ? o.missing(key, l, n) : key;
  };

  /** Forgets flight `k` and publishes (with `c`, the catalogs it brought). */
  const drop = (k: string, c?: Store) => {
    fl.delete(k);
    pub(
      S.locale,
      c,
      S.ld.filter((x) => x != k),
    );
  };

  /** The flight of (l, n), started unless the pair is in place or failed before. */
  const get = (l: string, n: string): Promise<unknown> | void => {
    const k = l + K + n;
    let f = fl.get(k);
    if (!f && load && !(S.c[n] && S.c[n][l]) && !bad.has(k)) {
      const a = new AbortController();
      const no = () => a.signal.aborted;
      fl.set(
        k,
        (f = [
          new Promise<Catalog>((y) => y(load(l, n, a.signal)))
            .then((m) => no() || drop(k, ing(S.c, l, m, n)))
            // Also takes what layering a value that is not a catalog throws.
            .catch((e) => no() || (bad.set(k, e), err("load_failed", l, n, undefined, e), drop(k))),
          a,
        ]),
      );
      pub(S.locale, S.c, S.ld.concat(k));
    }
    return f && f[0];
  };

  /** Starts what `l`'s chain needs for `nss`; the flights to wait for. */
  const ensure = (l: string, nss: Iterable<string>) =>
    chain(l)
      .flatMap(([k]) => [...nss].map((n) => get(k, n)))
      .filter(Boolean);

  /** Clears the failures whose `i`-th key part (0 locale, 1 namespace) is `v`. */
  const retry = (i: number, v: string) =>
    bad.forEach((_, k) => k.split(K)[i] == v && bad.delete(k));

  const i18n: I18n = {
    get locale() {
      return S.locale;
    },
    get dir() {
      return S.dir;
    },
    get ready() {
      return Promise.all([...fl.values()].map((f) => f[0])).then(noop);
    },
    // Fast path: no params and a static message of the default namespace at the locale.
    t: ((key: string, p?: Params, f = !p && S.pr && S.pr[key]) =>
      typeof f == "string" && f ? f : tr(S, key, p)) as I18n["t"],
    ns: ((n: string) => (key: string, p?: Params) => tr(S, key, p, n)) as I18n["ns"],
    setLocale(l) {
      if (dead) return Promise.resolve();
      if (!valid(l)) return Promise.reject(RangeError(`[@comvi/core] invalid locale "${l}"`));
      const my = ++seq;
      const keep = chain(l).map((x) => x[0]);
      fl.forEach((f, k) => keep.includes(k.split(K)[0]) || (f[1].abort(), drop(k)));
      // The target's own failures are asked for again.
      retry(0, l);
      const go = () => {
        if (my == seq && !dead) {
          const miss = [...act].filter((n) => bad.has(l + K + n));
          // Partial failure switches (R4-11); only a target with no catalog at all rejects.
          if (act.size && miss.length == act.size) throw bad.get(l + K + miss[0]);
          if (l != S.locale) pub(l);
        }
      };
      const ps = ensure(l, act);
      // Nothing to load: the switch happens inside this call.
      return ps.length ? Promise.all(ps).then(go) : new Promise((y) => y(go()));
    },
    load(n) {
      if (dead) return Promise.resolve();
      retry(1, n);
      act.add(n);
      return Promise.all(ensure(S.locale, [n])).then(noop);
    },
    add(l, m, n = D) {
      if (!dead) {
        // A newer manual catalog wins over a load of the same pair still in flight.
        const k = l + K + n;
        const f = fl.get(k);
        if (f) {
          f[1].abort();
          fl.delete(k);
        }
        pub(
          S.locale,
          ing(S.c, l, m, n),
          S.ld.filter((x) => x != k),
        );
      }
    },
    has: (key, q = {}) => {
      const ch = chain(q.locale || S.locale);
      return !!look(
        S,
        key,
        q.ns || D,
        q.fallback === false ? (ch.slice(0, ch.o && 1) as unknown as Chain) : ch,
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
        subs.clear();
        // Every teardown runs, last plugin first, even when one throws.
        downs.reverse().forEach((f) => {
          try {
            if (f) f();
          } catch (e) {
            setTimeout(() => {
              throw e;
            });
          }
        });
      }
    },
    setDefaultParams(v) {
      dp = v;
      if (!dead) pub();
    },
  };

  CORE.set(i18n, { s: () => S, tr, ch: chain, z: o.timeZone });

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
