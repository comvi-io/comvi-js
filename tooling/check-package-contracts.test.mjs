import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkLicensePacked,
  checkPackedJsReachable,
  checkDistForBrowserExternalShim,
  checkDistForPrivatePackageNames,
  checkNextPeerRangeDeclarations,
  collectDistFiles,
  collectPrivatePackageNames,
  parseCaretRange,
  shorthandCaretRange,
} from "./check-package-contracts.mjs";

/**
 * A minimal `packages/*` tree: just enough for the private-package-name gate
 * (and its `collectPrivatePackageNames`/`collectDistFiles` helpers) to read —
 * not a full publishable workspace, so no `npm pack` involved.
 */
function makeWorkspace(t, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-package-contracts-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const pkg of packages) {
    const dir = path.join(root, "packages", pkg.dir);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: pkg.name, version: pkg.version ?? "0.0.0", private: pkg.private }, null, 2)}\n`,
    );
    for (const [file, source] of Object.entries(pkg.dist ?? {})) {
      const target = path.join(dir, "dist", file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
    }
  }
  return root;
}

test("collectPrivatePackageNames finds only private: true packages, by name not hard-coding", (t) => {
  const root = makeWorkspace(t, [
    { dir: "cli", name: "@comvi/cli" },
    { dir: "typegen", name: "@comvi/typegen", private: true },
    { dir: "locale-routing", name: "@comvi/locale-routing", private: true },
    { dir: "core", name: "@comvi/core" },
  ]);

  assert.deepEqual(collectPrivatePackageNames(root), ["@comvi/locale-routing", "@comvi/typegen"]);
});

test("collectPrivatePackageNames returns nothing when no package is private", (t) => {
  const root = makeWorkspace(t, [{ dir: "cli", name: "@comvi/cli" }]);
  assert.deepEqual(collectPrivatePackageNames(root), []);
});

test("collectDistFiles walks nested dirs and excludes .map", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: {
        "index.js": "export {}",
        "index.js.map": "{}",
        "index.d.ts": "export {}",
        "core/TypeEmitter.d.ts": "export {}",
        "core/TypeEmitter.d.ts.map": "{}",
      },
    },
  ]);
  const distDir = path.join(root, "packages", "cli", "dist");

  const files = collectDistFiles(distDir).map((f) =>
    path.relative(distDir, f).split(path.sep).join("/"),
  );
  assert.deepEqual(files.sort(), ["core/TypeEmitter.d.ts", "index.d.ts", "index.js"].sort());
});

test("collectDistFiles returns nothing when dist does not exist", (t) => {
  const root = makeWorkspace(t, [{ dir: "cli", name: "@comvi/cli" }]);
  assert.deepEqual(collectDistFiles(path.join(root, "packages", "cli", "dist")), []);
});

test("checkDistForPrivatePackageNames reports the exact violation message", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: { "stale-probe.d.ts": 'import "@comvi/typegen";' },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  const errors = checkDistForPrivatePackageNames("@comvi/cli", packageDir, ["@comvi/typegen"]);
  assert.deepEqual(errors, [
    "@comvi/cli: dist/stale-probe.d.ts names workspace-private package @comvi/typegen; " +
      "it must be inlined/vendored, not imported",
  ]);
});

test("checkDistForPrivatePackageNames passes a dist with no reference to any private package", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: { "index.js": 'export const inlined = "the emitter, inlined, no import left"' },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  assert.deepEqual(
    checkDistForPrivatePackageNames("@comvi/cli", packageDir, ["@comvi/typegen"]),
    [],
  );
});

test("checkDistForPrivatePackageNames ignores .map files", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: {
        "index.js": "export {}",
        "index.js.map":
          '{"sources":["../../typegen/src/index.ts"],"sourcesContent":["import \\"@comvi/typegen\\";"]}',
      },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  assert.deepEqual(
    checkDistForPrivatePackageNames("@comvi/cli", packageDir, ["@comvi/typegen"]),
    [],
  );
});

test("checkDistForPrivatePackageNames reports one violation per offending file, across multiple private names", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "vite-plugin",
      name: "@comvi/vite-plugin",
      dist: {
        "emit.d.ts": 'import "@comvi/typegen";',
        "extract.d.ts":
          'import { SchemaParam } from "@comvi/typegen";\nimport "@comvi/locale-routing";',
        "index.js": "export {}",
      },
    },
  ]);
  const packageDir = path.join(root, "packages", "vite-plugin");

  const errors = checkDistForPrivatePackageNames("@comvi/vite-plugin", packageDir, [
    "@comvi/locale-routing",
    "@comvi/typegen",
  ]);
  assert.deepEqual(errors.sort(), [
    "@comvi/vite-plugin: dist/emit.d.ts names workspace-private package @comvi/typegen; " +
      "it must be inlined/vendored, not imported",
    "@comvi/vite-plugin: dist/extract.d.ts names workspace-private package @comvi/locale-routing; " +
      "it must be inlined/vendored, not imported",
    "@comvi/vite-plugin: dist/extract.d.ts names workspace-private package @comvi/typegen; " +
      "it must be inlined/vendored, not imported",
  ]);
});

test("checkDistForPrivatePackageNames is a no-op when there are no private packages to check for", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "cli",
      name: "@comvi/cli",
      dist: { "index.js": 'import "@comvi/typegen";' },
    },
  ]);
  const packageDir = path.join(root, "packages", "cli");

  assert.deepEqual(checkDistForPrivatePackageNames("@comvi/cli", packageDir, []), []);
});

/**
 * A tree holding just the files that declare `@comvi/next`'s peer ranges.
 * `overrides` replaces any of them, so each test states only the drift it is
 * about. The root README fixture carries the sibling `@comvi/react` and
 * `@comvi/nuxt` install lines on purpose — they are the lines this check must
 * NOT pick up.
 */
function makePeerRangeTree(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-next-peer-range-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const nextRange = overrides.nextRange ?? "^15.0.0 || ^16.0.0";
  const reactRange = overrides.reactRange ?? "^18.2.0 || ^19.0.0";
  const prose = overrides.prose ?? "next ^15 || ^16, react ^18.2 || ^19";
  const stubProse = overrides.stubProse ?? "^15 || ^16";

  const write = (rel, body) => {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };

  write(
    "packages/next/package.json",
    `${JSON.stringify({ name: "@comvi/next", peerDependencies: { next: nextRange, react: reactRange } }, null, 2)}\n`,
  );
  if (overrides.packageReadme !== null) {
    write(
      "packages/next/README.md",
      overrides.packageReadme ?? `\`\`\`bash\nnpm install @comvi/next\n# Peers: ${prose}\n\`\`\`\n`,
    );
  }
  if (overrides.rootReadme !== null) {
    write(
      "README.md",
      overrides.rootReadme ??
        `npm install @comvi/react     # Peer: react ^18 || ^19\n` +
          `npm install @comvi/nuxt      # Peer: nuxt ^3 || ^4\n` +
          `npm install @comvi/next      # Peers: ${prose}\n`,
    );
  }
  write(
    "scripts/bundler-matrix/app/stubs/next/package.json",
    `${JSON.stringify({ name: "next", version: overrides.stubVersion ?? "15.0.0", description: overrides.stubDescription ?? `INERT STAND-IN, versioned so @comvi/next's peer range (${stubProse}) is satisfiable.` }, null, 2)}\n`,
  );

  return root;
}

