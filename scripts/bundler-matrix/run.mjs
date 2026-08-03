import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * Pack-based bundler-matrix gate (weight-refactor plan, Phase 1 acceptance,
 * amendment 6 + R2).
 *
 * 1. `pnpm pack` every workspace package the ACTIVE cases need into a temp
 *    dir, so every assertion runs against the artifacts users actually
 *    receive (exports map, sideEffects array, dist files — post
 *    workspace-protocol rewrite).
 * 2. R2: assert every entry of core's `sideEffects` array names a file that
 *    actually exists in the packed tarball (deterministic register-tags chunk
 *    name — fails when rolldown renames the chunk on upgrade).
 * 3. Install the tarballs into the standalone consumer app in ./app (npm, not
 *    pnpm — deliberately outside the workspace), bundle each case with
 *    webpack AND vite under development AND production modes, run every
 *    bundle in plain node, and assert both tag-activation channels:
 *    ambient (root entry + /tags import side effect) and per-call
 *    (tagInterpolation.extensions). See app/src/*.mjs for the assertions.
 * 4. framework-slim P0.5: assert per case whether the tag-registration
 *    modules are in the bundler's MODULE GRAPH (webpack `--json` stats
 *    `modules[].identifier`; vite via the `bm-module-ids` config plugin) —
 *    module IDs, never output-text substrings. The `*-on-slim` cases that
 *    assert their absence are declared and skipped until their phase lands.
 *
 * Wrapper <T> rendering is NOT exercised (needs a DOM/renderer); wrapper
 * tarballs are still packed, installed, and bundled (app/src/wrappers.mjs).
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const APP_DIR = path.join(SCRIPT_DIR, "app");
const OUT_DIR = path.join(APP_DIR, "out");

/** `@comvi/core`'s side-effectful ROOT entry, as a module-ID fragment. */
const ROOT_ENTRY = `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core.js`;

/**
 * The three capability subpaths a single-package app does NOT use, as
 * module-ID fragments — entry file and hashed chunk alike.
 *
 * Every wrapper `/slim` entry re-exports icuCompiler, attachLoader,
 * flattenCatalog, attachPlugins and attachDevtools so an app never has to
 * name `@comvi/core`. The single-package cases call attachLoader (and with it
 * flattenCatalog, same module); these fragments are what must stay OUT of the
 * graph, which is the whole claim "an unused named re-export costs nothing".
 */
