/**
 * The changeset guard's view of a diff (published-changes.mjs): which changed
 * files reach a published artifact. A manifest change that touches only
 * devDependencies is the one exemption.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  changesetChanges,
  consumesChangesets,
  onlyDevDependenciesChanged,
  onlyReleaseVersionChanged,
  parseNameStatus,
  publishedChanges,
  publishedPath,
} from "./published-changes.mjs";

const SCRIPT = fileURLToPath(new URL("./published-changes.mjs", import.meta.url));

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

test("onlyDevDependenciesChanged: reordered `exports` conditions → false (Node resolves them in order)", () => {
  const base = {
    ...BASE,
    exports: { ".": { import: "./dist/index.js", default: "./dist/index.cjs" } },
  };
  const head = {
    ...BASE,
    exports: { ".": { default: "./dist/index.cjs", import: "./dist/index.js" } },
  };

  assert.equal(onlyDevDependenciesChanged(json(base), json(head)), false);
});

test("onlyDevDependenciesChanged: reordered `imports` conditions → false", () => {
  const base = { ...BASE, imports: { "#env": { node: "./env-node.js", default: "./env.js" } } };
  const head = { ...BASE, imports: { "#env": { default: "./env.js", node: "./env-node.js" } } };

  assert.equal(onlyDevDependenciesChanged(json(base), json(head)), false);
});

test("onlyDevDependenciesChanged: whitespace-only reformat → true", () => {
  assert.equal(onlyDevDependenciesChanged(json(BASE), JSON.stringify(BASE)), true);
});

/** Fixture manifests: two published packages with `files`, one private package without. */
const CORE = {
  name: "@comvi/core",
  version: "0.7.0",
  files: ["dist", "LICENSE"],
  scripts: { build: "vite build && node ../../tooling/qualify.mjs dist" },
  devDependencies: { vitest: "^4.1.0" },
};
const CLI = {
  name: "@comvi/cli",
  version: "0.7.0",
  files: ["dist", "bin", "LICENSE"],
  bin: { comvi: "./bin/comvi.js" },
  scripts: { build: "vite build" },
};
const TYPEGEN = { name: "@comvi/typegen", private: true, scripts: { build: "vite build" } };

/**
 * The CLI against a real repository: a base commit, then `change(dir)` on a
 * branch. Returns the exit status and output of `node published-changes.mjs <baseRef>`.
 */
