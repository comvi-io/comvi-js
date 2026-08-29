import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    "import.meta.env.VITE_COMVI_API_BASE_URL": JSON.stringify("https://api.comvi.io"),
  },
  test: {
    exclude: [...configDefaults.exclude, "gate-e/**"],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
