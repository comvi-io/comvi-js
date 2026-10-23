import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  COORDINATED_VERSION_FAILED,
  changesetOrder,
  hoistBreakingEntries,
  main,
} from "./version-release.mjs";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/**
 * A workspace with one pending changeset, a root CHANGELOG that already has a
 * release heading to insert above, and two publishable packages sharing one
 * version so `coordinatedVersion` resolves. Both are in the `fixed` group of the
 * fixture's own `.changeset/config.json`: that file is what `main` reads to know
 * which packages the release train covers.
 */
function makeFixtureRepo(t, { changesets = { "a.md": '"@comvi/core": minor' } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "version-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".changeset"), { recursive: true });
  fs.writeFileSync(path.join(root, ".changeset/README.md"), "# Changesets\n");
  writeJson(path.join(root, ".changeset/config.json"), {
    fixed: [["@comvi/core", "@comvi/react"]],
    ignore: [],
  });
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

test("skipRootChangelog reports the version it would add and writes no CHANGELOG", (t) => {
  const root = makeFixtureRepo(t);
  const before = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  const { run } = recordingRun();
  const logged = [];

  const result = main({ root, skipRootChangelog: true, run, log: (line) => logged.push(line) });

  // Same shape as the full path: nothing was hoisted, and the field says so
  // rather than going missing.
  assert.deepEqual(result, { versioned: true, version: "0.5.0", changed: false, hoisted: [] });
  assert.deepEqual(logged, ["root-changelog: would add coordinated 0.5.0 release"]);
  assert.equal(fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8"), before);
});

test("skipRootChangelog still runs both commands — it is not a dry run", (t) => {
  const root = makeFixtureRepo(t);
  const { calls, run } = recordingRun();

  main({ root, skipRootChangelog: true, run, log: () => {} });

  // The tree is fully versioned and the changesets consumed by the time the
  // flag is read. Only the root CHANGELOG entry and the hoist are skipped.
  assert.deepEqual(describeCalls(calls), [
    "node sync-peer-ranges.mjs",
    "pnpm exec changeset version",
  ]);
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
    (error) => {
      assert.match(error.message, /publishable packages must share one version/);
      // The CLI prints this one without a stack, and nothing else. The code is
      // what keeps that catch narrow.
      assert.equal(error.code, COORDINATED_VERSION_FAILED);
      return true;
    },
  );
});

test("a failure that is not the coordinated-version check keeps its own identity", (t) => {
  const root = makeFixtureRepo(t);
  // A changeset with no summary: `collectChangesets` rejects it. The CLI must
  // rethrow this rather than reduce it to one line.
  fs.writeFileSync(path.join(root, ".changeset/broken.md"), '---\n"@comvi/core": patch\n---\n\n');
  const { run } = recordingRun();

  assert.throws(
    () => main({ root, run, log: () => {} }),
    (error) => {
      assert.notEqual(error.code, COORDINATED_VERSION_FAILED);
      return true;
    },
  );
});

test("the changesets are read before `changeset version` deletes them", (t) => {
  const root = makeFixtureRepo(t);
  // A runner that consumes the pending changesets the way `changeset version`
  // does — it deletes the `*.md` entries and leaves `README.md` and
  // `config.json` in place. The CHANGELOG entry must still be written from what
  // was collected first.
  const run = (command) => {
    if (command === process.execPath) return;
    for (const file of fs.readdirSync(path.join(root, ".changeset"))) {
      if (file.endsWith(".md") && file !== "README.md") {
        fs.rmSync(path.join(root, ".changeset", file));
      }
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

/** Two examples and the README section that quotes their range, as `main` finds them before a cut. */
function addExamples(root, range = "^0.4.0") {
  writeJson(path.join(root, "examples/react/package.json"), {
    name: "comvi-example-react",
    dependencies: { "@comvi/core": range, "@comvi/react": range, react: "^19.0.0" },
    devDependencies: { vite: "^7.0.0" },
  });
  writeJson(path.join(root, "examples/sveltekit/package.json"), {
    name: "comvi-example-sveltekit",
    devDependencies: { "@comvi/svelte": range, "@sveltejs/kit": "^2.0.0" },
  });
  fs.writeFileSync(
    path.join(root, "examples/README.md"),
    `The examples depend on the published names (\`"@comvi/react": "${range}"\`).\n\n` +
      "```sh\npnpm examples:use-tag next\n" +
      `pnpm examples:use-tag ${range}    # back to the release range\n\`\`\`\n\n` +
      "Next.js ^15.4.0 is unrelated.\n",
  );
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

test("the cut moves every example's @comvi ranges, and only those, to the new version", (t) => {
  const root = makeFixtureRepo(t);
  addExamples(root);
  const { run } = recordingRun();

  main({ root, run, log: () => {} });

  // StackBlitz installs the examples from npm off `main`, so their ranges have
  // to change in the same commit as the versions they ask for.
  assert.deepEqual(readJson(path.join(root, "examples/react/package.json")), {
    name: "comvi-example-react",
    dependencies: { "@comvi/core": "^0.5.0", "@comvi/react": "^0.5.0", react: "^19.0.0" },
    devDependencies: { vite: "^7.0.0" },
  });
  assert.deepEqual(readJson(path.join(root, "examples/sveltekit/package.json")), {
    name: "comvi-example-sveltekit",
    devDependencies: { "@comvi/svelte": "^0.5.0", "@sveltejs/kit": "^2.0.0" },
  });
  assert.equal(
    fs.readFileSync(path.join(root, "examples/README.md"), "utf8"),
    'The examples depend on the published names (`"@comvi/react": "^0.5.0"`).\n\n' +
      "```sh\npnpm examples:use-tag next\n" +
      "pnpm examples:use-tag ^0.5.0    # back to the release range\n```\n\n" +
      "Next.js ^15.4.0 is unrelated.\n",
  );
});

test("skipRootChangelog still moves the examples: the tree is versioned either way", (t) => {
  const root = makeFixtureRepo(t);
  addExamples(root);
  const { run } = recordingRun();

  main({ root, run, skipRootChangelog: true, log: () => {} });

  assert.equal(
    readJson(path.join(root, "examples/react/package.json")).dependencies["@comvi/react"],
    "^0.5.0",
  );
});

test("a pre-release version leaves the examples on the last stable range", (t) => {
  const root = makeFixtureRepo(t);
  addExamples(root);
  for (const pkg of ["core", "react"]) {
    const file = path.join(root, "packages", pkg, "package.json");
    writeJson(file, { ...readJson(file), version: "0.5.0-rc.0" });
  }
  const before = fs.readFileSync(path.join(root, "examples/react/package.json"), "utf8");
  const readme = fs.readFileSync(path.join(root, "examples/README.md"), "utf8");
  const logged = [];

  main({ root, run: recordingRun().run, log: (line) => logged.push(line) });

  // `^0.5.0-rc.0` would send StackBlitz to the RC off `main`; the RC route is
  // `pnpm examples:use-tag next` on a demo branch.
  assert.equal(fs.readFileSync(path.join(root, "examples/react/package.json"), "utf8"), before);
  assert.equal(fs.readFileSync(path.join(root, "examples/README.md"), "utf8"), readme);
  assert.ok(logged.some((line) => /examples: 0\.5\.0-rc\.0 is a pre-release/.test(line)));
});

test("with no changesets the examples are left alone", (t) => {
  const root = makeFixtureRepo(t, { changesets: {} });
  addExamples(root);
  const before = fs.readFileSync(path.join(root, "examples/react/package.json"), "utf8");

  main({ root, run: recordingRun().run, log: () => {} });

  assert.equal(fs.readFileSync(path.join(root, "examples/react/package.json"), "utf8"), before);
});
