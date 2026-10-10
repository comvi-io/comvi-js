import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SYNC_PEER_RANGES = path.join(SCRIPT_DIR, "sync-peer-ranges.mjs");

/**
 * Every export here reads a module-level `root = process.cwd()`, so a child
 * process whose cwd IS the fixture root is the only way to exercise them
 * without the live repo's own changesets deciding the answer. `out(value)`
 * hands a JSON result back over stdout.
 */
function runInFixture(root, body) {
  const source =
    `import { declaredMaxBump, nextReleaseVersion, nextReleaseRange, syncPeerRanges } from ${JSON.stringify(
      pathToFileURL(SYNC_PEER_RANGES).href,
    )};\n` +
    `const out = (value) => console.log("RESULT " + JSON.stringify(value));\n` +
    `try {\n${body}\n} catch (error) {\n` +
    `  console.log(error.message);\n  process.exit(3);\n}\n`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", source], {
    cwd: root,
    encoding: "utf8",
  });
}

function resultOf(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const line = (result.stdout ?? "").split("\n").find((l) => l.startsWith("RESULT "));
  assert.ok(line, `no RESULT line in child output:\n${result.stdout}\n${result.stderr}`);
  return JSON.parse(line.slice("RESULT ".length));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/**
 * A whole workspace in miniature. `@comvi/core` at 0.4.0 is what every next
 * version is derived from; `@comvi/react` carries the caret peer range the
 * script rewrites next to a framework peer it must not touch; `@comvi/plugin-x`
 * carries the `workspace:` range that is exempt; `@comvi/internal` is a
 * workspace-private package outside the fixed group with no `@comvi/*` peer at
 * all — the shape the repo's inlined-only packages have — and must come out
 * byte-identical.
 */
function makeFixtureRepo(
  t,
  { changesets = { "a.md": '"@comvi/core": minor\n"@comvi/react": patch' } } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-peer-ranges-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".changeset"), { recursive: true });
  writeJson(path.join(root, ".changeset/config.json"), {
    fixed: [["@comvi/core", "@comvi/react", "@comvi/plugin-x"]],
  });
  // README.md lives in .changeset and is never a changeset. It is given real
  // frontmatter here on purpose: the guard is a filename check, and a fixture
  // whose README cannot parse as a changeset would pin nothing.
  fs.writeFileSync(
    path.join(root, ".changeset/README.md"),
    '---\n"@comvi/core": major\n---\n\n# Changesets\n',
  );
  for (const [file, frontmatter] of Object.entries(changesets)) {
    fs.writeFileSync(path.join(root, ".changeset", file), `---\n${frontmatter}\n---\n\nBody\n`);
  }

  writeJson(path.join(root, "packages/core/package.json"), {
    name: "@comvi/core",
    version: "0.4.0",
  });
  writeJson(path.join(root, "packages/react/package.json"), {
    name: "@comvi/react",
    version: "0.4.0",
    peerDependencies: { "@comvi/core": "^0.4.0", react: "^18.0.0 || ^19.0.0" },
  });
  writeJson(path.join(root, "packages/plugin-x/package.json"), {
    name: "@comvi/plugin-x",
    version: "0.1.0",
    peerDependencies: { "@comvi/core": "workspace:*" },
  });
  writeJson(path.join(root, "packages/internal/package.json"), {
    name: "@comvi/internal",
    version: "0.0.0",
    private: true,
  });
  // A directory under packages/ with no manifest at all — the script skips it.
  fs.mkdirSync(path.join(root, "packages/not-a-package"), { recursive: true });
  return root;
}

const manifestPath = (root, dir) => path.join(root, "packages", dir, "package.json");
const readManifest = (root, dir) => JSON.parse(fs.readFileSync(manifestPath(root, dir), "utf8"));
const readRaw = (root, dir) => fs.readFileSync(manifestPath(root, dir), "utf8");

