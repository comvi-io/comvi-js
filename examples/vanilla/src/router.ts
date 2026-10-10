// The whole router: two paths, the History API, and a listener. `pushState`
// changes the address without a reload, `popstate` brings Back and Forward,
// and the dev server (Vite's default `appType: "spa"`) answers `/about` with
// index.html on a reload.
export type Route = "home" | "about";

const paths: Record<Route, string> = { home: "/", about: "/about" };

export function currentRoute(): Route {
  return location.pathname === paths.about ? "about" : "home";
}

const listeners = new Set<(route: Route) => void>();

export function onRouteChange(listener: (route: Route) => void): void {
  listeners.add(listener);
}

function notify(): void {
  const route = currentRoute();
  for (const listener of listeners) listener(route);
}

window.addEventListener("popstate", notify);

export function navigate(route: Route): void {
  if (currentRoute() === route) return;
  history.pushState(null, "", paths[route]);
  notify();
}

/** A real `<a href>` that navigates without a reload; a modified click still opens a tab. */
export function link(route: Route, label: string, testId: string): HTMLAnchorElement {
  const anchor = document.createElement("a");
  anchor.href = paths[route];
  anchor.textContent = label;
  anchor.dataset.testid = testId;
  anchor.addEventListener("click", (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    navigate(route);
  });
  return anchor;
}
