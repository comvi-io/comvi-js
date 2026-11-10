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
import type { Catalog } from "@comvi/core";
import { provide, useCtx, type Ctx } from "./binding";

declare const __DEV__: boolean;

// React 18 warns about useLayoutEffect in a server render; the server runs no effects.
const useCommit = typeof document < "u" ? useLayoutEffect : useEffect;

/**
 * Catalogs by namespace, then locale, as a server payload carries them (`handover()` of
 * `@comvi/core/ssr`): `null` is a load that failed on the server.
 */
export type HandoverCatalogs = Readonly<Record<string, Readonly<Record<string, Catalog | null>>>>;

export interface I18nHandoverProps {
  /**
   * Catalogs to render with before the instance holds them (an SSR or RSC payload). They
   * are added to the instance at commit, once per object; a new literal with the same
   * messages on every parent render publishes nothing (the core compares values), but a
   * STABLE object skips that comparison. A `null` slot means what it means in
   * `createI18n({ catalogs })`: the load failed on the server — the subtree renders without
   * it (the fallback the server rendered), and at commit the instance drops a catalog it held
   * for it and does not ask for it until `i18n.load(ns)` or a switch to its locale.
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
  const [given, setH] = useState(() => [i, target, base.locale, base.lrev] as const);
  let h = given;
  if (h[0] != i || h[1] != target) setH((h = [i, target, base.locale, base.lrev]));
  const loc = target && target != h[2] && h[3] == base.lrev ? target : base.locale;
  /** The [instance, catalogs] pair published last (written at commit only). */
  const done = useRef<readonly [I18n, HandoverCatalogs]>(undefined);
  const fresh = (d = done.current) => catalogs && !(d && d[0] == i && d[1] == catalogs);
  /** What this handover committed before for this instance: its slots are replaced, not layered. */
  const prev = (d = done.current) => (d && d[0] == i ? d[1] : undefined);
  const v = useMemo(
    (): Ctx => [i, view(i, base, fresh() ? catalogs! : {}, loc, prev())],
    [i, base, catalogs, loc],
  );
  useCommit(() => {
    if (fresh()) {
      const p = prev();
      // Own keys only, as view() renders them: an inherited catalog is never committed. A slot
      // this handover handed before BECOMES the new catalog (a repeated server payload: a key
      // the server no longer has is gone); a `null` fails the pair; a slot handed for the first
      // time is layered over the instance's (`add()`).
      for (const n of Object.keys(catalogs!))
        for (const l of Object.keys(catalogs![n])) {
          const m = catalogs![n][l];
          if (m && !(p && Object.hasOwn(p, n) && Object.hasOwn(p[n], l))) i.add(l, m, n);
          else core(i).f(l, n, m);
        }
      done.current = [i, catalogs!];
    }
  }, [i, catalogs]);
  // The locale is committed when the instance or the target changes — never on a catalogs
  // refresh, which would undo a setLocale() made since. Runs after the catalogs effect, so
  // the switch finds the handed-over catalogs in place.
  useCommit(() => {
    // The core's switch of a handover: the failures the payload brought stay failed (a
    // `null` is a known result), where `setLocale()` would ask for them again.
    if (target && target != i.locale)
      core(i)
        .L(target)
        .catch(() =>
          // Reported through onError already (load_failed; the render refused an invalid tag):
          // give the target up, so the subtree renders the instance's locale instead of keys in
          // the target.
          setH((h) => (h[0] == i && h[1] == target ? [i, target, target, h[3]] : h)),
        );
  }, [i, target]);
  return provide(v, children);
};
