import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { changesetOrder, hoistBreakingEntries, main } from "./version-release.mjs";

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

  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: true, hoisted: [] });
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

  assert.deepEqual(result, {
    versioned: true,
    version: "0.5.0",
    changed: false,
    hoisted: [],
  });
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

  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: true, hoisted: [] });
  assert.match(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), /A summary line/);
});

// ---------------------------------------------------------------------------
// Breaking-entry hoist.
// ---------------------------------------------------------------------------

/** Three changesets whose filenames sort alpha < beta < gamma. */
const HOIST_CHANGESETS = [
  { id: "alpha.md", body: "**BREAKING:** alpha went away.\n\nMore about alpha.\n" },
  { id: "beta.md", body: "A change that breaks nothing.\n" },
  { id: "gamma.md", body: "**BREAKING:** gamma went away.\n" },
];

/** What `changeset version` emits: entries in changeset-id order, which for
 *  this trio happens to be the reverse of the filename order. */
const REVERSED_BLOCK = `# @comvi/core

## 0.5.0

### Minor Changes

- **BREAKING:** gamma went away.

- A change that breaks nothing.

- **BREAKING:** alpha went away.

  More about alpha.

## 0.4.0

### Minor Changes

- **BREAKING:** an older release, untouched.

- Something else.
`;

const bulletFirstLines = (changelog, version) => {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l === `## ${version}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).filter((l) => l.startsWith("- "));
};

test("BREAKING entries move to the top of their section, ordered by changeset filename", () => {
  const out = hoistBreakingEntries(REVERSED_BLOCK, "0.5.0", changesetOrder(HOIST_CHANGESETS));

  assert.deepEqual(bulletFirstLines(out, "0.5.0"), [
    "- **BREAKING:** alpha went away.",
    "- **BREAKING:** gamma went away.",
    "- A change that breaks nothing.",
  ]);
});

test("a hoisted entry carries its continuation lines and its blank separator", () => {
  const out = hoistBreakingEntries(REVERSED_BLOCK, "0.5.0", changesetOrder(HOIST_CHANGESETS));

  assert.match(out, /- \*\*BREAKING:\*\* alpha went away\.\n\n {2}More about alpha\.\n\n/);
  // Nothing gained or lost: the same lines, reordered.
  assert.deepEqual(out.split("\n").slice().sort(), REVERSED_BLOCK.split("\n").slice().sort());
});

test("older version blocks are never touched", () => {
  const out = hoistBreakingEntries(REVERSED_BLOCK, "0.5.0", changesetOrder(HOIST_CHANGESETS));

  assert.deepEqual(bulletFirstLines(out, "0.4.0"), [
    "- **BREAKING:** an older release, untouched.",
    "- Something else.",
  ]);
});

test("a version with no block in this changelog is a no-op", () => {
  const out = hoistBreakingEntries(REVERSED_BLOCK, "0.9.9", changesetOrder(HOIST_CHANGESETS));

  assert.equal(out, REVERSED_BLOCK);
});

test("`### Major Changes` keeps the order changesets chose", () => {
  const source = `# @comvi/core

## 1.0.0

### Major Changes

- **BREAKING:** gamma went away.

- **BREAKING:** alpha went away.
`;

  assert.equal(hoistBreakingEntries(source, "1.0.0", changesetOrder(HOIST_CHANGESETS)), source);
});

test("the `<hash>: ` prefix changesets prepends is not mistaken for content", () => {
  const source = `# @comvi/core

## 0.5.0

### Patch Changes

- 6463199: A change that breaks nothing.

- bec9ad6: **BREAKING:** gamma went away.
`;

  const out = hoistBreakingEntries(source, "0.5.0", changesetOrder(HOIST_CHANGESETS));

  assert.deepEqual(bulletFirstLines(out, "0.5.0"), [
    "- bec9ad6: **BREAKING:** gamma went away.",
    "- 6463199: A change that breaks nothing.",
  ]);
});

test("a BREAKING entry no changeset explains sorts after the ones that have a filename", () => {
  const source = `# @comvi/core

## 0.5.0

### Minor Changes

- **BREAKING:** hand-written, no changeset.

- **BREAKING:** gamma went away.

- **BREAKING:** alpha went away.
`;

  const out = hoistBreakingEntries(source, "0.5.0", changesetOrder(HOIST_CHANGESETS));

  assert.deepEqual(bulletFirstLines(out, "0.5.0"), [
    "- **BREAKING:** alpha went away.",
    "- **BREAKING:** gamma went away.",
    "- **BREAKING:** hand-written, no changeset.",
  ]);
});

test("main hoists every package changelog it just generated and names them", (t) => {
  const root = makeFixtureRepo(t, {
    changesets: {
      "alpha.md": '"@comvi/core": minor',
      "beta.md": '"@comvi/core": minor',
      "gamma.md": '"@comvi/core": minor',
    },
  });
  // Give the changesets the bodies the hoist orders by, and both packages the
  // block `changeset version` would have just written.
  for (const { id, body } of HOIST_CHANGESETS) {
    fs.writeFileSync(
      path.join(root, ".changeset", id),
      `---\n"@comvi/core": minor\n---\n\n${body}`,
    );
  }
  fs.writeFileSync(path.join(root, "packages/core/CHANGELOG.md"), REVERSED_BLOCK);
  fs.writeFileSync(
    path.join(root, "packages/react/CHANGELOG.md"),
    REVERSED_BLOCK.replace("# @comvi/core", "# @comvi/react"),
  );
  const { run } = recordingRun();

  const result = main({ root, run, log: () => {} });

  assert.deepEqual(result.hoisted, ["@comvi/core", "@comvi/react"]);
  for (const pkg of ["core", "react"]) {
    const changelog = fs.readFileSync(path.join(root, "packages", pkg, "CHANGELOG.md"), "utf8");
    assert.deepEqual(
      bulletFirstLines(changelog, "0.5.0"),
      [
        "- **BREAKING:** alpha went away.",
        "- **BREAKING:** gamma went away.",
        "- A change that breaks nothing.",
      ],
      pkg,
    );
  }
});

test("a package changelog already in order is not rewritten", (t) => {
  const root = makeFixtureRepo(t);
  const ordered = `# @comvi/core

## 0.5.0

### Minor Changes

- A summary line.
`;
  fs.writeFileSync(path.join(root, "packages/core/CHANGELOG.md"), ordered);
  const { run } = recordingRun();

  const result = main({ root, run, log: () => {} });

  assert.deepEqual(result.hoisted, []);
  assert.equal(fs.readFileSync(path.join(root, "packages/core/CHANGELOG.md"), "utf8"), ordered);
});
