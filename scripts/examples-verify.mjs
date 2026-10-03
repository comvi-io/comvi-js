import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import zlib from "node:zlib";
import { spawn, spawnSync } from "node:child_process";

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
 *   2. `pnpm build` — the real build a reader gets: `vite build`,
 *      `next build` or `nuxt build`, whichever the example's own script says.
 *   3. the example's own `typecheck` script — `tsc`, `vue-tsc`,
 *      `svelte-check` or `nuxt typecheck`, whichever the framework needs.
 *   4. a size probe, chosen by KIND: the three build tools put "the entry
 *      chunk" in three different places, and Next's first load is not one
 *      file at all.
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
const SKIP_ENTRIES = new Set([
  "node_modules",
  "dist",
  ".turbo",
  "pnpm-lock.yaml",
  ".vite",
  // A local `pnpm build` in an example leaves these behind, and copying one in
  // would let a probe measure the PREVIOUS build when this run's died.
  ".next",
  ".nuxt",
  ".output",
  ".data",
]);

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

export function copyTree(from, to) {
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
 * The temp install's `.npmrc`; why each line is there is spelled out where
 * `verifyExample` writes it. Exported so `examples:e2e` installs the same way.
 */
export const EXAMPLE_NPMRC = [
  "ignore-workspace=true",
  "node-linker=hoisted",
  "auto-install-peers=false",
  "strict-peer-dependencies=true",
  "",
].join("\n");

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
  // `pkg.tarball` when the caller names the file (`examples:e2e --tarballs`).
  for (const pkg of packages) overrides[pkg.name] = `file:${pkg.tarball ?? tarballFor(pkg)}`;
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
  return measureFiles([file]);
}

/**
 * The bytes of one or more files, as a reader downloads them.
 *
 * Gzip is summed PER FILE rather than taken over the concatenation, because
 * that is what the transfer costs: each chunk is its own HTTP response with its
 * own compression window, and gzipping them together would report a number no
 * browser ever sees.
 */
export function measureFiles(files) {
  let min = 0;
  let gzip = 0;
  for (const file of files) {
    const bytes = fs.readFileSync(file);
    min += bytes.length;
    gzip += zlib.gzipSync(bytes, { level: 9 }).length;
  }
  return {
    file: files.length === 1 ? path.basename(files[0]) : `${files.length} chunks`,
    min,
    gzip,
  };
}

/**
 * Every `.js` under `dir`, at any depth — the client bundle, chunk by chunk.
 *
 * One definition for all three kinds, and recursive for all three: Vite's own
 * output is flat under `dist/assets`, but Next nests its chunks under
 * `.next/static/chunks/app/...`, and a `js chunks` column that meant "the top
 * level of one directory" for some rows and "everything" for others would put
 * two different measurements under one heading.
 */
function countJs(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) total += countJs(path.join(dir, entry.name));
    else if (entry.name.endsWith(".js")) total += 1;
  }
  return total;
}

/**
 * Which build tool an example runs, and therefore where its bytes end up.
 *
 * Read off the example's OWN `build` script, not a table keyed by directory
 * name: the script is what actually executes, so `examples/next` renamed to
 * `examples/app-router` still measures as a Next app, and a manifest whose
 * build was quietly switched cannot go on being measured as the old kind.
 */
const BUILD_CLIS = [
  ["next", /(^|[\s&|;])next\s+build\b/],
  ["nuxt", /(^|[\s&|;])(nuxt|nuxi)\s+(build|generate)\b/],
  ["vite", /(^|[\s&|;])vite\s+build\b/],
];

export function exampleKind(manifest, name = "an example") {
  const build = manifest?.scripts?.build;
  if (typeof build !== "string" || build.trim() === "") {
    throw new Error(
      `${name} declares no build script, so there is nothing to run and nothing to measure.`,
    );
  }
  for (const [kind, pattern] of BUILD_CLIS) {
    if (pattern.test(build)) return kind;
  }
  throw new Error(
    `${name}: cannot tell what \`${build}\` builds. examples-verify knows vite, next and nuxt; ` +
      'a new framework needs a kind of its own here AND a size probe, because "the entry ' +
      'chunk" is in a different place — and a different SHAPE — for each of them.',
  );
}

