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
   * object. The object IS the server's snapshot: a re-render passes the same object, a new server
   * result comes as a new object (even with the same content), and a new object is applied again.
   * Hold it once — module scope, `useState(() => …)`, or a prop from the server (as
   * `@comvi/next/client` passes it) — never an inline literal: re-created on every render under a
   * parent that reads `useI18n()`, a `null` slot fails its pair again and aborts an explicit
   * retry, and a catalog replaces an `add()` patch to its slot. Sibling handovers on one instance: a `null` one hands is marked in its own
   * subtree only until its commit, so create the instance from the first paint's payload (as
   * `@comvi/next/client` does) for every subtree to take the server's branch at hydration. A `null` slot means what it means in
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
  children?: ReactNode;
}

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
  const v = useMemo(
    (): Ctx => [i, view(i, base, fresh() ? catalogs! : {}, loc)],
    [i, base, catalogs, loc],
  );
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
