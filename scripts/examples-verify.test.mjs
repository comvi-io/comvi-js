import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import {
  PINNED_PNPM,
  assertLocalResolutions,
  assertPinnedPnpm,
  declaredComviDeps,
  entryChunk,
  exampleInstallEnv,
  exampleKind,
  measureFiles,
  nextFirstLoad,
  nextPageRoute,
  nuxtEntryKey,
  nuxtPageRoute,
  parseArgs,
  provenanceLine,
  staticImportClosure,
  tempInstallEnv,
  withOverrides,
} from "./examples-verify.mjs";
import { childEnv } from "./examples-e2e/run.mjs";

/**
 * The pure helpers only. The install/build path is not tested here: it packs
 * fourteen tarballs and runs seven real installs, and a test that fakes those
 * would assert the fake. `pnpm examples:verify` is that path's own gate
 * (CONTRIBUTING gate 7).
 */

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

test("assertLocalResolutions accepts a lockfile whose @comvi entries are all file: tarballs", () => {
  const lockfile = [
    "overrides:",
    "  '@comvi/core': file:/tmp/comvi-core-0.5.0.tgz",
    "packages:",
    "  '@comvi/core@file:../../../packages/core/comvi-core-0.5.0.tgz':",
    "    resolution: {}",
    "  '@comvi/react@file:../../../packages/react/comvi-react-0.5.0.tgz':",
    "    resolution: {}",
  ].join("\n");

  assert.doesNotThrow(() => assertLocalResolutions(lockfile, ["@comvi/core", "@comvi/react"]));
});

test("assertLocalResolutions throws when one @comvi package resolved from the registry", () => {
  // The exact shape that shipped a green gate against the PREVIOUS release:
  // `pnpm pack` rewrote `workspace:*` to `0.4.0`, and the peer was fetched from
  // npm while every direct dependency came from a tarball.
  const lockfile = [
    "packages:",
    "  '@comvi/core@0.4.0':",
    "    resolution: {}",
    "  '@comvi/react@file:../../../packages/react/comvi-react-0.5.0.tgz':",
    "    resolution: {}",
  ].join("\n");

  assert.throws(() => assertLocalResolutions(lockfile, ["@comvi/react"]), {
    message: /1 @comvi resolution\(s\) came from the registry.*@comvi\/core@0\.4\.0/s,
  });
});

test("assertLocalResolutions fails closed on a lockfile it cannot parse", () => {
  // Zero parsed entries means zero strays, which would read as "provenance
  // clean" while nothing was ever checked. It has to be an error instead.
  const lockfile = "{ this is not a pnpm lockfile }";

  assert.throws(() => assertLocalResolutions(lockfile, ["@comvi/core"]), {
    message: /names no resolution for @comvi\/core.*never checked/s,
  });
});

test("withOverrides keys each override by the declared spec and leaves the declared ranges alone", () => {
  const packages = [
    { name: "@comvi/core", version: "0.4.0" },
    { name: "@comvi/react", version: "0.4.0" },
    { name: "@comvi/vite-plugin", version: "0.4.0" },
  ];
  const manifest = {
    name: "comvi-example-react",
    dependencies: { "@comvi/react": "^0.5.0", react: "^19.2.4" },
    devDependencies: { "@comvi/vite-plugin": "next" },
    pnpm: { onlyBuiltDependencies: ["esbuild"] },
  };

  const result = withOverrides(manifest, packages);

  assert.deepEqual(result.dependencies, { "@comvi/react": "^0.5.0", react: "^19.2.4" });
  assert.deepEqual(result.devDependencies, { "@comvi/vite-plugin": "next" });
  // Keyed by spec, never by bare name: a bare-name override rewrites the
  // packages' PEER ranges too, which blinds strict-peer-dependencies.
  assert.deepEqual(result.pnpm.overrides, {
    "@comvi/react@^0.5.0": "0.4.0",
    "@comvi/vite-plugin@next": "0.4.0",
  });
  assert.deepEqual(result.pnpm.onlyBuiltDependencies, ["esbuild"]);
});

