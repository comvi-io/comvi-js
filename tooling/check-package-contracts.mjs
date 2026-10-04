#!/usr/bin/env node
// Verifies that every publishable package's package.json contract matches what
// `npm pack --dry-run` actually includes: `files` covers `dist`, `sideEffects` is
// `false` or an explicit list, every exports/main/module/types/bin target is packed,
// bin targets are executable with a shebang, no `.DS_Store`/`.env*`/`.tsbuildinfo`
// is shipped, and no built file names a workspace-private package (it must be
// inlined/vendored instead — a private package resolves fine inside the workspace
// but is unresolvable once published). It also checks one cross-file fact that is
// not per-package: `@comvi/next`'s `next` peer range is written in four files, and
// the three mirrors must agree with the manifest (see
// `checkNextPeerRangeDeclarations`). Known limitations: the `.env*` check only
// matches a root-level entry (not e.g. `dist/.env`); suffix globs in exports
// (`./dist/*.css`) degrade to a weak prefix check; the bin executable-bit check
// reads the working-tree mode, not the 0755 npm normalises to in the tarball. Run
// after `pnpm build` (it inspects dist/).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const forbiddenPackageEntries = [
  ".DS_Store",
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
];

function normalizePackagePath(value) {
  return value.replace(/^\.\//, "").replaceAll(path.sep, "/");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function collectExportTargets(value, targets = []) {
  if (typeof value === "string") {
    targets.push(value);
    return targets;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const nested of Object.values(value)) {
      collectExportTargets(nested, targets);
    }
  }
  return targets;
}

function assert(condition, message, errors) {
  if (!condition) errors.push(message);
}

function isGlobTarget(target) {
  return target.includes("*");
}

function validateTargetIncluded(packageName, field, target, packedFiles, errors) {
  const normalized = normalizePackagePath(target);
  if (isGlobTarget(normalized)) {
    const prefix = normalized.slice(0, normalized.indexOf("*"));
    assert(
      Array.from(packedFiles).some((file) => file.startsWith(prefix)),
      `${packageName}: ${field} glob ${target} has no matching packed files`,
      errors,
    );
    return;
  }

  assert(
    packedFiles.has(normalized),
    `${packageName}: ${field} target ${target} is not included by npm pack --dry-run`,
    errors,
  );
}

function validateBin(packageName, bin, packedFiles, packageDir, errors) {
  if (!bin) return;
  const entries = typeof bin === "string" ? { [packageName.split("/").pop()]: bin } : bin;
  for (const [name, target] of Object.entries(entries)) {
    const normalized = normalizePackagePath(target);
    validateTargetIncluded(packageName, `bin.${name}`, target, packedFiles, errors);

    const absTarget = path.join(packageDir, normalized);
    assert(existsSync(absTarget), `${packageName}: bin.${name} ${target} does not exist`, errors);
    if (existsSync(absTarget)) {
      const content = readFileSync(absTarget, "utf8");
      const mode = statSync(absTarget).mode;
      assert(
        content.startsWith("#!/"),
        `${packageName}: bin.${name} ${target} lacks a shebang`,
        errors,
      );
      assert(
        (mode & 0o111) !== 0,
        `${packageName}: bin.${name} ${target} is not executable by any user class`,
        errors,
      );
    }
  }
}

function npmPackDryRun(packageDir) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: packageDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = JSON.parse(output);
  return new Set(parsed.flatMap((item) => item.files.map((file) => file.path)));
}

