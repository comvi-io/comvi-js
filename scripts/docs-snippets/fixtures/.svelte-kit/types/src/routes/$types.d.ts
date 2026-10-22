/**
 * Stand-in for SvelteKit's generated `./$types`.
 *
 * Reached through `rootDirs: ["src/routes", ".svelte-kit/types/src/routes"]`,
 * which is how SvelteKit itself wires it: a route file writes `from './$types'`
 * and TypeScript looks the name up in the parallel generated tree. The site
 * fences that import it (ssr.mdx, svelte.mdx) are all route files, so the
 * parallel tree is enough — no per-route codegen.
 */
export type LayoutServerLoad<Output = Record<string, any>> = (event: {
  params: Record<string, string>;
  url: URL;
  request: Request;
  locals: Record<string, any>;
  cookies: { get(name: string): string | undefined; set(name: string, value: string, opts?: any): void };
  fetch: typeof fetch;
  setHeaders(headers: Record<string, string>): void;
  depends(...deps: string[]): void;
}) => Output | Promise<Output>;

export type PageServerLoad<Output = Record<string, any>> = LayoutServerLoad<Output>;
export type LayoutLoad<Output = Record<string, any>> = LayoutServerLoad<Output>;
export type PageLoad<Output = Record<string, any>> = LayoutServerLoad<Output>;

export type LayoutData = Record<string, any>;
export type PageData = Record<string, any>;

export interface LayoutProps {
  data: LayoutData;
  children?: unknown;
  params: Record<string, string>;
}

export interface PageProps {
  data: PageData;
  form?: Record<string, any> | null;
  params: Record<string, string>;
}

export type Actions = Record<string, (event: any) => any>;
export type RequestHandler = (event: any) => Response | Promise<Response>;
