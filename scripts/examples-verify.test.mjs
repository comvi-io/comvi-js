import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertLocalResolutions,
  declaredComviDeps,
  entryChunk,
  exampleKind,
  nextFirstLoad,
  nextPageRoute,
  nuxtEntryFile,
  parseArgs,
  provenanceLine,
  withOverrides,
} from "./examples-verify.mjs";

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

/** A `packages` entry with its tarball really on disk, which `tarballFor` requires. */
function fakePackage(root, name, version) {
  const dir = path.join(root, name.replace("@comvi/", ""));
  fs.mkdirSync(dir, { recursive: true });
  const bare = name.replace(/^@/, "").replace("/", "-");
  fs.writeFileSync(path.join(dir, `${bare}-${version}.tgz`), "");
  return { name, version, dir };
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

test("withOverrides pins every workspace package without touching the declared ranges", () => {
  const root = tempDir("comvi-verify-overrides-");
  const packages = [
    fakePackage(root, "@comvi/core", "0.5.0"),
    fakePackage(root, "@comvi/react", "0.5.0"),
  ];
  const manifest = {
    name: "comvi-example-react",
    dependencies: { "@comvi/react": "^0.5.0", react: "^19.2.4" },
  };

  const result = withOverrides(manifest, packages);

  assert.deepEqual(result.dependencies, { "@comvi/react": "^0.5.0", react: "^19.2.4" });
  assert.equal(
    result.pnpm.overrides["@comvi/core"],
    `file:${path.join(root, "core", "comvi-core-0.5.0.tgz")}`,
  );
  assert.equal(
    result.pnpm.overrides["@comvi/react"],
    `file:${path.join(root, "react", "comvi-react-0.5.0.tgz")}`,
  );
});

test("withOverrides pins packages the example does not depend on, so transitives resolve locally", () => {
  const root = tempDir("comvi-verify-transitive-");
  const packages = [fakePackage(root, "@comvi/core", "0.5.0")];
  const manifest = { dependencies: { "@comvi/react": "^0.5.0" } };

  const result = withOverrides(manifest, packages);

  assert.ok("@comvi/core" in result.pnpm.overrides);
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
    message: /examples\/astro.*astro build.*vite, next and nuxt/s,
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

test("nextPageRoute refuses to guess when an app has more than one page", () => {
  const manifest = { pages: { "/[locale]/page": ["a.js"], "/[locale]/about/page": ["b.js"] } };

  assert.throws(() => nextPageRoute(manifest), { message: /exactly one page route.*found 2/s });
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

test("nuxtEntryFile picks the isEntry chunk, not the biggest or the first", () => {
  // The locale catalogs are dynamic imports of the entry, and one of them being
  // listed first in the manifest must not make it the thing being measured.
  const manifest = {
    "locales/uk.json": { file: "uk-BRI4vdSi.js", src: "locales/uk.json" },
    "../node_modules/nuxt/dist/app/entry.js": {
      file: "YERnk0my.js",
      name: "entry",
      isEntry: true,
    },
    "_shared.js": { file: "BOrKvaDh.js" },
  };

  assert.equal(nuxtEntryFile(manifest), "YERnk0my.js");
});

test("nuxtEntryFile fails closed when the manifest names no entry", () => {
  assert.throws(() => nuxtEntryFile({ "a.js": { file: "a-1.js" } }), {
    message: /no chunk marked `isEntry`/,
  });
});

test("nuxtEntryFile refuses to choose between two entries", () => {
  assert.throws(
    () => nuxtEntryFile({ a: { file: "a.js", isEntry: true }, b: { file: "b.js", isEntry: true } }),
    { message: /2 chunks marked `isEntry`/ },
  );
});

test("parseArgs still collects --only for the two SSR examples", () => {
  assert.deepEqual(parseArgs(["--only", "next", "--only", "nuxt", "--json"]), {
    only: ["next", "nuxt"],
    build: true,
    pack: true,
    keep: false,
    json: true,
  });
});
