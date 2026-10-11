import { defineConfig } from "vitest/config";
import { resolve } from "path";
import pkg from "./package.json";

/**
 * Two projects, split by build condition: `unit` is the dev suite (__DEV__
 * true — long diagnostics, preflight, eager ICU compile), `prod` compiles the
 * SOURCE with __DEV__ false so the E_* error-code arms and the !IS_DEV paths
 * are exercised at src level, where Stryker can see them (the dist tests
 * cover the same behaviour but only against the build output).
 */
const shared = {
  environment: "happy-dom" as const,
  setupFiles: ["./tests/setup.ts"],
  globals: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

const sharedResolve = {
  alias: {
    "@": resolve(__dirname, "./src"),
  },
};

// Under Stryker (`scripts/mutation/run.mjs` sets COMVI_MUTATION) the fuzz
// suites are left out: they would re-run for every parser mutant at seconds
// apiece, and what they kill, the named tests already do.
const FUZZ = process.env.COMVI_MUTATION ? ["tests/**/message-fuzz.test.ts"] : [];

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
    projects: [
      {
        resolve: sharedResolve,
        define: {
          __DEV__: JSON.stringify(true),
          __VERSION__: JSON.stringify(pkg.version),
        },
        test: {
          ...shared,
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/prod/**", ...FUZZ],
        },
      },
      {
        resolve: sharedResolve,
        define: {
          __DEV__: JSON.stringify(false),
          __VERSION__: JSON.stringify(pkg.version),
        },
        test: {
          ...shared,
          name: "prod",
          include: ["tests/prod/**/*.test.ts"],
          exclude: FUZZ,
        },
      },
    ],
  },
});
