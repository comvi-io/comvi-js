// The whole router: three paths, the History API, and a listener. `pushState`
// changes the address without a reload, `popstate` brings Back and Forward,
// and the dev server (Vite's default `appType: "spa"`) answers `/features`
// and `/about` with index.html on a reload.
export type Route = "start" | "features" | "about";

const paths: Record<Route, string> = { start: "/", features: "/features", about: "/about" };

export function currentRoute(): Route {
  const route = (Object.keys(paths) as Route[]).find((key) => paths[key] === location.pathname);
  return route ?? "start";
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
export function link(
  route: Route,
  label: string,
  testId: string,
  className?: string,
): HTMLAnchorElement {
  const anchor = document.createElement("a");
  if (className) anchor.className = className;
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
