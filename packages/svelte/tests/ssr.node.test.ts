/**
 * `svelte/server`'s render(), no DOM. Synchronous: a route preloads with `i18n.load(ns)`, and
 * `useI18n` holds inline, per request (nothing unmounts on a server).
 */
import { render } from "svelte/server";
import { describe, expect, it, vi } from "vitest";
import { core } from "../../core/src/internal";
import { createI18n, handover, T, type Catalog, type I18nOptions } from "../src";
import ConsumerApp from "./fixtures/ConsumerApp.svelte";
import With from "./fixtures/With.svelte";

const strip = (s: string) => s.replace(/<!--.*?-->/g, "");
const catalogs: Record<string, Record<string, Catalog>> = {
  default: {
    en: { hi: "Hello", lines: "a<br/>b", lines2: "a<br></br>b" },
    de: { hi: "Hallo", lines: "a<br/>b", lines2: "a<br></br>b" },
  },
  shop: { en: { items: "{count} items" }, de: { items: "{count} Dinge" } },
};
const page = (o: Partial<I18nOptions> = {}, count?: number) => {
  const i18n = createI18n({ locale: "en", timeZone: "UTC", catalogs, ...o });
  return { i18n, html: strip(render(ConsumerApp, { props: { i18n, count } }).body) };
};

describe("server render", () => {
  it("renders t(), the bound <T> with a rest-spread param, and the state members", () => {
    const { html } = page({}, 3);
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain('<p id="bound">3 items</p>');
    expect(html).toContain("<span>en/ltr/true/false</span>");
  });

  it.each(["void", "void2"])("a void element is a real <br>, no children (%s)", (id) => {
    const warn = vi.spyOn(console, "warn");
    expect(page().html).toContain(`<p id="${id}">a<br>b</p>`);
    expect(warn).not.toHaveBeenCalled();
  });

  it("holds inline: the namespace is active for the request, so a load it starts reaches handover()", () => {
    const { i18n } = page();
    expect(core(i18n).k.shop).toBe(1);
    expect(handover(i18n).catalogs.shop!.en).toEqual(catalogs.shop!.en);
  });

  it("with no preload a held namespace renders its loading branch; a route's load() brings it", async () => {
    const load = async () => ({ items: "{count} late" });
    const a = createI18n({
      locale: "en",
      timeZone: "UTC",
      catalogs: { default: catalogs.default! },
      loader: load,
      onError() {},
    });
    const before = strip(render(ConsumerApp, { props: { i18n: a } }).body);
    expect(before).toContain("/false/true</span>");
    const b = createI18n({
      locale: "en",
      timeZone: "UTC",
      catalogs: { default: catalogs.default! },
      loader: load,
      onError() {},
    });
    await b.load("shop");
    expect(strip(render(ConsumerApp, { props: { i18n: b } }).body)).toContain(
      '<p id="bound">2 late</p>',
    );
  });

  it("two concurrent requests in different locales do not bleed (an instance per request)", () => {
    const [en, de] = [page(), page({ locale: "de" })];
    expect(en.html).toContain("Hello");
    expect(de.html).toContain("Hallo");
    expect(de.html).toContain("2 Dinge");
  });

  it("one instance in a second server render throws (development, R3-18(3))", () => {
    const { i18n } = page();
    expect(() => render(ConsumerApp, { props: { i18n } }).body).toThrow(/per request/);
  });

  it("<T> reads only, on the server too", () => {
    const i18n = createI18n({ locale: "en", timeZone: "UTC", catalogs, onError() {} });
    const html = strip(
      render(With, { props: { i18n, C: T, i18nKey: "items", ns: "shop", count: 1 } }).body,
    );
    expect(html).toBe("1 items");
    expect(core(i18n).k.shop ?? 0).toBe(0);
  });

  it("an object or an HTML string in a plain {x} is text on the server (04.11.2026)", () => {
    const i18n = createI18n({
      locale: "en",
      timeZone: "UTC",
      messages: { en: { m: "[{x}][{y}]" } },
    });
    const html = strip(
      render(With, {
        props: { i18n, C: T, i18nKey: "m", x: { t: "<img src=x>" }, y: "<img src=x>" },
      }).body,
    );
    expect(html).toBe("[[object Object]][&lt;img src=x>]");
  });

  it("handover() throws without a timeZone (development): server and browser must format dates in one zone", () => {
    const i18n = createI18n({ locale: "en" });
    expect(() => handover(i18n)).toThrow(/timeZone/);
  });
});
