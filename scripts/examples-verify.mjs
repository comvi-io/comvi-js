import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";

import {
  REPO_ROOT,
  assertTarballsFresh,
  cleanTarballs,
  comviResolutions,
  registryResolutions,
  tarballFor,
  workspacePackages,
} from "./docs-snippets/link-sdk.mjs";

/**
 * Build gate for `examples/*` — the StackBlitz demos.
 *
 * The examples exist to be opened from GitHub in a WebContainer, so they depend
 * on the PUBLISHED names at `^0.5.0` and are deliberately NOT pnpm workspace
 * members: a `workspace:*` example is unopenable, which is the whole reason
 * `test-apps/*` cannot double as demos. That leaves a hole this script fills —
 * until 0.5.0 (or an RC under the `next` tag) is on npm, nothing anywhere
 * proves an example even compiles.
 *
 * The shortcut this does NOT take is the one the docs gate already paid for
 * (docs-0.5 plan §6.1.1): `pnpm pack` REWRITES `workspace:*` to a concrete
 * version, so a locally packed `@comvi/react` depends on `@comvi/core@<version>`
 * FROM THE REGISTRY. Install that one tarball and the example builds green
 * against the PREVIOUS release's core while reporting the next one's version.
 * So: pack all fourteen, and pin every `@comvi/*` — direct and transitive —
 * through `pnpm.overrides`, then refuse to continue unless the lockfile says
 * every `@comvi` resolution came from a local tarball.
 *
 * What is checked, per example, in a temp copy outside every workspace (no
 * lockfile in this repo is read or written):
 *
 *   1. `pnpm install` with the overrides, then the provenance assertion.
 *   2. `pnpm build` — the real Vite build, which is what a reader gets.
 *   3. the example's own `typecheck` script — `tsc`, `vue-tsc` or
 *      `svelte-check`, whichever the framework needs.
 *
 * The manifest's `^0.5.0` ranges are left EXACTLY as committed. An override
 * replaces the specifier without touching the declaration, so the file that
 * ships to StackBlitz is the file that was verified.
 *
 *   node scripts/examples-verify.mjs [--only <name>] [--no-build] [--no-pack]
 *                                    [--keep] [--json]
 *
 *     --only    verify one example (repeatable)
 *     --no-build / --no-pack   reuse the workspace build / the tarballs on disk
 *     --keep    leave the temp directories in place for inspection
 *     --json    machine-readable report on stdout
 */

const SCRIPT_DIR = path.dirname(url.fileURLToPath(import.meta.url));
const EXAMPLES_DIR = path.join(REPO_ROOT, "examples");

/** Directory entries that are never copied into the temp build. */
const SKIP_ENTRIES = new Set(["node_modules", "dist", ".turbo", "pnpm-lock.yaml", ".vite"]);

/** Every `examples/<name>` holding a package.json, in report order. */
export function exampleDirs(root = EXAMPLES_DIR) {
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .sort()
    .filter((entry) => fs.existsSync(path.join(root, entry, "package.json")))
    .map((entry) => ({ name: entry, dir: path.join(root, entry) }));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
    ...options,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { status: result.status, output };
}