/**
 * `@comvi/next`'s peer ranges are written down in several places, and until this
 * check existed nothing tied them together: `scripts/sync-peer-ranges.mjs` only
 * pins internal `@comvi/*` peers, and the rest of this file has no peer logic at
 * all. So the human-written mirrors drifted silently — `next` said `^14 || ^15`
 * everywhere while Next 14 was, in fact, unusable (every page 500s with
 * `TypeError: Cannot redefine property: I18nProvider`).
 *
 * Both mirrored peers are checked, because both were wrong at once:
 *   - `next`  — the range this repo decides.
 *   - `react` — a floor NEXT decides. Every Next in the supported window
 *     (14.2.35, 15.5.9, 15.5.18, 16.3.5) declares `react: ^18.2.0`, so a
 *     `^18.0.0` floor here advertises React 18.0/18.1 with Next 15/16, which
 *     Next itself refuses. `@comvi/react` deliberately keeps `^18.0.0` —
 *     `useSyncExternalStore` lands in React 18.0 and that range is ours, not
 *     Next's — which is why this check is scoped to `packages/next` alone.
 *
 * `packages/next/package.json` is the single source. The mirrors must agree:
 * both README install comments verbatim, and the bundler-matrix stub by having
 * a version the `next` range accepts plus prose that names that range.
 *
 * Deliberately narrow — two peers of ONE package. Generalising it to every peer
 * in the repo would need a prose convention the other pages do not follow
 * (`packages/react/README.md` writes full triples, `# Peer: react ^18.0.0 ||
 * ^19.0.0`), and a guard that has to guess at formats is a guard that reports
 * noise.
 */
const NEXT_PEER_SOURCE = "packages/next/package.json";
const NEXT_PEER_README_MIRRORS = ["packages/next/README.md", "README.md"];
const NEXT_PEER_STUB_MIRROR = "scripts/bundler-matrix/app/stubs/next/package.json";

/**
 * `"^18.2.0 || ^19.0.0"` → `[[18, 2, 0], [19, 0, 0]]`; `null` if any member is
 * not a plain caret range (a prose form cannot be derived from `>=15`).
 */
export function parseCaretRange(range) {
  if (typeof range !== "string" || range.trim() === "") return null;
  const parsed = [];
  for (const part of range.split("||")) {
    const match = /^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(part.trim());
    if (!match) return null;
    parsed.push([Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]);
  }
  return parsed;
}

/**
 * The shorthand the prose mirrors use: trailing zero components are dropped, so
 * `^15.0.0` → `^15` and `^18.2.0` → `^18.2`. A floor that carries a meaningful
 * minor keeps it; one that does not reads as the bare major it is.
 */
export function shorthandCaretRange(parsed) {
  return parsed
    .map(([major, minor, patch]) => {
      if (patch !== 0) return `^${major}.${minor}.${patch}`;
      if (minor !== 0) return `^${major}.${minor}`;
      return `^${major}`;
    })
    .join(" || ");
}

