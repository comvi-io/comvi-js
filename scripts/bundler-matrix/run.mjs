import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * Pack-based bundler-matrix gate (weight-refactor plan, Phase 1 acceptance,
 * amendment 6 + R2).
 *
 * 1. `pnpm pack` @comvi/core, @comvi/react, @comvi/vue into a temp dir, so
 *    every assertion runs against the artifacts users actually receive
 *    (exports map, sideEffects array, dist files — post workspace-protocol
 *    rewrite).
 * 2. R2: assert every entry of core's `sideEffects` array names a file that
 *    actually exists in the packed tarball (deterministic register-tags chunk
 *    name — fails when rolldown renames the chunk on upgrade).
 * 3. Install the tarballs into the standalone consumer app in ./app (npm, not
 *    pnpm — deliberately outside the workspace), bundle each fixture with
 *    webpack AND vite under development AND production modes, run every
 *    bundle in plain node, and assert both tag-activation channels:
 *    ambient (root entry + /tags import side effect) and per-call
 *    (tagInterpolation.extensions). See app/src/*.mjs for the assertions.
 *
 * Wrapper <T> rendering is NOT exercised (needs a DOM/renderer); wrapper
 * tarballs are still packed, installed, and bundled (app/src/wrappers.mjs).
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const APP_DIR = path.join(SCRIPT_DIR, "app");
const OUT_DIR = path.join(APP_DIR, "out");
const FIXTURES = ["ambient", "per-call", "wrappers", "slim-composition"];
const MODES = ["development", "production"];
const BUNDLERS = ["webpack", "vite"];

/** Dev-only string from core's translate chunk: present iff the bundler
 *  resolved the "development" export condition. */
const DEV_MARKER = "[i18n] Missing parameter";

