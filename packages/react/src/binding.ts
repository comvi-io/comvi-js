/**
 * The React binding over the 0.8 core (design §3.4, §2.5; synthesis R4-15, R4-16, R4-20;
 * lot-0 spike S9, the commit model).
 *
 * - ONE subscription per provider: `useSyncExternalStore` on the instance's published
 *   state. Hooks read a SLICE of what the provider renders: `useI18n()` the whole state
 *   (a new snapshot re-renders it — the accepted compromise of §2.5), `useLocale()` only
 *   the locale (a namespace load re-renders nothing that reads it).
 * - `<I18nHandover>` renders its subtree from a RENDER-LOCAL state,
 *   `view(published, catalogs, locale)`: catalogs handed over as a prop (an SSR or RSC
 *   payload) and a target locale render at once, and are PUBLISHED (`add()`,
 *   `setLocale()`) only at commit, so a render React abandons, suspends or runs on the
 *   server publishes nothing (S9: H5, R2, R5). It is its own component so an app without
 *   a server payload carries none of it (the R3-10 binding cap).
 * - Fixed hook order in every component; nothing publishes during render (R4-17).
 */
import {
  createContext,
  createElement,
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Catalog, I18n, KeysOf, NsOf, ParamsFor, TFor } from "@comvi/core";
import { state, translate, view, type State } from "@comvi/core/internal";

declare const __DEV__: boolean;

/** Catalogs by namespace, then locale (the shape of `createI18n({ catalogs })`). */
export type ProviderCatalogs = Readonly<Record<string, Readonly<Record<string, Catalog>>>>;

export interface I18nProviderProps {
  i18n: I18n;
  /** Rendered instead of the children while a catalog of the current locale loads. */
  loading?: ReactNode;
  /**
   * Suspend instead (throw `i18n.ready` to the nearest `<Suspense>`) while a catalog of
   * the current locale loads. `ready` is one promise per set of loads, so a re-render
   * while they are in flight does not suspend again.
   */
  suspense?: boolean;
  children?: ReactNode;
}

export interface I18nHandoverProps {
  /**
   * Catalogs to render with before the instance holds them (an SSR or RSC payload). They
   * are added to the instance at commit, once per object: pass a STABLE object (a new
   * literal on every parent render is layered again on every render).
   */
  catalogs?: ProviderCatalogs;
  /**
   * The locale to render in (a route parameter). The subtree renders in it at once and the
   * instance switches at commit; a later `setLocale()` wins until this prop changes.
   */
  locale?: string;
  children?: ReactNode;
}

type Ctx = readonly [I18n, State];

const C = createContext<Ctx | null>(null);
const L = createContext("");
// React 18 warns about useLayoutEffect in a server render; the server runs no effects.
const useCommit = typeof document < "u" ? useLayoutEffect : useEffect;

/** Rich parts → one node: a Fragment with the parts as varargs (no keys, no cloneElement). */
const node = (r: unknown): any =>
  Array.isArray(r) ? createElement(Fragment, null, ...(r as ReactNode[])) : r;

/**
 * A tag handler receives its children as ONE node (a Fragment), so `<a>{chunks}</a>`
 * renders nested tags and element params without React's missing-key warning.
 */
const wrap = (p?: Record<string, unknown>) => {
  let q: Record<string, unknown> | undefined;
  for (const k in p) {
    const f = p[k];
    if (typeof f == "function") (q ||= { ...p })[k] = (c: unknown) => f(node(c));
  }
  return q || p;
};

const provide = (v: Ctx, children: ReactNode) =>
  createElement(
    C.Provider,
    { value: v },
    createElement(L.Provider, { value: v[1].locale }, children),
  );

const useCtx = (): Ctx => {
  const c = useContext(C);
  if (__DEV__ && !c) throw Error("[@comvi/react] no <I18nProvider> above this component");
  return c!;
};

/** Makes `i18n` the instance of its subtree and re-renders it on every published change. */
export const I18nProvider = ({
  i18n: i,
  loading: spinner,
  suspense,
  children,
}: I18nProviderProps): ReactElement => {
  const get = () => state(i);
  const s = useSyncExternalStore(i.on, get, get);
  // Only a load of the CURRENT locale gates: a switch keeps showing the old locale.
  const busy = s.ld.some((k) => !k.indexOf(s.locale + "\0"));
  if (busy && suspense) throw i.ready;
  return provide([i, s], busy && spinner !== undefined ? spinner : children);
};

