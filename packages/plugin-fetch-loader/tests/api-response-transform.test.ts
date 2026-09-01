import { describe, it, expect } from "vitest";
import { transformApiResponse } from "../src/index";
import type { ExportApiResponse } from "../src/index";

const INVALID_SHAPE = '[FetchLoader] Invalid API response: "namespaces" must be an object';

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
