import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

/**
 * Pack-based bundler-matrix gate.
 *
 * 1. `pnpm pack` every workspace package the ACTIVE cases need into a temp
 *    dir, so every assertion runs against the artifacts users actually
 *    receive (exports map, sideEffects array, dist files — post
 *    workspace-protocol rewrite).
 * 2. Assert core's `sideEffects`: `false` in 0.8 (tags are in the base, R3-11, so no
 *    chunk registers anything on import); the 0.7 array named registration chunks that
 *    had to exist in the tarball.
 * 3. Install the tarballs into the standalone consumer app in ./app (npm, not
 *    pnpm — deliberately outside the workspace), bundle each case with
 *    webpack AND vite under development AND production modes, and run every
 *    bundle in plain node (each fixture asserts its own behaviour and prints
 *    BUNDLER_MATRIX_OK). See app/src/*.mjs.
 * 4. Assert per case whether the tag-registration modules are in the bundler's
 *    MODULE GRAPH (webpack `--json` stats `modules[].identifier`; vite via the
 *    `bm-module-ids` config plugin) — module IDs, never output-text substrings.
 * 5. Assert, for the `*-dev-conditions` cases only, which ARTIFACT of a
 *    package the bundler resolved, by looking for a dev-only warning's TEXT in
 *    the bundle (`devOnlyText`). This is the one claim the module graph cannot
 *    carry: a package's prod and dev artifacts are the same module by
 *    identity, and only their content differs.
 *
 * WHAT EACH COMBINATION VERIFIES (bundler × mode × case):
 *   - the build succeeds from the packed tarballs through the stock resolver;
 *   - the export condition: core's dev-only text in the development bundle and not in the
 *     production one (`DEV_MARKER`; `noCore` cases assert it on module IDs instead), and the
 *     case's own `devOnlyText` in the same two directions;
 *   - the module graph: tag sentinels absent/present, `absentModules` absent and
 *     `presentModules` present (tree-shaking across the re-export hops, sideEffects);
 *   - EXECUTING the bundle: the fixture asserts its own behaviour — the exports exist,
 *     `createI18n` builds an instance, `t()` translates (ICU in the base), formatters
 *     format, React/Vue render to a string — and prints `BUNDLER_MATRIX_OK <case>`.
 *
 * WHERE A BUNDLE RUNS follows what it was built for (`runtimeOf`):
 *   - "node": the webpack leg (`target: "node18"`, node resolve conditions) and every case
 *     with `target: "server"` (Next's server layer, the proxy). A fresh `node` process with
 *     NO DOM globals: a browser-global access in our server/SSR code fails the matrix.
 *   - "browser": every other vite build. Vite builds for the CLIENT (the `browser` resolve
 *     condition, Svelte compiled for the client), so the bundle runs in headless Chromium
 *     (Playwright, as the examples e2e and test-app smoke do), never in bare node. A client
 *     runtime may read `window`/`document` on import (Svelte 5.59 does), so bare node is the
 *     wrong place to run it. The two never share a process.
 * React, Vue and Solid run under both legs, so their render is still checked without a DOM
 * on the webpack leg; the Svelte cases are vite-only and load in the browser (mounting is
 * the e2e scenario's and the package's tests').
 * Each `*-dev-conditions` case imports whichever module carries its package's
 * dev-only diagnostic — `createNextI18n` for `@comvi/next`; on 0.8 the `react-format`,
 * `vue-format` and `solid-format` cases carry the binding's — so that module is in the graph under
 * both conditions.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const APP_DIR = path.join(SCRIPT_DIR, "app");
const OUT_DIR = path.join(APP_DIR, "out");

/**
 * The 0.8 core's subpath entries as module-ID fragments (each is an entry file of its own,
 * prod and `.dev` alike), and the `/format` entries of `@comvi/react` and `@comvi/vue`. An app that does not import
 * a subpath must not carry its module.
 */
const coreEntry08 = (name) => `@comvi${path.sep}core${path.sep}dist${path.sep}comvi-core-${name}`;
const CORE_SUBPATHS_08 = ["cdn", "plugins", "devtools", "format"].map(coreEntry08);
/**
 * The chunk that holds `core()`, the bindings' way to an instance. The base entry and
 * `/internal` share it since an instance carries its core's version. A binding that takes
 * from `/internal` only what lives in shared chunks leaves that entry a re-export shell,
 * which webpack and Rollup drop from the graph: those cases assert this chunk, not the entry.
 */