/**
 * The app's LANDING page entry in Next's `app-build-manifest.json`.
 *
 * Next records one chunk list per App Router entry: every layout, every page,
 * and its own built-in `/_not-found`. The examples have a second page (the
 * e2e suite navigates to it), so "first load" is reported for the landing
 * page: the one route whose path is nothing but dynamic segments
 * (`/page` or `/[locale]/page`). Zero or several such routes is a question
 * this cannot answer, and it refuses rather than reporting whichever key
 * happened to come first.
 */
export function nextPageRoute(manifest) {
  const pages = manifest?.pages;
  if (!pages || typeof pages !== "object") {
    throw new Error(
      "Next's app-build-manifest.json has no `pages` object. Either the build did not run or " +
        "this Next version reshaped the manifest — in which case nothing was measured, and a " +
        "size of zero must not read as a small bundle.",
    );
  }
  const routes = Object.keys(pages).filter((key) => key.endsWith("/page") && !key.startsWith("/_"));
  const landing = routes.filter((key) =>
    key
      .slice(0, -"/page".length)
      .split("/")
      .filter(Boolean)
      .every((segment) => /^\[.+\]$/.test(segment)),
  );
  if (landing.length !== 1) {
    throw new Error(
      `expected exactly one landing page route in app-build-manifest.json, found ${landing.length}` +
        ` among ${routes.length} page route(s)${routes.length > 0 ? `: ${routes.join(", ")}` : ""}. ` +
        '"First load" is a property of ONE route, and the table reports the landing page.',
    );
  }
  return landing[0];
}

/**
 * Every JS file the browser must have before Next can render `route` — the
 * number the build summary prints as "First Load JS".
 *
 * A page is rendered inside its layouts, so the browser downloads the layout
 * chunks and the page chunks; the manifest lists them separately and they
 * overlap heavily, hence the dedupe. A layout on a SIBLING branch is not on the
 * path to this route and is deliberately left out.
 */
export function nextFirstLoad(manifest, route) {
  const pages = manifest?.pages ?? {};
  const entry = pages[route];
  if (!entry) {
    throw new Error(
      `app-build-manifest.json has no entry for ${route} (it names: ${Object.keys(pages).join(", ") || "nothing"}).`,
    );
  }
  const files = new Set(entry);
  const scope = route.slice(0, -"/page".length);
  for (const [key, list] of Object.entries(pages)) {
    if (!key.endsWith("/layout")) continue;
    const layoutScope = key.slice(0, -"/layout".length);
    if (scope === layoutScope || scope.startsWith(`${layoutScope}/`)) {
      for (const file of list) files.add(file);
    }
  }
  return [...files];
}

/**
 * The client entry in Nuxt's Vite manifest, by the same rule as the Vite probe:
 * named by the build, never picked by size.
 *
 * The KEY comes back rather than the file, because the import graph is keyed by
 * source: `chunk.imports` holds manifest keys, and the closure below has to
 * walk them.
 */
export function nuxtEntryKey(manifest) {
  const entries = Object.entries(manifest ?? {}).filter(([, chunk]) => chunk?.isEntry);
  if (entries.length === 0) {
    throw new Error(
      "Nuxt's client manifest has no chunk marked `isEntry`, so nothing here says what the " +
        "browser loads first and nothing was measured.",
    );
  }
  if (entries.length > 1) {
    throw new Error(
      `Nuxt's client manifest has ${entries.length} chunks marked \`isEntry\` ` +
        `(${entries.map(([, chunk]) => chunk.file).join(", ")}). "The entry" is one chunk; pick ` +
        "deliberately rather than letting object order decide.",
    );
  }
  return entries[0][0];
}

/**
 * The app's LANDING page chunk in Nuxt's client manifest.
 *
 * Nuxt compiles every route component into its own dynamic chunk, keyed by its
 * source path under `pages/`, alongside its built-in `error-404.vue` and
 * `error-500.vue` (which live under `node_modules/nuxt/...` and are therefore
 * not matched). A one-page example has exactly one, so anything else is a
 * question this cannot answer.
 */