function guardAfter(change, baseRef = "main", setupBase = () => {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "comvi-guard-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    });
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  try {
    git("init", "-q", "-b", "main");
    write("packages/core/package.json", json(CORE));
    write("packages/core/src/x.ts", "export const x = 1;\n");
    write("packages/core/vite.config.ts", "export default {};\n");
    write("packages/core/tests/x.test.ts", "// test\n");
    write("packages/core/README.md", "# core\n");
    write("packages/cli/package.json", json(CLI));
    write("packages/cli/bin/comvi.js", "#!/usr/bin/env node\n");
    write("packages/cli/src/index.ts", "export {};\n");
    write("packages/typegen/package.json", json(TYPEGEN));
    write("packages/typegen/lib/emit.ts", "export {};\n");
    write("packages/typegen/tests/emit.test.ts", "// test\n");
    write("tooling/qualify.mjs", "// qualify\n");
    write("tooling/unrelated.mjs", "// unrelated\n");
    write(".changeset/README.md", "# Changesets\n");
    write(".changeset/old-entry.md", '---\n"@comvi/core": patch\n---\n\nOld.\n');
    setupBase({ dir, git, write });
    git("add", "-A");
    git("commit", "-qm", "base");
    git("checkout", "-qb", "topic");
    change({ dir, git, write });
    git("add", "-A");
    git("commit", "-qm", "change");
    const result = spawnSync(process.execPath, [SCRIPT, baseRef], { cwd: dir, encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("CLI: a source file moved out of src/ without a changeset → fails, naming the removed path", () => {
  const result = guardAfter(({ dir, git }) => {
    mkdirSync(path.join(dir, "packages/core/tests"), { recursive: true });
    git("mv", "packages/core/src/x.ts", "packages/core/tests/x.ts");
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /packages\/core\/src\/x\.ts/);
});

test("CLI: a non-ASCII source path without a changeset → fails, naming it unquoted", () => {
  const result = guardAfter(({ write }) => write("packages/core/src/é.ts", "export {};\n"));

  assert.equal(result.status, 1);
  assert.match(result.output, /packages\/core\/src\/é\.ts/);
});

test("CLI: a source change whose only changeset edit is a deletion → fails", () => {
  const result = guardAfter(({ git, write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    git("rm", "-q", ".changeset/old-entry.md");
  });

  assert.equal(result.status, 1);
});

test("CLI: a source change with only .changeset/README.md edited → fails", () => {
  const result = guardAfter(({ write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    write(".changeset/README.md", "# Changesets, edited\n");
  });

  assert.equal(result.status, 1);
});

test("CLI: a source change with an added changeset → passes", () => {
  const result = guardAfter(({ write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    write(".changeset/new-entry.md", '---\n"@comvi/core": patch\n---\n\nNew.\n');
  });

  assert.equal(result.status, 0);
});

test("CLI: a source change with an edited existing changeset → passes", () => {
  const result = guardAfter(({ write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    write(".changeset/old-entry.md", '---\n"@comvi/core": patch\n---\n\nOld, reworded.\n');
  });

  assert.equal(result.status, 0);
});

test("CLI: a devDependencies-only manifest change without a changeset → passes", () => {
  const result = guardAfter(({ write }) =>
    write("packages/core/package.json", json({ ...CORE, devDependencies: { vitest: "^4.2.0" } })),
  );

  assert.equal(result.status, 0);
});

test("CLI: a base ref that does not exist → fails", () => {
  const result = guardAfter(
    ({ write }) => write("packages/core/src/x.ts", "export const x = 2;\n"),
    "no-such-branch",
  );

  assert.notEqual(result.status, 0);
});

test("parseNameStatus: NUL-separated status/path pairs, non-ASCII paths as they are", () => {
  const output = "M\0packages/core/src/é.ts\0D\0.changeset/old.md\0";

  assert.deepEqual(parseNameStatus(output), [
    { status: "M", path: "packages/core/src/é.ts" },
    { status: "D", path: ".changeset/old.md" },
  ]);
});

test("parseNameStatus: an odd number of fields → throws", () => {
  assert.throws(() => parseNameStatus("M\0a\0D\0"), /unexpected/);
});

test("changesetChanges: added and modified changesets count; deleted, README and nested do not", () => {
  const entries = [
    { status: "A", path: ".changeset/new.md" },
    { status: "M", path: ".changeset/edited.md" },
    { status: "D", path: ".changeset/gone.md" },
    { status: "M", path: ".changeset/README.md" },
    { status: "A", path: ".changeset/sub/x.md" },
    { status: "M", path: ".changeset/config.json" },
  ];

  assert.deepEqual(changesetChanges(entries), [".changeset/new.md", ".changeset/edited.md"]);
});

const VALID_CHANGESET = '---\n"@comvi/core": patch\n---\n\nNew.\n';

for (const [name, file] of [
  ["a `bin` file listed in `files`", "packages/cli/bin/comvi.js"],
  ["a build config", "packages/core/vite.config.ts"],
  ["a tooling script the build script runs", "tooling/qualify.mjs"],
  [
    "a private package's non-test file (no `files`: everything counts)",
    "packages/typegen/lib/emit.ts",
  ],
]) {
  test(`CLI: ${name} changed without a changeset → fails`, () => {
    const result = guardAfter(({ write }) => write(file, "// changed\n"));

    assert.equal(result.status, 1);
    assert.match(result.output, new RegExp(file.replace(/[.]/g, "\\.")));
  });
}

for (const [name, file] of [
  ["a test file", "packages/core/tests/x.test.ts"],
  ["a README", "packages/core/README.md"],
  ["a private package's test", "packages/typegen/tests/emit.test.ts"],
  ["a tooling script no build runs", "tooling/unrelated.mjs"],
]) {
  test(`CLI: ${name} changed without a changeset → passes`, () => {
    const result = guardAfter(({ write }) => write(file, "// changed\n"));

    assert.equal(result.status, 0);
  });
}

test("CLI: a source change whose only changeset is empty → fails", () => {
  const result = guardAfter(({ write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    write(".changeset/new-entry.md", "");
  });

  assert.equal(result.status, 1);
});

test("CLI: a source change whose only changeset has frontmatter but no summary → fails", () => {
  const result = guardAfter(({ write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    write(".changeset/new-entry.md", '---\n"@comvi/core": patch\n---\n');
  });

  assert.equal(result.status, 1);
});

test("CLI: a source change with a valid changeset next to an invalid one → passes", () => {
  const result = guardAfter(({ write }) => {
    write("packages/core/src/x.ts", "export const x = 2;\n");
    write(".changeset/broken.md", "");
    write(".changeset/new-entry.md", VALID_CHANGESET);
  });

  assert.equal(result.status, 0);
});

test("publishedPath: a `files` glob it does not expand → everything but tests and docs counts", () => {
  assert.equal(publishedPath("lib/x.js", { files: ["dist/*.js"] }), true);
});

test("publishedPath: a test tsconfig → not published", () => {
  assert.equal(publishedPath("tsconfig.tests.json", { files: ["dist"] }), false);
});

test("publishedPath: the build tsconfig → published", () => {
  assert.equal(publishedPath("tsconfig.json", { files: ["dist"] }), true);
});

test("ci.yml: the guard step passes the base ref through env, never interpolated into the shell", () => {
  const workflow = readFileSync(new URL("../workflows/ci.yml", import.meta.url), "utf8");
  const step = workflow
    .split("- name: Verify changeset for published package changes")[1]
    .split("- name:")[0];
  const run = step.slice(step.indexOf("run:"));

  assert.match(step, /env:\n\s+BASE_REF: \$\{\{ github\.base_ref \}\}/);
  assert.doesNotMatch(run, /\$\{\{/);
});

test("onlyReleaseVersionChanged: version, devDependencies and @comvi/* ranges → true", () => {
  const base = { ...BASE, peerDependencies: { "@comvi/core": "^0.7.0", vite: "^8.0.0" } };
  const head = {
    ...base,
    version: "0.8.0",
    peerDependencies: { "@comvi/core": "^0.8.0", vite: "^8.0.0" },
    devDependencies: { vitest: "^5.0.0" },
  };

  assert.equal(onlyReleaseVersionChanged(json(base), json(head)), true);
});

test("onlyReleaseVersionChanged: the @comvi/* range in each dependency field → true", () => {
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const base = { ...BASE, [field]: { "@comvi/core": "^0.7.0" } };
    const head = { ...base, version: "0.8.0", [field]: { "@comvi/core": "^0.8.0" } };
    assert.equal(onlyReleaseVersionChanged(json(base), json(head)), true, field);
  }
});

test("onlyReleaseVersionChanged: anything but a plain @comvi/* range swap → false", () => {
  const withCore = { ...BASE, dependencies: { ...BASE.dependencies, "@comvi/core": "^0.7.0" } };
  const dep = (value) => ({
    ...withCore,
    version: "0.7.1",
    dependencies: { ...BASE.dependencies, "@comvi/core": value },
  });
  const cases = [
    [BASE, { ...BASE, version: "0.7.1", dependencies: { commander: "^15.0.0" } }],
    [
      BASE,
      {
        ...BASE,
        version: "0.7.1",
        dependencies: { ...BASE.dependencies, "@comvi/core": "^0.7.1" },
      },
    ],
    [withCore, { ...withCore, version: "0.7.1", dependencies: { ...BASE.dependencies } }],
    [BASE, { ...BASE, version: "0.7.1", exports: { ".": "./dist/other.js" } }],
    [withCore, dep("npm:other@1.0.0")],
    [withCore, dep("https://example.com/core.tgz")],
    [withCore, dep("latest")],
    [withCore, dep(null)],
    [withCore, dep(["^0.7.1"])],
    [withCore, dep({ version: "^0.7.1" })],
    [
      { ...withCore, dependencies: { ...BASE.dependencies, "@comvi/core": "workspace:*" } },
      dep("^0.7.1"),
    ],
  ];
  for (const [base, head] of cases) {
    assert.equal(onlyReleaseVersionChanged(json(base), json(head)), false, JSON.stringify(head));
  }
  assert.equal(onlyReleaseVersionChanged(null, json(BASE)), false);
  assert.equal(onlyReleaseVersionChanged(json(BASE), "{ not json"), false);
});

test("consumesChangesets: deleted changesets and none added → true; any added or edited → false", () => {
  const deleted = { status: "D", path: ".changeset/old-entry.md" };
  assert.equal(consumesChangesets([deleted]), true);
  for (const status of ["A", "M", "T"]) {
    assert.equal(
      consumesChangesets([deleted, { status, path: ".changeset/other.md" }]),
      false,
      status,
    );
  }
  assert.equal(consumesChangesets([{ status: "D", path: ".changeset/README.md" }]), false);
  assert.equal(consumesChangesets([{ status: "M", path: "packages/core/src/x.ts" }]), false);
});

test("CLI: a release version commit (changesets consumed, versions moved) → passes", () => {
  const result = guardAfter(({ git, write }) => {
    git("rm", "-q", ".changeset/old-entry.md");
    write("packages/core/package.json", json({ ...CORE, version: "0.7.1" }));
    write("packages/cli/package.json", json({ ...CLI, version: "0.7.1" }));
    write("packages/core/CHANGELOG.md", "# @comvi/core\n\n## 0.7.1\n");
  });

  assert.equal(result.status, 0, result.output);
});

test("CLI: a minor release commit that also moves @comvi/* peer ranges → passes", () => {
  const result = guardAfter(
    ({ git, write }) => {
      git("rm", "-q", ".changeset/old-entry.md");
      write("packages/core/package.json", json({ ...CORE, version: "0.8.0" }));
      write(
        "packages/cli/package.json",
        json({ ...CLI, version: "0.8.0", peerDependencies: { "@comvi/core": "^0.8.0" } }),
      );
    },
    "main",
    ({ write }) =>
      write(
        "packages/cli/package.json",
        json({ ...CLI, peerDependencies: { "@comvi/core": "^0.7.0" } }),
      ),
  );

  assert.equal(result.status, 0, result.output);
});

test("CLI: changesets consumed but a source file changed too → fails", () => {
  const result = guardAfter(({ git, write }) => {
    git("rm", "-q", ".changeset/old-entry.md");
    write("packages/core/package.json", json({ ...CORE, version: "0.7.1" }));
    write("packages/core/src/x.ts", "export const x = 2;\n");
  });

  assert.equal(result.status, 1);
  assert.match(result.output, /packages\/core\/src\/x\.ts/);
});

test("CLI: a version bump without consuming a changeset → fails", () => {
  const result = guardAfter(({ write }) =>
    write("packages/core/package.json", json({ ...CORE, version: "0.7.1" })),
  );

  assert.equal(result.status, 1);
});
