import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { bump, declaredBumps, planRcVersions } from "./rc-version.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SCRIPT_DIR, "..");
const RC_VERSION = path.join(SCRIPT_DIR, "rc-version.mjs");

/**
 * `applyRcVersions` reaches the fixed-group version through
 * sync-peer-ranges' `nextReleaseVersion()`, which reads a module-level
 * `process.cwd()` and ignores the `root` it is handed. A child process whose
 * cwd IS the fixture root is therefore the only way to exercise the write path
 * without the live repo deciding the answer.
 */
function applyInFixture(root, body) {
  const source =
    `import { applyRcVersions } from ${JSON.stringify(pathToFileURL(RC_VERSION).href)};\n` +
    `try {\n${body}\n} catch (error) {\n` +
    `  console.log(error.message);\n  process.exit(3);\n}\n`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: root,
    encoding: "utf8",
  });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/**
 * A whole repo in miniature: a two-member fixed group, one independently
 * versioned package the changesets name, and a caret peer range on each.
 */
function makeFixtureRepo(t, { extraPackages = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rc-version-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeJson(path.join(root, ".changeset/config.json"), {
    fixed: [["@comvi/core", "@comvi/react"]],
    ignore: ["@comvi/vite-config"],
  });
  fs.writeFileSync(
    path.join(root, ".changeset/a.md"),
    '---\n"@comvi/core": minor\n"@comvi/plugin-x": patch\n---\n\nA\n',
  );

  writeJson(path.join(root, "packages/core/package.json"), {
    name: "@comvi/core",
    version: "0.4.0",
  });
  writeJson(path.join(root, "packages/react/package.json"), {
    name: "@comvi/react",
    version: "0.4.0",
    peerDependencies: { "@comvi/core": "^0.4.0", react: "^18.0.0" },
  });
  writeJson(path.join(root, "packages/plugin-x/package.json"), {
    name: "@comvi/plugin-x",
    version: "0.1.0",
    peerDependencies: { "@comvi/core": "workspace:*" },
  });
  for (const [dir, pkg] of Object.entries(extraPackages)) {
    writeJson(path.join(root, "packages", dir, "package.json"), pkg);
  }
  return root;
}

const readManifest = (root, dir) =>
  JSON.parse(fs.readFileSync(path.join(root, "packages", dir, "package.json"), "utf8"));

test("bump follows semver for the three types and strips a prerelease suffix", () => {
  assert.equal(bump("0.4.0", "minor"), "0.5.0");
  assert.equal(bump("0.4.3", "patch"), "0.4.4");
  assert.equal(bump("0.4.0", "major"), "1.0.0");
  assert.equal(bump("0.5.0-rc.1", "minor"), "0.6.0");
});

test("declaredBumps keeps the max type per package across changesets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-version-"));
  fs.mkdirSync(path.join(dir, ".changeset"));
  fs.writeFileSync(
    path.join(dir, ".changeset/a.md"),
    '---\n"@comvi/x": patch\n"@comvi/y": minor\n---\n\nA\n',
  );
  fs.writeFileSync(path.join(dir, ".changeset/b.md"), '---\n"@comvi/x": minor\n---\n\nB\n');
  fs.writeFileSync(path.join(dir, ".changeset/README.md"), "# not a changeset\n");

  assert.deepEqual(declaredBumps(dir), { "@comvi/x": "minor", "@comvi/y": "minor" });
});

test("plan against this repo: fixed group + locale-routing, ignored and private packages excluded", () => {
  const { manifests, versions } = planRcVersions({ root: REPO, rc: "3" });

  const names = manifests.map((m) => m.name).sort();
  assert.ok(
    names.includes("@comvi/core"),
    `@comvi/core must be versioned; got ${names.join(", ")}`,
  );
  assert.ok(
    names.includes("@comvi/locale-routing"),
    `@comvi/locale-routing must be versioned; got ${names.join(", ")}`,
  );
  assert.ok(!names.includes("@comvi/vite-config"), "ignored package must not be versioned");
  assert.ok(!names.includes("@comvi/chrome-extension"), "apps are outside packages/");
  const core = versions["@comvi/core"];
  assert.match(core, /^\d+\.\d+\.\d+-rc\.3$/);
  const fixed = JSON.parse(
    fs.readFileSync(path.join(REPO, ".changeset/config.json"), "utf8"),
  ).fixed.flat();
  for (const name of fixed)
    assert.equal(versions[name], core, `${name} must share the fixed rc version`);
  assert.notEqual(
    versions["@comvi/locale-routing"],
    core,
    "locale-routing is versioned on its own",
  );
  assert.match(versions["@comvi/locale-routing"], /-rc\.3$/);
});