test("declaredMaxBump takes the max type across changesets and ignores README.md", (t) => {
  const root = makeFixtureRepo(t, {
    changesets: {
      "a.md": '"@comvi/core": patch',
      "b.md": '"@comvi/react": minor\n"@comvi/plugin-x": patch',
    },
  });

  // 2 === minor. README.md declares `major` in the fixture and is still skipped.
  assert.equal(resultOf(runInFixture(root, "  out(declaredMaxBump());")), 2);
});

test("declaredMaxBump is 0 when no changeset is pending", (t) => {
  const root = makeFixtureRepo(t, { changesets: {} });

  assert.equal(resultOf(runInFixture(root, "  out(declaredMaxBump());")), 0);
});

test("a minor changeset makes the next version 0.5.0 and the next range ^0.5.0", (t) => {
  const root = makeFixtureRepo(t);

  assert.deepEqual(
    resultOf(runInFixture(root, "  out([nextReleaseVersion(), nextReleaseRange()]);")),
    ["0.5.0", "^0.5.0"],
  );
});

test("a patch-only train bumps the patch digit and keeps the minor range", (t) => {
  const root = makeFixtureRepo(t, { changesets: { "a.md": '"@comvi/core": patch' } });

  assert.deepEqual(
    resultOf(runInFixture(root, "  out([nextReleaseVersion(), nextReleaseRange()]);")),
    ["0.4.1", "^0.4.0"],
  );
});

test("a major changeset anywhere makes the next version 1.0.0 and the next range ^1.0.0", (t) => {
  const root = makeFixtureRepo(t, {
    changesets: {
      "a.md": '"@comvi/core": minor',
      "b.md": '"@comvi/plugin-x": major',
    },
  });

  assert.deepEqual(
    resultOf(runInFixture(root, "  out([nextReleaseVersion(), nextReleaseRange()]);")),
    ["1.0.0", "^1.0.0"],
  );
});

test("with no changesets there is no next version and no next range", (t) => {
  const root = makeFixtureRepo(t, { changesets: {} });

  assert.deepEqual(
    resultOf(runInFixture(root, "  out([nextReleaseVersion(), nextReleaseRange()]);")),
    [null, null],
  );
});

test("syncPeerRanges pins @comvi peers to the next minor and leaves everything else alone", (t) => {
  const root = makeFixtureRepo(t);
  const internalBefore = readRaw(root, "internal");
  const pluginXBefore = readRaw(root, "plugin-x");

  const result = runInFixture(root, "  syncPeerRanges();\n  out(null);");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  assert.deepEqual(readManifest(root, "react").peerDependencies, {
    "@comvi/core": "^0.5.0",
    // A framework peer is not a @comvi peer: the script must not widen it.
    react: "^18.0.0 || ^19.0.0",
  });
  // `workspace:` ranges are resolved by pnpm at publish time, so they are exempt.
  assert.equal(readRaw(root, "plugin-x"), pluginXBefore);
  // Workspace-private and with no @comvi peer: never rewritten.
  assert.equal(readRaw(root, "internal"), internalBefore);
  assert.match(result.stdout, /sync-peer-ranges: @comvi\/react -> @comvi\/\* peer \^0\.5\.0/);
});

test("syncPeerRanges with no changesets writes nothing", (t) => {
  const root = makeFixtureRepo(t, { changesets: {} });
  const before = ["core", "react", "plugin-x", "internal"].map((dir) => readRaw(root, dir));

  const result = runInFixture(root, "  syncPeerRanges();\n  out(null);");
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  assert.deepEqual(
    ["core", "react", "plugin-x", "internal"].map((dir) => readRaw(root, dir)),
    before,
  );
  assert.match(result.stdout, /sync-peer-ranges: no changesets, nothing to do/);
});

test("syncPeerRanges is idempotent: a peer already on the next range is not rewritten", (t) => {
  const root = makeFixtureRepo(t);
  runInFixture(root, "  syncPeerRanges();\n  out(null);");
  const afterFirst = readRaw(root, "react");

  const second = runInFixture(root, "  syncPeerRanges();\n  out(null);");

  assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);
  assert.equal(readRaw(root, "react"), afterFirst);
  assert.doesNotMatch(second.stdout, /sync-peer-ranges: @comvi\/react/);
});