export function nuxtPageRoute(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error(
      "Nuxt's client manifest is not an object. Either the build did not run or this Nuxt " +
        "version reshaped it — in which case nothing was measured, and a size of zero must " +
        "not read as a small bundle.",
    );
  }
  const routes = Object.keys(manifest).filter(
    (key) => /(^|\/)pages\/.+\.vue$/.test(key) && !key.includes("node_modules"),
  );
  // The landing page, by the same rule as Next: the examples have a second
  // page, and the table reports the one a visitor lands on.
  const landing = routes.filter((key) => /(^|\/)pages\/index\.vue$/.test(key));
  if (landing.length !== 1) {
    throw new Error(
      `expected exactly one landing page chunk (pages/index.vue) in Nuxt's client manifest, ` +
        `found ${landing.length} among ${routes.length} page chunk(s)` +
        `${routes.length > 0 ? `: ${routes.join(", ")}` : ""}. "First load" is a property of ONE ` +
        "route, and the table reports the landing page.",
    );
  }
  return landing[0];
}

/**
 * Every file reachable from `roots` through STATIC imports.
 *
 * Vite's `imports` are the ones the chunk cannot execute without — Nuxt emits
 * them as `<link rel="modulepreload">` and the browser has them before the
 * entry runs — so measuring the entry alone reports a fraction of what the page
 * costs. `dynamicImports` are deliberately NOT followed: the three locale
 * catalogs are dynamic imports of the entry, and counting them would erase the
 * lazy split the examples exist to demonstrate.
 *
 * Cycle-safe because the real manifest has cycles: `pages/index.vue` imports
 * the entry, and Nuxt's error components import it back.
 */
export function staticImportClosure(manifest, roots) {
  const files = [];
  const seenFiles = new Set();
  const seenKeys = new Set();
  const queue = [...roots];
  for (let index = 0; index < queue.length; index += 1) {
    const key = queue[index];
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const chunk = manifest?.[key];
    if (!chunk) {
      throw new Error(
        `Nuxt's client manifest has no chunk "${key}", so the import graph cannot be closed ` +
          "and the size below the entry is unknown.",
      );
    }
    if (chunk.file && !seenFiles.has(chunk.file)) {
      seenFiles.add(chunk.file);
      files.push(chunk.file);
    }
    for (const next of chunk.imports ?? []) queue.push(next);
  }
  return files;
}

/**
 * The probes, one per kind. Each returns the files that make up "first load"
 * plus the total number of client `.js` chunks the build emitted, and each
 * fails loudly rather than returning nothing: a missing size must not be
 * reportable as a small one.
 *
 * The two numbers answer different questions on purpose. `files` is what the
 * browser must have before the route renders; `chunks` is everything the build
 * wrote, which is where the lazily-loaded locale catalogs show up — the split
 * the examples exist to demonstrate is only visible in the gap between them.
 */
async function viteProbe(dir) {
  const dist = path.join(dir, "dist");
  return { files: [entryChunk(dist)], chunks: countJs(dist) };
}

async function nextProbe(dir) {
  const manifestPath = path.join(dir, ".next", "app-build-manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`no .next/app-build-manifest.json — \`next build\` produced no app build.`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const files = nextFirstLoad(manifest, nextPageRoute(manifest));
  return {
    files: files.map((file) => path.join(dir, ".next", file)),
    // Everything served from /_next/static, which is where the three lazy
    // catalog chunks live; they are in no route's first-load list, so counting
    // only those would report the split as absent.
    chunks: countJs(path.join(dir, ".next", "static")),
  };
}

async function nuxtProbe(dir) {
  // The Vite client manifest, which is what Nitro itself reads to decide the
  // `#entry` import map and the modulepreload links it writes into every
  // rendered page. It is a JS module rather than JSON, so it is imported.
  const manifestPath = path.join(dir, ".nuxt", "dist", "server", "client.manifest.mjs");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      "no .nuxt/dist/server/client.manifest.mjs — the Nuxt build wrote no client manifest, so " +
        "there is nothing that names the entry chunk.",
    );
  }
  const manifest = (await import(url.pathToFileURL(manifestPath).href)).default;
  const assets = path.join(dir, ".output", "public", "_nuxt");
  // The entry AND the route's own chunk, each closed over its static imports:
  // Nuxt preloads both, and neither runs until every `imports` entry has landed.
  const files = staticImportClosure(manifest, [nuxtEntryKey(manifest), nuxtPageRoute(manifest)]);
  const missing = files.filter((file) => !fs.existsSync(path.join(assets, file)));
  if (missing.length > 0) {
    throw new Error(
      `the client manifest names ${missing.join(", ")}, which the build did not write to ${assets}.`,
    );
  }
  return {
    files: files.map((file) => path.join(assets, file)),
    chunks: countJs(assets),
  };
}

