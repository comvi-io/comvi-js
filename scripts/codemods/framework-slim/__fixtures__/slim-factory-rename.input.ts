// `createSlimI18n` never published, so it is renamed rather than
// deprecated: one host, one name. An alias renames only the IMPORTED name —
// `createServerHost` is the user's own and stays exactly as written.
import { createSlimI18n } from "@comvi/next/client";
import { createSlimI18n as createServerHost } from "@comvi/next/server";

const unrelated = {
  createSlimI18n() {
    return "unrelated member";
  },
};
export const labels = { createSlimI18n: "unrelated key" };
unrelated.createSlimI18n();

export const client = createSlimI18n({ locale: "en" });
export const server = createServerHost({ locale: "en", exposeGlobal: false });

export function preview() {
  return createSlimI18n({ locale: "de" });
}
