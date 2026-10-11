/**
 * Gate: the version inlined into a package's built artifacts must equal the
 * version in its manifest.
 *
 * `packages/core` inlines its own version at build time
 * (`define: { __VERSION__: JSON.stringify(pkg.version) }` in vite.config.ts,
 * vite.config.dev.ts and vite.config.umd.ts). The build reads package.json, so
 * any step that rewrites the manifest AFTER the build (the RC rehearsal's
 * scripts/rc-version.mjs, a hand-edited version) leaves `dist` reporting the
 * previous version while npm receives the new one. Nothing else notices: the
 * inlined value only surfaces at runtime, through the devtools discovery
 * envelope (`{v, i}`) and the duplicate-copy guard, which is KEYED on the
 * version string and therefore goes silently blind when two different copies
 * both claim the same stale version.
 *
 * Which packages are checked is discovered, not hard-coded: every
 * `packages/<name>/vite.config*.{ts,mts,js,mjs}` that mentions `__VERSION__`
 * marks its package as version-inlining, so a second package that starts
 * inlining is covered without touching this file.
 *
 * The check is deliberately strict: every semver string literal in the built
 * output must be the manifest version. In today's `packages/core/dist` the only
 * such literals are the inlined copies themselves, so a stale build is caught
 * in both directions (missing new version, or a leftover old one). If a package
 * ever ships an unrelated semver literal in `dist`, this gate is where to
 * record it: `BUNDLED_DEPENDENCY_VERSIONS` names the dependencies a package
 * bundles together with their own version string. Such a literal is accepted
 * only while it equals the version of the dependency that is installed.
 *
 * A minified build writes its strings as template literals, so a version
 * between two backticks is a literal too. That is a SECOND pass next to the
 * `"`/`'` one, never one character class: with all three delimiters in one
 * class, `` `0.5.1"0.5.0"` `` matches from the backtick to the first `"`,
 * which consumes the opening quote of the stale literal behind it and hides
 * it. The `"`/`'` pass is unchanged, so every literal the gate found before
 * the template pass existed is still found.
 *
 * Usage: `node tooling/check-inlined-version.mjs` from the repo root.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BUILT_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const VITE_CONFIG = /^vite\.config.*\.(ts|mts|js|mjs)$/;
const SEMVER_LITERAL = /["'](\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)["']/g;
const SEMVER_TEMPLATE_LITERAL = /`(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)`/g;

/**
 * Dependencies whose own version string a package bundles into `dist`.
 * `@comvi/plugin-in-context-editor` bundles Vue, whose runtime carries
 * `version`, into the standalone IIFE and the lazily loaded editor chunks.
 *
 * What this admits, exactly: in that package's output, any literal equal to
 * the version of the Vue that is installed for it — wherever it stands. A
 * stale stamp of the package itself would slip through only if it equalled
 * that Vue version.
 *
 * The exclusion is by value, not by provenance, on purpose: chunk names are
 * hashed, and `standalone.iife.js` carries Vue's literal AND the editor's own
 * stamp, so exempting files (or the region a dependency came from, which a
 * minified single-file bundle no longer marks) would exempt the very file
 * that has to be checked.
 */
export const BUNDLED_DEPENDENCY_VERSIONS = {
  "@comvi/plugin-in-context-editor": ["vue"],
};

/** The installed version of every dependency `pkg` is recorded as bundling. */
function bundledDependencyVersions(pkg, problems) {
  const versions = new Set();
  for (const dependency of BUNDLED_DEPENDENCY_VERSIONS[pkg.name] ?? []) {
    const manifestPath = path.join(pkg.dir, "node_modules", dependency, "package.json");
    if (!fs.existsSync(manifestPath)) {
      problems.push(
        `${pkg.name}: bundled dependency ${dependency} is not installed, so its version ` +
          `literal cannot be told apart from a stale one — run pnpm install before this gate`,
      );
      continue;
    }
    versions.add(JSON.parse(fs.readFileSync(manifestPath, "utf8")).version);
  }
  return versions;
}

/** Package directories whose vite config inlines `__VERSION__`. */
export function packagesInliningVersion(root) {
  const packagesDir = path.join(root, "packages");
  if (!fs.existsSync(packagesDir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(packagesDir).sort()) {
    const dir = path.join(packagesDir, entry);
    const manifestPath = path.join(dir, "package.json");
    if (!fs.existsSync(manifestPath) || !fs.statSync(dir).isDirectory()) continue;
    const configs = fs
      .readdirSync(dir)
      .filter((file) => VITE_CONFIG.test(file))
      .filter((file) => fs.readFileSync(path.join(dir, file), "utf8").includes("__VERSION__"));
    if (configs.length === 0) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    found.push({ dir, name: manifest.name, version: manifest.version, configs: configs.sort() });
  }
  return found;
}

function builtFiles(distDir) {
  const files = [];
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    const full = path.join(distDir, entry.name);
    if (entry.isDirectory()) files.push(...builtFiles(full));
    else if (BUILT_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files.sort();
}

/** Every semver string literal in a built file, in source order. */
export function collectVersionLiterals(source) {
  return [...source.matchAll(SEMVER_LITERAL), ...source.matchAll(SEMVER_TEMPLATE_LITERAL)]
    .sort((a, b) => a.index - b.index)
    .map((match) => match[1]);
}

export function checkPackage(pkg) {
  const problems = [];
  const distDir = path.join(pkg.dir, "dist");
  if (!fs.existsSync(distDir)) {
    return {
      ...pkg,
      matched: 0,
      problems: [`${pkg.name}: no dist/ to check — run the build before this gate`],
    };
  }

  const bundled = bundledDependencyVersions(pkg, problems);
  let matched = 0;
  for (const file of builtFiles(distDir)) {
    const literals = collectVersionLiterals(fs.readFileSync(file, "utf8"));
    for (const literal of literals) {
      if (literal === pkg.version) matched += 1;
      else if (!bundled.has(literal))
        problems.push(
          `${pkg.name}: ${path.relative(pkg.dir, file)} inlines version "${literal}" but the ` +
            `manifest says ${pkg.version} — the build ran against a different manifest ` +
            `(rebuild after any version rewrite)`,
        );
    }
  }

  if (matched === 0) {
    problems.push(
      `${pkg.name}: no built file inlines the manifest version ${pkg.version} — ` +
        `${pkg.configs.join(", ")} define __VERSION__, so dist/ is stale or was built from a ` +
        `different manifest`,
    );
  }

  return { ...pkg, matched, problems };
}

export function checkInlinedVersions({ root, log = console.log } = {}) {
  const packages = packagesInliningVersion(root);
  if (packages.length === 0) {
    return {
      packages,
      problems: ["no package inlines __VERSION__ — this gate has nothing to check"],
    };
  }
  const results = packages.map((pkg) => checkPackage(pkg));
  const problems = results.flatMap((result) => result.problems);
  for (const result of results) {
    if (result.problems.length === 0)
      log(
        `check-inlined-version: ${result.name} dist inlines ${result.version} ` +
          `(${result.matched} occurrence${result.matched === 1 ? "" : "s"})`,
      );
  }
  return { packages: results, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { problems } = checkInlinedVersions({ root: process.cwd() });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check-inlined-version: ${problem}`);
    process.exit(1);
  }
}
