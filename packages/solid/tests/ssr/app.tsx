/** The components of the SSR tests, compiled once per side (vitest.config.ts). */
import { Show, Suspense, type JSX } from "solid-js";
import { I18nProvider, T, useI18n, type I18n } from "../../src";
import { useFormat } from "../../src/format";

export const Account = () => {
  const { t, isReady, isLoading } = useI18n("account");
  return <p>{isReady() ? (t("title") as string) : isLoading() ? "loading" : "unavailable"}</p>;
};

/** `useI18n()`: its flags read the configured namespaces (owner brief 2026-11-10). */
export const Global = () => {
  const { t, isReady, isLoading } = useI18n();
  return <p>{isReady() ? (t("hi") as string) : isLoading() ? "loading" : "unavailable"}</p>;
};

/** A component with keys after its useI18n: a server-only id would shift them. */
export const Keyed = () => {
  const { t } = useI18n("account");
  const { t: d, locale } = useI18n();
  return (
    <main lang={locale()}>
      <h1>{d("hi", { name: "Ann" }) as string}</h1>
      <Show when={true}>
        <h2>{t("title") as string}</h2>
      </Show>
      <p>
        <T i18nKey="terms" components={{ link: { component: "a", props: { href: "/t" } } }} />
      </p>
      <p>
        <T i18nKey="lines" components={{ br: "br" }} />
      </p>
    </main>
  );
};

export const Ago = () => <p>{useFormat().relative(880_000)}</p>;

export const Price = () => <p>{useFormat().number(1234.5)}</p>;

export const Lines = (p: { k: string }) => <T i18nKey={p.k} components={{ br: "br" }} />;

export const Empty = () => (
  <T i18nKey="m" components={{ p: (q: { children?: JSX.Element }) => <i>{q.children}</i> }} />
);

/** A parameter in `<T>` right under the provider, with no element around it. */
export const Bare = (p: { name: string }) => <T i18nKey="hi" name={p.name} />;

/**
 * Objects in a plain `{x}` (04.11.2026: always text). `{ t }` is the shape of a Solid server
 * template, which the server inserts as raw HTML; a JSX element is that shape on the server and
 * a DOM element in the browser.
 */
export const FORGED = { t: '<img src="x">' };
export const Forged = () => (
  <p>
    <T i18nKey="hi" {...{ name: FORGED }} />|
    {useI18n().t("hi", { name: FORGED } as never) as string}
  </p>
);
export const Node = () => (
  <p>
    <T i18nKey="hi" {...({ name: <b>x</b> } as object)} />|
    {useI18n().t("hi", { name: <b>x</b> } as never) as string}
  </p>
);

export const Provide = (p: { i18n: I18n; children: JSX.Element }) => (
  <I18nProvider i18n={p.i18n}>{p.children}</I18nProvider>
);

/** The app shape of a Solid server render: a Suspense boundary above the provider. */
export const Page = (p: { i18n: I18n; children: JSX.Element }) => (
  <Suspense fallback="waiting">
    <I18nProvider i18n={p.i18n}>{p.children}</I18nProvider>
  </Suspense>
);
