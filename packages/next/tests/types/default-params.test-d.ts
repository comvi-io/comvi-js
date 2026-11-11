// `defaultParams` on both Next inputs are server data (owner decision 2026-11-11): the server
// configuration (`createGetI18n`) and the client `options` take strings, finite numbers,
// booleans and `null`; a tag handler, a Date, an array or an object is a type error.
import type { ClientOptions } from "../../src/client/I18nProvider";
import type { NextI18nOptions } from "../../src/server/getI18n";

const base = { locales: ["en"], defaultLocale: "en", timeZone: "UTC" } as const;

export const serverOk: NextI18nOptions = {
  ...base,
  defaultParams: { brand: "Comvi", n: 1, ok: true, x: null },
};
export const serverHandler: NextI18nOptions = {
  ...base,
  // @ts-expect-error a tag handler is not server data
  defaultParams: { link: (c: string) => c },
};
// @ts-expect-error a Date is not server data
export const serverDate: NextI18nOptions = { ...base, defaultParams: { d: new Date(0) } };

export const clientOk: ClientOptions = { defaultParams: { brand: "Comvi", none: null } };
// @ts-expect-error a tag handler is not server data
export const clientHandler: ClientOptions = { defaultParams: { link: (c: string) => c } };
// @ts-expect-error an array is not server data
export const clientArray: ClientOptions = { defaultParams: { d: ["a"] } };
// @ts-expect-error an object is not server data
export const clientObject: ClientOptions = { defaultParams: { d: { a: 1 } } };
