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
 *    ambient (a `@comvi/core/tags` import — the app's own, the one a wrapper
 *    `<T>` module carries, or the non-exported CDN entry's; the base root
 *    entry registers nothing) and per-call (tagInterpolation.extensions). See
 *    app/src/*.mjs for the assertions.
 * 4. framework-slim P0.5: assert per case whether the tag-registration
 *    modules are in the bundler's MODULE GRAPH (webpack `--json` stats
 *    `modules[].identifier`; vite via the `bm-module-ids` config plugin) —
 *    module IDs, never output-text substrings. Every DECLARED case runs: the
 *    `*-on-slim` cases that assert that absence graduated with their phases,
 *    and nothing is pending today (see `CASES`).
 *
 * Wrapper <T> rendering is NOT exercised (needs a DOM/renderer); wrapper
 * tarballs are still packed, installed, and bundled (app/src/wrappers.mjs).
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const APP_DIR = path.join(SCRIPT_DIR, "app");
const OUT_DIR = path.join(APP_DIR, "out");

// RE-DERIVED by the single-entry convergence (plan §5): there is no ROOT_ENTRY
// constant any more. `comvi-core.js` used to be the batteries-included,
// side-effectful root, so its ABSENCE was the proxy for "no full graph leaked".
// It is the BASE host now — present in every comvi graph, side-effect-free, and
// resolved per condition (`comvi-core.dev.js` under development) — so it cannot
// carry that meaning. What still does: the tag-registration sentinels (derived
// from the packed `sideEffects` array below) and `UNUSED_CAPABILITY_SUBPATHS`.

/**
 * Core's capability subpaths as module-ID fragments — entry file and hashed
 * chunk alike — grouped per capability so a case can name exactly the ones ITS
 * app does not use. `absentModules` matches substrings, so the chunk fragments
 * cover the content-hashed names too.
 */
