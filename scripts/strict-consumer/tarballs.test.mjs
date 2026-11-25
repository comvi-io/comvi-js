import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildStore, importTarget, parseArgs, workspaceResolver } from "./tarballs.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "strict-consumer-tarballs-test-"));

/** A real `npm pack`-shaped tarball: everything under `package/`. */
function tarball(dir, manifest, files = {}) {
  const src = fs.mkdtempSync(path.join(dir, "src-"));
  const pkg = path.join(src, "package");
  fs.mkdirSync(pkg);
  fs.writeFileSync(path.join(pkg, "package.json"), JSON.stringify(manifest));
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(pkg, rel)), { recursive: true });
    fs.writeFileSync(path.join(pkg, rel), content);
  }
  const file = path.join(
    dir,
    `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`,
  );
  execFileSync("tar", ["-czf", file, "-C", src, "package"]);
  return { name: manifest.name, version: manifest.version, file };
}

test("parseArgs: dist by default, --packed, --from-registry <spec>, not both", () => {
  assert.deepEqual(parseArgs([]), { source: "dist", spec: null });
  assert.deepEqual(parseArgs(["--packed"]), { source: "packed", spec: null });
  assert.deepEqual(parseArgs(["--from-registry", "next"]), { source: "registry", spec: "next" });
  assert.throws(() => parseArgs(["--from-registry"]), /dist-tag or version/);
  assert.throws(() => parseArgs(["--packed", "--from-registry", "next"]), /pass one/);
  assert.throws(() => parseArgs(["--tarballs"]), /unknown argument/);
});

test("importTarget: a string, a conditions object, nested conditions, main", () => {
  assert.equal(importTarget({ exports: "./a.js" }), "./a.js");
  assert.equal(importTarget({ exports: { types: "./a.d.ts", default: "./a.js" } }), "./a.js");
  assert.equal(
    importTarget({
      exports: { ".": { types: "./x.d.ts", import: "./x.mjs", require: "./x.cjs" } },
    }),
    "./x.mjs",
  );
  assert.equal(
    importTarget({ exports: { ".": { import: { types: "./x.d.mts", default: "./x.mjs" } } } }),
    "./x.mjs",
  );
  assert.equal(
    importTarget({ exports: { "./server": { default: "./s.js" } } }, "./server"),
    "./s.js",
  );
  assert.equal(importTarget({ main: "./m.js" }), "./m.js");
  assert.throws(
    () => importTarget({ name: "@comvi/next", exports: { "./server": "./s.js" } }),
    /no import target/,
  );
});

test("buildStore: one directory per package, its dependencies linked beside it", () => {
  const dir = tmp();
  const thirdParty = path.join(dir, "react");
  fs.mkdirSync(thirdParty);
  fs.writeFileSync(path.join(thirdParty, "package.json"), '{"name":"react"}');
  const tarballs = [
    tarball(dir, { name: "@comvi/core", version: "0.8.0" }, { "dist/index.d.ts": "export {};" }),
    tarball(dir, {
      name: "@comvi/react",
      version: "0.8.0",
      dependencies: { "@comvi/core": "0.8.0" },
      peerDependencies: { react: "^19", "left-pad": "*" },
    }),
  ];
  const root = path.join(dir, "store");
  const store = buildStore(tarballs, root, {
    resolveThirdParty: (dep) => (dep === "react" ? thirdParty : null),
  });

  const react = store.dirs.get("@comvi/react");
  const core = store.dirs.get("@comvi/core");
  assert.equal(react, path.join(root, "comvi-react", "node_modules", "@comvi", "react"));
  assert.ok(fs.existsSync(path.join(core, "dist", "index.d.ts")), "the tarball is extracted");
  // react's core is THE core: one realpath, so one TypeScript module.
  const linkedCore = path.join(root, "comvi-react", "node_modules", "@comvi", "core");
  assert.equal(fs.realpathSync(linkedCore), fs.realpathSync(core));
  assert.equal(
    fs.realpathSync(path.join(root, "comvi-react", "node_modules", "react")),
    fs.realpathSync(thirdParty),
  );
  // core has no dependencies, so nothing but itself is in its node_modules.
  assert.deepEqual(fs.readdirSync(path.join(root, "comvi-core", "node_modules")), ["@comvi"]);
  assert.deepEqual(fs.readdirSync(path.join(root, "comvi-core", "node_modules", "@comvi")), [
    "core",
  ]);
  assert.deepEqual(store.unresolved, ["@comvi/react -> left-pad"]);
  assert.equal(store.manifests.get("@comvi/react").version, "0.8.0");
});

test("buildStore: a @comvi dependency missing from the tarballs is an error, not a skip", () => {
  const dir = tmp();
  const tarballs = [
    tarball(dir, {
      name: "@comvi/react",
      version: "0.8.0",
      dependencies: { "@comvi/core": "0.8.0" },
    }),
  ];
  assert.throws(
    () => buildStore(tarballs, path.join(dir, "store"), { resolveThirdParty: () => null }),
    /@comvi\/react depends on @comvi\/core, which is not among the tarballs/,
  );
});

test("buildStore: a tarball holding another package than its name says is refused", () => {
  const dir = tmp();
  const wrong = tarball(dir, { name: "@comvi/core", version: "0.8.0" });
  assert.throws(
    () =>
      buildStore([{ ...wrong, name: "@comvi/react" }], path.join(dir, "store"), {
        resolveThirdParty: () => null,
      }),
    /holds @comvi\/core, not @comvi\/react/,
  );
});

test("workspaceResolver: the owner's own node_modules first, then the root, then .pnpm", () => {
  const repo = tmp();
  const put = (rel) => {
    fs.mkdirSync(path.join(repo, rel), { recursive: true });
    fs.writeFileSync(path.join(repo, rel, "package.json"), "{}");
  };
  put("packages/nuxt/node_modules/h3");
  put("node_modules/h3");
  put("node_modules/vite");
  put("node_modules/.pnpm/node_modules/@nuxt/kit");
  const resolve = workspaceResolver(repo);
  assert.equal(
    resolve("h3", "@comvi/nuxt"),
    fs.realpathSync(path.join(repo, "packages/nuxt/node_modules/h3")),
  );
  assert.equal(
    resolve("vite", "@comvi/vite-plugin"),
    fs.realpathSync(path.join(repo, "node_modules/vite")),
  );
  assert.equal(
    resolve("@nuxt/kit", "@comvi/nuxt"),
    fs.realpathSync(path.join(repo, "node_modules/.pnpm/node_modules/@nuxt/kit")),
  );
  assert.equal(resolve("absent", "@comvi/nuxt"), null);
});
