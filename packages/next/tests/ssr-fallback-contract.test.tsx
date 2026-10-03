/**
 * `@comvi/next` against the shared server fallback-chain contract
 * (`@comvi/test-utils/ssrFallbackContract`). Every row runs through one
 * fixture: per request, `setRequestLocale` + `getI18n()` with no prior
 * `loadTranslations()`, then `loadTranslations()` for the client `messages`,
 * then `<I18nProvider messages>` through `renderToString` and `hydrateRoot`.
 * Next-only assertions follow the table.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act } from "@testing-library/react";
import {
  SSR_FALLBACK_CASES,
  SSR_FALLBACK_CATALOGS,
  SSR_FALLBACK_DEFAULT_NS,
  SSR_FALLBACK_LOCALES,
  type SsrFallbackCase,
} from "@comvi/test-utils/ssrFallbackContract";

import { createI18n, T } from "@comvi/react";
import { I18nProvider } from "../src/client/I18nProvider";
import { createNextI18n } from "../src/createNextI18n";
import { _resetServerI18n, setI18n } from "../src/server/cache";
import { getI18n } from "../src/server/getI18n";
import { loadTranslations } from "../src/server/loadTranslations";
import { setRequestLocale } from "../src/server/setRequestLocale";
import { spyOnConsoleError } from "./helpers/consoleWarnings";

// React's `cache()` is per Server Component render. Outside one, each
// `requests.run(...)` stands in for a render, so concurrent requests get their
// own request stores exactly as they do under Next.
const requests = new AsyncLocalStorage<Map<unknown, unknown>>();
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: () => T) => {
    return () => {
      const store = requests.getStore();
      if (!store) throw new Error("test: no request store");
      if (!store.has(fn)) store.set(fn, fn());
      return store.get(fn) as T;
    };
  },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

type Messages = Awaited<ReturnType<typeof loadTranslations>>;
type Translate = (key: string, params?: Record<string, unknown>) => string;

const createServerHost = (row: SsrFallbackCase) => {
  const { i18n } = createNextI18n({
    locales: [...SSR_FALLBACK_LOCALES],
    defaultLocale: row.defaultLocale,
    fallbackLocale: [row.fallbackLocale].flat(),
    defaultNs: SSR_FALLBACK_DEFAULT_NS,
    devMode: false,
  });
  const failing = new Set(row.failing);
  const loader = vi.fn(async (locale: string, ns: string) => {
    if (failing.has(`${locale}:${ns}`)) throw new Error(`offline ${locale}:${ns}`);
    return SSR_FALLBACK_CATALOGS[`${locale}:${ns}`] ?? {};
  });
  i18n.registerLoader(loader);
  if (row.cached) i18n.addTranslations(row.cached as Record<string, Record<string, string>>);
  const loadErrors = new Set<string>();
  i18n.onLoadError((locale, ns) => loadErrors.add(`${locale}:${ns}`));
  setI18n(i18n);
  return { loader, loadErrors };
};

// The client host shares the server's `fallbackLocale`, as the documented setup
// (one `createNextI18n` instance on both sides) does. No loader: it renders
// from `messages` alone.
const createClientHost = (row: SsrFallbackCase) =>
  createI18n({
    locale: "en",
    fallbackLocale: [row.fallbackLocale].flat(),
    defaultNs: SSR_FALLBACK_DEFAULT_NS,
    devMode: false,
  });

const Tree = (props: {
  i18n: ReturnType<typeof createClientHost>;
  locale: string;
  messages: Messages;
  keys: readonly string[];
  ns: string;
}) => (
  <I18nProvider i18n={props.i18n} locale={props.locale} messages={props.messages} autoInit={false}>
    {props.keys.map((key) => (
      <span key={key} data-key={key}>
        <T i18nKey={key as never} ns={props.ns} />
      </span>
    ))}
  </I18nProvider>
);

const rendered = (container: HTMLElement, keys: readonly string[]) =>
  Object.fromEntries(
    keys.map((key) => [key, container.querySelector(`[data-key="${key}"]`)?.textContent]),
  );

describe("@comvi/next: the server fallback-chain contract", () => {
  afterEach(() => {
    _resetServerI18n();
    document.body.innerHTML = "";
  });

  it.each(SSR_FALLBACK_CASES.map((row) => [row.name, row] as const))("%s", async (_name, row) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = spyOnConsoleError();
    const ns = row.ns ?? SSR_FALLBACK_DEFAULT_NS;
    const { loader, loadErrors } = createServerHost(row);

    // Server: every request in its own request scope, concurrently.
    const served = await Promise.all(
      row.requests.map((request) =>
        requests.run(new Map(), async () => {
          setRequestLocale(request.locale);
          const { t, locale } = await getI18n(ns === SSR_FALLBACK_DEFAULT_NS ? undefined : { ns });
          const texts = Object.fromEntries(
            Object.keys(request.expect).map((key) => [key, (t as Translate)(key)]),
          );
          const messages = await loadTranslations(request.locale, { namespaces: [ns] });
          return { locale, texts, messages };
        }),
      ),
    );

    row.requests.forEach((request, index) => {
      expect(served[index].locale).toBe(request.locale);
      expect(served[index].texts).toEqual(request.expect);
      expect(Object.keys(served[index].messages)).toEqual(request.clientCatalogs);
    });

    const fetched = loader.mock.calls.map(([locale, namespace]) => `${locale}:${namespace}`);
    expect(fetched).toEqual(expect.arrayContaining([...(row.fetched ?? [])]));
    for (const pair of row.notFetched ?? []) expect(fetched).not.toContain(pair);
    expect([...loadErrors].sort()).toEqual([...row.loadErrors].sort());

    // Client: SSR markup, then hydration from the same messages.
    for (const [index, request] of row.requests.entries()) {
      const keys = Object.keys(request.expect);
      const props = { locale: request.locale, messages: served[index].messages, keys, ns };
      const container = document.createElement("div");
      container.innerHTML = renderToString(<Tree i18n={createClientHost(row)} {...props} />);
      document.body.appendChild(container);
      expect(rendered(container, keys)).toEqual(request.expect);

      const client = createClientHost(row);
      let root!: ReturnType<typeof hydrateRoot>;
      await act(async () => {
        root = hydrateRoot(container, <Tree i18n={client} {...props} />);
      });
      expect(rendered(container, keys)).toEqual(request.expect);

      if (index === 0 && row.navigation) {
        const { navigation } = row;
        const navKeys = Object.keys(navigation.expect);
        const messages = await loadTranslations(navigation.locale, { namespaces: [ns] });
        expect(Object.keys(messages)).toEqual(navigation.clientCatalogs);
        await act(async () => {
          root.render(
            <Tree
              i18n={client}
              locale={navigation.locale}
              messages={messages}
              keys={navKeys}
              ns={ns}
            />,
          );
        });
        expect(rendered(container, navKeys)).toEqual(navigation.expect);
      }
      act(() => root.unmount());
    }

    // A hydration mismatch would surface here.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("concurrent loads of one pair on the shared host → one fetch", async () => {
    const [row] = SSR_FALLBACK_CASES;
    const { loader } = createServerHost(row);

    await Promise.all([loadTranslations("fr"), loadTranslations("fr"), getI18n({ locale: "fr" })]);

    const fetched = loader.mock.calls.map(([locale, ns]) => `${locale}:${ns}`);
    expect(fetched.filter((pair) => pair === "fr:common")).toHaveLength(1);
    expect(fetched.filter((pair) => pair === "de:common")).toHaveLength(1);
  });
});
