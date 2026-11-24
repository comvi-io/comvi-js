// Without generated catalogs `getI18n({ ns })` takes any namespace name, in the single and the
// array form, a `string` variable too: names are checked only against a declared schema (B21).
import type { GetI18n } from "../../src/server";

declare const getI18n: GetI18n;
declare const name: string;
declare const more: boolean;

export async function anyNamespace(): Promise<string> {
  const one: string = (await getI18n({ ns: "anything" })).t("k");
  const list: string = (await getI18n({ ns: ["a", "b"] })).t("k");
  const fromVariable: string = (await getI18n({ ns: name })).t("k");
  const listFromVariables: string = (await getI18n({ ns: [name, name, "c"] })).t("k");
  const either = await getI18n({ ns: more ? ["a", "b"] : "a" });
  return one + list + fromVariable + listFromVariables + either.locale;
}