function runOrThrow(command, args, options = {}) {
  const { status, output } = run(command, args, options);
  if (status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${status}${options.quiet ? `\n${output}` : ""}`,
    );
  }
  return output;
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP_ENTRIES.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

/**
 * The example's manifest with every `@comvi/*` pinned to a local tarball.
 *
 * `dependencies` is untouched on purpose — the published ranges are part of
 * what is being verified. `pnpm.overrides` redirects resolution only, and it
 * applies to TRANSITIVE dependencies, which is the half a plain install of one
 * tarball misses.
 */
export function withOverrides(manifest, packages) {
  const overrides = {};
  for (const pkg of packages) overrides[pkg.name] = `file:${tarballFor(pkg)}`;
  return { ...manifest, pnpm: { ...manifest.pnpm, overrides } };
}

/** Direct `@comvi/*` dependencies the example declares. */
export function declaredComviDeps(manifest) {
  const pools = [manifest.dependencies, manifest.devDependencies];
  const names = new Set();
  for (const pool of pools) {
    for (const name of Object.keys(pool ?? {})) {
      if (name.startsWith("@comvi/")) names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * Fail CLOSED on provenance.
 *
 * `comviResolutions` is a set of regexes over one lockfile format; a lockfile it
 * cannot read yields zero entries, and "zero registry resolutions" then reads as
 * evidence when nothing was checked. So every package the example DECLARES must
 * be accounted for before the stray filter is believed.
 */
export function assertLocalResolutions(lockfile, declared) {
  const seen = new Set(comviResolutions(lockfile).map((entry) => entry.name));
  const unaccounted = declared.filter((name) => !seen.has(name));
  if (unaccounted.length > 0) {
    throw new Error(
      `the lockfile names no resolution for ${unaccounted.join(", ")} (${seen.size} @comvi ` +
        "packages parsed). Either the install did not happen, or this is a lockfile format " +
        "`comviResolutions` cannot read — in which case provenance was never checked.",
    );
  }
  const strays = registryResolutions(lockfile);
  if (strays.length > 0) {
    throw new Error(
      `${strays.length} @comvi resolution(s) came from the registry, not a local tarball: ` +
        `${strays.map((stray) => `${stray.name}@${stray.reference}`).join(", ")}. ` +
        "`pnpm pack` rewrites `workspace:*` to a concrete version, so an override that did not " +
        "apply pulls the PUBLISHED dependency and this gate goes green against it.",
    );
  }
}

/**
 * The entry chunk Vite wrote, found through `dist/index.html` rather than by
 * picking the biggest file: the entry is what the browser loads first, and the
 * lazy locale chunks are supposed to be separate files — a "largest chunk" rule
 * would quietly start reporting one of those the day the split regressed.
 */
export function entryChunk(distDir) {
  const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
  const match = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
  if (!match) throw new Error(`no module script in ${path.join(distDir, "index.html")}`);
  return path.join(distDir, match[1].replace(/^\//, ""));
}

export function measure(file) {
  const bytes = fs.readFileSync(file);
  return {
    file: path.basename(file),
    min: bytes.length,
    gzip: zlib.gzipSync(bytes, { level: 9 }).length,
  };
}

/** Every `.js` Vite emitted, so the report can say the lazy split really happened. */
function chunkCount(distDir) {
  const assets = path.join(distDir, "assets");
  if (!fs.existsSync(assets)) return 0;
  return fs.readdirSync(assets).filter((entry) => entry.endsWith(".js")).length;
}

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

export function renderReport(results) {
  const rows = results.map((result) => [
    result.name,
    result.ok ? "ok" : "FAIL",
    result.chunk ? kb(result.chunk.min) : "—",
    result.chunk ? kb(result.chunk.gzip) : "—",
    result.chunks ? String(result.chunks) : "—",
  ]);
  const header = ["example", "result", "entry min", "entry gz", "js chunks"];
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells) =>
    cells
      .map((cell, index) => cell.padEnd(widths[index]))
      .join("  ")
      .trimEnd();
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join(
    "\n",
  );
}

async function verifyExample(example, packages, options) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `comvi-example-${example.name}-`));
  const result = { name: example.name, dir: target, ok: false, steps: [] };
  try {
    copyTree(example.dir, target);

    const manifestPath = path.join(target, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(withOverrides(manifest, packages), null, 2)}\n`,
    );
    // `.npmrc`, not flags: `ignore-workspace` keeps pnpm from walking up into
    // this repo's `pnpm-workspace.yaml`, and `node-linker=hoisted` gives the
    // temp tree the flat `node_modules` a Vite app expects.
    fs.writeFileSync(
      path.join(target, ".npmrc"),
      "ignore-workspace=true\nnode-linker=hoisted\nstrict-peer-dependencies=false\n",
    );

    for (const [step, argv] of [
      ["install", ["install", "--no-frozen-lockfile", "--ignore-workspace"]],
      ["build", ["run", "build"]],
      ["typecheck", ["run", "typecheck"]],
    ]) {
      const { status, output } = run("pnpm", argv, { cwd: target, quiet: true });
      result.steps.push({ step, status, output });
      if (status !== 0) {
        console.error(`\n${example.name}: \`pnpm ${argv.join(" ")}\` exited ${status}\n${output}`);
        return result;
      }
      if (step === "install") {
        assertLocalResolutions(
          fs.readFileSync(path.join(target, "pnpm-lock.yaml"), "utf8"),
          declaredComviDeps(manifest),
        );
      }
    }

    const dist = path.join(target, "dist");
    result.chunk = measure(entryChunk(dist));
    result.chunks = chunkCount(dist);
    result.ok = true;
    return result;
  } catch (error) {
    console.error(`\n${example.name}: ${error.message}`);
    return result;
  } finally {
    if (!options.keep) fs.rmSync(target, { recursive: true, force: true });
  }
}

export function parseArgs(argv) {
  const options = { only: [], build: true, pack: true, keep: false, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--only") options.only.push(argv[++index]);
    else if (arg === "--no-build") options.build = false;
    else if (arg === "--no-pack") options.pack = false;
    else if (arg === "--keep") options.keep = true;
    else if (arg === "--json") options.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

async function main(argv) {
  const options = parseArgs(argv);
  let examples = exampleDirs();
  if (options.only.length > 0) {
    const wanted = new Set(options.only);
    const missing = [...wanted].filter((name) => !examples.some((entry) => entry.name === name));
    if (missing.length > 0) {
      console.error(`no such example: ${missing.join(", ")}`);
      return 2;
    }
    examples = examples.filter((entry) => wanted.has(entry.name));
  }
  if (examples.length === 0) {
    console.error("no examples found under examples/");
    return 2;
  }

  if (options.build) runOrThrow("pnpm", ["build"], { cwd: REPO_ROOT });
  if (options.pack) {
    cleanTarballs(REPO_ROOT);
    runOrThrow("pnpm", ["pack:release"], { cwd: REPO_ROOT });
  }
  const packages = workspacePackages(REPO_ROOT);
  if (!options.pack) assertTarballsFresh(packages);

  const results = [];
  for (const example of examples) {
    console.error(`examples-verify: ${example.name}…`);
    results.push(await verifyExample(example, packages, options));
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        results.map(({ name, ok, chunk, chunks }) => ({ name, ok, chunk, chunks })),
        null,
        2,
      ),
    );
  } else {
    console.log(
      `\n${packages.length} packages packed from ${REPO_ROOT}; ` +
        "every @comvi resolution is a local tarball.\n",
    );
    console.log(renderReport(results));
  }
  return results.every((result) => result.ok) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    console.error(`examples-verify: ${error.message}`);
    process.exitCode = 2;
  }
}

export { SCRIPT_DIR, EXAMPLES_DIR };
