#!/usr/bin/env node
// Mutation testing (Stryker) for one package: `pnpm mutation packages/core [-- extra stryker args]`.
// Runs from the package directory so `mutate` globs and the package's vitest.config.ts apply;
// reports land in <package>/.stryker/ (gitignored). Manual / nightly tool — deliberately not a CI gate.
import path from "node:path";
import fs from "node:fs";
import url from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../..");
const [pkg, ...rest] = process.argv.slice(2);
if (!pkg) {
  console.error("usage: pnpm mutation <packages/dir|apps/dir> [-- stryker args]");
  process.exit(2);
}
const cwd = path.resolve(ROOT, pkg);
if (!fs.existsSync(path.join(cwd, "vitest.config.ts"))) {
  console.error(`${pkg}: no vitest.config.ts — mutation testing needs a vitest package`);
  process.exit(2);
}
const config = path.join(ROOT, "scripts/mutation/stryker.config.json");
// pnpm keeps root devDependencies out of a package's node_modules, so the runner plugin is
// resolved from the root and handed to Stryker by absolute path.
const runnerPlugin = createRequire(path.join(ROOT, "package.json")).resolve(
  "@stryker-mutator/vitest-runner",
);
const result = spawnSync(
  "pnpm",
  ["exec", "stryker", "run", config, "--plugins", runnerPlugin, ...rest.filter((a) => a !== "--")],
  {
    cwd,
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
