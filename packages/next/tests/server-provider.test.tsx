// @vitest-environment node
/**
 * The SERVER `<I18nProvider i18n routing>` of `@comvi/next/server` (lot 6a, D2/D3): it hands
 * the client provider the existing `handover()` and a DEFINED set of serializable settings
 * from the request's instance — `fallbackLocale`, `formats` — and nothing else: no loader,
 * no callback, no credential, no other option. The client provider can be replaced by an app's
 * own client component (the place for a client loader).
 */
import { isValidElement, type ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { createI18n } from "@comvi/core";
import { handover } from "@comvi/core/ssr";
import { useI18n } from "@comvi/react";
import { renderToString } from "react-dom/server";
import { I18nProvider } from "../src/server";
import { I18nProvider as ClientProvider } from "../src/client";

const routing = { locales: ["en", "uk"], defaultLocale: "en" };
const instance = () =>
  createI18n({
    locale: "uk",
    fallbackLocale: ["en"],
    timeZone: "UTC",
    formats: { number: { price: { style: "currency", currency: "EUR" } } },
    namespaces: ["default"],
    catalogs: { default: { uk: { hi: "Привіт" }, en: { hi: "Hi" } } },
    loader: async () => ({ secret: "server only" }),
    onError: () => {},
    missing: (k) => k,
    now: 5,
  });

const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("server <I18nProvider i18n routing>", () => {
  it("renders the client provider with handover() and the defined settings only", () => {
    const i18n = instance();
    const el = I18nProvider({ i18n, routing, children: "x" }) as ReactElement<
      Record<string, unknown>
    >;
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(ClientProvider);
    expect(el.props.payload).toEqual(handover(i18n));
    expect(el.props.options).toEqual({
      fallbackLocale: ["en"],
      formats: { number: { price: { style: "currency", currency: "EUR" } } },
    });
    expect(el.props.routing).toBe(routing);
    expect(el.props.children).toBe("x");
    // Everything it hands over is data: it survives a JSON round trip unchanged.
    expect(json(el.props.options)).toEqual(el.props.options);
    expect(json(el.props.payload)).toEqual(el.props.payload);
  });

  it("an instance without the settings hands over an empty set", () => {
    const i18n = createI18n({ locale: "en", timeZone: "UTC" });
    const el = I18nProvider({ i18n, children: null }) as ReactElement<Record<string, unknown>>;
    expect(el.props.options).toEqual({});
    expect("routing" in el.props && el.props.routing !== undefined).toBe(false);
  });

  it("an app's own client provider receives the same props", () => {
    const Mine = () => null;
    const i18n = instance();
    const el = I18nProvider({ i18n, routing, client: Mine, children: "x" }) as ReactElement<
      Record<string, unknown>
    >;
    expect(el.type).toBe(Mine);
    expect(Object.keys(el.props).sort()).toEqual(["children", "options", "payload", "routing"]);
  });
});

describe("explicit params (defaultParams removed, owner decision 2026-11-11)", () => {
  it("Server and Client Components render the same text with the params each call passes", () => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      catalogs: { default: { en: { hi: "Welcome to {brand}" } } },
    });
    const Client = () => <p>{useI18n().t("hi", { brand: "Comvi" }) as string}</p>;
    const el = I18nProvider({ i18n, children: <Client /> }) as ReactElement<
      Record<string, unknown>
    >;
    expect(el.props.options).toEqual({});
    expect(renderToString(el)).toBe(`<p>${i18n.t("hi", { brand: "Comvi" })}</p>`);
  });
});