const CORE_INSTANCE_CHUNK_08 = `@comvi${path.sep}core${path.sep}dist${path.sep}chunks${path.sep}comvi-core-instance`;
const REACT_FORMAT_08 = `@comvi${path.sep}react${path.sep}dist${path.sep}comvi-react-format`;
/** The binding's one dev-only diagnostic (`useI18n()` outside a provider), development artifact only. */
const REACT_DEV_TEXT = "[@comvi/react] no <I18nProvider>";
/** `@comvi/vue`'s `/format` entry, and its dev-only diagnostic (no `app.use(i18n)` above). */
const VUE_FORMAT_08 = `@comvi${path.sep}vue${path.sep}dist${path.sep}comvi-vue-format`;
const VUE_DEV_TEXT = "[@comvi/vue] no app.use(i18n)";
/** `@comvi/solid`'s `/format` entry, and its dev-only diagnostic (no provider above). */
const SOLID_FORMAT_08 = `@comvi${path.sep}solid${path.sep}dist${path.sep}comvi-solid-format`;
const SOLID_DEV_TEXT = "[@comvi/solid] no <I18nProvider>";
/** `@comvi/svelte`'s `/format` entry and its `<T>`, published as sources. */
const SVELTE_FORMAT_08 = `@comvi${path.sep}svelte${path.sep}dist${path.sep}format.svelte`;
const SVELTE_T_08 = `@comvi${path.sep}svelte${path.sep}dist${path.sep}T.svelte`;
/** `@comvi/next`'s middleware module, per artifact (the `next-proxy` case). */
const NEXT_CREATE_MIDDLEWARE = `@comvi${path.sep}next${path.sep}dist${path.sep}middleware${path.sep}createMiddleware`;
const NEXT_CREATE_MIDDLEWARE_PROD = `${NEXT_CREATE_MIDDLEWARE}.js`;
const NEXT_CREATE_MIDDLEWARE_DEV = `${NEXT_CREATE_MIDDLEWARE}.dev.js`;
/** What a `proxy.ts` graph must never carry: core, or next's server half. */
const NEXT_PROXY_FORBIDDEN = [
  `@comvi${path.sep}core${path.sep}`,
  `@comvi${path.sep}next${path.sep}dist${path.sep}server${path.sep}`,
];
/**
 * Matrix cases. `sentinels` says what the bundler's module graph must look
 * like for core's tag-registration chunks (the `sideEffects` set):
 *   "present" — the app opted into tags (an explicit `@comvi/core/tags` import,
 *               or the non-exported CDN entry), so the registration chunk must
 *               survive;
 *   "absent"  — the app is on the base host without tags, so nothing may pull
 *               it. Core's base entry itself is present either way and is
 *               never what these assert.
 * `absentModules` adds case-specific module-ID fragments that must NOT appear
 * in the graph, and `presentModules` fragments that MUST (both matched as
 * substrings, so hashed chunk names are covered).
 *
 * PER-MODE VALUES. `sentinels`, `absentModules` and `presentModules` all accept
 * either one value for the whole matrix or a map keyed by `"<bundler>:<mode>"`
 * with a `default` fallback:
 *
 *   absentModules: { default: [], "webpack:production": [FRAGMENT] }
 *
 * That is what lets a case assert "absent in production, present in
 * development" — one claim per direction, because an absence and a presence are
 * different assertions and a module that is merely missing everywhere would
 * satisfy the absence alone.
 *
 * `devOnlyText` names strings that must appear in the DEVELOPMENT bundle's
 * output and must NOT appear in the production one — the dev-artifact claim
 * the module graph cannot express, because both artifacts of a package are the
 * same module by identity and only their TEXT differs. Output text is the
 * right instrument here and only here: the question is literally "did this
 * warning ship".
 *
 * `bundlers` narrows a case to a subset of the matrix legs (the webpack leg
 * has no svelte loader, and `@comvi/svelte` publishes `.svelte` and `.svelte.js`
 * sources a consumer's Svelte tooling compiles, so the Svelte cases are vite-only).
 *
 * `target: "server"` marks a case that models server code (see "WHERE A BUNDLE RUNS"
 * above): it runs in bare node on both legs.
 *
 * `packages` are the workspace tarballs the case needs, `deps` the framework
 * peer deps its bundle imports. A case carrying `pending` is declared but not
 * run — it asserts an absence the wrappers cannot yet deliver.
 */
