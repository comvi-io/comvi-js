// §7.2-2 — `createSlimI18n` never published, so it is renamed rather than
// deprecated: one host, one name. An alias renames only the IMPORTED name —
// `createServerHost` is the user's own and stays exactly as written.
import { createI18n } from "@comvi/next/client";
import { createI18n as createServerHost, devtools } from "@comvi/next/server";

const unrelated = {
  createSlimI18n() {
    return "unrelated member";
  },
};
export const labels = { createSlimI18n: "unrelated key" };
unrelated.createSlimI18n();

export const client = createI18n({ locale: "en" });
export const server = createServerHost({ locale: "en" }).with(devtools({ exposeGlobal: false }));

export function preview() {
  return createI18n({ locale: "de" });
}
