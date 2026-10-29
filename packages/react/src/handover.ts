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
import { view } from "@comvi/core/internal";
import { painted, provide, useCtx, type Ctx, type ProviderCatalogs } from "./binding";

// React 18 warns about useLayoutEffect in a server render; the server runs no effects.
const useCommit = typeof document < "u" ? useLayoutEffect : useEffect;

export interface I18nHandoverProps {
  /**
   * Catalogs to render with before the instance holds them (an SSR or RSC payload). They
   * are added to the instance at commit, once per object; a new literal with the same
   * messages on every parent render publishes nothing (the core compares values), but a
   * STABLE object skips that comparison.
   */
  catalogs?: ProviderCatalogs;
  /**
   * The locale to render in (a route parameter). The subtree renders in it at once and the
   * instance switches at commit; a later `setLocale()` wins until this prop changes. A
   * switch that fails (no catalog of the locale loads) gives the target up: the subtree
   * renders the instance's locale again.
   */
  locale?: string;
  children?: ReactNode;
}

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
      // Own keys only, as view() renders them: an inherited catalog is never committed.
      for (const n of Object.keys(catalogs!))
        for (const l of Object.keys(catalogs![n])) i.add(l, catalogs![n][l], n);
      done.current = [i, catalogs!];
    }
  }, [i, catalogs]);
  // The locale is committed when the instance or the target changes — never on a catalogs
  // refresh, which would undo a setLocale() made since. Runs after the catalogs effect, so
  // the switch finds the handed-over catalogs in place.
  useCommit(() => {
    if (target && target != i.locale)
      i.setLocale(target).catch(() =>
        // Reported through onError already (load_failed, invalid_locale): give the target
        // up, so the subtree renders the instance's locale instead of keys in the target.
        setH((h) => (h[0] == i && h[1] == target ? [i, target, target, h[3]] : h)),
      );
  }, [i, target]);
  return provide(v, children);
};
// The provider's first-paint gate (`loading`, `suspense`) never hides a handover child:
// the catalogs it carries reach the instance only when it commits.
painted.add(I18nHandover);
