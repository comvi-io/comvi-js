/**
 * The Vue binding over the 0.8 core (design §3.5, §2.5, R3-5; mirrors `@comvi/react`).
 *
 * - `createI18n(options)` is core's instance plus `install`: `app.use(i18n)` provides it to
 *   every component of the app and sets the global `$t`. On a server, an instance per request
 *   (R3-18(3)): the app factory creates both.
 * - ONE subscription per instance: a `shallowRef` of its published state, made when the
 *   instance is. Readers take a SLICE through `computed`: `locale` and `dir` re-render only
 *   when they change, `t()` / `$t()` read the whole state (a new snapshot re-renders what
 *   called them — the accepted compromise of §2.5, as in React).
 * - A namespace is activated after the component mounts (a post-flush watcher), never
 *   during setup or render; on a server, before the component renders (`onServerPrefetch`:
 *   `renderToString` waits for its catalogs).
 */
import {
  computed,
  Fragment,
  h,
  inject,
  onServerPrefetch,
  shallowRef,
  watchEffect,
  type App,
  type ComputedRef,
  type FunctionalComponent,
  type InjectionKey,
  type ShallowRef,
  type VNode,
  type VNodeChild,
  type WritableComputedRef,
} from "vue";
import {
  createI18n as create,
  type BoundTFor,
  type I18n,
  type I18nOptions,
  type NsOf,
  type TComponentFor,
  type TFor,
} from "@comvi/core";
import { activate, coming, state, translate, type State } from "@comvi/core/internal";

declare const __DEV__: boolean;

declare module "@comvi/core" {
  /**
   * What a tag handler of a generated catalog (`{ link: Tag }`) receives: the tag's
   * children joined into ONE child — a string when they are all text (the usual
   * `<link>terms</link>`), else a Fragment node. `h("a", props, children)` takes both.
   */
  interface TagChildren {
    vue: string | VNode;
  }
}

/** The instance `createI18n` of `@comvi/vue` makes: core's, plus `install` for `app.use()`. */
export type VueI18n = I18n & { install(app: App): void };

/** Per instance: its published state, and the `locale` and `dir` slices of it. */
type Cell = readonly [ShallowRef<State>, WritableComputedRef<string>, ComputedRef<"ltr" | "rtl">];
const cells = new WeakMap<I18n, Cell>();

const K: InjectionKey<I18n> = Symbol();
const D = "default";
/** Instances installed into an app on a server (development check, one per request). */
const served = new WeakSet<I18n>();

/**
 * Rich parts → one child: their text when every part is a string, else a Fragment of them.
 * Also the core's joiner, so a tag handler gets its children as this one child.
 */
const node = (r: unknown): any =>
  Array.isArray(r) ? (r.every((x) => typeof x == "string") ? r.join("") : h(Fragment, r)) : r;

/** `t()` of `i` for namespace `ns`, against the state its cell holds (a reactive read). */
const tr = (i: I18n, ns?: string) => (k: string, p?: object) =>
  node(translate(i, cells.get(i)![0].value, k, p as never, ns, node));

function install(this: VueI18n, app: App): void {
  // A server serves requests concurrently: one instance installed into two apps would
  // render one request in the locale another request switched to (R3-18(3)).
  if (__DEV__ && typeof document == "undefined") {
    if (served.has(this))
      throw Error(
        "[@comvi/vue] an instance is installed into a second app on the server: create the i18n instance per request, in the function that creates the app",
      );
    served.add(this);
  }
  app.provide(K, this);
  app.config.globalProperties.$t = tr(this) as never;
}

/**
 * Creates the instance (core's `createI18n`, same options) and makes it a Vue plugin:
 * `createApp(App).use(i18n)`.
 */
export const createI18n = (options: I18nOptions): VueI18n => {
  const i = create(options) as VueI18n;
  const s = shallowRef(state(i));
  i.on(() => (s.value = state(i)));
  cells.set(i, [
    s,
    computed({
      get: () => s.value.locale,
      // A failed switch is reported through `onError` (load_failed, invalid_locale) and
      // keeps the old locale; a `v-model` has nobody to hand the rejection to.
      set: (l) => void i.setLocale(l).catch(() => {}),
    }),
    computed(() => s.value.dir),
  ]);
  i.install = install;
  return i;
};

/** The instance of the app this component belongs to. */
const use = (): I18n => {
  const i = inject(K);
  if (__DEV__ && !i) throw Error("[@comvi/vue] no app.use(i18n) above this component");
  return i!;
};

/**
 * Activates the namespace `ns()` names after the component mounts, and again when it
 * changes — never during setup or render. On a server the render waits for the namespace
 * (the default one too): `renderToString` then renders its catalogs, never its keys.
 */
const live = (i: I18n, ns: () => string | undefined) => {
  watchEffect(
    () => {
      const n = ns();
      if (n) activate(i, n);
    },
    { flush: "post" },
  );
  onServerPrefetch(() => activate(i, ns() || D));
};

