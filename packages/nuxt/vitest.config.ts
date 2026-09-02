import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

/**
 * Test seam for Nuxt's build-time flags: Vite does not substitute
 * `import.meta.server` / `import.meta.dev` in serve mode (vitest), so src is
 * rewritten to read a global switch instead. Both globals default to
 * undefined, which preserves the exact behaviour tests always had (both
 * flags falsy); a test flips them with vi.stubGlobal and unstubGlobals
 * restores. Only src files are rewritten — tests and node_modules are not.
 *
 * `import.meta.hot` is rewritten too — NOTE this one is NOT
 * behaviour-preserving: vitest defines a truthy hot context, the global
 * defaults to undefined, so HMR registration now runs only when a test
 * stubs __COMVI_TEST_HOT__ (which is what lets the dispose callback be
 * captured and invoked at all).
 */
const importMetaSeam = {
  name: "comvi-import-meta-seam",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    if (!/\.[mc]?ts$/.test(id) || id.includes("node_modules") || !/\/src\//.test(id)) return null;
    if (
      !code.includes("import.meta.server") &&
      !code.includes("import.meta.dev") &&
      !code.includes("import.meta.hot")
    )
      return null;
    return code
      .replaceAll("import.meta.server", "(globalThis.__COMVI_TEST_SERVER__ === true)")
      .replaceAll("import.meta.dev", "(globalThis.__COMVI_TEST_DEV__ === true)")
      .replaceAll("import.meta.hot", "globalThis.__COMVI_TEST_HOT__");
  },
};

export default defineConfig({
  plugins: [vue(), importMetaSeam],
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