const UNUSED_CAPABILITY_SUBPATHS = [
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-icu.js`,
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-plugins.js`,
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-devtools.js`,
  `comvi-core-compile-icu-`,
  `comvi-core-plugins-`,
  `comvi-core-devtools-`,
];
/**
 * Matrix cases. `sentinels` says what the bundler's module graph must look
 * like for core's tag-registration chunks (the `sideEffects` set):
 *   "present" — the app opted into tags (root entry or an explicit /tags
 *               import), so the registration chunk must survive;
 *   "absent"  — the app is on bare slim without tags, so nothing may pull it.
 * A case may instead give `{ default, "<bundler>:<mode>": … }` when one
 * combination legitimately differs — see `next-client-slim`, the only such
 * case, for what earns that.
 * `absentModules` adds case-specific module-ID fragments that must NOT appear
 * in the graph (matched as substrings, so hashed chunk names are covered).
 * `packages` are the workspace tarballs the case needs, `deps` the framework
 * peer deps its bundle imports. Pending cases are declared but not run: they
 * assert an absence that today's wrappers cannot deliver (they value-import
 * the root entry), and the phase named in `pending` graduates them.
 */
const CASES = [
  { name: "ambient", sentinels: "present", packages: ["@comvi/core"] },
  { name: "per-call", sentinels: "present", packages: ["@comvi/core"] },
  {
    name: "wrappers",
    sentinels: "present",
    packages: ["@comvi/core", "@comvi/react", "@comvi/vue"],
    deps: ["react", "vue"],
  },
  { name: "slim-composition", sentinels: "absent", packages: ["@comvi/core"] },
  {
    name: "react-on-slim",
    sentinels: "absent",
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    name: "solid-on-slim",
    sentinels: "absent",
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    name: "svelte-on-slim",
    sentinels: "absent",
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    // Plan P4 step 4 / P4-AB1: an app that imports ONLY `createI18nFromCore`
    // + `useI18n` from @comvi/vue must drop the root-importing createI18n
    // module — and with it core's tag-registration chunks — in EVERY bundler,
    // or the fallback `@comvi/vue/slim` subpath ships instead.
    name: "vue-on-slim",
    sentinels: "absent",
    absentModules: [ROOT_ENTRY],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // Plan P5 step 2: the companion-only server graph must drop every
    // root-importing module. That holds in DEVELOPMENT too, where webpack
    // keeps the sibling `./server` re-exports alive — which is the point:
    // retargeting getI18n.ts to `@comvi/core/slim` removes the root entry at
    // the source instead of relying on the bundler to prune it.
    //
    // Retargeted by the DX pass to the SINGLE-PACKAGE recipe: the fixture now
    // builds its host from `createSlimI18n` + `attachLoader` re-exported by
    // `@comvi/next/server`, so this case also gates the re-export hop on the
    // server half — the three unused capability subpaths must stay out.
    name: "next-server-on-slim",
    sentinels: "absent",
    absentModules: [
      ROOT_ENTRY,
      ...UNUSED_CAPABILITY_SUBPATHS,
      `@comvi${path.sep}next${path.sep}dist${path.sep}createNextI18n.js`,
    ],
    packages: ["@comvi/core", "@comvi/locale-routing", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  {
    // Plan P5 step 2 (advisory refinement): the client recipe carries neither
    // the server host module nor any loader code — core's or next's. Those
    // four absences hold in every combination.
    //
    // The tag chunks are the one honest exception. `@comvi/next/client`
    // re-exports `T` from `@comvi/react` (public API, unchanged), so as far
    // as the graph is concerned `T` is a used export of react's entry.
    // Production webpack and BOTH vite modes still drop it — nothing in this
    // bundle imports `T` from `@comvi/next/client`, and rollup tree-shakes
    // regardless of mode — but webpack in development runs with
    // `usedExports` off and cannot know that, so it keeps react's `T` chunk
    // and with it core's tag registration. A development bundle is not a
    // shipped cost; the expectation is pinned per combination rather than
    // papered over, so a regression in either direction still fails.
    name: "next-client-slim",
    sentinels: { default: "absent", "webpack:development": "present" },
    absentModules: [
      ROOT_ENTRY,
      `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-loader.js`,
      `comvi-core-importMapLoader-`,
      `@comvi${path.sep}next${path.sep}dist${path.sep}server${path.sep}`,
    ],
    packages: ["@comvi/core", "@comvi/locale-routing", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  // ---------------------------------------------------------------------
  // framework-slim DX pass: the SINGLE-PACKAGE recipes. Each app imports
  // from exactly one specifier — `@comvi/<fw>/slim`, or `@comvi/next/client`
  // — and names `@comvi/core` nowhere.
  //
  // These five cases are THE gate for re-export-hop tree-shaking. A wrapper
  // `/slim` entry re-exports five capability bindings from core's PURE
  // subpaths so an app never has to reach past its framework package; each
  // app below uses exactly ONE of them (`attachLoader` + `flattenCatalog`,
  // which share a module), and `UNUSED_CAPABILITY_SUBPATHS` asserts the other
  // three never enter the bundler's module graph. The root entry and the tag
  // chunks are asserted absent as everywhere else.
  //
  // Development matters as much as production here: webpack runs with
  // `optimization.usedExports` off, so a re-export it cannot resolve is a
  // retained module. That is exactly how `export * from "@comvi/core"` kept
  // the root entry alive for vue (fs-p4 §2 / P4-AB1), and why every entry in
  // this wave uses NAMED re-exports only.
  {
    name: "react-slim-preset",
    sentinels: "absent",
    absentModules: [ROOT_ENTRY, ...UNUSED_CAPABILITY_SUBPATHS],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    name: "solid-slim-preset",
    sentinels: "absent",
    absentModules: [ROOT_ENTRY, ...UNUSED_CAPABILITY_SUBPATHS],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    name: "svelte-slim-preset",
    sentinels: "absent",
    absentModules: [ROOT_ENTRY, ...UNUSED_CAPABILITY_SUBPATHS],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    name: "vue-slim-preset",
    sentinels: "absent",
    absentModules: [ROOT_ENTRY, ...UNUSED_CAPABILITY_SUBPATHS],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // `@comvi/next/client` exports the ROOT `createI18n` and the slim
    // `createSlimI18n` side by side; this app calls only the latter, and the
    // root entry must still be absent everywhere. The tag exception is
    // inherited verbatim from `next-client-slim`: the entry re-exports `T`
    // from `@comvi/react`, a two-package chain webpack development cannot
    // reconnect.
    name: "next-client-slim-preset",
    sentinels: { default: "absent", "webpack:development": "present" },
    absentModules: [
      ROOT_ENTRY,
      ...UNUSED_CAPABILITY_SUBPATHS,
      `@comvi${path.sep}next${path.sep}dist${path.sep}server${path.sep}`,
    ],
    packages: ["@comvi/core", "@comvi/locale-routing", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
];
const ACTIVE_CASES = CASES.filter((testCase) => testCase.pending === undefined);
const PENDING_CASES = CASES.filter((testCase) => testCase.pending !== undefined);
const MODES = ["development", "production"];
const BUNDLERS = ["webpack", "vite"];

/** Dev-only string from core's translate chunk: present iff the bundler
 *  resolved the "development" export condition. */
const DEV_MARKER = "[i18n] Missing parameter";

const ALL_PACKAGES = [
  { name: "@comvi/core", dir: "packages/core", distProbe: "dist/comvi-core.js" },
  { name: "@comvi/react", dir: "packages/react", distProbe: "dist/comvi-react.js" },
  { name: "@comvi/solid", dir: "packages/solid", distProbe: "dist/comvi-solid.js" },
  { name: "@comvi/svelte", dir: "packages/svelte", distProbe: "dist/index.js" },
  { name: "@comvi/vue", dir: "packages/vue", distProbe: "dist/comvi-vue.js" },
  {
    name: "@comvi/locale-routing",
    dir: "packages/locale-routing",
    distProbe: "dist/index.js",
  },
  { name: "@comvi/next", dir: "packages/next", distProbe: "dist/server.js" },
];

/** Only the tarballs the ACTIVE cases need are built, packed and installed. */
const required = new Set(ACTIVE_CASES.flatMap((testCase) => testCase.packages));
const PACKAGES = ALL_PACKAGES.filter((pkg) => required.has(pkg.name));

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
        `Run: pnpm exec turbo run build ${PACKAGES.map((p) => `--filter ${p.name}`).join(" ")}`,
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

/**
 * Sentinel module IDs for the tag-registration graph, derived from the packed
 * `sideEffects` array itself (never a hand-copied list): a case's assertion is
 * "does the bundler's module graph contain one of these files", matched
 * against bundler-reported module identifiers — never against output text.
 */
const SENTINEL_FRAGMENTS = sideEffects.map((entry) =>
  `@comvi/core/${entry.replace(/^\.\//, "")}`.split("/").join(path.sep),
);
console.log(`tag sentinels: ${SENTINEL_FRAGMENTS.length} module IDs derived from sideEffects`);

// ---------------------------------------------------------------------------
// 3. Install bundlers + tarballs into the standalone app (npm, no workspace).
// ---------------------------------------------------------------------------
console.log("\n=== Installing fixture app dependencies (npm)");
const npmFlags = ["--no-audit", "--no-fund", "--no-package-lock"];
run("npm", ["install", ...npmFlags], { cwd: APP_DIR });
run("npm", ["install", "--no-save", ...npmFlags, ...Object.values(tarballs)], { cwd: APP_DIR });

const appPkgJson = JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"));
const appDeps = { ...appPkgJson.dependencies, ...appPkgJson.devDependencies };
const missingDeps = [...new Set(ACTIVE_CASES.flatMap((testCase) => testCase.deps ?? []))].filter(
  (dep) => appDeps[dep] === undefined,
);
if (missingDeps.length > 0) {
  fail(
    `active cases need framework peer deps missing from app/package.json: ${missingDeps.join(", ")}\n` +
      `Add them there (a graduating *-on-slim case brings its own dep).`,
  );
}

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

/**
 * Module IDs the bundler reported for the last build:
 * - webpack: `--json` stats, `modules[].identifier` (recursing into the
 *   sub-modules ModuleConcatenationPlugin folds together in production);
 * - vite: the rollup/rolldown `chunk.modules` keys the config plugin writes
 *   next to the bundle as `<out>.modules.json`.
 */
function readModuleIds(bundler, outFile) {
  if (bundler === "vite") {
    const file = `${outFile}.modules.json`;
    if (!fs.existsSync(file)) fail(`vite produced no module list for ${path.basename(outFile)}`);
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  const statsFile = `${outFile}.stats.json`;
  if (!fs.existsSync(statsFile)) fail(`webpack produced no stats for ${path.basename(outFile)}`);
  const stats = JSON.parse(fs.readFileSync(statsFile, "utf8"));
  const ids = [];
  const collect = (modules) => {
    for (const module of modules ?? []) {
      if (typeof module.identifier === "string") ids.push(module.identifier);
      collect(module.modules);
    }
  };
  collect(stats.modules);
  return ids;
}

function bundle(bundler, mode, fixture) {
  const entry = path.join(APP_DIR, "src", `${fixture}.mjs`);
  const outFile = path.join(
    OUT_DIR,
    `${bundler}-${mode}-${fixture}.${bundler === "webpack" ? "cjs" : "mjs"}`,
  );
  const bin = path.join(APP_DIR, "node_modules", ".bin", bundler);
  const args =
    bundler === "webpack"
      ? ["--config", "webpack.config.mjs", "--mode", mode, "--json", `${outFile}.stats.json`]
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
  return { outFile, moduleIds: readModuleIds(bundler, outFile) };
}

const failures = [];
const results = [];
for (const bundler of BUNDLERS) {
  for (const mode of MODES) {
    for (const testCase of ACTIVE_CASES) {
      const fixture = testCase.name;
      const label = `${bundler} × ${mode} × ${fixture}`;
      const { outFile, moduleIds } = bundle(bundler, mode, fixture);

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

      // Module-graph check: tag registration is pulled in exactly when the
      // app asked for tags. Module IDs, never output-text substrings.
      const expectTags =
        typeof testCase.sentinels === "string"
          ? testCase.sentinels
          : (testCase.sentinels[`${bundler}:${mode}`] ?? testCase.sentinels.default);
      const found = moduleIds.filter((id) =>
        SENTINEL_FRAGMENTS.some((fragment) => id.includes(fragment)),
      );
      const sentinelsOk = expectTags === "present" ? found.length > 0 : found.length === 0;
      if (!sentinelsOk) {
        failures.push(
          `${label}: tag sentinel modules expected ${expectTags}, found ${
            found.length > 0 ? found.join(", ") : "none"
          }`,
        );
      }

      // Case-specific absences (plan P5 step 2): module-ID fragments the
      // graph must not contain at all — the root entry for a companion-only
      // server app, the server host module and loader code for a client one.
      const leaked = (testCase.absentModules ?? []).flatMap((fragment) =>
        moduleIds.filter((id) => id.includes(fragment)),
      );
      if (leaked.length > 0) {
        failures.push(`${label}: modules expected absent, found ${leaked.join(", ")}`);
      }

      // Behavioral check: run the bundle in plain node.
      const exec = spawnSync(process.execPath, [outFile], { encoding: "utf8" });
      const ran = exec.status === 0 && exec.stdout.includes(`BUNDLER_MATRIX_OK ${fixture}`);
      if (!ran) {
        failures.push(
          `${label}: bundle execution failed (exit ${exec.status})\n${exec.stdout}${exec.stderr}`,
        );
      }
      const ok = ran && sentinelsOk && leaked.length === 0;
      results.push(`${ok ? "PASS" : "FAIL"}  ${label}`);
      console.log(`${ok ? "PASS" : "FAIL"}  ${label} [tags ${expectTags}]`);
    }
  }
}

for (const testCase of PENDING_CASES) {
  console.log(`SKIP  ${testCase.name} — pending: ${testCase.pending}`);
}

fs.rmSync(packDir, { recursive: true, force: true });

console.log(
  `\n=== Bundler matrix summary (${results.length} combinations, ${PENDING_CASES.length} pending case(s) skipped)`,
);
if (failures.length > 0) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n\n"));
  process.exit(1);
}
console.log("bundler-matrix: all combinations green");
