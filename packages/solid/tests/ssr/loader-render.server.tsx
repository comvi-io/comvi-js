/** Server half: `generate: "ssr"` against solid's server build. */
import { renderToString } from "solid-js/web";
import { LoaderApp, type LoaderAppProps } from "./loader-app";

export function renderLoaderApp(props: LoaderAppProps): string {
  return renderToString(() => <LoaderApp {...props} />);
}
