import { readFileSync } from "node:fs";
import { configDefaults, defineConfig } from "vitest/config";

// The same exact editor version vite.config.ts bakes into the detector.
const editorVersion: string = JSON.parse(
  readFileSync(new URL("../../packages/editor/package.json", import.meta.url), "utf8"),
).version;

export default defineConfig({
  define: {
    __COMVI_EDITOR_VERSION__: JSON.stringify(editorVersion),
    "import.meta.env.VITE_COMVI_API_BASE_URL": JSON.stringify("https://api.comvi.io"),
  },
  test: {
    // .stryker-tmp: an interrupted Stryker run leaves a sandbox copy behind and
    // vitest would silently run every test twice (once unmutated from the copy).
    exclude: [...configDefaults.exclude, "gate-e/**", ".stryker-tmp*/**"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
