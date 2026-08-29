import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_PACKAGE_ROOTS,
  PRODUCTION_CONDITIONS,
  assertPublishedFile,
  parseSpecifier,
  resolveFixtureSpecifier,
  resolvePackageExport,
  runSizeCheck,
} from "./size-check.mjs";

function makeFakePackage(root) {
  const pkgDir = path.join(root, "node-pkg");
  const distDir = path.join(pkgDir, "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const pkgJson = {
    name: "@fake/pkg",
    version: "1.0.0",
    type: "module",
    files: ["dist"],
    // Decoy fields: a resolver that falls back to dist paths or legacy fields
    // instead of the exports map would pick one of these up.
    main: "./dist/main-field.js",
    module: "./dist/module-field.js",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        development: "./dist/dev.js",
        default: "./dist/exports-entry.js",
      },
      "./with-peer": "./dist/with-peer.js",
      "./runtime/*": "./dist/runtime/*",
    },
  };
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(pkgJson, null, 2));
  fs.writeFileSync(
    path.join(distDir, "exports-entry.js"),
    'export const marker = "VIA_EXPORTS_MAP";\n',
  );
  fs.writeFileSync(
    path.join(distDir, "main-field.js"),
    'export const marker = "VIA_MAIN_FIELD";\n',
  );
  fs.writeFileSync(
    path.join(distDir, "module-field.js"),
    'export const marker = "VIA_MODULE_FIELD";\n',
  );
  fs.writeFileSync(path.join(distDir, "dev.js"), 'export const marker = "VIA_DEV_CONDITION";\n');
  fs.writeFileSync(
    path.join(distDir, "with-peer.js"),
    'import peer from "fake-peer";\nexport const marker = peer;\n',
  );
  fs.mkdirSync(path.join(distDir, "runtime"), { recursive: true });
  fs.writeFileSync(
    path.join(distDir, "runtime", "thing.js"),
    'export const marker = "VIA_SUBPATH_PATTERN";\n',
  );
  return { pkgDir, pkgJson };
}

test("parseSpecifier splits scoped and unscoped specifiers", () => {
  assert.deepEqual(parseSpecifier("@comvi/core"), { packageName: "@comvi/core", subpath: "." });
  assert.deepEqual(parseSpecifier("@comvi/core/loader"), {
    packageName: "@comvi/core",
    subpath: "./loader",
  });
  assert.deepEqual(parseSpecifier("esbuild"), { packageName: "esbuild", subpath: "." });
});

test("resolvePackageExport picks the default condition and skips development/types in production", () => {
  const pkgJson = {
    name: "x",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        development: "./dist/dev.js",
        default: "./dist/prod.js",
      },
    },
  };
  assert.equal(resolvePackageExport(pkgJson, ".", PRODUCTION_CONDITIONS), "./dist/prod.js");
  assert.equal(resolvePackageExport(pkgJson, ".", ["development"]), "./dist/dev.js");
});

test("resolvePackageExport returns undefined for a subpath missing from the exports map", () => {
  const pkgJson = { name: "x", exports: { ".": { default: "./dist/index.js" } } };
  assert.equal(resolvePackageExport(pkgJson, "./slim", PRODUCTION_CONDITIONS), undefined);
});

test("resolvePackageExport uses the exports map, never module/main dist paths", () => {
  const pkgJson = {
    name: "x",
    main: "./dist/main-field.js",
    module: "./dist/module-field.js",
    exports: { ".": { default: "./dist/exports-entry.js" } },
  };
  assert.equal(
    resolvePackageExport(pkgJson, ".", PRODUCTION_CONDITIONS),
    "./dist/exports-entry.js",
  );
});

test("resolvePackageExport refuses packages without an exports map", () => {
  assert.throws(
    () => resolvePackageExport({ name: "x", main: "./dist/index.js" }, "."),
    /no "exports" map/,
  );
});

test("assertPublishedFile rejects targets outside the files allowlist", () => {
  const pkgJson = { name: "x", files: ["dist"] };
  assert.doesNotThrow(() => assertPublishedFile(pkgJson, "./dist/index.js"));
  assert.throws(
    () => assertPublishedFile(pkgJson, "./src/index.ts"),
    /outside the published "files" allowlist/,
  );
});

