/**
 * Tarballs from the npm registry instead of this checkout's `pnpm pack`.
 *
 *   --from-registry <dist-tag | version>
 *
 * The same flag shape as `pnpm bundler-matrix --from-registry next`: every
 * `@comvi/*` tarball is `npm pack @comvi/<pkg>@<spec>`. It exists for D′ (the
 * docs checked against the PUBLISHED release candidate); a local run of the
 * gates still packs this checkout.
 *
 * Which packages: the roots a gate asks for, plus every `@comvi/*` package
 * those tarballs name in `dependencies` or `peerDependencies`, read from the
 * packed manifests. Not "every workspace package": the set the registry holds
 * for a version is not the set in this checkout (0.7.1 has
 * `@comvi/plugin-fetch-loader` and no `@comvi/editor`), and a gate that pins
 * every `@comvi` resolution to a tarball must know every package the install
 * will reach.
 *
 * One version for all: the Comvi packages are released as a fixed group, so a
 * dist-tag that resolves to two different versions is a half-published release,
 * and the run refuses it rather than check a mix.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** The value of `--from-registry` at `argv[index]`, or a usage error. */
export function registrySpec(argv, index) {
  const value = argv[index];
  if (value === undefined || value.startsWith("--") || value.trim() === "") {
    throw new Error("--from-registry requires a dist-tag or version, e.g. --from-registry next");
  }
  return value;
}

/** The `@comvi/*` names a packed manifest depends on, and which of them are optional peers. */
export function comviDependencies(manifest) {
  const optional = new Set(
    Object.entries(manifest.peerDependenciesMeta ?? {})
      .filter(([, meta]) => meta?.optional)
      .map(([name]) => name),
  );
  const names = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  return [...names]
    .filter((name) => name.startsWith("@comvi/"))
    .sort()
    .map((name) => ({ name, optional: optional.has(name) }));
}

/** `npm pack <name>@<spec>` into `dir`: `{ name, version, file }`, or `null` on a 404. */
export function npmPack(name, spec, dir) {
  let out;
  try {
    out = execFileSync("npm", ["pack", `${name}@${spec}`, "--pack-destination", dir, "--json"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = String(error.stderr ?? "");
    if (/E404|No matching version|ETARGET/.test(stderr)) return null;
    throw new Error(`npm pack ${name}@${spec} failed:\n${stderr || error.message}`);
  }
  const entry = JSON.parse(out)[0];
  const file = path.join(dir, entry.filename);
  if (!fs.existsSync(file)) throw new Error(`npm pack ${name}@${spec} did not produce ${file}`);
  return { name: entry.name, version: entry.version, file };
}

/** The `package/package.json` inside a tarball. */
export function tarballManifest(file) {
  return JSON.parse(
    execFileSync("tar", ["-xzOf", file, "package/package.json"], { encoding: "utf8" }),
  );
}

/**
 * Fetch `roots` and their `@comvi/*` dependency closure at `spec` into `dir`.
 *
 * Returns `[{ name, version, dir, file }]`, sorted by name. `dir` is the pack
 * directory and the file is `<scope>-<name>-<version>.tgz` in it, the shape
 * `link-sdk.mjs` `tarballFor()` expects of a workspace package.
 *
 * `pack` and `manifestOf` are injectable for the tests; the defaults call npm
 * and tar.
 */
export function fetchRegistryTarballs(
  roots,
  spec,
  dir,
  { pack = npmPack, manifestOf = tarballManifest, log = () => {} } = {},
) {
  fs.mkdirSync(dir, { recursive: true });
  const fetched = new Map();
  const queue = [...new Set(roots)].sort().map((name) => ({ name, optional: false, from: null }));
  while (queue.length > 0) {
    const { name, optional, from } = queue.shift();
    if (fetched.has(name)) continue;
    const packed = pack(name, spec, dir);
    if (!packed) {
      if (optional) {
        log(`  ${name}@${spec}: not on the registry (an optional peer of ${from}), skipped`);
        continue;
      }
      throw new Error(
        `${name}@${spec} is not on the registry` +
          (from ? ` (a dependency of ${from})` : " (a package this gate installs)"),
      );
    }
    if (packed.name !== name) {
      throw new Error(`npm pack ${name}@${spec} produced ${packed.name}`);
    }
    log(`  ${name}@${spec} -> ${path.basename(packed.file)} (${packed.version})`);
    fetched.set(name, { name, version: packed.version, dir, file: packed.file });
    for (const dep of comviDependencies(manifestOf(packed.file))) {
      if (!fetched.has(dep.name)) queue.push({ ...dep, from: name });
    }
  }
  const versions = new Set([...fetched.values()].map((entry) => entry.version));
  if (versions.size > 1) {
    throw new Error(
      `@${spec} resolves to more than one version: ` +
        [...fetched.values()].map((entry) => `${entry.name}@${entry.version}`).join(", ") +
        ". The Comvi packages are released as one group; refusing a mixed set.",
    );
  }
  return [...fetched.values()].sort((a, b) => a.name.localeCompare(b.name));
}
