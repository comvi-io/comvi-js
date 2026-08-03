// The PUBLISHED `@comvi/next` root type contract (plan §2.6).
//
// `createNextI18n` returns a composed host. Before the single-entry
// convergence that type was core's batteries-included `I18n`; now it is the
// exact, explicitly published `NextComposedI18n<D>` the non-exported builder
// produces. These assertions are the type half of the preservation claim —
// `tests/composed-contract.test.ts` is the behavioural half.
import type { NextComposedI18n } from "@comvi/next";
import { createNextI18n } from "@comvi/next";
import type { CreateNextI18nResult } from "../../src/createNextI18n";
import type { I18n, I18nLoaderApi, I18nPluginHostApi, LoaderFn } from "@comvi/core";
import type { LoaderImportMap } from "@comvi/core/loader";

type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

// ---------------------------------------------------------------------------
// (i) The published type IS the result's `i18n` field — no drift possible.
// ---------------------------------------------------------------------------
export type _ResultHostIsTheExportedType = Expect<
  Equal<CreateNextI18nResult["i18n"], NextComposedI18n>
>;
export type _ResultHostIsTheExportedTypeGeneric = Expect<
  Equal<CreateNextI18nResult<{ brand: string }>["i18n"], NextComposedI18n<{ brand: string }>>
>;

// ---------------------------------------------------------------------------
// (ii) It carries the base host, the loader API and the plugin host.
// ---------------------------------------------------------------------------
export type _CarriesBaseHost = Expect<Equal<NextComposedI18n extends I18n ? true : false, true>>;
export type _CarriesPluginHost = Expect<
  Equal<NextComposedI18n extends I18nPluginHostApi ? true : false, true>
>;
export type _CarriesLoaderApi = Expect<
  Equal<NextComposedI18n extends I18nLoaderApi ? true : false, true>
>;

// ---------------------------------------------------------------------------
// (iii) BOTH `registerLoader` overloads survive — the one affordance the
//       generic loader capability does not carry.
// ---------------------------------------------------------------------------
declare const composed: NextComposedI18n;
const fn: LoaderFn = async () => ({});
composed.registerLoader(fn);
const map: LoaderImportMap = { en: async () => ({ default: { k: "EN" } }) };
composed.registerLoader(map);
// @ts-expect-error -- neither a loader function nor an import map
composed.registerLoader(42);

// ---------------------------------------------------------------------------
// (iv) Every result method returns the result, so `.use*` chains.
// ---------------------------------------------------------------------------
const _result = createNextI18n({ locales: ["en"], defaultLocale: "en" });
export type _UseChains = Expect<Equal<ReturnType<typeof _result.use>, CreateNextI18nResult>>;
export type _UseClientChains = Expect<
  Equal<ReturnType<typeof _result.useClient>, CreateNextI18nResult>
>;
export type _UseServerChains = Expect<
  Equal<ReturnType<typeof _result.useServer>, CreateNextI18nResult>
>;
export type _UseClientLazyChains = Expect<
  Equal<ReturnType<typeof _result.useClientLazy>, CreateNextI18nResult>
>;
export type _UseServerLazyChains = Expect<
  Equal<ReturnType<typeof _result.useServerLazy>, CreateNextI18nResult>
>;

// ---------------------------------------------------------------------------
// (v) The base composition pipe is reachable on the published host.
// ---------------------------------------------------------------------------
export type _HasThePipe = Expect<
  Equal<NextComposedI18n["with"] extends (installer: never) => unknown ? true : false, true>
>;

// ---------------------------------------------------------------------------
// (vi) `D` flows when named explicitly. It does NOT infer from
//      `defaultParams` alone — `CreateNextI18nOptions<D>` reaches it through
//      `Pick<I18nOptions<D>, "defaultParams">`, a conditional type TS cannot
//      infer through. Verified identical on the pre-convergence build (P0 §7.3):
//      a pre-existing limitation, deliberately pinned rather than papered over.
// ---------------------------------------------------------------------------
const _branded = createNextI18n<{ brand: string }>({
  locales: ["en"],
  defaultLocale: "en",
  defaultParams: { brand: "Comvi" },
});
export type _ExplicitDFlows = Expect<
  Equal<typeof _branded.i18n, NextComposedI18n<{ brand: string }>>
>;

const _inferred = createNextI18n({
  locales: ["en"],
  defaultLocale: "en",
  defaultParams: { brand: "Comvi" },
});
export type _DDoesNotInferFromDefaultParams = Expect<
  Equal<typeof _inferred.i18n, NextComposedI18n<{}>>
>;