test("withOverrides leaves undeclared packages to the candidate registry", () => {
  const packages = [
    { name: "@comvi/core", version: "0.5.0-rc.1" },
    { name: "@comvi/react", version: "0.5.0-rc.1" },
  ];
  const manifest = { dependencies: { "@comvi/react": "^0.5.0" } };

  const result = withOverrides(manifest, packages);

  assert.deepEqual(result.pnpm.overrides, { "@comvi/react@^0.5.0": "0.5.0-rc.1" });
});

test("withOverrides pins the temp install to the repo's packageManager", () => {
  const root = JSON.parse(
    fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ).packageManager;

  const result = withOverrides({ packageManager: "pnpm@10.0.0", dependencies: {} }, []);

  assert.equal(PINNED_PNPM, root);
  assert.match(PINNED_PNPM, /^pnpm@\d+\.\d+\.\d+/);
  assert.equal(result.packageManager, PINNED_PNPM);
});

test("tempInstallEnv drops every spelling of the release age, keeps the rest, adds extra", () => {
  const env = {
    PATH: "/bin",
    npm_config_minimum_release_age: "1440",
    pnpm_config_minimum_release_age: "1440",
    "npm_config_minimum-release-age": "1440",
    NPM_CONFIG_MINIMUM_RELEASE_AGE: "1440",
    npm_config_minimum_release_age_exclude: "@comvi/*",
    npm_config_registry: "r",
  };

  const result = tempInstallEnv(env, { CI: "1" });

  assert.deepEqual(result, { PATH: "/bin", npm_config_registry: "r", CI: "1" });
});

test("examples:verify installs without the release age the repo exported", () => {
  const env = { PATH: "/bin", npm_config_minimum_release_age: "1440" };

  const result = exampleInstallEnv("next", env);

  assert.deepEqual(result, { PATH: "/bin", CI: "1", NEXT_TELEMETRY_DISABLED: "1" });
});

test("examples:e2e children run without the release age the repo exported", (t) => {
  process.env.npm_config_minimum_release_age = "1440";
  process.env.pnpm_config_minimum_release_age = "1440";
  t.after(() => {
    delete process.env.npm_config_minimum_release_age;
    delete process.env.pnpm_config_minimum_release_age;
  });

  const result = childEnv("vite");

  assert.equal(result.npm_config_minimum_release_age, undefined);
  assert.equal(result.pnpm_config_minimum_release_age, undefined);
  assert.equal(result.CI, "1");
});

