import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  define: {
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
