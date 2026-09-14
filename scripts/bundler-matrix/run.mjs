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
 * 2. Assert every entry of core's `sideEffects` array names a file that
 *    actually exists in the packed tarball — fails when rolldown renames the
 *    register-tags chunk on upgrade.
 * 3. Install the tarballs into the standalone consumer app in ./app (npm, not
 *    pnpm — deliberately outside the workspace), bundle each case with
 *    webpack AND vite under development AND production modes, run every
 *    bundle in plain node, and assert both tag-activation channels:
 *    ambient (a `@comvi/core/tags` import — the app's own, the one a wrapper
 *    `<T>` module carries, or the non-exported CDN entry's; the base root
 *    entry registers nothing) and per-call (tagInterpolation.extensions). See
 *    app/src/*.mjs for the assertions.
 * 4. Assert per case whether the tag-registration modules are in the bundler's
 *    MODULE GRAPH (webpack `--json` stats `modules[].identifier`; vite via the
 *    `bm-module-ids` config plugin) — module IDs, never output-text substrings.
 * 5. Assert, for the `*-dev-conditions` cases only, which ARTIFACT of a
 *    package the bundler resolved, by looking for a dev-only warning's TEXT in
 *    the bundle (`devOnlyText`). This is the one claim the module graph cannot
 *    carry: a package's prod and dev artifacts are the same module by
 *    identity, and only their content differs.
 *
 * Wrapper <T> rendering is NOT exercised (needs a DOM/renderer); wrapper
 * tarballs are still packed, installed, and bundled (app/src/wrappers.mjs).
 * Each `*-dev-conditions` case imports whichever module carries its binding's
 * dev-only diagnostic — `T` for the four wrappers, `createNextI18n` for
 * `@comvi/next` — so that module is in the graph under both conditions.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const APP_DIR = path.join(SCRIPT_DIR, "app");
const OUT_DIR = path.join(APP_DIR, "out");

// There is deliberately no ROOT_ENTRY constant: `comvi-core.js` is the BASE
// host — present in every comvi graph, side-effect-free, resolved per condition
// — so its presence proves nothing. What carries the "no full graph leaked"
// claim instead: the tag-registration sentinels (derived from the packed
// `sideEffects` array below) and `UNUSED_CAPABILITY_SUBPATHS`.

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
 * not touch. LOADER_SUBPATH is deliberately not part of it: the cases using this
 * constant call `attachLoader` or the configured `loader(map)`. These fragments
 * staying OUT of the graph is the whole claim "an unused named re-export costs
 * nothing".
 */
const UNUSED_CAPABILITY_SUBPATHS = [...ICU_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH];
/**
 * The in-context editor's heaviest chunk (~100 kB gz), reached through a
 * dynamic `import()` inside the editor's Core chunk. It is in the graph under
 * the default export condition and must be gone under `production`, where the
 * package's exports map swaps the whole entry for a no-op stub.
 */
const EDITOR_MODAL_CHUNK = [
  `@comvi${path.sep}plugin-in-context-editor${path.sep}dist${path.sep}EditModal-`,
];
/**
 * The `<T>` module of each binding, as a module-ID fragment. The `.dev`
 * artifact's chunk carries the same fragment, so one entry covers both
 * conditions. Used by the `*-dev-conditions` cases as the POSITIVE half of
 * their claim: a warning missing from the production bundle only means
 * something if the module that would have carried it is in the graph.
 */
const BINDING_T_MODULE = {
  react: [`@comvi${path.sep}react${path.sep}dist${path.sep}chunks${path.sep}comvi-react-T`],
  solid: [`@comvi${path.sep}solid${path.sep}dist${path.sep}chunks${path.sep}comvi-solid-T`],
  svelte: [`@comvi${path.sep}svelte${path.sep}dist${path.sep}T.svelte`],
  vue: [`@comvi${path.sep}vue${path.sep}dist${path.sep}chunks${path.sep}comvi-vue-T`],
};
/**
 * `@comvi/next`'s composed-root module, the one that carries its `IS_DEV`
 * diagnostic. `preserveModules` names it per module rather than per chunk, and
 * the fragment covers `createNextI18n.js` and `createNextI18n.dev.js` alike.
 */
const NEXT_COMPOSED_ROOT_MODULE = [`@comvi${path.sep}next${path.sep}dist${path.sep}createNextI18n`];
/**
 * The `<T raw>` deprecation, verbatim and identical in all four bindings. It
 * is guarded by each binding's `IS_DEV`, so it is in the DEVELOPMENT artifact
 * only — which is the whole point: before the `development` export condition
 * (and, for svelte, the `#dev-warn` imports entry) existed, this string was in
 * NO artifact a consumer could resolve, in any mode.
 */