/** A directory holding a `pnpm` that prints `version`, first on PATH. */
function fakePnpm(version, status = 0) {
  const bin = tempDir("comvi-verify-fake-pnpm-");
  fs.writeFileSync(path.join(bin, "pnpm"), `#!/bin/sh\necho ${version}\nexit ${status}\n`, {
    mode: 0o755,
  });
  return { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
}

test("assertPinnedPnpm returns the version when pnpm is the pinned one", () => {
  const env = fakePnpm("9.12.1");

  assert.equal(
    assertPinnedPnpm(tempDir("comvi-verify-pnpm-"), { env, pinned: "pnpm@9.12.1" }),
    "9.12.1",
  );
  // A corepack hash suffix is not part of the version.
  assert.equal(
    assertPinnedPnpm(tempDir("comvi-verify-pnpm-"), { env, pinned: "pnpm@9.12.1+sha512.abc" }),
    "9.12.1",
  );
});

test("assertPinnedPnpm fails when PATH runs another pnpm", () => {
  const env = fakePnpm("10.33.2");

  assert.throws(
    () => assertPinnedPnpm(tempDir("comvi-verify-pnpm-"), { env, pinned: "pnpm@9.12.1" }),
    {
      message: /is 10\.33\.2, not the pinned 9\.12\.1/,
    },
  );
});

test("assertPinnedPnpm fails when pnpm exits non-zero", () => {
  const env = fakePnpm("9.12.1", 1);

  assert.throws(
    () => assertPinnedPnpm(tempDir("comvi-verify-pnpm-"), { env, pinned: "pnpm@9.12.1" }),
    {
      message: /unavailable \(exit 1\), not the pinned 9\.12\.1/,
    },
  );
});

test("declaredComviDeps reads both pools and ignores everything outside the scope", () => {
  const manifest = {
    dependencies: { "@comvi/react": "^0.5.0", "@comvi/core": "^0.5.0", react: "^19.2.4" },
    devDependencies: { "@comvi/vite-plugin": "^0.5.0", vite: "^8.0.3" },
  };

  assert.deepEqual(declaredComviDeps(manifest), [
    "@comvi/core",
    "@comvi/react",
    "@comvi/vite-plugin",
  ]);
});

test("declaredComviDeps returns nothing for a manifest with no dependency pools", () => {
  assert.deepEqual(declaredComviDeps({ name: "x" }), []);
});

test("entryChunk picks the script index.html names, not the biggest file", () => {
  // The lazy locale catalogs are separate chunks by design. A "largest file"
  // rule would keep working until the split regressed and then silently start
  // reporting a locale chunk as the entry.
  const dist = tempDir("comvi-verify-dist-");
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "assets", "index-aaa.js"), "x".repeat(100));
  fs.writeFileSync(path.join(dist, "assets", "uk-bbb.js"), "y".repeat(10_000));
  fs.writeFileSync(
    path.join(dist, "index.html"),
    '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-aaa.js"></script></head><body></body></html>',
  );

  assert.equal(entryChunk(dist), path.join(dist, "assets", "index-aaa.js"));
});

test("entryChunk throws when the build wrote no module script", () => {
  const dist = tempDir("comvi-verify-noscript-");
  fs.writeFileSync(path.join(dist, "index.html"), "<!doctype html><html></html>");

  assert.throws(() => entryChunk(dist), { message: /no module script/ });
});

test("parseArgs defaults to building, packing and verifying every example", () => {
  assert.deepEqual(parseArgs([]), {
    only: [],
    build: true,
    pack: true,
    keep: false,
    json: false,
  });
});

test("parseArgs collects repeated --only and the negative flags", () => {
  assert.deepEqual(parseArgs(["--only", "react", "--only", "vue", "--no-build", "--keep"]), {
    only: ["react", "vue"],
    build: false,
    pack: true,
    keep: true,
    json: false,
  });
});

test("parseArgs rejects an unknown argument rather than ignoring it", () => {
  assert.throws(() => parseArgs(["--only", "react", "--typo"]), {
    message: /unknown argument: --typo/,
  });
});

test("provenanceLine makes no claim when an example never reached the assertion", () => {
  // The failure this exists for: every install dies, `assertLocalResolutions`
  // never runs, and the summary above the red table still says every
  // resolution is a local tarball.
  const results = [
    { name: "react", ok: false, provenanceChecked: false },
    { name: "vue", ok: true, provenanceChecked: true },
  ];

  const line = provenanceLine(results, [{ name: "@comvi/core" }], { pack: true });

  assert.match(line, /provenance NOT established: react/);
  assert.doesNotMatch(line, /every @comvi resolution in all/);
});

test("provenanceLine keeps the provenance claim but flags a later failure", () => {
  // The middle branch: every install reached the assertion and passed, so the
  // claim about where the packages came from IS established — and then a build
  // or typecheck failed. Both facts are true at once, and the line has to carry
  // both rather than picking whichever it saw last.
  const results = [
    { name: "react", ok: true, provenanceChecked: true },
    { name: "vue", ok: false, provenanceChecked: true },
  ];

  const line = provenanceLine(results, [{ name: "@comvi/core" }], { pack: true });

  assert.match(line, /every @comvi resolution in all 2 installs is a local tarball/);
  assert.match(line, /but see the failures below/);
  assert.doesNotMatch(line, /provenance NOT established/);
});

