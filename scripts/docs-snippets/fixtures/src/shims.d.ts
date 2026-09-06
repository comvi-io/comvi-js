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

/**
 * `server-only` is a real npm package in a Next app and a marker, not an API —
 * it exists to make a build fail when a module reaches the client. Three README
 * fences import it. Declaring it here models the reader's project without
 * putting a dependency in the gate's own install.
 */
declare module "server-only";
declare module "client-only";
