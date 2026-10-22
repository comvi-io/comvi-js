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

/**
 * `import.meta.env`, the way `vite/client` shapes it.
 *
 * The compiler options exclude every automatic types package except
 * `@types/node`, so `import.meta.env.DEV` has no declaration anywhere and every
 * fence reading it failed with TS2339. This is the vite/client shape, and it is
 * safe in a way an augmented `TranslationKeys` is not: nothing here can change
 * how another fence typechecks.
 *
 * `process` is NOT declared here. It was, and it had to go: `types: ["node"]`
 * brings @types/node's own `process` into the program, and two declarations of
 * one global name are TS2451 on every page. Node's globals come from Node's
 * types or not at all.
 */
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly [key: string]: any;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Framework modules a server-rendering fence imports, which the gate's install
 * does not carry: the SDK depends on `svelte` and `solid-js`, not on the
 * frameworks built on them. Each declaration is a hand-copied subset of
 * @sveltejs/kit 3, @solidjs/router 1.0 and @solidjs/start 2.1, enough to catch
 * a misspelled member or a wrong argument on the calls the fences make. It is
 * not the real package: `locals` and the handler context are loose, and a
 * fence's behaviour against the framework is verified by running it, not here.
 */
declare module "@sveltejs/kit" {
  export function error(status: number, message?: string): never;
}

declare module "@sveltejs/kit/hooks" {
  interface RequestEvent {
    params: Partial<Record<string, string>>;
    url: URL;
    request: Request;
    locals: Record<string, any>;
  }
  interface ResolveOptions {
    transformPageChunk?: (input: {
      html: string;
      done: boolean;
    }) => string | undefined | Promise<string | undefined>;
  }
  export type Handle = (input: {
    event: RequestEvent;
    resolve: (event: RequestEvent, opts?: ResolveOptions) => Promise<Response>;
  }) => Response | Promise<Response>;
}

declare module "@solidjs/router" {
  import type { Component } from "solid-js";
  export type Params = Record<string, string | undefined>;
  export const useParams: <T extends Params>() => T;
  export type MatchFilter = readonly string[] | RegExp | ((s: string) => boolean);
  export type RouteDefinition = {
    path?: string | string[];
    matchFilters?: Record<string, MatchFilter>;
    preload?: (args: any) => unknown;
    children?: RouteDefinition | RouteDefinition[];
    component?: Component<any>;
    info?: Record<string, any>;
  };
}

declare module "@solidjs/start/server" {
  import type { Component, JSX } from "solid-js";
  export type DocumentComponentProps = {
    assets?: JSX.Element;
    scripts: JSX.Element;
    children?: JSX.Element;
  };
  export function StartServer(props: { document: Component<DocumentComponentProps> }): JSX.Element;
  export function createHandler(fn: (context: any) => JSX.Element, options?: unknown): unknown;
}
