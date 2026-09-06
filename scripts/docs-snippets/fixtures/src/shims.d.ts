/**
 * Ambient shims for the imports a docs project makes across a language boundary.
 *
 * A `.tsx` fence that renders `<App />` from `./App.vue` is checked by tsc, which
 * cannot parse an SFC; without these the fence fails with TS2307 on a line whose
 * only sin is being in the other half of the example. vue-tsc / svelte-check see
 * the real components (sfc-check.mjs), so nothing is lost — this file only stops
 * the TS pass from reporting a boundary it structurally cannot cross.
 */
declare module "*.vue" {
  const component: any;
  export default component;
}

declare module "*.svelte" {
  const component: any;
  export default component;
}

declare module "*.css";