export function checkNextPeerRangeDeclarations(root) {
  const errors = [];

  const sourcePath = path.join(root, NEXT_PEER_SOURCE);
  if (!existsSync(sourcePath)) return errors;
  const peers = readJson(sourcePath).peerDependencies ?? {};

  const declared = {};
  const shorthand = {};
  let nextMajors = null;
  for (const peer of ["next", "react"]) {
    declared[peer] = peers[peer];
    const parsed = parseCaretRange(declared[peer]);
    if (parsed === null) {
      errors.push(
        `${NEXT_PEER_SOURCE}: peerDependencies.${peer} must be caret ranges joined by "||" ` +
          `so the prose mirrors can be derived from it; got ${JSON.stringify(declared[peer])}`,
      );
      return errors;
    }
    shorthand[peer] = shorthandCaretRange(parsed);
    if (peer === "next") nextMajors = parsed.map(([major]) => major);
  }

  // One regex for the whole comment: `# Peers: next <range>, react <range>`.
  // Keying on BOTH names is what keeps the sibling install lines out — the root
  // README's `@comvi/react` line is `# Peer: react …` (singular, no `next`),
  // and `nuxt ^3 || ^4` never matches `next\s`. Requiring at least one match is
  // the point too: a renamed comment must fail, not pass by matching nothing.
  for (const mirror of NEXT_PEER_README_MIRRORS) {
    const mirrorPath = path.join(root, mirror);
    if (!existsSync(mirrorPath)) {
      errors.push(`${mirror}: missing, but it declares the @comvi/next peer ranges`);
      continue;
    }
    const matches = [
      ...readFileSync(mirrorPath, "utf8").matchAll(
        /#\s*Peers:\s*next\s+([^,\n]+),\s*react\s+([^,\n]+)/g,
      ),
    ];
    if (matches.length === 0) {
      errors.push(
        `${mirror}: no "# Peers: next <range>, react <range>" comment found; ` +
          `${NEXT_PEER_SOURCE} declares next ${declared.next} and react ${declared.react}, ` +
          `so this file must mirror them as "next ${shorthand.next}, react ${shorthand.react}"`,
      );
      continue;
    }
    for (const match of matches) {
      for (const [index, peer] of ["next", "react"].entries()) {
        const found = match[index + 1].trim();
        assert(
          found === shorthand[peer],
          `${mirror}: declares ${peer} "${found}" but ${NEXT_PEER_SOURCE} declares ` +
            `"${declared[peer]}" (expected the comment to read "${shorthand[peer]}")`,
          errors,
        );
      }
    }
  }

  // The stub is checked for SATISFACTION, not equality: it is pinned to the
  // floor of the range on purpose, so that the lowest supported Next is the one
  // proven to resolve. Equality would force it to the newest major and lose that.
  const stubPath = path.join(root, NEXT_PEER_STUB_MIRROR);
  if (!existsSync(stubPath)) {
    errors.push(`${NEXT_PEER_STUB_MIRROR}: missing, but it must satisfy the next peer range`);
    return errors;
  }
  const stub = readJson(stubPath);
  const stubMajor = Number(String(stub.version ?? "").split(".")[0]);
  assert(
    nextMajors.includes(stubMajor),
    `${NEXT_PEER_STUB_MIRROR}: version ${stub.version} is outside ${NEXT_PEER_SOURCE}'s ` +
      `next range "${declared.next}" (majors ${nextMajors.join(", ")}), so the bundler matrix ` +
      `installs a stub the published range would reject`,
    errors,
  );
  assert(
    typeof stub.description === "string" && stub.description.includes(`(${shorthand.next})`),
    `${NEXT_PEER_STUB_MIRROR}: description must name the range as "(${shorthand.next})" to match ` +
      `${NEXT_PEER_SOURCE}'s "${declared.next}"`,
    errors,
  );

  return errors;
}

/**
 * The name of every `packages/*` package whose manifest sets `private: true`.
 * Derived, not hard-coded: a package that becomes private later is picked up
 * automatically, same as `packagesInliningVersion` in check-inlined-version.mjs.
 */
export function collectPrivatePackageNames(root) {
  const packagesDir = path.join(root, "packages");
  if (!existsSync(packagesDir)) return [];
  const names = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(packagesDir, entry.name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    if (manifest.private === true && manifest.name) names.push(manifest.name);
  }
  return names;
}

/** Every file under `distDir`, recursively, excluding `.map` (source maps
 * routinely embed original workspace paths; that's not a shipped import). */
export function collectDistFiles(distDir) {
  if (!existsSync(distDir)) return [];
  const files = [];
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    const full = path.join(distDir, entry.name);
    if (entry.isDirectory()) files.push(...collectDistFiles(full));
    else if (!entry.name.endsWith(".map")) files.push(full);
  }
  return files;
}

/**
 * A shipped file that names a workspace-private package can't resolve once
 * published — the package only exists inside this workspace. The private
 * dependency must be inlined (bundled into the artifact) or vendored (copied
 * into source), never left as a live import/reference.
 */
export function checkDistForPrivatePackageNames(packageName, packageDir, privateNames) {
  const errors = [];
  if (privateNames.length === 0) return errors;
  const distDir = path.join(packageDir, "dist");
  for (const file of collectDistFiles(distDir)) {
    const content = readFileSync(file, "utf8");
    const relativePath = path.relative(distDir, file).split(path.sep).join("/");
    for (const privateName of privateNames) {
      if (content.includes(privateName)) {
        errors.push(
          `${packageName}: dist/${relativePath} names workspace-private package ${privateName}; ` +
            `it must be inlined/vendored, not imported`,
        );
      }
    }
  }
  return errors;
}

/**
 * Vite replaces a Node built-in that the build did not list as `external`
 * with a browser shim whose every export is `undefined`. The bundle still
 * builds, so only a consumer sees the failure, at the first call:
 * `(0 , import___vite_browser_external.randomUUID) is not a function`.
 * Shipped files must never carry that shim.
 */