test("provenanceLine says reused, not packed, under --no-pack", () => {
  const results = [{ name: "vue", ok: true, provenanceChecked: true }];

  const line = provenanceLine(results, [{ name: "@comvi/core" }], { pack: false });

  assert.match(line, /reused \(--no-pack\)/);
  assert.doesNotMatch(line, /packed/);
});

test("exampleKind reads the build script, not the directory name", () => {
  assert.equal(exampleKind({ scripts: { build: "vite build" } }), "vite");
  assert.equal(exampleKind({ scripts: { build: "next build" } }), "next");
  assert.equal(exampleKind({ scripts: { build: "nuxt build" } }), "nuxt");
});

test("exampleKind tells SvelteKit and SolidStart from a plain Vite app by their dependency", () => {
  const build = { build: "vite build" };
  assert.equal(
    exampleKind({ scripts: build, devDependencies: { "@sveltejs/kit": "^3.0.0" } }),
    "sveltekit",
  );
  assert.equal(
    exampleKind({ scripts: build, dependencies: { "@solidjs/start": "^2.0.0" } }),
    "solidstart",
  );
  assert.equal(exampleKind({ scripts: build, dependencies: { "solid-js": "^1.9.0" } }), "vite");
});

test("exampleKind sees the CLI behind a flag or a chained command", () => {
  assert.equal(exampleKind({ scripts: { build: "vite build --mode production" } }), "vite");
  assert.equal(exampleKind({ scripts: { build: "nuxt generate" } }), "nuxt");
  assert.equal(exampleKind({ scripts: { build: "rm -rf .next && next build" } }), "next");
});

test("exampleKind does not mistake `next` for `nuxt`", () => {
  // Four letters apart, and picking the wrong one sends the probe looking for
  // `.output/public/_nuxt` in a Next app and reporting "no such directory" as
  // if the build had failed.
  assert.equal(exampleKind({ scripts: { build: "next build" } }), "next");
  assert.notEqual(exampleKind({ scripts: { build: "nuxt build" } }), "next");
});

test("exampleKind refuses a build script it cannot measure", () => {
  // Silence here would mean a new example is verified with the WRONG size
  // probe, or with none — the report would still print a row.
  assert.throws(() => exampleKind({ scripts: { build: "astro build" } }, "examples/astro"), {
    message: /examples\/astro.*astro build.*vite, next, nuxt, sveltekit and solidstart/s,
  });
});

test("exampleKind refuses a manifest with no build script at all", () => {
  assert.throws(() => exampleKind({ scripts: {} }, "examples/broken"), {
    message: /examples\/broken.*no build script/s,
  });
});

test("nextPageRoute picks the app's own page and ignores Next's built-in ones", () => {
  const manifest = {
    pages: {
      "/_not-found/page": ["a.js"],
      "/[locale]/layout": ["b.js"],
      "/[locale]/page": ["c.js"],
    },
  };

  assert.equal(nextPageRoute(manifest), "/[locale]/page");
});

test("nextPageRoute reports the landing page when an app has a second page", () => {
  const manifest = { pages: { "/[locale]/page": ["a.js"], "/[locale]/about/page": ["b.js"] } };

  assert.equal(nextPageRoute(manifest), "/[locale]/page");
});

test("nextPageRoute refuses to guess when there is no single landing page", () => {
  const none = { pages: { "/[locale]/about/page": ["b.js"] } };
  const two = { pages: { "/page": ["a.js"], "/[locale]/page": ["b.js"] } };

  assert.throws(() => nextPageRoute(none), { message: /exactly one landing page route.*found 0/s });
  assert.throws(() => nextPageRoute(two), { message: /exactly one landing page route.*found 2/s });
});

test("nextPageRoute fails closed on a manifest shape it cannot read", () => {
  // A Next version that renames the file or reshapes it would otherwise yield
  // zero routes, and "no page found" must not read as "nothing to measure".
  assert.throws(() => nextPageRoute({ notPages: {} }), { message: /no `pages` object/ });
});

