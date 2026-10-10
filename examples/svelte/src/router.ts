import { derived, writable } from "svelte/store";

// A history-based router in a few lines: the current path is a store, `link`
// turns a plain `<a href>` into a client-side navigation, and the browser's
// Back and Forward arrive as `popstate`. URLs stay real paths (`/about`, never
// `#/about`), and the dev and preview servers answer any path with index.html.
export const pathname = writable(location.pathname);

window.addEventListener("popstate", () => pathname.set(location.pathname));

// The app's three pages. Any other path shows the start page.
export type Route = "start" | "features" | "about";
export const route = derived(
  pathname,
  ($pathname): Route =>
    $pathname === "/features" ? "features" : $pathname === "/about" ? "about" : "start",
);

export function navigate(to: string): void {
  if (to === location.pathname) return;
  history.pushState(null, "", to);
  pathname.set(to);
}

// `use:link` on an anchor. A modified click (new tab, new window) keeps the
// browser's default; a plain left click navigates in place.
export function link(node: HTMLAnchorElement) {
  const onClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(node.pathname);
  };
  node.addEventListener("click", onClick);
  return { destroy: () => node.removeEventListener("click", onClick) };
}
