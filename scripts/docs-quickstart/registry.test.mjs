import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { tarballFor } from "../docs-snippets/link-sdk.mjs";
import { comviDependencies, fetchRegistryTarballs, registrySpec } from "./registry.mjs";
import { packageName, parseArgs } from "./run.mjs";

/** A fake registry: `{ name: manifest }`, every package at `version` unless the manifest says. */
function fakeRegistry(manifests, version = "0.7.1") {
  const packed = [];
  const files = new Map();
  const pack = (name, spec, dir) => {
    packed.push(`${name}@${spec}`);
    const manifest = manifests[name];
    if (!manifest) return null;
    const v = manifest.version ?? version;
    const file = path.join(dir, `${name.slice(1).replace("/", "-")}-${v}.tgz`);
    fs.writeFileSync(file, "");
    files.set(file, manifest);
    return { name, version: v, file };
  };
  return { pack, manifestOf: (file) => files.get(file), packed };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "docs-quickstart-registry-test-"));

test("registrySpec: a dist-tag or version is required, the next flag is not one", () => {
  assert.equal(registrySpec(["--from-registry", "next"], 1), "next");
  assert.equal(registrySpec(["--from-registry", "0.7.1"], 1), "0.7.1");
  assert.throws(() => registrySpec(["--from-registry"], 1), /dist-tag or version/);
  assert.throws(() => registrySpec(["--from-registry", "--only"], 1), /dist-tag or version/);
});

test("parseArgs: --from-registry is off by default and takes a value", () => {
  assert.equal(parseArgs(["--content", "x"]).fromRegistry, null);
  assert.equal(parseArgs(["--content", "x", "--from-registry", "0.7.1"]).fromRegistry, "0.7.1");
  assert.throws(() => parseArgs(["--content", "x", "--from-registry"]), /dist-tag or version/);
});

test("packageName: scoped and bare specs, with and without a range", () => {
  assert.equal(packageName("@comvi/react"), "@comvi/react");
  assert.equal(packageName("@comvi/react@^0.8.0"), "@comvi/react");
  assert.equal(packageName("vue@3"), "vue");
});

test("comviDependencies: dependencies and peers, @comvi only, optional peers marked", () => {
  assert.deepEqual(
    comviDependencies({
      dependencies: { "@comvi/core": "0.7.1", "server-only": "^0.0.1" },
      peerDependencies: { "@comvi/react": "0.7.1", react: "^19", "@comvi/editor": "0.8.0" },
      peerDependenciesMeta: { "@comvi/editor": { optional: true } },
    }),
    [
      { name: "@comvi/core", optional: false },
      { name: "@comvi/editor", optional: true },
      { name: "@comvi/react", optional: false },
    ],
  );
  assert.deepEqual(comviDependencies({}), []);
});

test("fetchRegistryTarballs: fetches the roots and their @comvi closure, nothing else", () => {
  const dir = tmp();
  const registry = fakeRegistry({
    "@comvi/next": { dependencies: { "@comvi/core": "0.7.1", "@comvi/react": "0.7.1" } },
    "@comvi/react": { dependencies: { "@comvi/core": "0.7.1" }, peerDependencies: { react: "*" } },
    "@comvi/core": {},
    "@comvi/vue": { dependencies: { "@comvi/core": "0.7.1" } },
  });
  const got = fetchRegistryTarballs(["@comvi/next"], "0.7.1", dir, registry);
  assert.deepEqual(
    got.map((entry) => entry.name),
    ["@comvi/core", "@comvi/next", "@comvi/react"],
  );
  // Each package is packed once, at the requested spec.
  assert.deepEqual(registry.packed.sort(), [
    "@comvi/core@0.7.1",
    "@comvi/next@0.7.1",
    "@comvi/react@0.7.1",
  ]);
  // The entries have the shape link-sdk's tarballFor() resolves.
  for (const entry of got) assert.equal(tarballFor(entry), entry.file);
});

test("fetchRegistryTarballs: a package missing from the registry fails, naming who needs it", () => {
  const registry = fakeRegistry({
    "@comvi/react": { dependencies: { "@comvi/core": "0.8.0" } },
  });
  assert.throws(
    () => fetchRegistryTarballs(["@comvi/react"], "next", tmp(), registry),
    /@comvi\/core@next is not on the registry \(a dependency of @comvi\/react\)/,
  );
  assert.throws(
    () => fetchRegistryTarballs(["@comvi/editor"], "0.7.1", tmp(), fakeRegistry({})),
    /@comvi\/editor@0\.7\.1 is not on the registry \(a package this gate installs\)/,
  );
});

test("fetchRegistryTarballs: a missing OPTIONAL peer is skipped and logged", () => {
  const lines = [];
  const registry = fakeRegistry({
    "@comvi/core": {
      peerDependencies: { "@comvi/editor": "*" },
      peerDependenciesMeta: { "@comvi/editor": { optional: true } },
    },
  });
  const got = fetchRegistryTarballs(["@comvi/core"], "0.7.1", tmp(), {
    ...registry,
    log: (line) => lines.push(line),
  });
  assert.deepEqual(
    got.map((entry) => entry.name),
    ["@comvi/core"],
  );
  assert.ok(lines.some((line) => /@comvi\/editor@0\.7\.1: not on the registry/.test(line)));
});

test("fetchRegistryTarballs: a dist-tag that resolves to two versions is refused", () => {
  const registry = fakeRegistry({
    "@comvi/react": { version: "0.8.0-rc.1", dependencies: { "@comvi/core": "0.8.0-rc.1" } },
    "@comvi/core": { version: "0.8.0-rc.0" },
  });
  assert.throws(
    () => fetchRegistryTarballs(["@comvi/react"], "next", tmp(), registry),
    /more than one version: @comvi\/react@0\.8\.0-rc\.1, @comvi\/core@0\.8\.0-rc\.0/,
  );
});

test("fetchRegistryTarballs: a registry that answers with another package is refused", () => {
  const registry = {
    pack: (name, spec, dir) => {
      const file = path.join(dir, "comvi-core-0.7.1.tgz");
      fs.writeFileSync(file, "");
      return { name: "@comvi/core", version: "0.7.1", file };
    },
    manifestOf: () => ({}),
  };
  assert.throws(
    () => fetchRegistryTarballs(["@comvi/react"], "0.7.1", tmp(), registry),
    /produced @comvi\/core/,
  );
});