export function checkDistForBrowserExternalShim(packageName, packageDir) {
  const errors = [];
  const distDir = path.join(packageDir, "dist");
  for (const file of collectDistFiles(distDir)) {
    const content = readFileSync(file, "utf8");
    if (content.includes("__vite_browser_external")) {
      const relativePath = path.relative(distDir, file).split(path.sep).join("/");
      errors.push(
        `${packageName}: dist/${relativePath} bundles Vite's browser shim for a Node built-in; ` +
          `add the missing "node:*" specifier to the build's external list`,
      );
    }
  }
  return errors;
}

export async function checkPackageContracts({ root = process.cwd(), log = console.log } = {}) {
  const packagesDir = path.join(root, "packages");
  const packageDirs = (await readdir(packagesDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(packagesDir, entry.name))
    .filter((packageDir) => existsSync(path.join(packageDir, "package.json")))
    .sort();

  const privatePackageNames = collectPrivatePackageNames(root);

  const errors = [];
  const summaries = [];

  for (const packageDir of packageDirs) {
    const manifestPath = path.join(packageDir, "package.json");
    const manifest = readJson(manifestPath);
    if (manifest.private === true) continue;

    const packageName = manifest.name ?? path.basename(packageDir);
    const packedFiles = npmPackDryRun(packageDir);
    const packageErrors = [];

    assert(
      manifest.files?.includes("dist"),
      `${packageName}: files must include dist`,
      packageErrors,
    );
    assert(
      manifest.sideEffects === false || Array.isArray(manifest.sideEffects),
      `${packageName}: sideEffects must be false or an explicit side-effect file list`,
      packageErrors,
    );

    if (manifest.exports) {
      for (const target of collectExportTargets(manifest.exports)) {
        validateTargetIncluded(packageName, "exports", target, packedFiles, packageErrors);
      }
    } else {
      assert(manifest.main, `${packageName}: package must define exports or main`, packageErrors);
    }

    // Validate entry-point fields (unpkg/jsdelivr only present on UMD packages); skipped when absent.
    for (const field of ["main", "module", "types", "unpkg", "jsdelivr"]) {
      const target = manifest[field];
      if (target == null) continue;
      assert(
        typeof target === "string",
        `${packageName}: "${field}" must be a string path`,
        packageErrors,
      );
      if (typeof target === "string") {
        validateTargetIncluded(packageName, field, target, packedFiles, packageErrors);
      }
    }

    validateBin(packageName, manifest.bin, packedFiles, packageDir, packageErrors);

    for (const entry of forbiddenPackageEntries) {
      assert(
        !packedFiles.has(entry),
        `${packageName}: forbidden local artifact ${entry} is packed`,
        packageErrors,
      );
    }
    for (const packedFile of packedFiles) {
      assert(
        !packedFile.endsWith(".tsbuildinfo"),
        `${packageName}: ${packedFile} must not be packed`,
        packageErrors,
      );
      assert(
        !packedFile.endsWith("/.DS_Store"),
        `${packageName}: ${packedFile} must not be packed`,
        packageErrors,
      );
    }

    packageErrors.push(
      ...checkDistForPrivatePackageNames(packageName, packageDir, privatePackageNames),
      ...checkDistForBrowserExternalShim(packageName, packageDir),
    );

    const failed = packageErrors.length > 0;
    if (failed) errors.push(...packageErrors);
    summaries.push(`${failed ? "FAIL" : "PASS"} ${packageName}: ${packedFiles.size} files checked`);
  }

  // Repo-wide, not per-package: one fact declared in four files.
  const peerRangeErrors = checkNextPeerRangeDeclarations(root);
  errors.push(...peerRangeErrors);
  summaries.push(
    `${peerRangeErrors.length > 0 ? "FAIL" : "PASS"} next peer range: ` +
      `${NEXT_PEER_README_MIRRORS.length + 1} mirrors checked against ${NEXT_PEER_SOURCE}`,
  );

  for (const summary of summaries) {
    log(summary);
  }

  return { errors, summaries };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { errors, summaries } = await checkPackageContracts();

  if (errors.length > 0) {
    console.error("\nPackage contract check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Package contract check passed for ${summaries.length} publishable packages.`);
}
