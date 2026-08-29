import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    environment: "happy-dom",
    include: ["tests/**/*.{test,test-d}.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/types.ts", "src/runtime/components/T.ts"],
    },
    define: {
      __DEV__: JSON.stringify(true),
    },
    typecheck: {
      ignoreSourceErrors: true,
      tsconfig: "./tsconfig.typecheck.json",
    },
  },
  resolve: {
    alias: {
      "#app": resolve(__dirname, "./tests/mocks/nuxt-app.ts"),
      "#build/comvi.setup": resolve(__dirname, "./tests/mocks/comvi-setup.ts"),
      "#build/comvi.host": resolve(__dirname, "./tests/mocks/comvi-host.ts"),
      "#components": resolve(__dirname, "./tests/mocks/nuxt-components.ts"),
    },
  },
});