const PACKAGES = [
  { name: "@comvi/core", dir: "packages/core", distProbe: "dist/comvi-core.js" },
  { name: "@comvi/react", dir: "packages/react", distProbe: "dist/comvi-react.js" },
  { name: "@comvi/vue", dir: "packages/vue", distProbe: "dist/comvi-vue.js" },
];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function fail(message) {
  console.error(`\nbundler-matrix: FAIL — ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 0. Preconditions: dist must exist for everything we pack.
// ---------------------------------------------------------------------------
for (const pkg of PACKAGES) {
  const probe = path.join(REPO_ROOT, pkg.dir, pkg.distProbe);
  if (!fs.existsSync(probe)) {
    fail(
      `${pkg.name} has no build output (${pkg.dir}/${pkg.distProbe} missing).\n` +
        `Run: pnpm exec turbo run build --filter @comvi/core --filter @comvi/react --filter @comvi/vue`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Pack the tarballs.
// ---------------------------------------------------------------------------
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-bundler-matrix-"));
console.log(`\n=== Packing tarballs into ${packDir}`);
for (const pkg of PACKAGES) {
  run("pnpm", ["--filter", pkg.name, "exec", "pnpm", "pack", "--pack-destination", packDir], {
    cwd: REPO_ROOT,
  });
}

const tarballs = {};
for (const pkg of PACKAGES) {
  const version = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, pkg.dir, "package.json"), "utf8"),
  ).version;
  const file = path.join(packDir, `${pkg.name.slice(1).replace("/", "-")}-${version}.tgz`);
  if (!fs.existsSync(file)) fail(`expected tarball not produced: ${file}`);
  tarballs[pkg.name] = file;
}

// ---------------------------------------------------------------------------
// 2. R2 gate: every sideEffects entry must be an actually-packed dist file.
// ---------------------------------------------------------------------------
console.log("\n=== Checking @comvi/core sideEffects array against packed dist files");
const coreTarball = tarballs["@comvi/core"];
const tarList = execFileSync("tar", ["-tzf", coreTarball], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);
const packedPkgJson = JSON.parse(
  execFileSync("tar", ["-xzf", coreTarball, "-O", "package/package.json"], {
    encoding: "utf8",
  }),
);

const sideEffects = packedPkgJson.sideEffects;
if (!Array.isArray(sideEffects) || sideEffects.length === 0) {
  fail(
    `packed @comvi/core sideEffects must be a non-empty array of registration chunks, got: ${JSON.stringify(sideEffects)}`,
  );
}
const missing = sideEffects.filter(
  (entry) => !tarList.includes(`package/${entry.replace(/^\.\//, "")}`),
);
if (missing.length > 0) {
  const emitted = tarList
    .filter((f) => f.startsWith("package/dist/chunks/"))
    .map((f) => `  ${f}`)
    .join("\n");
  fail(
    `sideEffects entries not found in the packed tarball (registration chunk renamed?):\n` +
      missing.map((m) => `  ${m}`).join("\n") +
      `\nEmitted dist/chunks files:\n${emitted}`,
  );
}
console.log(`sideEffects OK (${sideEffects.length} entries all present in the tarball)`);

// ---------------------------------------------------------------------------
// 3. Install bundlers + tarballs into the standalone app (npm, no workspace).
// ---------------------------------------------------------------------------
console.log("\n=== Installing fixture app dependencies (npm)");
const npmFlags = ["--no-audit", "--no-fund", "--no-package-lock"];
run("npm", ["install", ...npmFlags], { cwd: APP_DIR });
run("npm", ["install", "--no-save", ...npmFlags, ...Object.values(tarballs)], { cwd: APP_DIR });

const installedCore = path.join(APP_DIR, "node_modules", "@comvi", "core");
if (!fs.existsSync(path.join(installedCore, "dist", "comvi-core.js"))) {
  fail("@comvi/core tarball did not install into the fixture app");
}
if (fs.lstatSync(installedCore).isSymbolicLink()) {
  fail("@comvi/core resolved to a symlink — fixture app is leaking into the workspace");
}

// ---------------------------------------------------------------------------
// 4. Bundle + execute the matrix.
// ---------------------------------------------------------------------------
fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const childEnv = { ...process.env };
delete childEnv.NODE_ENV; // --mode must be the only thing driving conditions

function bundle(bundler, mode, fixture) {
  const entry = path.join(APP_DIR, "src", `${fixture}.mjs`);
  const outFile = path.join(
    OUT_DIR,
    `${bundler}-${mode}-${fixture}.${bundler === "webpack" ? "cjs" : "mjs"}`,
  );
  const bin = path.join(APP_DIR, "node_modules", ".bin", bundler);
  const args =
    bundler === "webpack"
      ? ["--config", "webpack.config.mjs", "--mode", mode]
      : ["build", "--config", "vite.config.mjs", "--mode", mode];
  const env = { ...childEnv, BM_ENTRY: entry, BM_OUT: outFile };
  if (bundler === "vite") {
    // Vite's `development|production` resolve condition follows NODE_ENV, not
    // `--mode` (which alone leaves builds on NODE_ENV=production). Real
    // dev-condition consumers (vite dev server, NODE_ENV=development builds)
    // run with NODE_ENV set, so mirror that. Webpack derives the condition
    // from `--mode` directly.
    env.NODE_ENV = mode;
  }
  const res = spawnSync(bin, args, { cwd: APP_DIR, env, encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stdout || "");
    console.error(res.stderr || "");
    fail(`${bundler} (${mode}) failed to bundle ${fixture}`);
  }
  if (!fs.existsSync(outFile)) fail(`${bundler} (${mode}) produced no output for ${fixture}`);
  return outFile;
}

const failures = [];
const results = [];
for (const bundler of BUNDLERS) {
  for (const mode of MODES) {
    for (const fixture of FIXTURES) {
      const label = `${bundler} × ${mode} × ${fixture}`;
      const outFile = bundle(bundler, mode, fixture);

      // Export-condition check: dev builds must contain the dev-only core
      // chunk marker, prod builds must not.
      const content = fs.readFileSync(outFile, "utf8");
      const hasDevMarker = content.includes(DEV_MARKER);
      if (mode === "development" && !hasDevMarker) {
        failures.push(`${label}: development condition not resolved (dev marker missing)`);
      }
      if (mode === "production" && hasDevMarker) {
        failures.push(`${label}: production bundle contains the development build of core`);
      }

      // Behavioral check: run the bundle in plain node.
      const exec = spawnSync(process.execPath, [outFile], { encoding: "utf8" });
      const ok = exec.status === 0 && exec.stdout.includes(`BUNDLER_MATRIX_OK ${fixture}`);
      if (!ok) {
        failures.push(
          `${label}: bundle execution failed (exit ${exec.status})\n${exec.stdout}${exec.stderr}`,
        );
      }
      results.push(`${ok ? "PASS" : "FAIL"}  ${label}`);
      console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    }
  }
}

fs.rmSync(packDir, { recursive: true, force: true });

console.log(`\n=== Bundler matrix summary (${results.length} combinations)`);
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("bundler-matrix: all combinations green");