/**
 * Per kind: how it is built, and how it is measured.
 *
 * The build ARGV is `pnpm run build` for all three on purpose — the example's
 * own script is the contract a reader executes, and a table that ran something
 * else would be verifying a command nobody types. What genuinely differs is the
 * environment (neither SSR framework may phone home from a gate) and the probe,
 * because "the entry chunk" lives somewhere different in each of the three
 * build outputs and, for Next, is not one file at all.
 */
export const KINDS = {
  vite: { build: ["run", "build"], env: {}, probe: viteProbe },
  next: { build: ["run", "build"], env: { NEXT_TELEMETRY_DISABLED: "1" }, probe: nextProbe },
  nuxt: { build: ["run", "build"], env: { NUXT_TELEMETRY_DISABLED: "1" }, probe: nuxtProbe },
};

/** What the "first load" columns mean, which is not the same thing per kind. */
export const FIRST_LOAD_LEGEND = [
  "first load = what the browser must have before the route renders:",
  "  vite — the entry chunk dist/index.html names;",
  "  next — the route's chunk list from .next/app-build-manifest.json (page + enclosing",
  "         layouts), \u2248 the build summary's \"First Load JS\" (level-9 gzip here, Next's own",
  "         figure is computed its way);",
  "  nuxt — the isEntry chunk and the route chunk, each closed over its static `imports`,",
  "         in .output/public/_nuxt.",
  "js chunks = every .js the build wrote for the client; the gap between the two columns is",
  "  everything not needed to render the route, which includes the three lazy locale catalogs.",
].join("\n");

function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/**
 * The provenance claim, or an admission that there is none.
 *
 * "every @comvi resolution is a local tarball" is the strongest sentence this
 * script prints, and it used to print unconditionally — above a table of five
 * failures, in a run where `assertLocalResolutions` had never executed because
 * every install died first. A claim that survives its own evidence being absent
 * is worse than no claim, because it reads as evidence. So it is stated only
 * when every example reached the assertion AND passed everything after it.
 *
 * `packed` vs `reused` for the same reason: under `--no-pack` nothing was
 * packed this run, and saying otherwise misdescribes where the bytes came from.
 */
export function provenanceLine(results, packages, options) {
  const unchecked = results.filter((result) => !result.provenanceChecked);
  const origin = options.pack ? "packed" : "reused (--no-pack)";
  if (unchecked.length > 0) {
    return (
      `provenance NOT established: ${unchecked.map((result) => result.name).join(", ")} ` +
      "never reached the lockfile assertion, so nothing here says where their " +
      "@comvi packages came from."
    );
  }
  if (!results.every((result) => result.ok)) {
    return (
      `${packages.length} packages ${origin} from ${REPO_ROOT}; every @comvi resolution in ` +
      `all ${results.length} installs is a local tarball — but see the failures below.`
    );
  }
  return (
    `${packages.length} packages ${origin} from ${REPO_ROOT}; ` +
    `every @comvi resolution in all ${results.length} installs is a local tarball.`
  );
}