const CASES = [
  // ---------------------------------------------------------------------
  // The 0.8 cases (lot 1c): the core on its own, the core with every subpath, and the
  // React binding with and without `/format`. Tags are in the core's base (R3-11): there
  // is no registration chunk, so their tag sentinels are trivially absent.
  {
    name: "core-default",
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08, coreEntry08("internal")],
    packages: ["@comvi/core"],
  },
  {
    name: "core-subpaths",
    sentinels: "absent",
    presentModules: CORE_SUBPATHS_08,
    packages: ["@comvi/core"],
  },
  {
    name: "react-default",
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08, REACT_FORMAT_08],
    presentModules: [CORE_INSTANCE_CHUNK_08],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    name: "react-format",
    sentinels: "absent",
    absentModules: CORE_SUBPATHS_08.filter((f) => !f.endsWith("format")),
    presentModules: [REACT_FORMAT_08, coreEntry08("format")],
    devOnlyText: [REACT_DEV_TEXT],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    name: "vue-default",
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08, VUE_FORMAT_08],
    presentModules: [CORE_INSTANCE_CHUNK_08],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    name: "vue-format",
    sentinels: "absent",
    absentModules: CORE_SUBPATHS_08.filter((f) => !f.endsWith("format")),
    presentModules: [VUE_FORMAT_08, coreEntry08("format")],
    devOnlyText: [VUE_DEV_TEXT],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    name: "solid-default",
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08, SOLID_FORMAT_08],
    presentModules: [coreEntry08("internal")],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    name: "solid-format",
    sentinels: "absent",
    absentModules: CORE_SUBPATHS_08.filter((f) => !f.endsWith("format")),
    presentModules: [SOLID_FORMAT_08, coreEntry08("format")],
    devOnlyText: [SOLID_DEV_TEXT],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    name: "svelte-default",
    bundlers: ["vite"],
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08, SVELTE_FORMAT_08],
    presentModules: [CORE_INSTANCE_CHUNK_08],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    // `/format` reaches the instance through the binding's cell alone: no `<T>` in its graph.
    name: "svelte-format",
    bundlers: ["vite"],
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08.filter((f) => !f.endsWith("format")), SVELTE_T_08],
    presentModules: [SVELTE_FORMAT_08, coreEntry08("format")],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    // The 0.8 server recipe under `react-server`: `createGetI18n` and `handover()`. The core
    // subpaths the app does not name stay out. The server `<I18nProvider>` renders the client
    // provider: that module is in the graph only as a client reference (client-references.mjs,
    // what Next's flight loader makes of it), never with its React imports.
    name: "next-server-on-default",
    target: "server",
    conditions: ["react-server"],
    sentinels: "absent",
    absentModules: [...CORE_SUBPATHS_08, REACT_FORMAT_08],
    presentModules: [coreEntry08("ssr"), CORE_INSTANCE_CHUNK_08],
    packages: ["@comvi/core", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  // ---------------------------------------------------------------------
  // The ONE-ENTRY recipes: each app imports from exactly ONE published package
  // ROOT and names `@comvi/core` nowhere. (`@comvi/next`'s two entries are a
  // client/server RUNTIME split, not a host tier.)
  //
  // These are THE gate for re-export-hop tree-shaking: a one-entry package
  // re-exports core's capability bindings from its PURE subpaths, and each case
  // asserts that the ones ITS app does not call never enter the module graph.
  // Core's base entry is present in all of them — the entry's `createI18n`
  // re-export is what these apps construct with.
  //
  // Development matters as much as production here: webpack runs with
  // `optimization.usedExports` off, so a re-export it cannot resolve is a
  // retained module. That is exactly how `export * from "@comvi/core"` kept the
  // root entry alive for vue, and why every entry uses NAMED re-exports only.
  {
    // The 0.8 client recipe: `<I18nProvider payload>` from `@comvi/next/client`. Next's server
    // half and the core subpaths the app does not name stay out.
    name: "next-client-default",
    sentinels: "absent",
    absentModules: [
      ...CORE_SUBPATHS_08,
      REACT_FORMAT_08,
      `@comvi${path.sep}next${path.sep}dist${path.sep}server`,
    ],
    presentModules: [coreEntry08("internal")],
    packages: ["@comvi/core", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  {
    // Next.js 16's `proxy.ts` entry (COM-96): `@comvi/next/proxy` and
    // `@comvi/next/middleware` resolve out of the packed tarball to ONE shared
    // `createMiddleware` (the fixture asserts identity at run time), and neither
    // drags in core or next's server half. The graph holds no core, so the core
    // dev marker cannot apply (`noCore`); the export condition is asserted on
    // module IDs instead: the `.dev.js` artifact in development, the plain one
    // in production. The one-line `proxy` re-export module itself is pruned by
    // both bundlers (side-effect free), so it is not a presence sentinel.
    name: "next-proxy",
    target: "server",
    noCore: true,
    sentinels: "absent",
    absentModules: {
      default: [NEXT_CREATE_MIDDLEWARE_DEV, ...NEXT_PROXY_FORBIDDEN],
      "webpack:development": NEXT_PROXY_FORBIDDEN,
      "vite:development": NEXT_PROXY_FORBIDDEN,
    },
    presentModules: {
      default: [NEXT_CREATE_MIDDLEWARE_PROD],
      "webpack:development": [NEXT_CREATE_MIDDLEWARE_DEV],
      "vite:development": [NEXT_CREATE_MIDDLEWARE_DEV],
    },
    packages: ["@comvi/core", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
];
const ACTIVE_CASES = CASES.filter((testCase) => testCase.pending === undefined);
const PENDING_CASES = CASES.filter((testCase) => testCase.pending !== undefined);
if (ACTIVE_CASES.length === 0) {
  console.log("bundler-matrix: every case is pending — nothing to run");
  for (const testCase of PENDING_CASES) console.log(`SKIP  ${testCase.name} — ${testCase.pending}`);
  process.exit(0);
}
const MODES = ["development", "production"];
const BUNDLERS = ["webpack", "vite"];

/** Dev-only string from the 0.8 core's instance chunk (the flat-catalog check): present
 *  iff the bundler resolved the "development" export condition. */
// A development-only text of core (flat.ts's collision report, lot 6a D1).
const DEV_MARKER = "is defined both as a flat key and through nesting";

const ALL_PACKAGES = [
  { name: "@comvi/core", dir: "packages/core", distProbe: "dist/comvi-core.js" },
  { name: "@comvi/react", dir: "packages/react", distProbe: "dist/comvi-react.js" },
  { name: "@comvi/solid", dir: "packages/solid", distProbe: "dist/comvi-solid.js" },
  { name: "@comvi/svelte", dir: "packages/svelte", distProbe: "dist/index.js" },
  { name: "@comvi/vue", dir: "packages/vue", distProbe: "dist/comvi-vue.js" },
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

// `--from-registry <dist-tag>`: measure what npm actually serves instead of
// the local dist — every tarball comes from
// `npm pack @comvi/<pkg>@<tag>`, the dist precondition is skipped, and
// everything downstream (R2 sideEffects gate, install, bundling, sentinels)
// runs unchanged on those registry tarballs.
const fromRegistryIdx = process.argv.indexOf("--from-registry");
const FROM_REGISTRY = fromRegistryIdx === -1 ? null : process.argv[fromRegistryIdx + 1];
if (fromRegistryIdx !== -1 && (!FROM_REGISTRY || FROM_REGISTRY.startsWith("--"))) {
  fail("--from-registry requires a dist-tag or version, e.g. --from-registry next");
}

// ---------------------------------------------------------------------------
// 0. Preconditions: dist must exist for everything we pack (local mode only).
// ---------------------------------------------------------------------------
if (!FROM_REGISTRY) {
  for (const pkg of PACKAGES) {
    const probe = path.join(REPO_ROOT, pkg.dir, pkg.distProbe);
    if (!fs.existsSync(probe)) {
      fail(
        `${pkg.name} has no build output (${pkg.dir}/${pkg.distProbe} missing).\n` +
          `Run: pnpm exec turbo run build ${PACKAGES.map((p) => `--filter ${p.name}`).join(" ")}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Pack the tarballs (local dist, or the registry under --from-registry).
// ---------------------------------------------------------------------------
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-bundler-matrix-"));
const tarballs = {};
if (FROM_REGISTRY) {
  console.log(`\n=== Fetching registry tarballs (@${FROM_REGISTRY}) into ${packDir}`);
  for (const pkg of PACKAGES) {
    const spec = `${pkg.name}@${FROM_REGISTRY}`;
    const out = execFileSync("npm", ["pack", spec, "--pack-destination", packDir, "--json"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    const entry = JSON.parse(out)[0];
    const file = path.join(packDir, entry.filename);
    if (!fs.existsSync(file)) fail(`npm pack ${spec} did not produce ${file}`);
    console.log(`  ${spec} -> ${entry.filename} (${entry.version})`);
    tarballs[pkg.name] = file;
  }
} else {
  console.log(`\n=== Packing tarballs into ${packDir}`);
  for (const pkg of PACKAGES) {
    run("pnpm", ["--filter", pkg.name, "exec", "pnpm", "pack", "--pack-destination", packDir], {
      cwd: REPO_ROOT,
    });
  }
  for (const pkg of PACKAGES) {
    const version = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, pkg.dir, "package.json"), "utf8"),
    ).version;
    const file = path.join(packDir, `${pkg.name.slice(1).replace("/", "-")}-${version}.tgz`);
    if (!fs.existsSync(file)) fail(`expected tarball not produced: ${file}`);
    tarballs[pkg.name] = file;
  }
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
// 0.8: tags are in the base (R3-11), so no chunk registers anything on import and the
// whole package is side-effect free. The 0.7 array of registration chunks is gone.
if (sideEffects !== false && (!Array.isArray(sideEffects) || sideEffects.length === 0)) {
  fail(
    `packed @comvi/core sideEffects must be false (0.8) or a non-empty array of registration chunks, got: ${JSON.stringify(sideEffects)}`,
  );
}
const missing = (sideEffects || []).filter(
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
console.log(
  sideEffects === false
    ? "sideEffects OK (false: no registration chunk in 0.8)"
    : `sideEffects OK (${sideEffects.length} entries all present in the tarball)`,
);

/**
 * Sentinel module IDs for the tag-registration graph, derived from the packed
 * `sideEffects` array itself (never a hand-copied list): a case's assertion is
 * "does the bundler's module graph contain one of these files", matched
 * against bundler-reported module identifiers — never against output text.
 */
const SENTINEL_FRAGMENTS = (sideEffects || []).map((entry) =>
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

/**
 * A case field that is either one value for the whole matrix or a map keyed by
 * `"<bundler>:<mode>"` with a `default` fallback. Arrays are values, not maps.
 */
function perMode(value, bundler, mode) {
  if (value === undefined || typeof value === "string" || Array.isArray(value)) return value;
  return value[`${bundler}:${mode}`] ?? value.default;
}

/** Where a case's bundle runs: "node" (no DOM) or "browser" (Chromium). See the header. */
function runtimeOf(bundler, testCase) {
  return bundler === "vite" && testCase.target !== "server" ? "browser" : "node";
}

function bundle(bundler, mode, fixture, conditions, runtime) {
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
  const env = { ...childEnv, BM_ENTRY: entry, BM_OUT: outFile, BM_RUNTIME: runtime };
  if (conditions !== undefined) env.BM_CONDITIONS = conditions.join(",");
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

/** Runs a bundle in a fresh `node` process: no DOM globals. */
function execInNode(outFile, fixture) {
  const exec = spawnSync(process.execPath, [outFile], { encoding: "utf8" });
  return {
    ok: exec.status === 0 && exec.stdout.includes(`BUNDLER_MATRIX_OK ${fixture}`),
    output: `(exit ${exec.status})\n${exec.stdout}${exec.stderr}`,
  };
}

/**
 * Runs a bundle as a module script of a page in headless Chromium, served from a routed
 * origin (no server, no file:// module restrictions). It passes when the fixture logged its
 * OK line and the page raised no error by the time it finished loading.
 */
let browser;
async function execInBrowser(outFile, fixture) {
  if (browser === undefined) {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  }
  const page = await browser.newPage();
  const lines = [];
  const errors = [];
  let ok = false;
  let settle;
  const settled = new Promise((resolve) => (settle = resolve));
  page.on("console", (message) => {
    lines.push(`${message.type()}: ${message.text()}`);
    if (message.text() === `BUNDLER_MATRIX_OK ${fixture}`) {
      ok = true;
      settle();
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.stack ?? String(error));
    settle();
  });
  const origin = "http://bundler-matrix.localhost";
  await page.route(`${origin}/**`, (route) => {
    const name = new URL(route.request().url()).pathname.slice(1);
    if (name === "") {
      return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><script type="module" src="/${path.basename(outFile)}"></script>`,
      });
    }
    const file = path.join(path.dirname(outFile), name);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ contentType: "text/javascript", body: fs.readFileSync(file) });
  });
  try {
    await page.goto(`${origin}/`, { waitUntil: "load" });
    await Promise.race([settled, new Promise((resolve) => setTimeout(resolve, 15_000))]);
  } catch (error) {
    errors.push(String(error));
  } finally {
    await page.close();
  }
  return {
    ok: ok && errors.length === 0,
    output: `(chromium)\n${[...lines, ...errors].join("\n")}`,
  };
}

const failures = [];
const results = [];
for (const bundler of BUNDLERS) {
  for (const mode of MODES) {
    for (const testCase of ACTIVE_CASES) {
      const fixture = testCase.name;
      if (testCase.bundlers !== undefined && !testCase.bundlers.includes(bundler)) {
        console.log(
          `SKIP  ${bundler} × ${mode} × ${fixture} — case is ${testCase.bundlers.join("/")}-only`,
        );
        continue;
      }
      const label = `${bundler} × ${mode} × ${fixture}`;
      const runtime = runtimeOf(bundler, testCase);
      const { outFile, moduleIds } = bundle(bundler, mode, fixture, testCase.conditions, runtime);

      // Export-condition check: dev builds must contain the dev-only core
      // chunk marker, prod builds must not.
      const content = fs.readFileSync(outFile, "utf8");
      // A `noCore` case carries no core, so its condition is asserted on its
      // own module IDs (`presentModules` / `absentModules`) instead.
      const hasDevMarker = content.includes(DEV_MARKER);
      if (!testCase.noCore && mode === "development" && !hasDevMarker) {
        failures.push(`${label}: development condition not resolved (dev marker missing)`);
      }
      if (mode === "production" && hasDevMarker) {
        failures.push(`${label}: production bundle contains the development build of core`);
      }

      // Per-case dev-only TEXT: the same string asserted in both directions,
      // because a string missing everywhere would satisfy the absence alone.
      const devTextWrong = (testCase.devOnlyText ?? []).filter(
        (text) => content.includes(text) !== (mode === "development"),
      );
      if (devTextWrong.length > 0) {
        failures.push(
          mode === "development"
            ? `${label}: development bundle is MISSING dev-only text ${devTextWrong
                .map((t) => JSON.stringify(t))
                .join(
                  ", ",
                )} — the "development" artifact of the binding was not resolved, so its IS_DEV diagnostics are dead`
            : `${label}: production bundle CONTAINS dev-only text ${devTextWrong
                .map((t) => JSON.stringify(t))
                .join(", ")}`,
        );
      }

      // Module-graph check: tag registration is pulled in exactly when the
      // app asked for tags. Module IDs, never output-text substrings.
      const expectTags = perMode(testCase.sentinels, bundler, mode);
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

      // Case-specific absences: module-ID fragments the graph must not
      // contain at all.
      const leaked = (perMode(testCase.absentModules, bundler, mode) ?? []).flatMap((fragment) =>
        moduleIds.filter((id) => id.includes(fragment)),
      );
      if (leaked.length > 0) {
        failures.push(`${label}: modules expected absent, found ${leaked.join(", ")}`);
      }

      // Case-specific presences: fragments the graph MUST contain. An absence
      // assertion alone cannot tell "correctly excluded" from "never built".
      const absent = (perMode(testCase.presentModules, bundler, mode) ?? []).filter(
        (fragment) => !moduleIds.some((id) => id.includes(fragment)),
      );
      if (absent.length > 0) {
        failures.push(`${label}: modules expected present, none matched ${absent.join(", ")}`);
      }

      const exec =
        runtime === "browser"
          ? await execInBrowser(outFile, fixture)
          : execInNode(outFile, fixture);
      const ran = exec.ok;
      if (!ran) failures.push(`${label}: bundle execution failed in ${runtime} ${exec.output}`);
      const ok =
        ran &&
        sentinelsOk &&
        leaked.length === 0 &&
        absent.length === 0 &&
        devTextWrong.length === 0;
      results.push(`${ok ? "PASS" : "FAIL"}  ${label}`);
      console.log(`${ok ? "PASS" : "FAIL"}  ${label} [tags ${expectTags}, ran in ${runtime}]`);
    }
  }
}
await browser?.close();

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
