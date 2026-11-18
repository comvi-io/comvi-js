/**
 * `@comvi/nuxt` against the shared routing-policy contract
 * (`@comvi/test-utils/routingPolicyContract`). Every row runs through the
 * global route middleware on the server, and through `useTranslation(event)`
 * on an event carrying the same URL, cookies and headers. Settings go through
 * the shared `normalizeRoutingOptions`, as the module's do, so a row tests what
 * an app writing those options in `nuxt.config` gets.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_CONTROL_CASES,
  DEFAULT_COOKIE,
  DETECTION_PRECEDENCE_CASES,
  POLICY_DEFAULT_LOCALE,
  POLICY_LOCALES,
  type PolicyRequest,
  type RoutingPolicySettings,
} from "@comvi/test-utils/routingPolicyContract";
import { ACCEPT_LANGUAGE_CASES } from "@comvi/test-utils/acceptLanguageTable";
import {
  fakeInstance,
  getMockCookieOptions,
  getMockCookieWrites,
  mockRuntimeConfig,
  resetMocks,
  setMockCookie,
  setMockI18n,
  setMockRequestHeaders,
  useNuxtApp,
} from "./mocks/nuxt-app";
import { setNitroRuntimeConfig } from "./mocks/nitro-imports";
import { setComviOptions } from "./mocks/comvi-options";
import { runtimeLocaleKeys } from "./mocks/locale-options";
import middleware from "../src/runtime/middleware/i18n.global";
import { useTranslation } from "../src/runtime/server/utils/useTranslation";
import type { NuxtI18nRuntimeConfig } from "../src/types";

/** What h3 would read off a real event: the request this row describes. */
interface ContractEvent {
  request: PolicyRequest;
}
vi.mock("h3", () => ({
  getCookie: (event: ContractEvent, name: string) => cookiesOf(event.request)[name],
  getHeader: (event: ContractEvent, name: string) => event.request.headers?.[name.toLowerCase()],
  getQuery: (event: ContractEvent) => event.request.query ?? {},
}));

const NUXT_DEFAULT_COOKIE = "i18n_locale";
const cookieName = (name: string) => (name === DEFAULT_COOKIE ? NUXT_DEFAULT_COOKIE : name);
const cookiesOf = (request: PolicyRequest) =>
  Object.fromEntries(
    Object.entries(request.cookies ?? {}).map(([name, value]) => [cookieName(name), value]),
  );

const search = (query: Record<string, string> = {}) => {
  const params = new URLSearchParams(query).toString();
  return params ? `?${params}` : "";
};

const runtimeComvi = (
  settings: RoutingPolicySettings,
  locales: readonly string[] = POLICY_LOCALES,
): NuxtI18nRuntimeConfig["comvi"] => {
  const { localeCookie, localeDetection } = runtimeLocaleKeys(settings);
  return {
    locales: [...locales],
    localeObjects: {},
    defaultLocale: locales[0] ?? POLICY_DEFAULT_LOCALE,
    localePrefix: "as-needed",
    localeCookie,
    localeDetection,
  };
};

/** The locale the route middleware rendered (on the server), and the cookie it wrote, if any. */
const runMiddleware = async (comvi: NuxtI18nRuntimeConfig["comvi"], request: PolicyRequest) => {
  resetMocks();
  setMockI18n(fakeInstance(comvi.defaultLocale));
  mockRuntimeConfig.public.comvi = comvi;
  const cookies = cookiesOf(request);
  for (const [name, value] of Object.entries(cookies)) setMockCookie(name, value);
  const setupWrites = Object.fromEntries(
    Object.keys(cookies).map((name) => [name, getMockCookieWrites(name).length]),
  );
  setMockRequestHeaders(request.headers ?? {});

  await middleware({
    params: {},
    path: request.path,
    fullPath: `${request.path}${search(request.query)}`,
    query: request.query ?? {},
  });

  const name = comvi.localeCookie ? comvi.localeCookie.name : undefined;
  const writes = name ? getMockCookieWrites(name).slice(setupWrites[name] ?? 0) : [];
  const options = name ? getMockCookieOptions(name) : undefined;
  const written =
    name && options && writes.length > 0
      ? {
          name: name === NUXT_DEFAULT_COOKIE ? DEFAULT_COOKIE : name,
          value: writes[writes.length - 1],
          maxAge: options.maxAge,
          sameSite: options.sameSite,
          secure: options.secure,
          ...(options.domain === undefined ? {} : { domain: options.domain }),
        }
      : null;

  return { locale: (useNuxtApp().$i18n as { locale: string }).locale, written };
};

/** `useTranslation(event)` on an event carrying the same request. */
const runHelper = async (comvi: NuxtI18nRuntimeConfig["comvi"], request: PolicyRequest) => {
  setNitroRuntimeConfig({ public: { comvi } });
  const event = { path: `${request.path}${search(request.query)}`, request, context: {} };
  return useTranslation(event as never);
};

beforeEach(() => {
  // The contract is about requests, so the middleware runs as it does in SSR.
  vi.stubGlobal("__COMVI_TEST_SERVER__", true);
  setComviOptions({}, () => ({ loader: async () => ({}) }));
});

describe("routing-policy contract (nuxt): B6 detection precedence", () => {
  it.each(DETECTION_PRECEDENCE_CASES)("$why", async ({ settings, request, expected }) => {
    const comvi = runtimeComvi(settings);
    const { locale: middlewareLocale } = await runMiddleware(comvi, request);
    const { locale: helperLocale } = await runHelper(comvi, request);

    expect({ middleware: middlewareLocale, helper: helperLocale }).toEqual({
      middleware: expected,
      helper: expected,
    });
  });
});

describe("routing-policy contract (nuxt): B5 Accept-Language end to end", () => {
  it.each(ACCEPT_LANGUAGE_CASES)("$why — $header", async ({ header, locales, expected }) => {
    const comvi = runtimeComvi({}, locales);
    const request = { path: "/", headers: { "accept-language": header } };

    expect((await runMiddleware(comvi, request)).locale).toBe(expected ?? locales[0]);
    expect((await runHelper(comvi, request)).locale).toBe(expected ?? locales[0]);
  });
});

describe("routing-policy contract (nuxt): B8 cookie control", () => {
  it.each(COOKIE_CONTROL_CASES)("$why", async ({ settings, request, dev, expected, locale }) => {
    if (dev) vi.stubGlobal("__COMVI_TEST_DEV__", true);
    const comvi = runtimeComvi(settings);
    const { locale: middlewareLocale, written } = await runMiddleware(comvi, request);
    const { locale: helperLocale } = await runHelper(comvi, request);

    expect(written).toEqual(expected);
    expect({ middleware: middlewareLocale, helper: helperLocale }).toEqual({
      middleware: locale,
      helper: locale,
    });
  });
});
