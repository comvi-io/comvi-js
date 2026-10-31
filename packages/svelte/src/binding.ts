/**
 * The Svelte binding over the 0.8 core (design §3.6, R4-18; mirrors `@comvi/react` and
 * `@comvi/vue`).
 *
 * - `useI18n(ns)` holds its namespace from mount to destroy (lot 4c), never during init; on a
 *   server it holds at once, per request (nothing is destroyed there: the instance dies with the
 *   request). A server render is synchronous, so a route loads with `i18n.load(ns)` first.
 * - The state members are getters over the instance's cell: read them through the object
 *   (`i18n.locale`), as `page` of `$app/state`; destructured in a `<script>`, one is read once.
 * - `t` is text only (critic K10: a snippet needs `{@render}`, so rich text is `<T>`'s).
 * - `useI18n(ns).T` is `<T>` with its namespace: one wrapper per namespace, which forwards the
 *   props through a Proxy so a param stays reactive (a getter of the parent's) on the client.
 */
import { BROWSER, DEV } from "esm-env";
import { onMount, type Component, type Snippet } from "svelte";
import type { BoundTFor, I18n, NsOf, TComponentFor, TFor, UntypedT } from "@comvi/core";
import { core, N } from "@comvi/core/internal";
import { use } from "./context.svelte.js";
import TComponentImpl from "./T.svelte";

declare module "@comvi/core" {
  /**
   * What a tag handler of a generated catalog (`{ link: Tag }`) receives: the tag's children
   * as ONE value. In `t()` always their text; in `<T>` their text when they are all text.
   */
  interface TagChildren {
    svelte: Children;
  }
}

/** A tag's children: text, or the list of its parts (a `<T>` tag holding rendered tags). */
export type Children = string | readonly unknown[];

/**
 * Params of a message in a project with no generated catalogs: a value or a tag handler. The
 * handler member gives an inline `(children) => …` its argument type.
 */
export type UntypedParams = Record<
  string,
  object | string | number | bigint | boolean | null | undefined | ((children: Children) => unknown)
>;

/**
 * What renders a tag through `components` (R3-24): an HTML tag name (`"strong"`), a Svelte
 * component, or `{ component, props }` for one that needs props of its own (`{ component: "a",
 * props: { href: "/terms" } }`); the tag's content is its `children` snippet.
 */
export type TagComponent =
  | string
  | Component<any>
  | { component: string | Component<any>; props?: Readonly<Record<string, unknown>> };

/**
 * A snippet of a tag's name inside `<T>` (`{#snippet link(children)}`). `children` is the text
 * of the tag's content: nested markup is flattened and development warns; render such a tag
 * through `components` to keep it.
 */
export type TagSnippet = Snippet<[children: string]>;

type TagMap = Readonly<Record<string, TagComponent>>;
/** The props of a generic `<T>` signature as `Component` reads them in a template. */
type Markup<F extends (props: never) => unknown> = Component<Parameters<F>[0]>;

/**
 * `<T i18nKey ns? locale? markers? components? {...params}>`: typed by the generated catalogs
 * when declared. Called in TypeScript, the key's own params are checked; in a template
 * svelte-check takes the `Component` half: the keys of the catalogs, loose params.
 */
export type TComponent = [NsOf] extends [never]
  ? Component<
      {
        i18nKey: string;
        ns?: string;
        locale?: string;
        markers?: boolean;
        components?: TagMap;
      } & UntypedParams
    >
  : TComponentFor<void, 1, TagMap> & Markup<TComponentFor<void, 1, TagMap>>;

/** `<T>` bound to namespace NS (from `useI18n(ns)`): typed by that namespace's keys. */
export type BoundT<NS extends string = "default"> = [NsOf] extends [never]
  ? Component<
      {
        i18nKey: string;
        locale?: string;
        markers?: boolean;
        ns?: never;
        components?: TagMap;
      } & UntypedParams
    >
  : NS extends NsOf
    ? BoundTFor<NS, void, 1, TagMap> & Markup<BoundTFor<NS, void, 1, TagMap>>
    : never;

/** What `useI18n(ns)` returns. Read the state members through the object: they are getters. */
export interface UseI18n<NS extends string = "default"> {
  /**
   * `t()` against the instance's state; a template or a `$derived` calling it re-runs on a
   * new state. Always a string: a tag handler's output is joined into it. Rich text is `<T>`'s.
   */
  t: [NsOf] extends [never] ? UntypedT<never, UntypedParams> : TFor<NS, never>;
  /** `<T>` bound to this namespace; the same component for every caller (R3-5(b)). */
  T: BoundT<NS>;
  /** The locale on screen. */
  locale: string;
  dir: "ltr" | "rtl";
  /**
   * A catalog of this namespace is usable for the locale on screen: its own, a parent's or an
   * allowed fallback locale's. Keys are not promised: a key a catalog lacks is a plain missing
   * key. Not the same as the `i18n.ready` promise.
   */
  isReady: boolean;
  /**
   * A catalog of this namespace is loading, for any locale, or will load when the component
   * holds the namespace at mount. `false` once a load failed with nothing in flight: with no
   * usable catalog that is the "unavailable" state (`isReady` false too).
   */
  isLoading: boolean;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/** `<T>` bound per namespace, prototype-free: a namespace called `constructor` gets its own. */
const Ts = N<Component<any>>();

/**
 * The i18n of the nearest `setI18n`. `ns` (default `default`) is the namespace of `t` and `T`.
 * The component holds it from mount to destroy: while held it loads for the locale on screen and
 * for every locale `setLocale()` switches to; with no consumer left it stays cached but a
 * switch does not load it. A failed load of it is not asked again by a remount: `i18n.load(ns)`
 * retries.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const c = use();
  const i = c.i;
  const x = core(i);
  const n = ns || "default";
  // Development: until the mount, reads of `n` are not idle ones.
  if (DEV) x.p!(n);
  // Once released, `isLoading` is a load in flight only: no hold of this one will load `n`, so a
  // result kept after the destroy is not loading forever.
  let u = 0;
  if (BROWSER)
    onMount(() => {
      const r = x.h(n);
      return () => ((u = 1), r());
    });
  else x.h(n);
  return {
    t: ((k: string, p?: never) =>
      ([] as unknown[]).concat(x.tr(c.s, k, p, n, text)).join("")) as UseI18n<NS>["t"],
    T: (Ts[n] ||= ((a: unknown, p: Record<string | symbol, unknown>) =>
      (TComponentImpl as (a: unknown, p: object) => void)(
        a,
        new Proxy(p, { get: (o, k) => (k == "ns" ? n : o[k]) }),
      )) as never) as BoundT<NS>,
    get locale() {
      return c.s.locale;
    },
    get dir() {
      return c.s.dir;
    },
    // Until the hold at mount, what the hold will load is loading already: no frame that says
    // "unavailable", no `missing_key` (lot 1d, 4c).
    get isReady() {
      return x.r(c.s, n);
    },
    get isLoading() {
      return !!x.w(c.s, n, u);
    },
    setLocale: i.setLocale,
    i18n: i,
  };
};

/** The core's joiner for `t`: a tag handler gets its children as text. */
const text = (r: unknown[]) => r.join("");
