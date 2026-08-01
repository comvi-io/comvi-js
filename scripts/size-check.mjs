import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import zlib from "node:zlib";
import { createRequire } from "node:module";

/**
 * Bundle-size gate (weight-refactor plan, Phase 0).
 *
 * Bundles each fixture in scripts/size-fixtures/ with esbuild (minified,
 * production conditions) and asserts the min+gz output against the budgets in
 * scripts/size-budgets.json.
 *
 * Fixture entries are resolved through the PUBLISHED `exports` map of the
 * target package (never through dist/ paths or the legacy `module`/`main`
 * fields), so the gate fails when the exports/conditions matrix is broken for
 * real consumers. Budget entries marked `pending: true` cover subpaths that a
 * later phase introduces; they are skipped with a notice while their entry
 * specifier does not resolve yet.
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");
const requireFromRoot = createRequire(path.join(REPO_ROOT, "package.json"));

/** Conditions a production bundler applies. Deliberately excludes "development" and "types". */
export const PRODUCTION_CONDITIONS = ["production", "import", "module", "browser"];

export const DEFAULT_PACKAGE_ROOTS = {
  "@comvi/core": path.join(REPO_ROOT, "packages", "core"),
};

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
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    target = subpath === "." ? exportsField : undefined;
  } else {
    const keys = Object.keys(exportsField);
    const isSubpathMap = keys.every((key) => key.startsWith("."));
    if (isSubpathMap) {
      target = exportsField[subpath];
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
  return resolved;
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
        return { path: resolved };
      });
    },
  };
}

/** Bundles one fixture entry file and returns its minified and gzipped byte sizes. */
export async function measureFixture({
  entryFile,
  packageRoots,
  conditions = PRODUCTION_CONDITIONS,
  define = {},
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
    define: {
      __DEV__: "false",
      "process.env.NODE_ENV": JSON.stringify("production"),
      ...define,
    },
    plugins: [exportsMapPlugin(packageRoots, conditions)],
  });
  const code = result.outputFiles[0].contents;
  const gzipped = zlib.gzipSync(code, { level: 9 });
  return { minBytes: code.byteLength, gzipBytes: gzipped.byteLength };
}

export function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KB (${bytes} B)`;
}

function fixtureEntries(entry) {
  return Array.isArray(entry) ? entry : [entry];
}

/**
 * Runs every budget entry. Returns per-fixture results with a status:
 * - "pass" / "fail": gated fixture measured against gzipBudgetBytes
 * - "informational": measured, printed, not gated (no budget configured)
 * - "pending": entry specifier not exported yet; skipped with a notice
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
    if (unresolved.length > 0) {
      if (fixture.pending) {
        results.push({ name: fixture.name, status: "pending", unresolved });
        continue;
      }
      throw new Error(
        `${fixture.name}: entry specifier(s) [${unresolved.join(", ")}] do not resolve through the published exports map`,
      );
    }
    const entryFile = path.join(fixturesDir, fixture.fixture);
    const { minBytes, gzipBytes } = await measureFixture({
      entryFile,
      packageRoots,
      conditions,
      define,
    });
    if (typeof fixture.gzipBudgetBytes !== "number") {
      results.push({ name: fixture.name, status: "informational", minBytes, gzipBytes });
      continue;
    }
    const status = gzipBytes <= fixture.gzipBudgetBytes ? "pass" : "fail";
    results.push({
      name: fixture.name,
      status,
      minBytes,
      gzipBytes,
      budget: fixture.gzipBudgetBytes,
    });
  }
  return results;
}

export function renderResults(results) {
  const lines = [];
  for (const result of results) {
    switch (result.status) {
      case "pending":
        lines.push(
          `~ ${result.name}: pending — [${result.unresolved.join(", ")}] not exported yet; ` +
            `gate activates when the entry lands (flip "pending" in size-budgets.json)`,
        );
        break;
      case "informational":
        lines.push(
          `i ${result.name}: ${formatBytes(result.gzipBytes)} min+gz (${formatBytes(result.minBytes)} min) — informational, not gated`,
        );
        break;
      case "pass":
        lines.push(
          `+ ${result.name}: ${formatBytes(result.gzipBytes)} min+gz <= budget ${formatBytes(result.budget)} (${formatBytes(result.minBytes)} min)`,
        );
        break;
      case "fail":
        lines.push(
          `x ${result.name}: ${formatBytes(result.gzipBytes)} min+gz EXCEEDS budget ${formatBytes(result.budget)} (${formatBytes(result.minBytes)} min)`,
        );
        break;
    }
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
  const failures = results.filter((result) => result.status === "fail");
  if (failures.length > 0) {
    console.error(`\nSize gate failed for: ${failures.map((result) => result.name).join(", ")}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  await main();
}