test("checkDistForBrowserExternalShim reports a dist that bundles Vite's browser shim for a Node built-in", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "vite-plugin",
      name: "@comvi/vite-plugin",
      dist: {
        "index.js":
          "var import___vite_browser_external = {};\nimport___vite_browser_external.randomUUID();",
        "index.d.ts": "export {};",
      },
    },
  ]);
  const packageDir = path.join(root, "packages", "vite-plugin");

  const errors = checkDistForBrowserExternalShim("@comvi/vite-plugin", packageDir);
  assert.deepEqual(errors, [
    "@comvi/vite-plugin: dist/index.js bundles Vite's browser shim for a Node built-in; " +
      'add the missing "node:*" specifier to the build\'s external list',
  ]);
});

test("checkDistForBrowserExternalShim passes a dist that imports Node built-ins as externals", (t) => {
  const root = makeWorkspace(t, [
    {
      dir: "vite-plugin",
      name: "@comvi/vite-plugin",
      dist: { "index.js": 'import { randomUUID } from "node:crypto";\nrandomUUID();' },
    },
  ]);
  const packageDir = path.join(root, "packages", "vite-plugin");

  assert.deepEqual(checkDistForBrowserExternalShim("@comvi/vite-plugin", packageDir), []);
});

/** Packed paths as `npm pack --dry-run` lists them: relative to the package dir. */
function packedSetOf(dist) {
  return new Set(["package.json", ...Object.keys(dist).map((file) => `dist/${file}`)]);
}

