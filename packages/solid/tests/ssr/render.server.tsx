/** Server half: `generate: "ssr"` against solid's server build. */
import { renderToString } from "solid-js/web";
import { App, type AppProps } from "./app";

export function renderApp(props: AppProps): string {
  return renderToString(() => <App {...props} />);
}