test("nextFirstLoad unions the page's chunks with every enclosing layout's", () => {
  // What Next's own build summary calls "First Load JS": the browser walks
  // layout then page, so both lists are downloaded before the route renders.
  const manifest = {
    pages: {
      "/layout": ["webpack.js", "main-app.js"],
      "/[locale]/layout": ["webpack.js", "shared.js", "layout.js"],
      "/[locale]/page": ["webpack.js", "shared.js", "page.js"],
      "/_not-found/page": ["not-found.js"],
    },
  };

  assert.deepEqual(nextFirstLoad(manifest, "/[locale]/page"), [
    "webpack.js",
    "shared.js",
    "page.js",
    "main-app.js",
    "layout.js",
  ]);
});

test("nextFirstLoad leaves out a layout from a sibling branch", () => {
  const manifest = {
    pages: {
      "/[locale]/layout": ["locale-layout.js"],
      "/admin/layout": ["admin-layout.js"],
      "/[locale]/page": ["page.js"],
    },
  };

  assert.deepEqual(nextFirstLoad(manifest, "/[locale]/page"), ["page.js", "locale-layout.js"]);
});

test("nextFirstLoad throws when the route it was handed is not in the manifest", () => {
  assert.throws(() => nextFirstLoad({ pages: { "/[locale]/page": ["a.js"] } }, "/other/page"), {
    message: /no entry for \/other\/page/,
  });
});

test("nuxtEntryKey picks the isEntry chunk, not the biggest or the first", () => {
  // The locale catalogs are dynamic imports of the entry, and one of them being
  // listed first in the manifest must not make it the thing being measured. The
  // KEY is what comes back, not the file: the import graph is keyed by source.
  const manifest = {
    "locales/uk.json": { file: "uk-BRI4vdSi.js", isDynamicEntry: true },
    "../node_modules/nuxt/dist/app/entry.js": {
      file: "YERnk0my.js",
      name: "entry",
      isEntry: true,
    },
    "_shared.js": { file: "BOrKvaDh.js" },
  };

  assert.equal(nuxtEntryKey(manifest), "../node_modules/nuxt/dist/app/entry.js");
});

test("nuxtEntryKey fails closed when the manifest names no entry", () => {
  assert.throws(() => nuxtEntryKey({ "a.js": { file: "a-1.js" } }), {
    message: /no chunk marked `isEntry`/,
  });
});

test("nuxtEntryKey refuses to choose between two entries", () => {
  assert.throws(
    () => nuxtEntryKey({ a: { file: "a.js", isEntry: true }, b: { file: "b.js", isEntry: true } }),
    { message: /2 chunks marked `isEntry`/ },
  );
});

test("nuxtPageRoute picks the app's page, not a dependency's", () => {
  // Nuxt's own error components are under `node_modules` but not under
  // `pages/`; a LAYER is both. A layer shipping `pages/index.vue` is ordinary —
  // that is what layers are for — and without the node_modules guard it makes
  // this manifest ambiguous and the probe throws on a build that is fine.
  const manifest = {
    "../node_modules/nuxt/dist/app/components/error-404.vue": { file: "a.js" },
    "../node_modules/nuxt/dist/app/entry.js": { file: "b.js", isEntry: true },
    "../node_modules/some-layer/pages/index.vue": { file: "c.js" },
    "pages/index.vue": { file: "d.js" },
    "locales/en.json": { file: "e.js" },
  };

  assert.equal(nuxtPageRoute(manifest), "pages/index.vue");
});

test("nuxtPageRoute reports the landing page when an app has a second page", () => {
  const manifest = {
    "pages/index.vue": { file: "a.js" },
    "pages/about.vue": { file: "b.js" },
  };

  assert.equal(nuxtPageRoute(manifest), "pages/index.vue");
});

test("nuxtPageRoute refuses to guess when there is no landing page", () => {
  const manifest = { "pages/about.vue": { file: "b.js" } };

  assert.throws(() => nuxtPageRoute(manifest), {
    message: /exactly one landing page chunk.*found 0/s,
  });
});

