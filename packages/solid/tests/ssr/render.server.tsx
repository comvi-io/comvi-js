/** Server half: `generate: "ssr"` against Solid's server build. */
import { renderToString, renderToStringAsync } from "solid-js/web";
import type { JSX } from "solid-js";
import { I18nProvider, type I18n } from "../../src";
import {
  Account,
  Ago,
  Bare,
  Empty,
  Forged,
  Global,
  Keyed,
  Lines,
  Node,
  Page,
  Price,
  Provide,
} from "./app";

const views: Record<string, (q: Record<string, string>) => JSX.Element> = {
  account: () => <Account />,
  ago: () => <Ago />,
  bare: (q) => <Bare name={q.name!} />,
  empty: () => <Empty />,
  forged: () => <Forged />,
  global: () => <Global />,
  keyed: () => <Keyed />,
  lines: (q) => <Lines k={q.k!} />,
  node: () => <Node />,
  price: () => <Price />,
};

/** `renderToString` under a provider: nothing waits. */
export const sync = (i18n: I18n, view: string, q: Record<string, string> = {}) =>
  renderToString(() => <Provide i18n={i18n}>{views[view]!(q)}</Provide>);

/** `renderToString` with `loading` set: a server is never gated. */
export const syncGated = (i18n: I18n) =>
  renderToString(() => (
    <I18nProvider i18n={i18n} loading="gate">
      <Account />
    </I18nProvider>
  ));

/** The sync render with a Suspense boundary. */
export const syncPage = (i18n: I18n, view: string) =>
  renderToString(() => <Page i18n={i18n}>{views[view]!({})}</Page>);

/** `renderToStringAsync` under a Suspense boundary: what a server render awaits. */
export const page = (i18n: I18n, view: string) =>
  renderToStringAsync(() => <Page i18n={i18n}>{views[view]!({})}</Page>, {
    noScripts: true,
  } as never);

/** `renderToStringAsync` with no boundary. */
export const noBoundary = (i18n: I18n, view: string) =>
  renderToStringAsync(() => <Provide i18n={i18n}>{views[view]!({})}</Provide>, {
    noScripts: true,
  } as never);
