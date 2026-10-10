import { describe, it, expect } from "vitest";
import { transformApiResponse } from "../src/api";
import type { ExportApiResponse } from "../src/api";

const INVALID_SHAPE =
  '[@comvi/plugin-fetch-loader] Invalid API response: "namespaces" must be an object';

describe("transformApiResponse()", () => {
  it("keys every namespace/locale pair as locale:namespace", () => {
    const response: ExportApiResponse = {
      locales: ["en", "fr"],
      namespaces: {
        default: { en: { hello: "Hello" }, fr: { hello: "Bonjour" } },
        dashboard: { en: { title: "Dashboard" } },
      },
    };

    expect(transformApiResponse(response)).toEqual(
      new Map([
        ["en:default", { hello: "Hello" }],
        ["fr:default", { hello: "Bonjour" }],
        ["en:dashboard", { title: "Dashboard" }],
      ]),
    );
  });

  it("returns an empty store for a response that carries no namespaces at all", () => {
    expect(transformApiResponse({ locales: [], namespaces: {} })).toEqual(new Map());
  });

  it.each([
    ["a missing response", undefined],
    ["a null namespaces field", { locales: [], namespaces: null }],
    ["a string namespaces field", { locales: [], namespaces: "default" }],
    ["an array namespaces field", { locales: [], namespaces: [] }],
  ])("rejects %s", (_case, response) => {
    expect(() => transformApiResponse(response as unknown as ExportApiResponse)).toThrow(
      INVALID_SHAPE,
    );
  });
});

describe("transformApiResponse() inner shapes", () => {
  it.each([
    ["a string where a namespace's locale map belongs", "ab"],
    ["null where a namespace's locale map belongs", null],
    ["an array where a namespace's locale map belongs", []],
  ])("rejects %s", (_case, locales) => {
    const response = { locales: ["en"], namespaces: { default: locales } };

    expect(() => transformApiResponse(response as unknown as ExportApiResponse)).toThrow(
      '[@comvi/plugin-fetch-loader] Invalid API response: "namespaces.default" must be an object',
    );
  });

  it.each([
    ["a string where a locale's catalog belongs", "Hello"],
    ["null where a locale's catalog belongs", null],
    ["an array where a locale's catalog belongs", []],
  ])("rejects %s", (_case, catalog) => {
    const response = { locales: ["en"], namespaces: { default: { en: catalog } } };

    expect(() => transformApiResponse(response as unknown as ExportApiResponse)).toThrow(
      '[@comvi/plugin-fetch-loader] Invalid API response: "namespaces.default.en" must be an object',
    );
  });
});
