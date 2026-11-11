/**
 * `<I18nHandover catalogs locale>` (design §2.5; synthesis R4-15, R4-16; lot-0 spike S9,
 * the commit model). It renders its subtree from a RENDER-LOCAL state,
 * `view(published, catalogs, locale)`: catalogs handed over as a prop (an SSR or RSC
 * payload) and a target locale render at once, and are PUBLISHED (`add()`, `setLocale()`)
 * only at commit, so a render React abandons, suspends or runs on the server publishes
 * nothing (S9: H5, R2, R5).
 *
 * Its own module, built into its own chunk (vite.entries.ts): an app without a server
 * payload carries none of it, not even its React imports (the R3-10 binding cap).
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import type { I18n } from "@comvi/core";
import { canonicalize, core, view } from "@comvi/core/internal";
import type { CatalogInput } from "@comvi/core";
import { provide, useCtx, type Ctx } from "./binding";

declare const __DEV__: boolean;

// React 18 warns about useLayoutEffect in a server render; the server runs no effects.
const useCommit = typeof document < "u" ? useLayoutEffect : useEffect;

/**
 * Catalogs by namespace, then locale, as a server payload carries them (`handover()` of
 * `@comvi/core/ssr`, flat) or as an app writes them (flat or nested, as `createI18n({ catalogs })`
 * takes them): `null` is a load that failed on the server. Plain data objects, read by their OWN
 * keys; what inherited properties do is not defined.
 */
export type HandoverCatalogs = Readonly<
  Record<string, Readonly<Record<string, CatalogInput | null>>>
>;

/** The handover's target as given (see `I18nHandover`). */
type Given = readonly [I18n, string | undefined, string, number, HandoverCatalogs | undefined | 0];

export interface I18nHandoverProps {
  /**
   * Catalogs to render with before the instance holds them (an SSR or RSC payload). Each slot
   * FULLY REPLACES the instance's slot, the first time and every later time: a key it lacks is
   * gone, `{}` is an empty catalog; a slot it omits is not changed; with two handovers on one
   * instance the last payload applied wins per slot. `add()` stays a patch. Committed once per
   * object; a new literal with the same messages on every parent render publishes nothing (the
   * core compares values), but a STABLE object skips that comparison. A new object is a new
   * payload: an inline literal with a `null` fails that pair again on every parent render (and
   * aborts an explicit retry in flight), so pass a stable object. A `null` slot means what it means in
   * `createI18n({ catalogs })`: the load failed on the server — the subtree renders without
   * it (the fallback the server rendered), and at commit the instance drops a catalog it held
   * for it and does not ask for it until `i18n.load(ns)` or a switch to its locale. A render
   * with that payload knows the load failed: translation, `isReady` and `isLoading` read the pair
   * as failed, as the server did (a hydration takes the server's branch) — no load predicted, a
   * client load of it already in flight not shown (the commit aborts it), and the same in a
   * nested handover whose payload does not mention the pair. An explicit retry shows its flight.
   */
  catalogs?: HandoverCatalogs;
  /**
   * The locale to render in (a route parameter, matched against the supported locales first).
   * The subtree renders in it at once and the instance switches at commit; a later
   * `setLocale()` wins until this prop changes. A switch that fails (no catalog of the locale
   * loads) gives the target up: the subtree renders the instance's locale again. One that is
   * not a tag (`""`, `"!!"`) is a configuration error: the render throws a `RangeError` before
   * the children render, and nothing reaches the instance. Absent: no target.
   */
  locale?: string;
  /**
   * A server payload's `defaultParams`, part of the same snapshot as `catalogs`.
   * - Not passed: the handover never changes the instance's `defaultParams`.
   * - Passed: the object REPLACES the instance's whole set (`setDefaultParams()`); `{}` clears
   *   it. The subtree renders with it at once and the instance takes it at commit, no remount.
   * - The same object again (a rerender with the same payload) does nothing, so changes the
   *   client made since stay. A new object is a new payload: it overwrites the client's changes,
   *   even with the values of the earlier one; one with the same own keys and values
   *   (`Object.is`) as the instance's current set publishes nothing, so an inline literal of
   *   strings, numbers, booleans or `null` is fine. A value created anew on every render (an
   *   inline handler, object, array or `Date`) differs on every render and is applied each time;
   *   in a component that itself reads `useI18n()` that loops (React: "Maximum update depth
   *   exceeded"), so define such a value once, outside the render or memoized.
   * Explicit `t()` params still win. Own keys only: inherited properties are not read; an own key
   * named `__proto__` is a param like any other.
   */
  defaultParams?: Readonly<Record<string, unknown>>;
  children?: ReactNode;
}

