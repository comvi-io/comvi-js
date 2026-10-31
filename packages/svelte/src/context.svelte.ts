/**
 * One reactive cell per instance (design §3.6, R4-18): its published state in a `$state.raw`,
 * fed by `i.on`. Every reader (`t`, `locale`, `<T>`, a formatter) reads the cell, so a new
 * snapshot re-runs what read it, in a template or a `$derived`. No `<T>` in this module's
 * graph: `@comvi/svelte/format` reaches the instance through it alone.
 */
import { BROWSER, DEV } from "esm-env";
import { getContext, setContext } from "svelte";
import type { I18n } from "@comvi/core";
import { core, type State } from "@comvi/core/internal";

/** The instance and its published state, read reactively. */
export interface Cell {
  readonly i: I18n;
  readonly s: State;
}

const K = Symbol();
const cells = new WeakMap<I18n, Cell>();
/** Instances set in a server render (development check, one per request). */
const served = new WeakSet<I18n>();

/**
 * Makes `i18n` the instance of this component and everything below it (the root component:
 * `App.svelte`, `+layout.svelte`). Nothing waits here: `await i18n.ready` before `mount()`, or
 * read `isReady` / `isLoading`. On a server, an instance per request.
 */
export const setI18n = (i18n: I18n): void => {
  // A server serves requests concurrently: one instance in two renders would render one
  // request in the locale another request switched to (R3-18(3)).
  if (DEV && !BROWSER) {
    if (served.has(i18n))
      throw Error(
        "[@comvi/svelte] an instance is set in a second server render: create the i18n instance per request",
      );
    served.add(i18n);
  }
  let c = cells.get(i18n);
  if (!c) {
    const x = core(i18n);
    let s = $state.raw(x.s());
    i18n.on(() => (s = x.s()));
    cells.set(
      i18n,
      (c = {
        i: i18n,
        get s() {
          return s;
        },
      }),
    );
  }
  setContext(K, c);
};

/** The cell of the nearest `setI18n`. Callable while a component initialises. */
export const use = (): Cell => {
  const c = getContext<Cell>(K);
  if (DEV && !c) throw Error("[@comvi/svelte] no setI18n(i18n) above this component");
  return c;
};
