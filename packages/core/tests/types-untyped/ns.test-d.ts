/**
 * Types without generated catalogs (an ungenerated project): `i18n.ns(name)` takes any namespace
 * name, a `string` variable too (B23). Checked by `tsc -p tsconfig.tests.json` (`pnpm typecheck`).
 */
import { createI18n } from "@comvi/core";

export function anyNamespace(name: string): string {
  const i18n = createI18n({ locale: "en" });
  const fromVariable: string = i18n.ns(name)("k");
  const fromLiteral: string = i18n.ns("not-declared-anywhere")("k", { n: 1 });
  return fromVariable + fromLiteral;
}