test("resolveFixtureSpecifier resolves @comvi/core through its published exports map", () => {
  const corePkg = JSON.parse(
    fs.readFileSync(path.join(DEFAULT_PACKAGE_ROOTS["@comvi/core"], "package.json"), "utf8"),
  );
  const expected = path.resolve(
    DEFAULT_PACKAGE_ROOTS["@comvi/core"],
    resolvePackageExport(corePkg, ".", PRODUCTION_CONDITIONS),
  );
  assert.equal(resolveFixtureSpecifier("@comvi/core", DEFAULT_PACKAGE_ROOTS), expected);
});

test("bundling resolves entries via the exports map, not main/module fields", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };

  const resolved = resolveFixtureSpecifier("@fake/pkg", packageRoots);
  assert.equal(resolved, path.join(pkgDir, "dist", "exports-entry.js"));

  const fixturesDir = path.join(root, "fixtures");
  fs.mkdirSync(fixturesDir);
  fs.writeFileSync(
    path.join(fixturesDir, "entry.ts"),
    'import { marker } from "@fake/pkg";\nconsole.log(marker);\n',
  );
  const budgets = {
    fixtures: [{ name: "fake", entry: "@fake/pkg", fixture: "entry.ts", gzipBudgetBytes: 1024 }],
  };
  const results = await runSizeCheck({ budgets, fixturesDir, packageRoots });
  assert.equal(results.length, 1);
  assert.equal(results[0].status, "pass");
  // The exports-map target is tiny; the decoys are equally tiny, so size alone
  // cannot distinguish them — the resolved-path assertion above is the gate.
  assert.ok(results[0].gzipBytes > 0);
});

test("runSizeCheck skips pending fixtures whose subpath is not exported yet", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };
  const budgets = {
    fixtures: [
      {
        name: "future",
        entry: "@fake/pkg/slim",
        fixture: "missing.ts",
        gzipBudgetBytes: 1,
        pending: true,
        pendingReason: "the /slim subpath lands in a later phase",
      },
    ],
  };
  const results = await runSizeCheck({ budgets, fixturesDir: root, packageRoots });
  assert.deepEqual(results, [
    {
      name: "future",
      status: "pending",
      reason: "the /slim subpath lands in a later phase",
      unresolved: ["@fake/pkg/slim"],
    },
  ]);
});

test("pending is declared, not inferred: a resolvable slot still skips", async (t) => {
  // The framework-slim slots resolve through the exports map today yet measure
  // the wrong graph until their phase lands, so resolution cannot decide this.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const budgets = {
    fixtures: [
      {
        name: "declared-pending",
        entry: "@fake/pkg",
        fixture: "missing.ts",
        pending: true,
        pendingReason: "the wrapper cannot consume this host yet",
      },
    ],
  };
  const results = await runSizeCheck({
    budgets,
    fixturesDir: root,
    packageRoots: { "@fake/pkg": pkgDir },
  });
  assert.deepEqual(results, [
    {
      name: "declared-pending",
      status: "pending",
      reason: "the wrapper cannot consume this host yet",
      unresolved: [],
    },
  ]);
});

test("a pending slot without a pendingReason is rejected", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const budgets = {
    fixtures: [{ name: "sloppy", entry: "@fake/pkg", fixture: "missing.ts", pending: true }],
  };
  await assert.rejects(
    runSizeCheck({ budgets, fixturesDir: root, packageRoots: { "@fake/pkg": pkgDir } }),
    /requires a "pendingReason"/,
  );
});

test("runSizeCheck fails hard when a non-pending fixture does not resolve", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const budgets = {
    fixtures: [
      { name: "broken", entry: "@fake/pkg/slim", fixture: "missing.ts", gzipBudgetBytes: 1 },
    ],
  };
  await assert.rejects(
    runSizeCheck({ budgets, fixturesDir: root, packageRoots: { "@fake/pkg": pkgDir } }),
    /do not resolve through the published exports map/,
  );
});

test("runSizeCheck reports a fail status when the budget is exceeded", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };
  const fixturesDir = path.join(root, "fixtures");
  fs.mkdirSync(fixturesDir);
  fs.writeFileSync(
    path.join(fixturesDir, "entry.ts"),
    'import { marker } from "@fake/pkg";\nconsole.log(marker);\n',
  );
  const budgets = {
    fixtures: [{ name: "fake", entry: "@fake/pkg", fixture: "entry.ts", gzipBudgetBytes: 1 }],
  };
  const results = await runSizeCheck({ budgets, fixturesDir, packageRoots });
  assert.equal(results[0].status, "fail");
});