const orphanMessage = (name, file) =>
  `${name}: ${file} is packed but no manifest entry point reaches it through an import; ` +
  "it is a stale build output (clean dist before building) or an entry missing from the manifest";

test("checkPackedJsReachable flags a stale generation whose chunks import each other", (t) => {
  const dist = {
    "index.es.js": 'export const load = () => import("./Core-vogj2dVW.js");',
    "Core-vogj2dVW.js": 'import { m } from "./EditModal-DvfvyyY-.js";\nexport { m };',
    "EditModal-DvfvyyY-.js": 'export const m = () => import("./Core-vogj2dVW.js");',
    // The previous build's pair. Each names the other, so "some packed file
    // mentions it" is true of both; neither is reachable from the entry.
    "Core-OLD00001.js": 'import { m } from "./EditModal-OLD00001.js";\nexport { m };',
    "EditModal-OLD00001.js": 'export const m = () => import("./Core-OLD00001.js");',
  };
  const root = makeWorkspace(t, [{ dir: "editor", name: "@comvi/editor", dist }]);
  const packageDir = path.join(root, "packages", "editor");

  const errors = checkPackedJsReachable("@comvi/editor", packageDir, packedSetOf(dist), {
    exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.es.js" } },
  });
  assert.deepEqual(errors, [
    orphanMessage("@comvi/editor", "dist/Core-OLD00001.js"),
    orphanMessage("@comvi/editor", "dist/EditModal-OLD00001.js"),
  ]);
});

test("checkPackedJsReachable follows static, dynamic, re-export and extensionless specifiers", (t) => {
  const dist = {
    "index.js":
      'import "./side-effect.js";\nimport { a } from "./chunks/inflight-Ab3_xY9z.js";\n' +
      'export * from "./reexported";\nexport const lazy = () => import("./lazy/panel.js");\n' +
      "export { a };",
    "side-effect.js": "globalThis.x = 1;",
    "chunks/inflight-Ab3_xY9z.js": 'import { b } from "../shared.js";\nexport const a = b;',
    "shared.js": "export const b = 1;",
    "reexported.js": "export const c = 1;",
    "lazy/panel.js": 'import { d } from "./dir";\nexport { d };',
    "lazy/dir/index.js": "export const d = 1;",
    // An unhashed name is no excuse: nothing reaches it.
    "comvi-core-devtools.js": "export {};",
  };
  const root = makeWorkspace(t, [{ dir: "loader", name: "@comvi/loader", dist }]);
  const packageDir = path.join(root, "packages", "loader");

  assert.deepEqual(
    checkPackedJsReachable("@comvi/loader", packageDir, packedSetOf(dist), {
      exports: { ".": "./dist/index.js" },
    }),
    [orphanMessage("@comvi/loader", "dist/comvi-core-devtools.js")],
  );
});

test("checkPackedJsReachable seeds from every manifest target, not only exports", (t) => {
  const dist = {
    "index.js": "export {};",
    "index.dev.js": 'import "./dev-only.js";',
    "dev-only.js": "export {};",
    "legacy.cjs": "module.exports = {};",
    "module.mjs": "export {};",
    "comvi.global.prod.js": "var Comvi = {};",
    "cdn.js": "var Comvi = {};",
    "cli.js": 'import "./commands.js";',
    "commands.js": "export {};",
    "runtime/a.js": 'import "./b.js";',
    "runtime/b.js": "export {};",
  };
  const root = makeWorkspace(t, [{ dir: "core", name: "@comvi/core", dist }]);
  const packageDir = path.join(root, "packages", "core");

  assert.deepEqual(
    checkPackedJsReachable("@comvi/core", packageDir, packedSetOf(dist), {
      exports: {
        ".": { import: { development: "./dist/index.dev.js", default: "./dist/index.js" } },
        "./runtime/*": "./dist/runtime/*",
      },
      main: "./dist/legacy.cjs",
      module: "./dist/module.mjs",
      types: "./dist/index.d.ts",
      unpkg: "./dist/comvi.global.prod.js",
      jsdelivr: "dist/cdn.js",
      bin: { comvi: "./dist/cli.js" },
    }),
    [],
  );
});

