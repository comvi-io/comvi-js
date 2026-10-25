/**
 * The changeset guard's view of a diff (published-changes.mjs): which changed
 * files reach a published artifact. A manifest change that touches only
 * devDependencies is the one exemption.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { onlyDevDependenciesChanged, publishedChanges } from "./published-changes.mjs";

const BASE = {
  name: "@comvi/cli",
  version: "0.7.0",
  exports: { ".": "./dist/index.js" },
  dependencies: { commander: "^14.0.0" },
  peerDependencies: { vite: "^8.0.0" },
  devDependencies: { vitest: "^4.1.0" },
};

const json = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

test("onlyDevDependenciesChanged: a devDependencies bump → true", () => {
  const head = { ...BASE, devDependencies: { vitest: "^4.2.0" } };

  assert.equal(onlyDevDependenciesChanged(json(BASE), json(head)), true);
});

test("onlyDevDependenciesChanged: devDependencies added where there were none → true", () => {
  const withoutDev = { ...BASE };
  delete withoutDev.devDependencies;

  assert.equal(onlyDevDependenciesChanged(json(withoutDev), json(BASE)), true);
});

for (const [field, value] of [
  ["dependencies", { commander: "^15.0.0" }],
  ["peerDependencies", { vite: "^9.0.0" }],
  ["optionalDependencies", { fsevents: "^2.3.0" }],
  ["exports", { ".": "./dist/cli.js" }],
  ["version", "0.7.1"],
]) {
  test(`onlyDevDependenciesChanged: ${field} changes alongside devDependencies → false`, () => {
    const head = { ...BASE, [field]: value, devDependencies: { vitest: "^4.2.0" } };

    assert.equal(onlyDevDependenciesChanged(json(BASE), json(head)), false);
  });
}

test("onlyDevDependenciesChanged: an added manifest → false", () => {
  assert.equal(onlyDevDependenciesChanged(null, json(BASE)), false);
});

test("onlyDevDependenciesChanged: a deleted manifest → false", () => {
  assert.equal(onlyDevDependenciesChanged(json(BASE), null), false);
});

test("onlyDevDependenciesChanged: a manifest that does not parse → false", () => {
  assert.equal(onlyDevDependenciesChanged(json(BASE), "{ not json"), false);
});

test("publishedChanges: src and runtime manifest changes count, devDependencies-only and non-surface files do not", () => {
  const texts = {
    base: {
      "packages/cli/package.json": json(BASE),
      "packages/core/package.json": json(BASE),
    },
    head: {
      "packages/cli/package.json": json({ ...BASE, devDependencies: { vitest: "^4.2.0" } }),
      "packages/core/package.json": json({ ...BASE, dependencies: { commander: "^15.0.0" } }),
    },
  };
  const files = [
    "packages/cli/package.json",
    "packages/core/package.json",
    "packages/core/src/index.ts",
    "packages/core/tests/a.test.ts",
    "pnpm-lock.yaml",
  ];

  const result = publishedChanges(files, (side, file) => texts[side][file] ?? null);

  assert.deepEqual(result, ["packages/core/package.json", "packages/core/src/index.ts"]);
});