test("nuxtPageRoute fails closed on a manifest shape it cannot read", () => {
  assert.throws(() => nuxtPageRoute("not a manifest"), { message: /is not an object/ });
});

test("staticImportClosure follows imports transitively, because the browser must", () => {
  // Vite's `imports` are STATIC: the entry cannot execute until every one of
  // them has arrived, and Nuxt marks them `preload`. Measuring the entry alone
  // reports a third of what the page actually costs.
  const manifest = {
    entry: { file: "entry.js", imports: ["_a"] },
    _a: { file: "a.js", imports: ["_b"] },
    _b: { file: "b.js", imports: [] },
  };

  assert.deepEqual(staticImportClosure(manifest, ["entry"]), ["entry.js", "a.js", "b.js"]);
});

test("staticImportClosure counts a chunk shared by two roots once", () => {
  // The page chunk and the entry both statically import the shared vendor
  // chunk; the browser downloads it once and so must the number.
  const manifest = {
    entry: { file: "entry.js", imports: ["_shared"] },
    "pages/index.vue": { file: "page.js", imports: ["_shared", "entry"] },
    _shared: { file: "shared.js", imports: [] },
  };

  // Breadth first, so the roots come out in the order they were asked for and
  // the shared chunk lands once, after both.
  assert.deepEqual(staticImportClosure(manifest, ["entry", "pages/index.vue"]), [
    "entry.js",
    "page.js",
    "shared.js",
  ]);
});

test("staticImportClosure terminates on a cycle instead of exhausting the stack", () => {
  // Nuxt's real manifest has one: `pages/index.vue` imports the entry, and the
  // error components import it back.
  const manifest = {
    entry: { file: "entry.js", imports: ["_a"] },
    _a: { file: "a.js", imports: ["entry"] },
  };

  assert.deepEqual(staticImportClosure(manifest, ["entry"]), ["entry.js", "a.js"]);
});

test("staticImportClosure ignores dynamicImports, which are the lazy half", () => {
  // The three locale catalogs are `dynamicImports` of the entry. Counting them
  // as first load would erase the very split the demo exists to show.
  const manifest = {
    entry: { file: "entry.js", imports: [], dynamicImports: ["locales/uk.json"] },
    "locales/uk.json": { file: "uk.js" },
  };

  assert.deepEqual(staticImportClosure(manifest, ["entry"]), ["entry.js"]);
});

test("staticImportClosure throws on an import the manifest does not describe", () => {
  assert.throws(
    () => staticImportClosure({ entry: { file: "e.js", imports: ["_gone"] } }, ["entry"]),
    {
      message: /no chunk "_gone"/,
    },
  );
});

test("measureFiles sums gzip per file, not over the concatenation", () => {
  // Each chunk is its own HTTP response with its own compression window.
  // Gzipping them together reports a number no browser ever sees — and the two
  // differ most for exactly the case here: several similar JS chunks.
  const dir = tempDir("comvi-verify-measure-");
  const one = path.join(dir, "one.js");
  const two = path.join(dir, "two.js");
  const body = "export const value = 'the same repeated body';".repeat(200);
  fs.writeFileSync(one, body);
  fs.writeFileSync(two, body);

  const measured = measureFiles([one, two]);

  assert.equal(measured.min, body.length * 2);
  assert.equal(measured.gzip, 2 * zlib.gzipSync(Buffer.from(body), { level: 9 }).length);
  assert.ok(measured.gzip > zlib.gzipSync(Buffer.from(body + body), { level: 9 }).length);
});

test("measureFiles labels a single file by its basename and a set by its count", () => {
  const dir = tempDir("comvi-verify-label-");
  const one = path.join(dir, "index-aaa.js");
  const two = path.join(dir, "vendor-bbb.js");
  fs.writeFileSync(one, "x");
  fs.writeFileSync(two, "y");

  assert.equal(measureFiles([one]).file, "index-aaa.js");
  assert.equal(measureFiles([one, two]).file, "2 chunks");
});
