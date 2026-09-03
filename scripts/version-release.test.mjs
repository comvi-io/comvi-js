import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "./version-release.mjs";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/**
 * A workspace with one pending changeset, a root CHANGELOG that already has a
 * release heading to insert above, and two publishable packages sharing one
 * version so `coordinatedVersion` resolves.
 */
function makeFixtureRepo(t, { changesets = { "a.md": '"@comvi/core": minor' } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".changeset"), { recursive: true });
  fs.writeFileSync(path.join(root, ".changeset/README.md"), "# Changesets\n");
  for (const [file, frontmatter] of Object.entries(changesets)) {
    fs.writeFileSync(
      path.join(root, ".changeset", file),
      `---\n${frontmatter}\n---\n\nA summary line.\n`,
    );
  }

  writeJson(path.join(root, "packages/core/package.json"), {
    name: "@comvi/core",
    version: "0.5.0",
  });
  writeJson(path.join(root, "packages/react/package.json"), {
    name: "@comvi/react",
    version: "0.5.0",
  });
  fs.writeFileSync(
    path.join(root, "CHANGELOG.md"),
    "# Changelog\n\n## [0.4.0]\n\nOld release.\n\n[0.4.0]: https://example.invalid/v0.4.0\n",
  );
  return root;
}

/** Records what `main` would spawn instead of spawning it. */
function recordingRun() {
  const calls = [];
  const run = (command, args) => calls.push([command, args]);
  return { calls, run };
}

/** `[node sync-peer-ranges, pnpm exec changeset version]`, in that order. */
function describeCalls(calls) {
  return calls.map(([command, args]) => {
    if (command === process.execPath) return `node ${path.basename(args[0])}`;
    return `${path.basename(command)} ${args.join(" ")}`;
  });
}

test("sync-peer-ranges runs before `changeset version`", (t) => {
  const root = makeFixtureRepo(t);
  const { calls, run } = recordingRun();

  main({ root, run, log: () => {} });

  // The order is the whole point: changesets escalates the fixed group to a
  // major bump if it reads a peer range the new version falls outside of.
  assert.deepEqual(describeCalls(calls), [
    "node sync-peer-ranges.mjs",
    "pnpm exec changeset version",
  ]);
  assert.equal(calls[0][1][0], path.join(root, "scripts/sync-peer-ranges.mjs"));
});

test("with changesets pending, the root CHANGELOG gains the coordinated version", (t) => {
  const root = makeFixtureRepo(t);
  const { run } = recordingRun();

  const result = main({ root, run, log: () => {} });

  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: true });
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.match(changelog, /^## \[0\.5\.0\]$/m);
  assert.match(changelog, /A summary line/);
  // Inserted above the previous release, not appended.
  assert.ok(changelog.indexOf("## [0.5.0]") < changelog.indexOf("## [0.4.0]"));
});

test("a second cut for a version already in the CHANGELOG changes nothing", (t) => {
  const root = makeFixtureRepo(t);
  const { run } = recordingRun();
  main({ root, run, log: () => {} });
  const after = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");

  const result = main({ root, run, log: () => {} });

  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: false });
  assert.equal(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), after);
});

test("with no changesets both commands still run and the CHANGELOG is left alone", (t) => {
  const root = makeFixtureRepo(t, { changesets: {} });
  const before = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const { calls, run } = recordingRun();
  const logged = [];

  const result = main({ root, run, log: (line) => logged.push(line) });

  // `changeset version` is a no-op with nothing pending, but it is still what
  // decides that — this script does not second-guess it.
  assert.deepEqual(describeCalls(calls), [
    "node sync-peer-ranges.mjs",
    "pnpm exec changeset version",
  ]);
  assert.deepEqual(result, { versioned: false });
  assert.deepEqual(logged, ["root-changelog: no changesets, nothing to update"]);
  assert.equal(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), before);
});

test("dryRun reports the version it would add and writes no CHANGELOG", (t) => {
  const root = makeFixtureRepo(t);
  const before = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const { run } = recordingRun();
  const logged = [];

  const result = main({ root, dryRun: true, run, log: (line) => logged.push(line) });

  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: false });
  assert.deepEqual(logged, ["root-changelog: would add coordinated 0.5.0 release"]);
  assert.equal(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), before);
});

test("a fixed group that does not share one version is a hard failure", (t) => {
  const root = makeFixtureRepo(t);
  writeJson(path.join(root, "packages/react/package.json"), {
    name: "@comvi/react",
    version: "0.5.1",
  });
  const { run } = recordingRun();

  assert.throws(
    () => main({ root, run, log: () => {} }),
    /publishable packages must share one version/,
  );
});

test("the changesets are read before `changeset version` deletes them", (t) => {
  const root = makeFixtureRepo(t);
  // A runner that empties .changeset the way `changeset version` does. The
  // CHANGELOG entry must still be written from what was collected first.
  const run = (command) => {
    if (command === process.execPath) return;
    for (const file of fs.readdirSync(path.join(root, ".changeset"))) {
      if (file !== "README.md") fs.rmSync(path.join(root, ".changeset", file));
    }
  };

  const result = main({ root, run, log: () => {} });

  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: true });
  assert.match(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), /A summary line/);
});