test("resolvePackageExport resolves subpath patterns, longest prefix winning", () => {
  const pkgJson = {
    name: "x",
    exports: {
      ".": "./dist/index.js",
      "./runtime/*": "./dist/runtime/*",
      "./runtime/server/*": "./dist/server/*",
    },
  };
  assert.equal(
    resolvePackageExport(pkgJson, "./runtime/plugin.js", PRODUCTION_CONDITIONS),
    "./dist/runtime/plugin.js",
  );
  assert.equal(
    resolvePackageExport(pkgJson, "./runtime/server/utils.js", PRODUCTION_CONDITIONS),
    "./dist/server/utils.js",
  );
  assert.equal(resolvePackageExport(pkgJson, "./runtime/", PRODUCTION_CONDITIONS), undefined);
});

test("a pattern subpath resolves and bundles like any other published entry", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };
  assert.equal(
    resolveFixtureSpecifier("@fake/pkg/runtime/thing.js", packageRoots),
    path.join(pkgDir, "dist", "runtime", "thing.js"),
  );

  const fixturesDir = path.join(root, "fixtures");
  fs.mkdirSync(fixturesDir);
  fs.writeFileSync(
    path.join(fixturesDir, "entry.ts"),
    'import { marker } from "@fake/pkg/runtime/thing.js";\nconsole.log(marker);\n',
  );
  const budgets = {
    fixtures: [
      {
        name: "pattern",
        entry: "@fake/pkg/runtime/thing.js",
        fixture: "entry.ts",
        gzipBudgetBytes: 1024,
      },
    ],
  };
  const results = await runSizeCheck({ budgets, fixturesDir, packageRoots });
  assert.equal(results[0].status, "pass");
});

test("external keeps framework peer deps out of the measured graph", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const { pkgDir } = makeFakePackage(root);
  const packageRoots = { "@fake/pkg": pkgDir };
  const fixturesDir = path.join(root, "fixtures");
  fs.mkdirSync(fixturesDir);
  fs.writeFileSync(
    path.join(fixturesDir, "entry.ts"),
    'import { marker } from "@fake/pkg/with-peer";\nconsole.log(marker);\n',
  );
  const fixture = {
    name: "peer",
    entry: "@fake/pkg/with-peer",
    fixture: "entry.ts",
    gzipBudgetBytes: 1024,
  };

  // "fake-peer" is not installed anywhere: without `external` the bundle
  // cannot resolve it, which is exactly what keeps the peer out of the bytes.
  await assert.rejects(
    runSizeCheck({ budgets: { fixtures: [fixture] }, fixturesDir, packageRoots }),
  );

  const results = await runSizeCheck({
    budgets: { fixtures: [{ ...fixture, external: ["fake-peer"] }] },
    fixturesDir,
    packageRoots,
  });
  assert.equal(results[0].status, "pass");
  assert.ok(!results[0].moduleIds.some((id) => id.includes("fake-peer")));
});

test("sentinel module IDs gate on the metafile graph, in both polarities", async (t) => {
  // Real @comvi/core: `@comvi/core/tags` pulls the side-effectful register-tags
  // chunk, the base root must not. (Before the single-entry convergence the
  // polarity ran root-vs-slim; the root is the base host now, so the tags
  // subpath is the positive pole.) This is the mechanism behind
  // probe-react-tags-pinning (plan P0.3) — module IDs, never output text.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sentinelModules = ["packages/core/dist/chunks/comvi-core-register-tags.js"];
  for (const [name, specifier] of [
    ["tags", "@comvi/core/tags"],
    ["base", "@comvi/core"],
  ]) {
    // The tags pole imports the toolbox it actually exports; the base pole
    // imports the host. Both keep one named import live for the bundler.
    fs.writeFileSync(
      path.join(root, `${name}.ts`),
      name === "tags"
        ? `import { registerTagSyntax } from "${specifier}";\nconsole.log(registerTagSyntax);\n`
        : `import { createI18n } from "${specifier}";\nconsole.log(createI18n);\n`,
    );
  }
  const fixtureFor = (name, expectSentinels) => ({
    name,
    entry: name === "tags" ? "@comvi/core/tags" : "@comvi/core",
    fixture: `${name}.ts`,
    sentinelModules,
    expectSentinels,
  });

  const [tagsResult, baseResult] = await runSizeCheck({
    budgets: { fixtures: [fixtureFor("tags", "present"), fixtureFor("base", "absent")] },
    fixturesDir: root,
  });
  assert.equal(tagsResult.status, "pass");
  assert.deepEqual(tagsResult.sentinels.found, sentinelModules);
  assert.equal(baseResult.status, "pass");
  assert.deepEqual(baseResult.sentinels.found, []);

  const [inverted] = await runSizeCheck({
    budgets: { fixtures: [fixtureFor("base", "present")] },
    fixturesDir: root,
  });
  assert.equal(inverted.status, "fail");
});

