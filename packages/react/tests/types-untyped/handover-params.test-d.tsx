/**
 * `<I18nHandover defaultParams>` takes server data only (owner decision 2026-11-11): strings,
 * finite numbers, booleans and `null`. A handler, a `Date`, an array or a nested object is a
 * type error; the core's own `defaultParams` still take any value.
 */
import type { ReactNode } from "react";
import { createI18n, I18nHandover, type HandoverParams } from "../../src";

export const ok = (
  <I18nHandover defaultParams={{ brand: "Comvi", n: 1.5, ok: true, none: null }}>
    {null}
  </I18nHandover>
);
export const typed: HandoverParams = { brand: "Comvi" };

// @ts-expect-error a tag handler is not server data
export const handler = <I18nHandover defaultParams={{ b: (c: ReactNode) => <b>{c}</b> }} />;
// @ts-expect-error a Date is not server data
export const date = <I18nHandover defaultParams={{ d: new Date(0) }} />;
// @ts-expect-error an array is not server data
export const array = <I18nHandover defaultParams={{ d: ["a"] }} />;
// @ts-expect-error a nested object is not server data
export const nested = <I18nHandover defaultParams={{ d: { a: 1 } }} />;

// The types accept any number: `NaN` and `Infinity` compile and are refused at run time (a
// TypeError naming the param, `handover-default-params.test.tsx` "6.").
export const nan = <I18nHandover defaultParams={{ n: NaN, i: Infinity }}>{null}</I18nHandover>;

// The core is not narrowed.
export const core = createI18n({
  locale: "en",
  defaultParams: { b: (c: ReactNode) => <b>{c}</b>, d: new Date(0) },
});
