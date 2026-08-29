import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import zlib from "node:zlib";
import { createRequire } from "node:module";

/**
 * Bundle-size gate: bundles each scripts/size-fixtures/ entry with esbuild and
 * asserts min+gz against scripts/size-budgets.json.
 *
 * Entries resolve through the PUBLISHED `exports` map, never a dist/ path, so a
 * broken exports/conditions matrix fails the gate. `pending: true` budgets are
 * declared slots that gate nothing. A fixture may also declare
 * `sentinelModules` + `expectSentinels`, asserting module-graph membership from
 * the metafile — module IDs, never output-text substrings.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const requireFromRoot = createRequire(path.join(REPO_ROOT, "package.json"));

/** Conditions a production bundler applies. Deliberately excludes "development" and "types". */
export const PRODUCTION_CONDITIONS = ["production", "import", "module", "browser"];

/**
 * Workspace packages whose imports the fixtures resolve through the PUBLISHED
 * exports map. Framework wrappers are here because the framework fixtures
 * (scripts/size-fixtures/framework/) measure wrapper-on-core graphs;
 * locale-routing and plugin-fetch-loader are transitive @comvi/next graph
 * members. Framework peer deps (react, vue, solid-js, svelte, next, nuxt)
 * are NOT here — fixtures mark them external, so only the comvi graph counts.
 */
export const DEFAULT_PACKAGE_ROOTS = Object.fromEntries(
  [
    "core",
    "react",
    "solid",
    "svelte",
    "vue",
    "next",
    "nuxt",
    "locale-routing",
    "plugin-fetch-loader",
    "plugin-locale-detector",
    "plugin-in-context-editor",
  ].map((dir) => [`@comvi/${dir}`, path.join(REPO_ROOT, "packages", dir)]),
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Splits "@scope/pkg/sub/path" into the package name and an exports-map subpath key. */
export function parseSpecifier(specifier) {
  const parts = specifier.split("/");
  const nameLength = specifier.startsWith("@") ? 2 : 1;
  if (parts.length < nameLength) throw new Error(`Invalid specifier: ${specifier}`);
  const packageName = parts.slice(0, nameLength).join("/");
  const rest = parts.slice(nameLength).join("/");
  return { packageName, subpath: rest ? `./${rest}` : "." };
}

function resolveExportTarget(target, conditions) {
  if (typeof target === "string") return target;
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const resolved = resolveExportTarget(candidate, conditions);
      if (resolved !== undefined) return resolved;
    }
    return undefined;
  }
  if (target !== null && typeof target === "object") {
    for (const [condition, value] of Object.entries(target)) {
      if (condition === "default" || conditions.includes(condition)) {
        const resolved = resolveExportTarget(value, conditions);
        if (resolved !== undefined) return resolved;
      }
    }
    return undefined;
  }
  return undefined;
}

/**
 * Node subpath-pattern lookup ("./runtime/*": "./dist/runtime/*"). Returns the
 * matching target plus the substring captured by `*`, longest prefix winning
 * (Node's PATTERN_KEY_COMPARE). @comvi/nuxt publishes its runtime this way,
 * so the nuxt fixtures reach the real runtime graph through the same
 * published-exports discipline as every other entry.
 */
function matchSubpathPattern(exportsField, subpath) {
  let best;
  for (const key of Object.keys(exportsField)) {
    const star = key.indexOf("*");
    if (star === -1 || key.indexOf("*", star + 1) !== -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    // An empty `*` capture names a directory, never a published file.
    if (subpath.length <= prefix.length + suffix.length) continue;
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    if (best !== undefined && prefix.length <= best.prefix.length) continue;
    best = {
      prefix,
      target: exportsField[key],
      match: subpath.slice(prefix.length, subpath.length - suffix.length),
    };
  }
  return best;
}

/**
 * Resolves an exports-map subpath ("." or "./slim") against a package.json
 * object under the given conditions. Returns the target path relative to the
 * package root, or undefined when the subpath is not exported. The legacy
 * `module`/`main` fields are intentionally never consulted: published
 * consumers of a package with an `exports` map cannot reach them.
 */
export function resolvePackageExport(pkgJson, subpath, conditions = PRODUCTION_CONDITIONS) {
  const exportsField = pkgJson.exports;
  if (exportsField === undefined || exportsField === null) {
    throw new Error(
      `${pkgJson.name}: no "exports" map; the size gate only measures published entry points`,
    );
  }
  let target;
  let patternMatch;
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    target = subpath === "." ? exportsField : undefined;
  } else {
    const keys = Object.keys(exportsField);
    const isSubpathMap = keys.every((key) => key.startsWith("."));
    if (isSubpathMap) {
      target = exportsField[subpath];
      if (target === undefined) {
        const pattern = matchSubpathPattern(exportsField, subpath);
        if (pattern !== undefined) ({ target, match: patternMatch } = pattern);
      }
    } else {
      target = subpath === "." ? exportsField : undefined;
    }
  }
  if (target === undefined) return undefined;
  const resolved = resolveExportTarget(target, conditions);
  if (resolved === undefined) {
    throw new Error(
      `${pkgJson.name}: subpath "${subpath}" exists in the exports map but no target matches conditions [${conditions.join(", ")}]`,
    );
  }
  return patternMatch === undefined ? resolved : resolved.split("*").join(patternMatch);
}