test("checkPackedJsReachable ignores bare specifiers and files outside dist", (t) => {
  const dist = { "index.js": 'import "@comvi/core";\nimport fs from "node:fs";\nexport {};' };
  const root = makeWorkspace(t, [{ dir: "cli", name: "@comvi/cli", dist }]);
  const packageDir = path.join(root, "packages", "cli");
  fs.mkdirSync(path.join(packageDir, "bin"));
  fs.writeFileSync(path.join(packageDir, "bin", "comvi.js"), 'import "../dist/index.js";');

  assert.deepEqual(
    checkPackedJsReachable(
      "@comvi/cli",
      packageDir,
      new Set([...packedSetOf(dist), "bin/comvi.js"]),
      { bin: "./bin/comvi.js" },
    ),
    [],
  );
});

test("checkLicensePacked requires LICENSE in the tarball", () => {
  assert.deepEqual(checkLicensePacked("@comvi/core", new Set(["package.json", "dist/index.js"])), [
    "@comvi/core: LICENSE is not packed; the root LICENSE is copied into each package by " +
      "tooling/copy-license.mjs (run by `pnpm build` and `pnpm pack:release`)",
  ]);
  assert.deepEqual(checkLicensePacked("@comvi/core", new Set(["package.json", "LICENSE"])), []);
});

test("parseCaretRange reads a caret union into version tuples, and rejects anything else", () => {
  assert.deepEqual(parseCaretRange("^15.0.0 || ^16.0.0"), [
    [15, 0, 0],
    [16, 0, 0],
  ]);
  assert.deepEqual(parseCaretRange("^18.2.0 || ^19.0.0"), [
    [18, 2, 0],
    [19, 0, 0],
  ]);
  assert.deepEqual(parseCaretRange("^16"), [[16, 0, 0]]);
  assert.deepEqual(parseCaretRange("^18.2"), [[18, 2, 0]]);
  assert.equal(parseCaretRange(">=15"), null);
  assert.equal(parseCaretRange("^15.0.0 || next"), null);
  // Next's own react peer includes an exact RC version, which has no caret and
  // so cannot be mirrored in prose. Rejecting it is correct, not a gap.
  assert.equal(parseCaretRange("^18.2.0 || 19.0.0-rc-de68d2f4-20241204 || ^19.0.0"), null);
  assert.equal(parseCaretRange(""), null);
  assert.equal(parseCaretRange(undefined), null);
});

test("shorthandCaretRange drops trailing zero components only", () => {
  assert.equal(
    shorthandCaretRange([
      [15, 0, 0],
      [16, 0, 0],
    ]),
    "^15 || ^16",
  );
  // The whole reason the React floor needed a format: ^18.2.0 must not collapse
  // to ^18, or the prose would advertise a floor the manifest does not.
  assert.equal(
    shorthandCaretRange([
      [18, 2, 0],
      [19, 0, 0],
    ]),
    "^18.2 || ^19",
  );
  assert.equal(shorthandCaretRange([[18, 2, 1]]), "^18.2.1");
});

test("checkNextPeerRangeDeclarations passes when every site agrees", (t) => {
  assert.deepEqual(checkNextPeerRangeDeclarations(makePeerRangeTree(t)), []);
});

test("checkNextPeerRangeDeclarations catches a stale next range in either README", (t) => {
  const stalePackage = checkNextPeerRangeDeclarations(
    makePeerRangeTree(t, { packageReadme: "# Peers: next ^14 || ^15, react ^18.2 || ^19\n" }),
  );
  assert.equal(stalePackage.length, 1);
  assert.match(stalePackage[0], /^packages\/next\/README\.md: declares next "\^14 \|\| \^15"/);
  assert.match(stalePackage[0], /expected the comment to read "\^15 \|\| \^16"/);

  const staleRoot = checkNextPeerRangeDeclarations(
    makePeerRangeTree(t, {
      rootReadme: "npm install @comvi/next      # Peers: next ^14 || ^15, react ^18.2 || ^19\n",
    }),
  );
  assert.equal(staleRoot.length, 1);
  assert.match(staleRoot[0], /^README\.md: declares next "\^14 \|\| \^15"/);
});