const ICU_SUBPATH = [
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-icu.js`,
  `comvi-core-compile-icu-`,
];
const LOADER_SUBPATH = [
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-loader.js`,
  `comvi-core-importMapLoader-`,
];
const PLUGINS_SUBPATH = [
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-plugins.js`,
  `comvi-core-plugins-`,
];
const DEVTOOLS_SUBPATH = [
  `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-devtools.js`,
  `comvi-core-devtools-`,
];
/**
 * The three capability subpaths a single-package app that uses the LOADER does
 * not touch.
 *
 * Every wrapper root re-exports icu/icuCompiler, attachLoader, flattenCatalog,
 * attachPlugins and attachDevtools so an app never has to name `@comvi/core`
 * (the `/slim` subpaths that used to carry that toolkit are gone — one entry
 * per package). The cases that use this constant call attachLoader or the
 * configured `loader()` (and with it flattenCatalog, same module), which is why
 * LOADER_SUBPATH is deliberately not part of it; these fragments are what must
 * stay OUT of the graph, which is the whole claim "an unused named re-export
 * costs nothing". The default and single-capability cases use no capability at
 * all, or exactly one, and compose their own set from the groups above.
 */
const UNUSED_CAPABILITY_SUBPATHS = [...ICU_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH];
/**
 * Matrix cases. `sentinels` says what the bundler's module graph must look
 * like for core's tag-registration chunks (the `sideEffects` set):
 *   "present" — the app opted into tags (an explicit `@comvi/core/tags` import,
 *               or the non-exported CDN entry), so the registration chunk must
 *               survive;
 *   "absent"  — the app is on the base host without tags, so nothing may pull
 *               it. Core's base entry itself is present either way and is
 *               never what these assert.
 * A case may instead give `{ default, "<bundler>:<mode>": … }` when one
 * combination legitimately differs. NO case earns that today: the next-client
 * pair was the only one that ever did — webpack development could not prune the
 * two-package hop to react's `T` chunk, which back then reached core's ambient
 * registration — and single-entry P2 ended it by moving `<T>` onto the pure
 * `@comvi/core/rich-text` seam.
 * `absentModules` adds case-specific module-ID fragments that must NOT appear
 * in the graph (matched as substrings, so hashed chunk names are covered).
 * `packages` are the workspace tarballs the case needs, `deps` the framework
 * peer deps its bundle imports. Pending cases are declared but not run: they
 * assert an absence that the wrappers of the day could not deliver, and the
 * phase named in `pending` graduates them. None are declared today.
 */
const CASES = [
  { name: "ambient", sentinels: "present", packages: ["@comvi/core"] },
  { name: "per-call", sentinels: "present", packages: ["@comvi/core"] },
  {
    name: "wrappers",
    sentinels: "absent",
    packages: ["@comvi/core", "@comvi/react", "@comvi/vue"],
    deps: ["react", "vue"],
  },
  {
    // The base host + `/loader` + `/plugins` composed through both call forms
    // (`attach*` and the configured installers), resolved through the published
    // exports map out of the packed tarball.
    name: "base-composition",
    sentinels: "absent",
    packages: ["@comvi/core"],
  },
  {
    // Plan P5 step 2: the companion-only server graph must drop next's own
    // composed-host module (`createNextI18n.js`, in `absentModules` below) and
    // the unused capability subpaths. That holds in DEVELOPMENT too, where
    // webpack keeps the sibling `./server` re-exports alive — which is the
    // point: the server helpers name only base bindings from `@comvi/core`, so
    // the composed builder is absent at the SOURCE instead of relying on the
    // bundler to prune it. `@comvi/core` itself is present — it is the base
    // host this fixture composes on.
    //
    // Retargeted by the DX pass to the SINGLE-PACKAGE recipe and RENAMED by
    // single-entry P4 (`next-server-on-slim` -> `next-server-on-default`): the
    // app builds its host from `createI18n` + `attachLoader` re-exported by
    // `@comvi/next/server` — the same base binding the client entry exports,
    // the retired second name deleted — so this case also gates the re-export
    // hop on the server half: the three unused capability subpaths must stay
    // out.
    name: "next-server-on-default",
    sentinels: "absent",
    absentModules: [
      ...UNUSED_CAPABILITY_SUBPATHS,
      `@comvi${path.sep}next${path.sep}dist${path.sep}createNextI18n.js`,
    ],
    packages: ["@comvi/core", "@comvi/locale-routing", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  // ---------------------------------------------------------------------
  // The ONE-ENTRY recipes: each app imports from exactly ONE specifier and
  // names `@comvi/core` nowhere. Every specifier below is a published package
  // ROOT — the wrapper `/slim` subpaths these cases were written against are
  // retired, and `@comvi/next`'s two entries are a client/server RUNTIME split,
  // not a host tier.
  //
  // These ten cases are THE gate for re-export-hop tree-shaking. A one-entry
  // package re-exports core's capability bindings from its PURE subpaths so an
  // app never has to reach past its framework package, and each case asserts
  // that the ones ITS app does not call never enter the bundler's module graph:
  // the `*-default` apps call NONE and assert all four, the `*-icu` apps call
  // exactly `icuCompiler` and assert the other three, and `vue-composed` — the
  // one case left that actually CALLS a capability through a wrapper root —
  // composes `loader(map)` and asserts the other three. The tag chunks are
  // asserted absent as everywhere else; core's base entry is present, since the
  // entry's `createI18n` re-export is what these apps construct with.
  //
  // Development matters as much as production here: webpack runs with
  // `optimization.usedExports` off, so a re-export it cannot resolve is a
  // retained module. That is exactly how `export * from "@comvi/core"` kept
  // the root entry alive for vue (fs-p4 §2 / P4-AB1), and why every entry in
  // this wave uses NAMED re-exports only.
  {
    // Single-entry P2 RETARGETS the former `react-slim-preset` onto the
    // published root, and with it absorbs the former `react-on-slim`: that app
    // named `@comvi/core` for its constructor, which the root carries now, so
    // the two cases had become one graph reached through two specifiers. This
    // one uses NO capability, so all four subpaths are asserted absent.
    name: "react-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    // Single-entry P2, NEW: the POSITIVE half of the `fw-react-icu` size row.
    // A size sentinel can only assert a module ABSENT, so that row leaves ICU
    // out of its sentinel list and this case proves ICU's presence instead —
    // it runs the bundle and formats a plural for real. What must stay out is
    // every capability the app did not buy.
    name: "react-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    // Single-entry P3 RETARGETS the former `solid-slim-preset` onto the
    // published root, and with it absorbs the former `solid-on-slim`: that app
    // named `@comvi/core` for its constructor, which the root carries now, so
    // the two cases had become one graph reached through two specifiers. This
    // one uses NO capability, so all four subpaths are asserted absent.
    name: "solid-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    // Single-entry P3, NEW: the POSITIVE half of the `fw-solid-icu` size row,
    // and the solid twin of `react-icu`. A size sentinel can only assert a
    // module ABSENT, so that row leaves ICU out of its sentinel list and this
    // case proves ICU's presence instead — it runs the bundle and formats a
    // plural for real. What must stay out is every capability the app did not
    // buy.
    name: "solid-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    // Single-entry P3 RETARGETS the former `svelte-slim-preset` onto the
    // published root, and with it absorbs the former `svelte-on-slim`: that app
    // named `@comvi/core` for its constructor, which the root carries now, so
    // the two cases had become one graph reached through two specifiers. This
    // one uses NO capability, so all four subpaths are asserted absent.
    name: "svelte-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    // Single-entry P3, NEW: the POSITIVE half of the `fw-svelte-icu` size row.
    // A size sentinel can only assert a module ABSENT, so that row leaves ICU
    // out of its sentinel list and this case proves ICU's presence instead —
    // it runs the bundle and formats a plural for real.
    name: "svelte-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    // Single-entry P3 ABSORBS the former `vue-on-slim` and RETARGETS the former
    // `vue-slim-preset` onto the published root: `/slim` was unpublished and is
    // gone, so the two apps that reached the same wrapper through two
    // specifiers are one graph. This one uses NO capability, so all four
    // subpaths are asserted absent. Core's base entry is present — vue's preset
    // constructs on it — so it is never an absence sentinel.
    name: "vue-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // Single-entry P3, NEW — the POSITIVE half of the `fw-vue-icu` size row. A
    // size sentinel can only assert a module ABSENT, so that row leaves ICU out
    // of its sentinel list and this case proves ICU's presence instead: it runs
    // the bundle and formats a plural for real. It also pins the vue-specific
    // half, that the compiler option travels through vue's PRESET, which builds
    // the host itself. What must stay out is every capability the app did not
    // buy.
    name: "vue-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // Single-entry P3 — the RETARGETED `vue-slim-preset` body. Vue is the one
    // binding with TWO construction paths on one entry (the wrapper preset,
    // `vue-default`, and this injected-host escape hatch), so it keeps a case of
    // its own. It is also the only case left in the matrix where a capability
    // re-export hop is actually CALLED through a wrapper root: the app composes
    // `createCore(...).with(loader(map))` and wraps it with `createI18nFromCore`,
    // and the three subpaths it does not call must stay out in webpack AND vite,
    // development AND production.
    name: "vue-composed",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // Single-entry P4 RETARGETS the former `next-client-slim-preset` and with it
    // ABSORBS the former `next-client-slim`: that app named `@comvi/core` for
    // its constructor, which `@comvi/next/client`'s `createI18n` now IS, so the
    // two cases built one graph through two specifiers. This app uses NO
    // capability, so all four subpaths are asserted absent — plus next's own
    // server modules, the absence the absorbed case contributed. The old
    // webpack-dev tag exception is gone: this entry still re-exports `T`
    // through `@comvi/react`, but React's component now reaches the pure
    // rich-text seam rather than ambient registration.
    name: "next-client-default",
    sentinels: "absent",
    absentModules: [
      ...UNUSED_CAPABILITY_SUBPATHS,
      ...LOADER_SUBPATH,
      `@comvi${path.sep}next${path.sep}dist${path.sep}server${path.sep}`,
    ],
    packages: ["@comvi/core", "@comvi/locale-routing", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  {
    // Single-entry P4, NEW: the POSITIVE half of the `fw-next-client-icu` size
    // row, and the client twin of `react-icu`. A size sentinel can only assert
    // a module ABSENT, so that row leaves ICU out of its sentinel list and this
    // case proves ICU's presence instead — it runs the bundle and formats a
    // plural for real. What must stay out is every capability the app did not
    // buy, plus next's server modules.
    name: "next-client-icu",
    sentinels: "absent",
    absentModules: [
      ...LOADER_SUBPATH,
      ...PLUGINS_SUBPATH,
      ...DEVTOOLS_SUBPATH,
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
      // graph must not contain at all — next's own composed builder and the
      // unused capability subpaths for a companion-only server app, the server
      // host module and loader code for a client one.
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