/** Throws when a resolved export target would not be included in the published tarball. */
export function assertPublishedFile(pkgJson, relTarget) {
  const files = pkgJson.files;
  if (!Array.isArray(files)) return; // no "files" allowlist: everything ships
  const normalized = relTarget.replace(/^\.\//, "");
  const covered = files.some((entry) => {
    const prefix = entry.replace(/^\.\//, "").replace(/\/$/, "");
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
  if (!covered) {
    throw new Error(
      `${pkgJson.name}: exports target "${relTarget}" is outside the published "files" allowlist [${files.join(", ")}]`,
    );
  }
}

function readPackageJson(pkgDir) {
  return JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
}

/**
 * Resolves a bare specifier through the published exports map of one of the
 * given workspace packages. Returns an absolute file path, or undefined when
 * the subpath is not exported (yet).
 */
export function resolveFixtureSpecifier(
  specifier,
  packageRoots,
  conditions = PRODUCTION_CONDITIONS,
) {
  const { packageName, subpath } = parseSpecifier(specifier);
  const pkgDir = packageRoots[packageName];
  if (!pkgDir) throw new Error(`No package root configured for ${packageName}`);
  const pkgJson = readPackageJson(pkgDir);
  const relTarget = resolvePackageExport(pkgJson, subpath, conditions);
  if (relTarget === undefined) return undefined;
  assertPublishedFile(pkgJson, relTarget);
  return path.resolve(pkgDir, relTarget);
}

/**
 * Whether the published `sideEffects` field marks `relTarget` as side-effectful.
 *
 * esbuild applies this itself for paths IT resolves, but a PLUGIN-resolved path
 * defaults to side-effectful — so without this, an entry a real bundler prunes
 * stays in the measured graph, inflating both the bytes and the sentinel
 * verdict.
 */
export function hasDeclaredSideEffects(pkgJson, relTarget) {
  const declared = pkgJson.sideEffects;
  if (declared === undefined) return true;
  if (declared === false) return false;
  if (!Array.isArray(declared)) return true;
  const normalized = relTarget.replace(/^\.\//, "");
  return declared.some((pattern) => {
    const body = pattern.replace(/^\.\//, "");
    const source = body
      .split("**")
      .map((segment) =>
        segment
          .split("*")
          .map((literal) => escapeRegExp(literal))
          .join("[^/]*"),
      )
      .join(".*");
    return new RegExp(`^${source}$`).test(normalized);
  });
}

/**
 * esbuild plugin that routes every import of the configured packages through
 * resolvePackageExport, so bundles see exactly what a published consumer sees.
 */
export function exportsMapPlugin(packageRoots, conditions = PRODUCTION_CONDITIONS) {
  const names = Object.keys(packageRoots);
  const filter = new RegExp(`^(?:${names.map(escapeRegExp).join("|")})(?:/|$)`);
  return {
    name: "published-exports-map",
    setup(build) {
      build.onResolve({ filter }, (args) => {
        const resolved = resolveFixtureSpecifier(args.path, packageRoots, conditions);
        if (resolved === undefined) {
          return {
            errors: [
              {
                text: `"${args.path}" does not resolve through the published exports map (missing subpath)`,
              },
            ],
          };
        }
        const { packageName, subpath } = parseSpecifier(args.path);
        const pkgJson = readPackageJson(packageRoots[packageName]);
        const relTarget = resolvePackageExport(pkgJson, subpath, conditions);
        return { path: resolved, sideEffects: hasDeclaredSideEffects(pkgJson, relTarget) };
      });
    },
  };
}

/**
 * esbuild loader for the Svelte SFCs a published @comvi/svelte consumer
 * compiles with their own svelte plugin (dist/T.svelte is reachable from the
 * package index, so even a no-<T> fixture has to parse it). The compiler is
 * resolved from the @comvi/svelte package itself — the same version the
 * package is built and tested against.
 */
export function svelteComponentPlugin(packageRoots) {
  return {
    name: "svelte-component",
    setup(build) {
      let compile;
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        if (compile === undefined) {
          const pkgDir = packageRoots["@comvi/svelte"];
          if (pkgDir === undefined) {
            return { errors: [{ text: "no @comvi/svelte package root: cannot compile .svelte" }] };
          }
          compile = createRequire(path.join(pkgDir, "package.json"))("svelte/compiler").compile;
        }
        const source = await fs.promises.readFile(args.path, "utf8");
        const { js } = compile(source, {
          filename: args.path,
          generate: "client",
          dev: false,
        });
        return { contents: js.code, loader: "js" };
      });
    },
  };
}

/**
 * esbuild metafile -> repo-relative POSIX module IDs that SURVIVED into the
 * bundle.
 *
 * Derived from `outputs[*].inputs`, never from the top-level `metafile.inputs`
 * map: the latter lists every file esbuild PARSED, including modules that
 * tree-shaking removed completely. Reading it made every sentinel a false
 * positive — a `sideEffects:false` re-export chain esbuild had fully dropped
 * still "found" its module ID, which is exactly the absence these fixtures
 * exist to prove.
 */
function metafileModuleIds(metafile) {
  const retained = new Set();
  for (const output of Object.values(metafile.outputs)) {
    for (const input of Object.keys(output.inputs ?? {})) {
      retained.add(path.relative(REPO_ROOT, path.resolve(input)).split(path.sep).join("/"));
    }
  }
  return [...retained].sort();
}

/**
 * Bundles one fixture entry file. Returns min+gz byte sizes and the module IDs
 * esbuild recorded in the metafile (repo-relative), which is what the tags
 * pinning probe asserts on — module-graph membership, never output text.
 */
export async function measureFixture({
  entryFile,
  packageRoots,
  conditions = PRODUCTION_CONDITIONS,
  define = {},
  external = [],
}) {
  const esbuild = requireFromRoot("esbuild");
  const result = await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    minify: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2020",
    logLevel: "silent",
    metafile: true,
    external,
    define: {
      __DEV__: "false",
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...define,
    },
    plugins: [exportsMapPlugin(packageRoots, conditions), svelteComponentPlugin(packageRoots)],
  });
  const code = result.outputFiles[0].contents;
  const gzipped = zlib.gzipSync(code, { level: 9 });
  return {
    minBytes: code.byteLength,
    gzipBytes: gzipped.byteLength,
    moduleIds: metafileModuleIds(result.metafile),
  };
}

export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB (${bytes} B)`;
}

function fixtureEntries(entry) {
  return Array.isArray(entry) ? entry : [entry];
}

/**
 * Evaluates a fixture's `sentinelModules` expectation against the measured
 * module graph. Returns undefined when the fixture declares none.
 */
function checkSentinels(fixture, moduleIds) {
  const sentinels = fixture.sentinelModules;
  if (sentinels === undefined) return undefined;
  const expect = fixture.expectSentinels;
  if (expect !== "present" && expect !== "absent") {
    throw new Error(
      `${fixture.name}: "sentinelModules" requires "expectSentinels": "present" | "absent"`,
    );
  }
  const found = sentinels.filter((sentinel) => moduleIds.includes(sentinel));
  const ok = expect === "present" ? found.length > 0 : found.length === 0;
  return { expect, found, ok };
}

/**
 * Runs every budget entry. Returns per-fixture results with a status:
 * - "pass" / "fail": gated fixture — measured against gzipBudgetBytes and/or
 *   its `sentinelModules` expectation
 * - "informational": measured, printed, not gated (no budget, no sentinels)
 * - "pending": slot declared but not measurable yet; skipped with a notice
 *   naming what graduates it (`pendingReason`, required)
 */
export async function runSizeCheck({
  budgets,
  fixturesDir,
  packageRoots = DEFAULT_PACKAGE_ROOTS,
  conditions = PRODUCTION_CONDITIONS,
  define = {},
} = {}) {
  const results = [];
  for (const fixture of budgets.fixtures) {
    const specifiers = fixtureEntries(fixture.entry);
    const unresolved = specifiers.filter(
      (specifier) => resolveFixtureSpecifier(specifier, packageRoots, conditions) === undefined,
    );
    // `pending` is declared, never inferred: a slot can resolve through the
    // exports map yet still measure the wrong graph, so resolution alone
    // cannot decide measurability.
    if (fixture.pending) {
      if (typeof fixture.pendingReason !== "string" || fixture.pendingReason.length === 0) {
        throw new Error(
          `${fixture.name}: "pending": true requires a "pendingReason" naming what graduates the slot`,
        );
      }
      results.push({
        name: fixture.name,
        status: "pending",
        reason: fixture.pendingReason,
        unresolved,
      });
      continue;
    }
    if (unresolved.length > 0) {
      throw new Error(
        `${fixture.name}: entry specifier(s) [${unresolved.join(", ")}] do not resolve through the published exports map`,
      );
    }
    const entryFile = path.join(fixturesDir, fixture.fixture);
    const { minBytes, gzipBytes, moduleIds } = await measureFixture({
      entryFile,
      packageRoots,
      conditions,
      define,
      external: fixture.external,
    });
    const sentinels = checkSentinels(fixture, moduleIds);
    const budget = fixture.gzipBudgetBytes;
    if (typeof budget !== "number" && sentinels === undefined) {
      results.push({ name: fixture.name, status: "informational", minBytes, gzipBytes, moduleIds });
      continue;
    }
    const withinBudget = typeof budget !== "number" || gzipBytes <= budget;
    results.push({
      name: fixture.name,
      status: withinBudget && (sentinels === undefined || sentinels.ok) ? "pass" : "fail",
      minBytes,
      gzipBytes,
      moduleIds,
      budget,
      sentinels,
    });
  }
  return results;
}

/** One-line sentinel verdict appended to a gated fixture's report line. */
function renderSentinels(sentinels) {
  if (sentinels === undefined) return "";
  const found = sentinels.found.length > 0 ? sentinels.found.join(", ") : "none";
  return ` | sentinel modules expected ${sentinels.expect}, found: ${found}`;
}

export function renderResults(results) {
  const lines = [];
  for (const result of results) {
    switch (result.status) {
      case "pending": {
        const unresolved =
          result.unresolved.length > 0
            ? ` [${result.unresolved.join(", ")}] not exported yet;`
            : "";
        lines.push(
          `~ ${result.name}: pending —${unresolved} ${result.reason}; ` +
            `gate activates when the slot graduates (drop "pending" in size-budgets.json)`,
        );
        break;
      }
      case "informational":
        lines.push(
          `i ${result.name}: ${formatBytes(result.gzipBytes)} min+gz (${formatBytes(result.minBytes)} min) — informational, not gated`,
        );
        break;
      case "pass":
        lines.push(
          `+ ${result.name}: ${formatBytes(result.gzipBytes)} min+gz` +
            (typeof result.budget === "number" ? ` <= budget ${formatBytes(result.budget)}` : "") +
            ` (${formatBytes(result.minBytes)} min)${renderSentinels(result.sentinels)}`,
        );
        break;
      case "fail":
        lines.push(
          `x ${result.name}: ${formatBytes(result.gzipBytes)} min+gz` +
            (typeof result.budget === "number" ? ` vs budget ${formatBytes(result.budget)}` : "") +
            ` (${formatBytes(result.minBytes)} min)${renderSentinels(result.sentinels)}`,
        );
        break;
    }
  }
  return lines.join("\n");
}

/** `--modules` prints the comvi module IDs behind every sentinel fixture. */
function renderModuleGraphs(results) {
  const lines = [];
  for (const result of results) {
    if (result.sentinels === undefined || result.moduleIds === undefined) continue;
    const comviModules = result.moduleIds.filter((id) => id.startsWith("packages/"));
    lines.push(`\n${result.name} — ${comviModules.length} comvi module(s):`);
    for (const id of comviModules) lines.push(`  ${id}`);
  }
  return lines.join("\n");
}

async function main() {
  const budgetsPath = path.join(SCRIPT_DIR, "size-budgets.json");
  const budgets = JSON.parse(fs.readFileSync(budgetsPath, "utf8"));
  const corePkg = readPackageJson(DEFAULT_PACKAGE_ROOTS["@comvi/core"]);
  const results = await runSizeCheck({
    budgets,
    fixturesDir: path.join(SCRIPT_DIR, "size-fixtures"),
    define: { __VERSION__: JSON.stringify(corePkg.version) },
  });
  console.log(renderResults(results));
  if (process.argv.includes("--modules")) console.log(renderModuleGraphs(results));
  const failures = results.filter((result) => result.status === "fail");
  if (failures.length > 0) {
    console.error(`\nSize gate failed for: ${failures.map((result) => result.name).join(", ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  await main();
}