const T_RAW_DEPRECATION = "<T raw> is deprecated";
/**
 * `@comvi/next`'s one `IS_DEV` diagnostic: the readable half of the
 * `E_USE_HOST_IDENTITY` error `createNextI18n(…).use` throws when an installer
 * hands back a different object. The production family throws the bare code
 * instead, so this text is a development-artifact marker in the same way.
 * `next-dev-conditions.mjs` deliberately never quotes it.
 */
const NEXT_USE_IDENTITY_HINT = ".use(installer) must return the host it was given";
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
 * satisfy the absence alone. `editor-production` is the case that needs it.
 *
 * `devOnlyText` names strings that must appear in the DEVELOPMENT bundle's
 * output and must NOT appear in the production one — the dev-artifact claim
 * the module graph cannot express, because both artifacts of a package are the
 * same module by identity and only their TEXT differs. Output text is the
 * right instrument here and only here: the question is literally "did this
 * warning ship".
 *
 * `bundlers` narrows a case to a subset of the matrix legs. Only
 * `svelte-dev-conditions` uses it: it imports `T`, and the webpack leg has no
 * svelte loader on purpose (every other svelte case relies on webpack pruning
 * the `T.svelte` re-export WITHOUT resolving it).
 *
 * `packages` are the workspace tarballs the case needs, `deps` the framework
 * peer deps its bundle imports. A case carrying `pending` is declared but not
 * run — it asserts an absence the wrappers cannot yet deliver.
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
    // The companion-only server graph must drop next's own composed-host module
    // (`createNextI18n.js`) and the unused capability subpaths. That holds in
    // DEVELOPMENT too, where webpack keeps the sibling `./server` re-exports
    // alive — which is the point: the server helpers name only base bindings
    // from `@comvi/core`, so the composed builder is absent at the SOURCE
    // instead of relying on the bundler to prune it. `@comvi/core` itself is
    // present — it is the base host this fixture composes on.
    name: "next-server-on-default",
    sentinels: "absent",
    absentModules: [
      ...UNUSED_CAPABILITY_SUBPATHS,
      `@comvi${path.sep}next${path.sep}dist${path.sep}createNextI18n.js`,
    ],
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
    name: "react-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    // The POSITIVE half of the ICU claim: a size sentinel can only assert a
    // module ABSENT, so this case proves ICU's presence instead — it runs the
    // bundle and formats a plural for real. Same for the icu twins below.
    name: "react-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    name: "solid-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    name: "solid-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    name: "svelte-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    name: "svelte-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    // Core's base entry is present — vue's preset constructs on it — so it is
    // never an absence sentinel here.
    name: "vue-default",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS, ...LOADER_SUBPATH],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    name: "vue-icu",
    sentinels: "absent",
    absentModules: [...LOADER_SUBPATH, ...PLUGINS_SUBPATH, ...DEVTOOLS_SUBPATH],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // Vue is the one binding with TWO construction paths on one entry (the
    // wrapper preset, `vue-default`, and this injected-host escape hatch), so it
    // keeps a case of its own. It is also the only case where a capability
    // re-export hop is actually CALLED through a wrapper root.
    name: "vue-composed",
    sentinels: "absent",
    absentModules: [...UNUSED_CAPABILITY_SUBPATHS],
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // This entry re-exports `T` through `@comvi/react`, whose component reaches
    // the pure rich-text seam rather than ambient registration — which is why it
    // needs no webpack-development exception for the tag sentinels.
    name: "next-client-default",
    sentinels: "absent",
    absentModules: [
      ...UNUSED_CAPABILITY_SUBPATHS,
      ...LOADER_SUBPATH,
      `@comvi${path.sep}next${path.sep}dist${path.sep}server${path.sep}`,
    ],
    packages: ["@comvi/core", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  {
    name: "next-client-icu",
    sentinels: "absent",
    absentModules: [
      ...LOADER_SUBPATH,
      ...PLUGINS_SUBPATH,
      ...DEVTOOLS_SUBPATH,
      `@comvi${path.sep}next${path.sep}dist${path.sep}server${path.sep}`,
    ],
    packages: ["@comvi/core", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  // ---------------------------------------------------------------------
  // The DEV-CONDITIONS recipes: one per binding, each importing `T` from the
  // one published root and defining NO `__DEV__` anywhere (neither bundler
  // config does). `devOnlyText` then asserts the `<T raw>` deprecation is in
  // the development bundle and out of the production one.
  //
  // These four are THE gate for "the dev-only diagnostics are reachable at
  // all". Every binding used to bake `__DEV__: false` into its single
  // artifact, so the warnings were dead in the published packages in BOTH
  // modes — a defect no existing case could see, because the module graph is
  // identical either way and only the resolved artifact's text differs.
  {
    name: "react-dev-conditions",
    sentinels: "absent",
    devOnlyText: [T_RAW_DEPRECATION],
    presentModules: BINDING_T_MODULE.react,
    packages: ["@comvi/core", "@comvi/react"],
    deps: ["react"],
  },
  {
    name: "solid-dev-conditions",
    sentinels: "absent",
    devOnlyText: [T_RAW_DEPRECATION],
    presentModules: BINDING_T_MODULE.solid,
    packages: ["@comvi/core", "@comvi/solid"],
    deps: ["solid-js"],
  },
  {
    // Vite only: this case imports `T`, and the webpack leg has no svelte
    // loader by design — see the fixture's header.
    name: "svelte-dev-conditions",
    bundlers: ["vite"],
    sentinels: "absent",
    devOnlyText: [T_RAW_DEPRECATION],
    presentModules: BINDING_T_MODULE.svelte,
    packages: ["@comvi/core", "@comvi/svelte"],
    deps: ["svelte"],
  },
  {
    name: "vue-dev-conditions",
    sentinels: "absent",
    devOnlyText: [T_RAW_DEPRECATION],
    presentModules: BINDING_T_MODULE.vue,
    packages: ["@comvi/core", "@comvi/vue"],
    deps: ["vue"],
  },
  {
    // `@comvi/next`, on its ROOT entry: `createNextI18n` — the only module
    // with an `IS_DEV` diagnostic — ships from `./index` alone. Tags are
    // PRESENT here, unlike every other dev-conditions case: the composed root
    // bare-imports `@comvi/core/tags`, as the 0.4 root did.
    name: "next-dev-conditions",
    sentinels: "present",
    devOnlyText: [NEXT_USE_IDENTITY_HINT],
    presentModules: NEXT_COMPOSED_ROOT_MODULE,
    packages: ["@comvi/core", "@comvi/react", "@comvi/next"],
    deps: ["react", "next"],
  },
  {
    // The editor's production exclusion, as a gate rather than a claim. The
    // package's exports map answers the `production` condition with a no-op
    // stub that imports nothing, so a production app that composes
    // `inContextEditor(…)` carries neither the editor runtime nor the
    // capability subpaths it would otherwise pull in. Development must keep
    // the modal: a stub on BOTH conditions would satisfy the absence and
    // silently ship an editor that never opens.
    //
    // The fixture composes and runs the host in both modes, so the identity
    // the two entries share (`.use(inContextEditor())` returns the host) is
    // exercised as well as the graph.
    name: "editor-production",
    sentinels: "absent",
    absentModules: {
      default: [],
      "webpack:production": EDITOR_MODAL_CHUNK,
      "vite:production": EDITOR_MODAL_CHUNK,
    },
    presentModules: {
      default: [],
      "webpack:development": EDITOR_MODAL_CHUNK,
      "vite:development": EDITOR_MODAL_CHUNK,
    },
    packages: ["@comvi/core", "@comvi/plugin-in-context-editor"],
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
  { name: "@comvi/next", dir: "packages/next", distProbe: "dist/server.js" },
  {
    name: "@comvi/plugin-in-context-editor",
    dir: "packages/plugin-in-context-editor",
    distProbe: "dist/index.es.js",
  },
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

/**
 * A case field that is either one value for the whole matrix or a map keyed by
 * `"<bundler>:<mode>"` with a `default` fallback. Arrays are values, not maps.
 */
function perMode(value, bundler, mode) {
  if (value === undefined || typeof value === "string" || Array.isArray(value)) return value;
  return value[`${bundler}:${mode}`] ?? value.default;
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
      if (testCase.bundlers !== undefined && !testCase.bundlers.includes(bundler)) {
        console.log(
          `SKIP  ${bundler} × ${mode} × ${fixture} — case is ${testCase.bundlers.join("/")}-only`,
        );
        continue;
      }
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

      const exec = spawnSync(process.execPath, [outFile], { encoding: "utf8" });
      const ran = exec.status === 0 && exec.stdout.includes(`BUNDLER_MATRIX_OK ${fixture}`);
      if (!ran) {
        failures.push(
          `${label}: bundle execution failed (exit ${exec.status})\n${exec.stdout}${exec.stderr}`,
        );
      }
      const ok =
        ran &&
        sentinelsOk &&
        leaked.length === 0 &&
        absent.length === 0 &&
        devTextWrong.length === 0;
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