test("planRcVersions rejects an --rc that is not a non-negative integer", () => {
  assert.throws(() => planRcVersions({ root: REPO, rc: "x" }), /non-negative integer/);
});

test("dry-run CLI writes nothing and names every peer edit as an exact rc version", () => {
  const { manifests } = planRcVersions({ root: REPO, rc: "0" });
  const before = manifests.map((m) => fs.readFileSync(m.file, "utf8"));

  const out = execFileSync(process.execPath, [RC_VERSION, "--rc", "0", "--dry-run"], {
    cwd: REPO,
    encoding: "utf8",
  });

  assert.deepEqual(
    manifests.map((m) => fs.readFileSync(m.file, "utf8")),
    before,
    "dry-run must not modify manifests",
  );
  assert.match(out, /rc-version: @comvi\/core \d+\.\d+\.\d+ -> \d+\.\d+\.\d+-rc\.0/);
  // plugins peer-depend on @comvi/core with a caret range: it must become the exact rc version.
  assert.match(
    out,
    /@comvi\/plugin-fetch-loader .* \(peers: @comvi\/core: \^\d+\.\d+\.\d+ -> \d+\.\d+\.\d+-rc\.0\)/,
  );
});

test("applyRcVersions rewrites every manifest to its rc version", (t) => {
  const root = makeFixtureRepo(t);

  const result = applyInFixture(
    root,
    '  applyRcVersions({ root: process.cwd(), rc: "7", log: () => {} });',
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(readManifest(root, "core").version, "0.5.0-rc.7");
  assert.equal(readManifest(root, "react").version, "0.5.0-rc.7");
  assert.equal(readManifest(root, "plugin-x").version, "0.1.1-rc.7");
});

test("applyRcVersions pins a caret peer range to the exact rc version and leaves the rest alone", (t) => {
  const root = makeFixtureRepo(t);

  const result = applyInFixture(
    root,
    '  applyRcVersions({ root: process.cwd(), rc: "7", log: () => {} });',
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(readManifest(root, "react").peerDependencies, {
    "@comvi/core": "0.5.0-rc.7",
    react: "^18.0.0",
  });
  // `workspace:*` survives: pnpm publish replaces it with the published version.
  assert.deepEqual(readManifest(root, "plugin-x").peerDependencies, {
    "@comvi/core": "workspace:*",
  });
});

test("applyRcVersions refuses a @comvi peer range that no package in this RC provides", (t) => {
  const root = makeFixtureRepo(t, {
    extraPackages: {
      "plugin-y": {
        name: "@comvi/plugin-y",
        version: "0.1.0",
        peerDependencies: { "@comvi/locale-routing": "^0.1.0" },
      },
    },
  });
  fs.writeFileSync(path.join(root, ".changeset/b.md"), '---\n"@comvi/plugin-y": patch\n---\n\nB\n');

  const result = applyInFixture(
    root,
    '  applyRcVersions({ root: process.cwd(), rc: "7", log: () => {} });',
  );

  assert.equal(result.status, 3, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /@comvi\/plugin-y: peer @comvi\/locale-routing is not in this RC/);
});

test("applyRcVersions with dryRun writes no manifest", (t) => {
  const root = makeFixtureRepo(t);
  const before = ["core", "react", "plugin-x"].map((dir) =>
    fs.readFileSync(path.join(root, "packages", dir, "package.json"), "utf8"),
  );

  const result = applyInFixture(
    root,
    '  applyRcVersions({ root: process.cwd(), rc: "7", dryRun: true, log: () => {} });',
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(
    ["core", "react", "plugin-x"].map((dir) =>
      fs.readFileSync(path.join(root, "packages", dir, "package.json"), "utf8"),
    ),
    before,
  );
});