test("checkNextPeerRangeDeclarations catches a stale REACT range, which is the drift that shipped", (t) => {
  // Every Next 14/15/16 floors react at ^18.2.0, so an ^18 floor in prose (or
  // in the manifest) advertises React 18.0/18.1 with a Next that refuses it.
  const staleProse = checkNextPeerRangeDeclarations(
    makePeerRangeTree(t, { prose: "next ^15 || ^16, react ^18 || ^19" }),
  );
  assert.equal(staleProse.length, 2, "both READMEs carry the react range");
  for (const error of staleProse) {
    assert.match(error, /declares react "\^18 \|\| \^19"/);
    assert.match(error, /expected the comment to read "\^18\.2 \|\| \^19"/);
  }

  // And the reverse: manifest loosened, prose still correct.
  const staleManifest = checkNextPeerRangeDeclarations(
    makePeerRangeTree(t, { reactRange: "^18.0.0 || ^19.0.0" }),
  );
  assert.equal(staleManifest.length, 2);
  for (const error of staleManifest) {
    assert.match(error, /declares react "\^18\.2 \|\| \^19" but/);
    assert.match(error, /"\^18\.0\.0 \|\| \^19\.0\.0"/);
  }
});

test("checkNextPeerRangeDeclarations fails when the comment is renamed away, rather than passing vacuously", (t) => {
  // The failure mode a "find and compare" check invites: no match found, so
  // nothing to disagree with. That must be an error, not a pass.
  const errors = checkNextPeerRangeDeclarations(
    makePeerRangeTree(t, { packageReadme: "# Requires: next latest\n" }),
  );
  assert.equal(errors.length, 1);
  assert.match(errors[0], /no "# Peers: next <range>, react <range>" comment found/);
});

test("checkNextPeerRangeDeclarations leaves the sibling install lines alone", (t) => {
  // `@comvi/react`'s own `# Peer: react ^18 || ^19` is correct at ^18.0 —
  // useSyncExternalStore lands in React 18.0, and that range is ours, not
  // Next's. It sits one line from @comvi/next's and must not be rewritten to
  // ^18.2, so the check must not see it. Same for `nuxt ^3 || ^4`.
  assert.deepEqual(
    checkNextPeerRangeDeclarations(
      makePeerRangeTree(t, {
        rootReadme:
          `npm install @comvi/react     # Peer: react ^18 || ^19\n` +
          `npm install @comvi/nuxt      # Peer: nuxt ^3 || ^4\n` +
          `npm install @comvi/vue       # Peer: vue ^3\n` +
          `npm install @comvi/next      # Peers: next ^15 || ^16, react ^18.2 || ^19\n`,
      }),
    ),
    [],
  );
});

test("checkNextPeerRangeDeclarations accepts a stub pinned to the range floor but rejects one outside it", (t) => {
  // The stub is deliberately the FLOOR, so satisfaction is the rule, not equality.
  assert.deepEqual(
    checkNextPeerRangeDeclarations(makePeerRangeTree(t, { stubVersion: "15.0.0" })),
    [],
  );
  assert.deepEqual(
    checkNextPeerRangeDeclarations(makePeerRangeTree(t, { stubVersion: "16.3.5" })),
    [],
  );

  const outside = checkNextPeerRangeDeclarations(makePeerRangeTree(t, { stubVersion: "14.2.0" }));
  assert.equal(outside.length, 1);
  assert.match(outside[0], /version 14\.2\.0 is outside/);
  assert.match(outside[0], /majors 15, 16/);
});

test("checkNextPeerRangeDeclarations catches stub prose that names the old range", (t) => {
  const errors = checkNextPeerRangeDeclarations(makePeerRangeTree(t, { stubProse: "^14 || ^15" }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /description must name the range as "\(\^15 \|\| \^16\)"/);
});

test("checkNextPeerRangeDeclarations rejects a source range the mirrors cannot be derived from", (t) => {
  const badNext = checkNextPeerRangeDeclarations(makePeerRangeTree(t, { nextRange: ">=15" }));
  assert.equal(badNext.length, 1);
  assert.match(badNext[0], /peerDependencies\.next must be caret ranges joined by "\|\|"/);
  assert.match(badNext[0], /got ">=15"/);

  const badReact = checkNextPeerRangeDeclarations(makePeerRangeTree(t, { reactRange: ">=18.2" }));
  assert.equal(badReact.length, 1);
  assert.match(badReact[0], /peerDependencies\.react must be caret ranges joined by "\|\|"/);
});

test("checkNextPeerRangeDeclarations reports a mirror that has gone missing", (t) => {
  const errors = checkNextPeerRangeDeclarations(makePeerRangeTree(t, { rootReadme: null }));
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^README\.md: missing/);
});