/**
 * Params of a message in a project with no generated catalogs: a value, a node or a tag
 * handler. The handler member gives an inline `(children) => h("a", children)` its
 * argument type, so it needs no annotation.
 */
export type UntypedParams = Record<
  string,
  object | VNodeChild | ((children: string | VNode) => VNodeChild)
>;

/** What a slot of `<T>` named after a tag receives. */
export interface TagSlotProps {
  /** The tag's children: their text, or a Fragment node when they hold markup. */
  children: string | VNode;
}

/**
 * `<T i18nKey ns? locale? markers? {...params}>`: typed by the generated catalogs when
 * declared. A tag's handler is a prop or a slot of the tag's name, so with generated
 * catalogs a `Tag` param is optional here.
 */
export type TComponent = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; ns?: string; locale?: string; markers?: boolean } & UntypedParams,
    ) => VNode
  : // The typo guard of `t()` (R3-2) is in the shared core type: see TComponentFor.
    TComponentFor<VNode, 1>;

/** `<T>` bound to namespace NS (from `useI18n(ns)`): typed by that namespace's keys. */
export type BoundT<NS extends string = "default"> = [NsOf] extends [never]
  ? (
      props: { i18nKey: string; locale?: string; markers?: boolean; ns?: never } & UntypedParams,
    ) => VNode
  : NS extends NsOf
    ? BoundTFor<NS, VNode, 1>
    : never;

/** What `useI18n(ns)` returns. */
export interface UseI18n<NS extends string = "default"> {
  /**
   * `t()` against the instance's state; a template calling it re-renders on a new state. A
   * rich message renders a node (render functions; in a template use `<T>`). Without
   * generated catalogs it is typed `string`.
   */
  t: [NsOf] extends [never] ? (key: string, params?: UntypedParams) => string : TFor<NS, VNode>;
  /** `<T>` bound to this namespace; the same component for every caller (R3-5(b)). */
  T: BoundT<NS>;
  /**
   * The locale on screen. Setting it switches (`setLocale`): the value stays the old one
   * until the new locale's catalogs are in. Re-renders only on a locale change.
   */
  locale: WritableComputedRef<string>;
  dir: ComputedRef<"ltr" | "rtl">;
  /**
   * A catalog of this namespace is loading, for any locale (a switch in progress too), or
   * will load when the component activates the namespace after it mounts.
   */
  isLoading: ComputedRef<boolean>;
  setLocale: (locale: string) => Promise<void>;
  i18n: I18n;
}

/**
 * Renders one message; params are attributes, a tag handler is an attribute or a slot of
 * the tag's name (`<T i18nKey="terms"><template v-slot:link="{ children }"><a href="/terms">{{
 * children }}</a></template></T>`). Every attribute but `i18nKey` and the per-call options
 * `ns`, `locale` and `markers` is a message param — `class` too. `ns` is explicit: `<T>` never
 * takes the namespace of a `useI18n(ns)` above it (R3-5); `useI18n(ns).T` is the bound one.
 * `markers={false}` opts the message out of an in-context editor session (R3-14 H9).
 */
export const T = {
  props: ["i18nKey", "ns", "locale", "markers"],
  inheritAttrs: false,
  setup(
    p: { i18nKey: string; ns?: string; locale?: string; markers?: boolean },
    { attrs, slots }: { attrs: Record<string, unknown>; slots: Record<string, any> },
  ) {
    const i = use();
    live(i, () => p.ns);
    return () => {
      // The per-call options sit in the params, where the core reads them.
      const q: Record<string, unknown> = {
        ...attrs,
        ns: p.ns,
        locale: p.locale,
        markers: p.markers,
      };
      // An attribute wins over a slot of the same name.
      for (const k in slots) q[k] ??= (children: unknown) => slots[k]({ children });
      return tr(i, p.ns)(p.i18nKey, q);
    };
  },
} as unknown as TComponent;

/**
 * Bound `<T>` per namespace: one component identity for the app's lifetime. Prototype-free,
 * so a namespace called `constructor` gets its own component.
 */
const Ts: Record<string, FunctionalComponent> = Object.create(null);

/**
 * The i18n of the app (`app.use(i18n)`). `ns` is the namespace of `t` and `T`; it is
 * activated after the component mounts, never during setup. A failed load of it is not
 * asked again by a remount — `i18n.load(ns)` retries.
 */
export const useI18n = <NS extends string = "default">(ns?: NS): UseI18n<NS> => {
  const i = use();
  const [s, locale, dir] = cells.get(i)!;
  live(i, () => ns);
  return {
    t: tr(i, ns) as UseI18n<NS>["t"],
    T: (ns ? (Ts[ns] ||= (q, { slots }) => h(T as never, { ...q, ns }, slots)) : T) as BoundT<NS>,
    locale,
    dir,
    // Until the activation after mount, a namespace the loader will load is loading
    // already: no frame of its keys that says it is loaded (lot 1d).
    isLoading: computed(() => !!coming(i, s.value, ns || D)),
    setLocale: i.setLocale,
    i18n: i,
  };
};