export function renderReport(results) {
  const rows = results.map((result) => [
    result.name,
    result.kind ?? "—",
    result.ok ? "ok" : "FAIL",
    result.chunk ? kb(result.chunk.min) : "—",
    result.chunk ? kb(result.chunk.gzip) : "—",
    result.files ? String(result.files) : "—",
    result.chunks ? String(result.chunks) : "—",
  ]);
  const header = [
    "example",
    "kind",
    "result",
    "first load min",
    "first load gz",
    "first-load files",
    "js chunks",
  ];
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
  const result = {
    name: example.name,
    dir: target,
    ok: false,
    provenanceChecked: false,
    steps: [],
  };
  try {
    copyTree(example.dir, target);

    const manifestPath = path.join(target, "package.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    // Decided BEFORE anything runs: an example whose build this script cannot
    // measure must fail here, not build green and then get a "—" in the table.
    const kind = exampleKind(manifest, `examples/${example.name}`);
    result.kind = kind;
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify(withOverrides(manifest, packages), null, 2)}\n`,
    );
    // `.npmrc`, not flags: `ignore-workspace` keeps pnpm from walking up into
    // this repo's `pnpm-workspace.yaml`, and `node-linker=hoisted` gives the
    // temp tree the flat `node_modules` a Vite app expects.
    //
    // The two peer settings decide what this gate can see about PEERS, and it
    // is narrower than it looks. With `pnpm.overrides` in place an example that
    // fails to declare `@comvi/core` still installs: the override satisfies the
    // peer, so these settings do NOT catch a missing @comvi peer here — the
    // provenance assertion below is what caught that one, by reporting the
    // registry copy it had been resolved from.
    //
    // What they do catch is an UNSATISFIABLE peer RANGE: repack the detector
    // with `peerDependencies: { "@comvi/core": "^9.0.0" }` and the install dies
    // with ERR_PNPM_PEER_DEP_ISSUES instead of shrugging. That is the failure a
    // reader would hit, because StackBlitz runs `npm install`, which errors on
    // an unmet peer where pnpm's defaults quietly auto-install one.
    //
    // RELEASE CAPTAIN: re-run this gate AFTER the version bump. Today the
    // detector's peer range is `^0.4.0` and the tarballs are 0.4.0, so it is
    // satisfied by construction. The bump is the moment that range and the
    // examples' `^0.5.0` meet for the first time, and the only moment this
    // check can fail.
    //
    // The last line sends the whole @comvi scope to the candidate's own
    // registry, so a PEER no override reaches (core behind the fetch loader in
    // the Nuxt example) resolves to the same tarballs and never to npmjs.org:
    // scripts/examples-e2e/candidate-registry.mjs.
    fs.writeFileSync(
      path.join(target, ".npmrc"),
      `${EXAMPLE_NPMRC}@comvi:registry=${options.registryUrl}\n`,
    );

    for (const [step, argv] of [
      ["install", ["install", "--no-frozen-lockfile", "--ignore-workspace"]],
      ["build", KINDS[kind].build],
      ["typecheck", ["run", "typecheck"]],
    ]) {
      const { status, output } = run("pnpm", argv, {
        cwd: target,
        quiet: true,
        // `CI` is not set here on a laptop, and Next and Nuxt both take that as
        // permission to print an interactive telemetry notice on first run.
        env: { ...process.env, CI: "1", ...KINDS[kind].env },
      });
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
        // Recorded, not inferred: the provenance summary at the end may only
        // be printed for examples that really reached this line.
        result.provenanceChecked = true;
      }
    }

    const { files, chunks } = await KINDS[kind].probe(target);
    result.chunk = measureFiles(files);
    result.files = files.length;
    result.chunks = chunks;
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

  // A child process, not an in-process server: the installs below are
  // `spawnSync`, which would block a server living in this event loop.
  const urlFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "comvi-registry-")), "url");
  const registry = spawn(
    process.execPath,
    [
      path.join(SCRIPT_DIR, "examples-e2e", "candidate-registry.mjs"),
      "--url-file",
      urlFile,
      ...packages.map((pkg) => tarballFor(pkg)),
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  const results = [];
  try {
    for (let waited = 0; !fs.existsSync(urlFile); waited += 100) {
      if (waited > 30_000 || registry.exitCode !== null) {
        throw new Error("the candidate registry did not start");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    options.registryUrl = fs.readFileSync(urlFile, "utf8");
    for (const example of examples) {
      console.error(`examples-verify: ${example.name}…`);
      results.push(await verifyExample(example, packages, options));
    }
  } finally {
    registry.kill();
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        results.map(({ name, kind, ok, chunk, files, chunks }) => ({
          name,
          kind,
          ok,
          chunk,
          files,
          chunks,
        })),
        null,
        2,
      ),
    );
  } else {
    console.log(`\n${provenanceLine(results, packages, options)}\n`);
    console.log(renderReport(results));
    console.log(`\n${FIRST_LOAD_LEGEND}`);
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
