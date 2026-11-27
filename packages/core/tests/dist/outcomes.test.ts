/**
 * The outcome table of `setLocale()` / `load()` on the BUILT entries, the production
 * (`comvi-core.js`) and the development (`comvi-core.dev.js`) build (tests/outcomes.ts). Requires a
 * fresh build (turbo runs `build` before `test`).
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import type * as Index from "../../src/index";
import type * as Internal from "../../src/internal";
import { outcomeTable, switcherTable, type Api } from "../outcomes";

const DIST = path.resolve(__dirname, "../../dist");
const load = async <T>(file: string): Promise<T> =>
  import(pathToFileURL(path.join(DIST, file)).href);

for (const [suffix, dev] of [
  ["", false],
  [".dev", true],
] as const) {
  const get = async (): Promise<Api> => ({
    createI18n: (await load<typeof Index>(`comvi-core${suffix}.js`)).createI18n,
    core: (await load<typeof Internal>(`comvi-core-internal${suffix}.js`)).core,
    dev,
  });
  outcomeTable(`comvi-core${suffix}.js`, get);
  switcherTable(`comvi-core${suffix}.js`, get);
}
