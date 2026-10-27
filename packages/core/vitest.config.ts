import { defineConfig } from "vitest/config";
import pkg from "./package.json" with { type: "json" };

/**
 * Two projects, split by build condition: `unit` runs the source with `__DEV__` true
 * (readable diagnostics), `prod` with `__DEV__` false, so the production arms are
 * exercised at source level where Stryker can see them.
 */
const shared = {
  environment: "node" as const,
  setupFiles: ["./tests/setup.ts"],
  globals: true,
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
};

// Under Stryker (scripts/mutation/run.mjs sets COMVI_MUTATION) the fuzz suite is left
// out: it would re-run for every parser mutant, and what it kills the named tests do.
// tests/contracts and tests/dist read the BUILT dist or the source TEXT (which Stryker
// instruments), never the mutated behaviour, so they are left out too.
const FUZZ = process.env.COMVI_MUTATION
  ? ["tests/**/fuzz.test.ts", "tests/contracts/**", "tests/dist/**"]
  : [];

export default defineConfig({
  test: {
    coverage: { provider: "v8", reporter: ["text", "json", "html"] },
    projects: [
      {
        define: { __DEV__: JSON.stringify(true), __VERSION__: JSON.stringify(pkg.version) },
        test: {
          ...shared,
          name: "unit",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/prod/**", ...FUZZ],
        },
      },
      {
        define: { __DEV__: JSON.stringify(false), __VERSION__: JSON.stringify(pkg.version) },
        test: {
          ...shared,
          name: "prod",
          // The fuzz corpus runs under both conditions (tests/compile/fuzz.test.ts).
          include: ["tests/prod/**/*.test.ts", "tests/compile/fuzz.test.ts"],
          exclude: FUZZ,
        },
      },
    ],
  },
});