/**
 * Renders its subtree with `catalogs` and in `locale` before the instance has them, and
 * hands both to the instance at commit (inside an `<I18nProvider>`).
 */
export const I18nHandover = ({
  catalogs,
  locale: target,
  children,
}: I18nHandoverProps): ReactElement => {
  const [i, base] = useCtx();
  // Locale handover as DERIVED state, never a render-time write: render the target while
  // the published locale has not moved since the prop was given (`lrev`), then follow it.
  const [given, setH] = useState(() => [i, target, base.locale, base.lrev] as const);
  let h = given;
  if (h[0] != i || h[1] != target) setH((h = [i, target, base.locale, base.lrev]));
  const loc = target && target != h[2] && h[3] == base.lrev ? target : base.locale;
  /** The [instance, catalogs] pair published last (written at commit only). */
  const done = useRef<readonly [I18n, ProviderCatalogs]>(undefined);
  const fresh = (d = done.current) => catalogs && !(d && d[0] == i && d[1] == catalogs);
  const v = useMemo(
    (): Ctx => [i, view(i, base, fresh() ? catalogs! : {}, loc)],
    [i, base, catalogs, loc],
  );
  useCommit(() => {
    if (fresh()) {
      for (const n in catalogs) for (const l in catalogs[n]) i.add(l, catalogs[n][l], n);
      done.current = [i, catalogs!];
    }
    // A rejection is reported through onError already (load_failed, invalid_locale).
    if (target && target != i.locale) i.setLocale(target).catch(() => {});
  }, [i, catalogs, target]);
  return provide(v, children);
};

/** What `useI18n(ns)` returns. */
export interface UseI18n<NS extends string = "default"> {
  /** `t()` against what this render shows; a rich message renders a React element. */
  t: TFor<NS, ReactElement>;
  locale: string;
  dir: "ltr" | "rtl";
  /** A catalog of this namespace is loading, for any locale (a switch in progress too). */
  isLoading: boolean;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/**
 * The i18n of the nearest `<I18nProvider>`. `ns` is the namespace of `t`; it is
 * activated (loaded for the locale) after commit, never during render.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const c = useCtx();
  const [i, s] = c;
  useEffect(() => {
    if (ns) i.load(ns);
  }, [i, ns]);
  return useMemo(
    () => ({
      t: ((k: string, p?: Record<string, unknown>) =>
        node(translate(i, s, k, wrap(p), ns))) as UseI18n<NS>["t"],
      locale: s.locale,
      dir: s.dir,
      isLoading: s.ld.some((k) => k.endsWith("\0" + (ns || "default"))),
      setLocale: i.setLocale,
      i18n: i,
    }),
    [c, ns],
  );
};

/** The locale this render shows. Re-renders on a locale change only, not on a namespace load. */
export const useLocale = (): string => useContext(L);

type ParamProps<N extends NsOf, K extends KeysOf[N]> = [ParamsFor<N, K>] extends [never]
  ? {}
  : ParamsFor<N, K>;

/** `<T i18nKey ns? locale? {...params}>`: typed by the generated catalogs when declared. */
export type TComponent = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; ns?: string; locale?: string } & Record<string, unknown>,
    ) => ReactNode
  : <K extends KeysOf[N], N extends NsOf = "default" & NsOf>(
      props: { i18nKey: K; ns?: N; locale?: string } & ParamProps<N, K>,
    ) => ReactNode;

/**
 * Renders one message; params are props, a tag handler is a prop of the tag's name
 * (`<T i18nKey="terms" link={(c) => <a href="/terms">{c}</a>} />`). `ns` is explicit:
 * `<T>` never takes the namespace of a `useI18n(ns)` above it (R3-5).
 */
export const T = (({ i18nKey, ns, ...p }: { i18nKey: string; ns?: string }) =>
  (useI18n(ns).t as (k: string, p: object) => ReactNode)(i18nKey, p)) as TComponent;
