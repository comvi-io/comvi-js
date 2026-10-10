/**
 * `@comvi/next` against the shared routing-policy contract
 * (`@comvi/test-utils/routingPolicyContract`). Every row runs through the
 * middleware, then through `getI18n()` in the request the middleware let
 * through: next's server helper learns the request locale from the
 * `x-comvi-locale` header the middleware sets, so that hand-off is part of
 * what is under test. `packages/nuxt/tests/routing-policy-contract.test.ts`
 * runs the same rows through nuxt.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
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
import { createMiddleware } from "../src/middleware/createMiddleware";
import { createNextI18n } from "../src/createNextI18n";
import { _resetServerI18n, setI18n } from "../src/server/cache";
import { getI18n } from "../src/server/getI18n";

// Outside a Server Component render React's `cache()` does not memoize; the
// request locale reaches `getI18n()` through the header alone.
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: vi.fn(async () => requestHeaders) }));

const NEXT_DEFAULT_COOKIE = "NEXT_LOCALE";
const cookieName = (name: string) => (name === DEFAULT_COOKIE ? NEXT_DEFAULT_COOKIE : name);

const middlewareFor = (
  settings: RoutingPolicySettings,
  locales: readonly string[] = POLICY_LOCALES,
) =>
  createMiddleware({
    locales,
    defaultLocale: locales[0] ?? POLICY_DEFAULT_LOCALE,
    localePrefix: "as-needed",
    ...settings,
  });

const requestFor = ({ path, query, cookies, headers }: PolicyRequest) => {
  const url = new URL(path, "https://example.com");
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
  const request = new NextRequest(url, { headers: headers ?? {} });
  for (const [name, value] of Object.entries(cookies ?? {})) {
    request.cookies.set(cookieName(name), value);
  }
  return request;
};

/** The locale the middleware resolved, and what `getI18n()` answers after it. */
const run = async (settings: RoutingPolicySettings, request: PolicyRequest) => {
  const response = middlewareFor(settings)(requestFor(request));
  const middlewareLocale = response.headers.get("x-comvi-locale");
  requestHeaders = new Headers(middlewareLocale ? { "x-comvi-locale": middlewareLocale } : {});
  const helper = await getI18n();
  return { response, middlewareLocale, helperLocale: helper.locale };
};

/** The documented setup: `createNextI18n`, with a loader answering from the table. */
const helperHost = () => {
  const { i18n } = createNextI18n({
    locales: [...POLICY_LOCALES],
    defaultLocale: POLICY_DEFAULT_LOCALE,
    defaultNs: HELPER_DEFAULT_NS,
    devMode: false,
  });
  i18n.registerLoader(
    async (locale: string, ns: string) => HELPER_CATALOGS[`${locale}:${ns}`] ?? {},
  );
  setI18n(i18n);
};

beforeEach(() => {
  _resetServerI18n();
  helperHost();
});

describe("routing-policy contract (next): B6 detection precedence", () => {
  it.each(DETECTION_PRECEDENCE_CASES)("$why", async ({ settings, request, expected }) => {
    const { middlewareLocale, helperLocale } = await run(settings, request);

    expect({ middleware: middlewareLocale, helper: helperLocale }).toEqual({
      middleware: expected,
      helper: expected,
    });
  });
});

describe("routing-policy contract (next): B5 Accept-Language end to end", () => {
  it.each(ACCEPT_LANGUAGE_CASES)("$why — $header", async ({ header, locales, expected }) => {
    const response = middlewareFor(
      {},
      locales,
    )(requestFor({ path: "/", headers: { "accept-language": header } }));
    const middlewareLocale = response.headers.get("x-comvi-locale");
    requestHeaders = new Headers({ "x-comvi-locale": middlewareLocale ?? "" });

    expect(middlewareLocale).toBe(expected ?? locales[0]);
    expect((await getI18n()).locale).toBe(expected ?? locales[0]);
  });
});

describe("routing-policy contract (next): B8 cookie control", () => {
  it.each(COOKIE_CONTROL_CASES)("$why", async ({ settings, request, dev, expected, locale }) => {
    if (dev) vi.stubEnv("NODE_ENV", "development");
    const { response, middlewareLocale, helperLocale } = await run(settings, request);

    const written = response.cookies.getAll().map((cookie) => ({
      name: cookie.name === NEXT_DEFAULT_COOKIE ? DEFAULT_COOKIE : cookie.name,
      value: cookie.value,
      maxAge: cookie.maxAge,
      sameSite: cookie.sameSite,
      secure: cookie.secure ?? false,
      ...(cookie.domain === undefined ? {} : { domain: cookie.domain }),
    }));
    expect(written).toEqual(expected ? [expected] : []);
    expect({ middleware: middlewareLocale, helper: helperLocale }).toEqual({
      middleware: locale,
      helper: locale,
    });
  });
});

describe("routing-policy contract (next): B10 server helper result", () => {
  it.each(SERVER_HELPER_CASES)("$why", async ({ options, calls }) => {
    const result = await getI18n(options);

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
