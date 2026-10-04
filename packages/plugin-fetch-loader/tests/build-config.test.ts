/**
 * The build-config contract this package depends on.
 *
 * `@comvi/plugin-fetch-loader` is the only caller that hands
 * `createPluginBuildOptions` an ENTRY MAP — `{ index, api }` — rather than a
 * single path, so the guard that makes that form safe is pinned from here.
 * `tooling/` has no test runner of its own and CI's test job filters to
 * `./packages/*` and `./apps/*`, so a suite anywhere else would never run.
 *
 * The failure being guarded is silent: with the fixed default file name, every
 * entry is emitted to `index.js`, the last one wins, and `./api` resolves to
 * whatever `dist/api.js` happened to be left behind — no error anywhere.
 */
import { describe, it, expect } from "vitest";
import { createPluginBuildOptions } from "@comvi/vite-config";

const ENTRY_MAP = { index: "/src/index.ts", api: "/src/api.ts" };

describe("createPluginBuildOptions() with an entry map", () => {
  it("rejects a file-name pattern that cannot tell the entries apart", () => {
    expect(() =>
      createPluginBuildOptions({ entry: ENTRY_MAP, fileNames: { es: "index.js" } }),
    ).toThrow(/\[name\]/);
  });

  it("rejects the fixed default file name, which is what an omitted fileNames gives", () => {
    expect(() => createPluginBuildOptions({ entry: ENTRY_MAP })).toThrow(/\[name\]/);
  });

  it("accepts a pattern that names each entry", () => {
    const build = createPluginBuildOptions({ entry: ENTRY_MAP, fileNames: { es: "[name].js" } });

    expect(build.lib).toMatchObject({ entry: ENTRY_MAP });
  });
});

describe("createPluginBuildOptions() with a single entry", () => {
  it("keeps the fixed default file name", () => {
    const build = createPluginBuildOptions({ entry: "/src/index.ts" });

    expect(build.rolldownOptions?.output).toMatchObject([{ entryFileNames: "index.js" }]);
  });
});