test("sentinelModules without an expectSentinels verdict is rejected", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "size-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "entry.ts"),
    'import { createI18n } from "@comvi/core";\nconsole.log(createI18n);\n',
  );
  await assert.rejects(
    runSizeCheck({
      budgets: {
        fixtures: [
          {
            name: "no-verdict",
            entry: "@comvi/core",
            fixture: "entry.ts",
            sentinelModules: ["packages/core/dist/chunks/comvi-core-register-tags.js"],
          },
        ],
      },
      fixturesDir: root,
    }),
    /requires "expectSentinels"/,
  );
});

// --- The shipped scripts/size-budgets.json, as a file ----------------------
//
// These assert the FILE's shape rather than the gate's behaviour, so the
// maintenance conventions written down in scripts/size-budgets.md cannot rot
// silently: the 0.5.0 hardening pass cut the file from 33 hand-tuned byte
// budgets and a ~34 KB prose blob to 15 rows on one mechanical rule, and
// nothing but a test keeps it there.

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const shippedBudgets = JSON.parse(
  fs.readFileSync(path.join(SCRIPT_DIR, "size-budgets.json"), "utf8"),
);

test("every shipped budget is exactly ceil(baseline * 1.05)", () => {
  const gated = shippedBudgets.fixtures.filter(
    (fixture) => typeof fixture.gzipBudgetBytes === "number",
  );
  assert.ok(gated.length > 0, "expected at least one gated row");
  for (const fixture of gated) {
    assert.ok(fixture.baseline, `${fixture.name}: a gated row must record its baseline sweep`);
    assert.equal(
      fixture.gzipBudgetBytes,
      Math.ceil(fixture.baseline.gzipBytes * 1.05),
      `${fixture.name}: budget must be ceil(baseline.gzipBytes * 1.05) — re-baseline, do not hand-tune`,
    );
  }
});

test("every shipped row records one authoritative sweep", () => {
  const dates = new Set();
  for (const fixture of shippedBudgets.fixtures) {
    assert.ok(fixture.baseline, `${fixture.name}: missing baseline`);
    assert.equal(typeof fixture.baseline.minBytes, "number", `${fixture.name}: baseline.minBytes`);
    assert.equal(
      typeof fixture.baseline.gzipBytes,
      "number",
      `${fixture.name}: baseline.gzipBytes`,
    );
    dates.add(fixture.baseline.measuredAt);
    // `modules` is the diff input for a sentinel verdict; a row without
    // sentinels has nothing to diff and must not carry a stale list.
    assert.equal(
      fixture.baseline.modules !== undefined,
      fixture.sentinelModules !== undefined,
      `${fixture.name}: baseline.modules belongs on sentinel rows and only on those`,
    );
  }
  assert.equal(
    dates.size,
    1,
    `budgets must derive from ONE run; found measuredAt values: ${[...dates].join(", ")}`,
  );
});

test("no shipped row is pending", () => {
  // `pending` skips a row's sentinels too, so a row that cannot be measured
  // yet is added when it can be, never parked here.
  const pending = shippedBudgets.fixtures.filter((fixture) => fixture.pending);
  assert.deepEqual(
    pending.map((fixture) => fixture.name),
    [],
  );
});

test("shipped notes are one line each and the prose lives in size-budgets.md", () => {
  for (const fixture of shippedBudgets.fixtures) {
    assert.equal(typeof fixture.note, "string", `${fixture.name}: missing note`);
    assert.ok(!fixture.note.includes("\n"), `${fixture.name}: note must be one line`);
    assert.ok(
      fixture.note.length <= 280,
      `${fixture.name}: note is ${fixture.note.length} chars — history belongs in scripts/size-budgets.md`,
    );
  }
  assert.match(shippedBudgets.note, /size-budgets\.md/);
  assert.ok(fs.existsSync(path.join(SCRIPT_DIR, "size-budgets.md")));
});

test("every shipped row points at a fixture that exists", () => {
  for (const fixture of shippedBudgets.fixtures) {
    assert.ok(
      fs.existsSync(path.join(SCRIPT_DIR, "size-fixtures", fixture.fixture)),
      `${fixture.name}: fixture ${fixture.fixture} does not exist`,
    );
  }
});
