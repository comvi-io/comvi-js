/**
 * `@comvi/nuxt` against the shared routing-policy contract
 * (`@comvi/test-utils/routingPolicyContract`). Every row runs through the
 * global route middleware on the server, and through `useTranslation(event)`
 * on an event carrying the same URL, cookies and headers. Settings go through
 * the module's own resolver (`resolveLocaleOptions`), so a row tests what an
 * app writing those options in `nuxt.config` gets.
 * `packages/next/tests/routing-policy-contract.test.ts` runs the same rows
 * through next.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n as createCoreI18n } from "@comvi/core";
import { attachLoader } from "@comvi/core/loader";
import {
  COOKIE_CONTROL_CASES,
  DEFAULT_COOKIE,
  DETECTION_PRECEDENCE_CASES,
  HELPER_CATALOGS,
  HELPER_DEFAULT_NS,
  HELPER_RESULT_KEYS,
  POLICY_DEFAULT_LOCALE,
  POLICY_LOCALES,
  SERVER_HELPER_CASES,
  type PolicyRequest,
  type RoutingPolicySettings,
} from "@comvi/test-utils/routingPolicyContract";
import { ACCEPT_LANGUAGE_CASES } from "@comvi/test-utils/acceptLanguageTable";
import {
  getMockCookieOptions,
  getMockCookieWrites,
  mockRuntimeConfig,
  resetMocks,
  setMockCookie,
  setMockRequestHeaders,
} from "./mocks/nuxt-app";
import { useState } from "#app";
import { createComviCore, resetComviHostMock } from "./mocks/comvi-host";
import { resetComviSetupMock } from "./mocks/comvi-setup";
import { nodeResponseStub } from "./mocks/node-response";
import { resolveLocaleOptions } from "../src/locale-options";
import middleware from "../src/runtime/middleware/i18n.global";
import { useTranslation } from "../src/runtime/server/utils/useTranslation";
import type { NuxtI18nRuntimeConfig } from "../src/types";

// The contract is about requests, so the middleware runs as it does in SSR.
vi.mock("../src/runtime/utils/runtime", () => ({ isServer: () => true }));

/** What h3 would read off a real event: the request this row describes. */
interface ContractEvent {
  request: PolicyRequest;
}
vi.mock("h3", () => ({
  getCookie: (event: ContractEvent, name: string) => cookiesOf(event.request)[name],
  getHeader: (event: ContractEvent, name: string) => event.request.headers?.[name.toLowerCase()],
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
  const { localeCookie, localeDetection } = resolveLocaleOptions(settings);
  return {
    locales: [...locales],
    localeObjects: {},
    defaultLocale: locales[0] ?? POLICY_DEFAULT_LOCALE,
    localePrefix: "as-needed",
    defaultNs: HELPER_DEFAULT_NS,
    fallbackLocale: locales[0] ?? POLICY_DEFAULT_LOCALE,
    localeCookie,
    localeDetection,
  };
};

/** The locale the route middleware rendered, and the cookie it wrote, if any. */
const runMiddleware = async (comvi: NuxtI18nRuntimeConfig["comvi"], request: PolicyRequest) => {
  resetMocks();
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

  return { locale: useState<string>("i18n-locale").value, written };
};

/** `useTranslation(event)` on an event carrying the same request. */
const runHelper = async (
  comvi: NuxtI18nRuntimeConfig["comvi"],
  request: PolicyRequest,
  options?: Parameters<typeof useTranslation>[1],
) => {
  const event = {
    path: `${request.path}${search(request.query)}`,
    request,
    node: { res: nodeResponseStub() },
    context: { runtimeConfig: { public: { comvi }, comvi: {} } },
  };
  return useTranslation(event as never, options);
};

beforeEach(() => {
  resetComviHostMock();
  resetComviSetupMock();
  createComviCore.mockImplementation((options: Record<string, unknown>) => {
    const host = attachLoader(createCoreI18n(options as never));
    host.registerLoader(async (locale: string, ns: string) => ({
      ...HELPER_CATALOGS[`${locale}:${ns}`],
    }));
    return host;
  });
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

describe("routing-policy contract (nuxt): B10 server helper result", () => {
  it.each(SERVER_HELPER_CASES)("$why", async ({ options, calls }) => {
    const result = await runHelper(runtimeComvi({}), { path: "/" }, options);

    expect(Object.keys(result).sort()).toEqual([...HELPER_RESULT_KEYS]);
    expect(result.locale).toBe(options.locale);
    for (const call of calls) {
      if ("t" in call) {
        expect(result.t(call.t as never, call.params as never)).toBe(call.expected);
      } else {
        expect(result.hasTranslation(call.has, call.params)).toBe(call.expected);
      }
    }
  });
});
