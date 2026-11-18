import { describe, expectTypeOf, it } from "vitest";
import type { H3Event } from "h3";
import type { Loader, OnError, Plugin } from "@comvi/core";
import type { NuxtI18nOptions, I18nOptionsFactory, NuxtI18nFileOptions } from "../src/types";
import { defineI18nOptions } from "../src/runtime/i18n";
import type { useTranslation } from "../src/runtime/server/utils/useTranslation";

describe("nuxt.config's comvi: data only, written once", () => {
  it("requires the time zone", () => {
    // @ts-expect-error -- `timeZone` is required.
    const missing: NuxtI18nOptions = { locales: ["en"], defaultLocale: "en" };
    const ok: NuxtI18nOptions = {
      locales: ["en", { code: "uk", iso: "uk-UA" }],
      defaultLocale: "en",
      timeZone: "UTC",
      fallbackLocale: "en",
      namespaces: ["common"],
      messages: { en: { home: { title: "Hello" } } },
      formats: { number: { money: { style: "currency", currency: "EUR" } } },
    };
    void [missing, ok];
  });

  it("has none of 0.7's removed options", () => {
    const base = { locales: ["en"], defaultLocale: "en", timeZone: "UTC" };
    // @ts-expect-error -- `defaultParams` is gone: params go to `t()`.
    const a: NuxtI18nOptions = { ...base, defaultParams: { brand: "Comvi" } };
    // @ts-expect-error -- `setup` is gone: `plugins` / `onError` of the options file.
    const b: NuxtI18nOptions = { ...base, setup: "./comvi.setup.ts" };
    // @ts-expect-error -- `apiKey` is gone: a private route reads its own key.
    const c: NuxtI18nOptions = { ...base, apiKey: "k" };
    // @ts-expect-error -- `ns` is `namespaces`.
    const d: NuxtI18nOptions = { ...base, ns: ["admin"] };
    void [a, b, c, d];
  });
});

describe("comvi.i18n.ts: defineI18nOptions((event) => options)", () => {
  it("gets the request's event on a server, undefined in the browser, and returns functions", () => {
    const factory = defineI18nOptions((event) => {
      expectTypeOf(event).toEqualTypeOf<H3Event | undefined>();
      return { loader: async () => ({}), onError: () => {}, missing: (key) => key, plugins: [] };
    });
    expectTypeOf(factory).toEqualTypeOf<I18nOptionsFactory>();
    expectTypeOf<NuxtI18nFileOptions["loader"]>().toEqualTypeOf<Loader | undefined>();
    expectTypeOf<NuxtI18nFileOptions["onError"]>().toEqualTypeOf<OnError | undefined>();
    expectTypeOf<NuxtI18nFileOptions["plugins"]>().toEqualTypeOf<readonly Plugin[] | undefined>();
  });

  it("takes no data: the locale, catalogs and the zone are nuxt.config's", () => {
    // @ts-expect-error -- `locale` is the module's (the request's, the payload's).
    defineI18nOptions(() => ({ locale: "en" }));
    // @ts-expect-error -- catalogs are `comvi.messages` or the loader's.
    defineI18nOptions(() => ({ messages: { en: {} } }));
  });
});

describe("useTranslation(event)", () => {
  it("returns t, locale, dir and the instance", () => {
    type R = Awaited<ReturnType<typeof useTranslation>>;
    expectTypeOf<R["locale"]>().toEqualTypeOf<string>();
    expectTypeOf<R["dir"]>().toEqualTypeOf<"ltr" | "rtl">();
    expectTypeOf<keyof R>().toEqualTypeOf<"t" | "locale" | "dir" | "i18n">();
  });
});