type Values = Readonly<Record<string, unknown>>;

const has = Object.prototype.hasOwnProperty;
/** Whether two sets of `defaultParams` hold the same own keys with the same values. */
const same = (a: Values | null | undefined, b: Values | null | undefined): boolean => {
  const k = Object.keys(a || {});
  return (
    k.length == Object.keys(b || {}).length &&
    k.every((x) => !!b && has.call(b, x) && Object.is(a![x], b[x]))
  );
};

/**
 * Renders its subtree with `catalogs` and in `locale` before the instance has them, and
 * hands both to the instance at commit (inside an `<I18nProvider>`).
 *
 * Order: data → gate → content. The first paint's payload goes to `createI18n({ ...options,
 * ...payload })`, before an `<I18nProvider loading | suspense>` decides its gate; the provider
 * does not look for a handover inside the subtree it gates, which renders only when the gate
 * opens on a client render. A hydration is never gated: there it works at any depth.
 */
export const I18nHandover = ({
  catalogs,
  locale: target,
  defaultParams,
  children,
}: I18nHandoverProps): ReactElement => {
  if (target !== undefined && !canonicalize(target))
    throw RangeError(__DEV__ ? `[@comvi/react] invalid locale "${target}"` : target);
  const [i, base] = useCtx();
  // Locale handover as DERIVED state, never a render-time write: render the target while
  // the published locale has not moved since the prop was given (`lrev`), then follow it.
  // [instance, target, locale and `lrev` when the target was given, the payload a failed switch
  // gave the target up for (0: none)].
  const [given, setH] = useState<Given>(() => [i, target, base.locale, base.lrev, 0]);
  let h = given;
  if (h[0] != i || h[1] != target) setH((h = [i, target, base.locale, base.lrev, 0]));
  // The target is pursued until the published locale moves (it lands, or an explicit
  // `setLocale()` wins); a failed switch gives it up for the payload it was decided on only.
  const go = target && target != h[2] && h[3] == base.lrev;
  const loc = go && h[4] !== catalogs ? target : base.locale;
  /** The [instance, catalogs] pair published last (written at commit only). */
  const done = useRef<readonly [I18n, HandoverCatalogs]>(undefined);
  const fresh = (d = done.current) => catalogs && !(d && d[0] == i && d[1] == catalogs);
  /** The [instance, set object] of `defaultParams` committed last (written at commit only). */
  const sent = useRef<readonly [I18n, Values]>(undefined);
  // Pending: a set object not committed before (the same object is the same payload: a no-op,
  // so changes the client made since stay) whose own keys or values differ from the instance's
  // current set; rendered at once. A new object equal to the current set publishes nothing.
  const dp =
    defaultParams &&
    !(sent.current && sent.current[0] == i && sent.current[1] == defaultParams) &&
    !same(defaultParams, base.dp)
      ? defaultParams
      : undefined;
  const v = useMemo(
    (): Ctx => [i, view(i, base, fresh() ? catalogs! : {}, loc, dp)],
    [i, base, catalogs, loc, dp],
  );
  useCommit(() => {
    if (dp) i.setDefaultParams(dp);
    if (defaultParams) sent.current = [i, defaultParams];
  });
  useCommit(() => {
    if (fresh()) {
      // Own keys only, as view() renders them: an inherited catalog is never committed. Each
      // slot fully replaces the instance's (a key the server no longer has is gone, `{}` is
      // empty, `null` fails the pair); a slot the payload omits is not changed.
      for (const n of Object.keys(catalogs!))
        for (const l of Object.keys(catalogs![n])) core(i).f(l, n, catalogs![n][l]);
      done.current = [i, catalogs!];
    }
  }, [i, catalogs]);
  // The locale is decided when the instance, the target or the payload changes, by the CURRENT
  // payload — while the target is still pursued: a new payload never undoes a setLocale() made
  // since. Runs after the catalogs effect, so the switch finds the handed-over catalogs in place.
  useCommit(() => {
    // The core's switch of a handover: a pair the current payload carries as `null` is the
    // server's result (not asked for again, no reason to stay), where `setLocale()` retries it.
    if (go && target != i.locale)
      core(i)
        .L(target, catalogs)
        .catch(() =>
          // Reported through onError already (load_failed; the render refused an invalid tag):
          // give the target up for this payload, so the subtree renders the instance's locale
          // instead of keys in the target.
          setH((h) => (h[0] == i && h[1] == target ? [i, target, h[2], h[3], catalogs] : h)),
        );
  }, [i, target, catalogs]);
  return provide(v, children);
};
