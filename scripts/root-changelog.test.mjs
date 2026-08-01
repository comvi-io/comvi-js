import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  collectChangesets,
  coordinatedVersion,
  getPublishablePackages,
  parseChangeset,
  renderRootReleaseSection,
  summarizeChangeset,
  updateRootChangelogContent,
  updateRootChangelogFile,
} from "./root-changelog.mjs";

const baseChangelog = `# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-05-09

Previous release.

[0.2.0]: https://github.com/comvi-io/comvi-js/releases/tag/v0.2.0
`;

const allPackages = ["@comvi/core", "@comvi/react", "@comvi/vue"];

test("parseChangeset reads quoted package frontmatter and body", () => {
  const changeset = parseChangeset(`---
"@comvi/core": minor
'@comvi/react': patch
---

Instance-level defaults:

- Details stay in package changelogs.
`);

  assert.deepEqual(changeset.releases, [
    { name: "@comvi/core", type: "minor" },
    { name: "@comvi/react", type: "patch" },
  ]);
  assert.equal(summarizeChangeset(changeset.body), "Instance-level defaults");
});

test("renderRootReleaseSection emits each changeset once and groups by highest bump", () => {
  const section = renderRootReleaseSection({
    version: "0.5.0",
    date: "2026-08-01",
    publishablePackageNames: allPackages,
    changesets: [
      {
        releases: allPackages.map((name) => ({ name, type: "minor" })),
        body: "Shared framework API.",
      },
      {
        releases: [
          { name: "@comvi/core", type: "patch" },
          { name: "@comvi/react", type: "minor" },
        ],
        body: "React integration update.",
      },
      {
        releases: [{ name: "@comvi/core", type: "patch" }],
        body: "Parser bug fix.",
      },
    ],
  });

  assert.match(section, /^## \[0\.5\.0\] - 2026-08-01/m);
  assert.match(section, /- \*\*All packages\*\* — Shared framework API\./);
  assert.match(section, /- \*\*@comvi\/core, @comvi\/react\*\* — React integration update\./);
  assert.match(section, /### Patch Changes\n\n- \*\*@comvi\/core\*\* — Parser bug fix\./);
  assert.equal(section.match(/Shared framework API\./g)?.length, 1);
});

test("renderRootReleaseSection stays undated when publication has not happened", () => {
  const section = renderRootReleaseSection({
    version: "0.5.0",
    publishablePackageNames: allPackages,
    changesets: [
      {
        releases: [{ name: "@comvi/core", type: "patch" }],
        body: "Parser bug fix.",
      },
    ],
  });

  assert.match(section, /^## \[0\.5\.0\]$/m);
  assert.doesNotMatch(section, /^## \[0\.5\.0\] -/m);
});

test("updateRootChangelogContent prepends a release and its link", () => {
  const result = updateRootChangelogContent({
    changelog: baseChangelog,
    version: "0.5.0",
    date: "2026-08-01",
    publishablePackageNames: allPackages,
    changesets: [
      {
        releases: [{ name: "@comvi/core", type: "minor" }],
        body: "New parser behavior.",
      },
    ],
  });

  assert.equal(result.changed, true);
  assert.ok(result.content.indexOf("## [0.5.0]") < result.content.indexOf("## [0.2.0]"));
  assert.ok(result.content.indexOf("[0.5.0]:") < result.content.indexOf("[0.2.0]:"));
});

test("updateRootChangelogContent is idempotent for an existing version", () => {
  const first = updateRootChangelogContent({
    changelog: baseChangelog,
    version: "0.5.0",
    date: "2026-08-01",
    publishablePackageNames: allPackages,
    changesets: [
      {
        releases: [{ name: "@comvi/core", type: "minor" }],
        body: "New parser behavior.",
      },
    ],
  });
  const second = updateRootChangelogContent({
    changelog: first.content,
    version: "0.5.0",
    date: "2026-08-02",
    publishablePackageNames: allPackages,
    changesets: [
      {
        releases: [{ name: "@comvi/core", type: "minor" }],
        body: "Duplicate attempt.",
      },
    ],
  });

  assert.equal(second.changed, false);
  assert.equal(second.content, first.content);
  assert.equal(second.content.match(/^## \[0\.5\.0\]/gm)?.length, 1);
});

test("parseChangeset rejects malformed entries", () => {
  assert.throws(
    () => parseChangeset("---\n@comvi/core: feature\n---\nSummary"),
    /invalid release entry/,
  );
  assert.throws(() => parseChangeset("---\n@comvi/core: minor\n---\n"), /no summary/);
});

test("coordinatedVersion rejects a partial fixed-group bump", () => {
  assert.equal(
    coordinatedVersion([
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/react", version: "0.5.0" },
    ]),
    "0.5.0",
  );
  assert.throws(
    () =>
      coordinatedVersion([
        { name: "@comvi/core", version: "0.5.0" },
        { name: "@comvi/react", version: "0.4.0" },
      ]),
    /must share one version/,
  );
});

test("coordinatedVersion ignores independently versioned packages", () => {
  assert.equal(
    coordinatedVersion([
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/locale-routing", version: "0.1.0" },
      { name: "@comvi/react", version: "0.5.0" },
    ]),
    "0.5.0",
  );
});

test("filesystem helpers generate one deterministic release entry", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-root-changelog-test-"));
  try {
    fs.mkdirSync(path.join(root, ".changeset"));
    fs.mkdirSync(path.join(root, "packages/core"), { recursive: true });
    fs.mkdirSync(path.join(root, "packages/react"), { recursive: true });
    fs.writeFileSync(path.join(root, ".changeset/README.md"), "ignored");
    fs.writeFileSync(
      path.join(root, ".changeset/z-last.md"),
      '---\n"@comvi/react": patch\n---\n\nReact fix.\n',
    );
    fs.writeFileSync(
      path.join(root, ".changeset/a-first.md"),
      '---\n"@comvi/core": minor\n---\n\nCore feature.\n',
    );
    fs.writeFileSync(
      path.join(root, "packages/core/package.json"),
      '{"name":"@comvi/core","version":"0.5.0"}\n',
    );
    fs.writeFileSync(
      path.join(root, "packages/react/package.json"),
      '{"name":"@comvi/react","version":"0.5.0"}\n',
    );
    fs.writeFileSync(path.join(root, "CHANGELOG.md"), baseChangelog);

    const changesets = collectChangesets(root);
    const packages = getPublishablePackages(root);
    assert.deepEqual(
      changesets.map((changeset) => changeset.id),
      ["a-first.md", "z-last.md"],
    );
    assert.equal(coordinatedVersion(packages), "0.5.0");
    assert.equal(updateRootChangelogFile({ root, version: "0.5.0", changesets, packages }), true);
    assert.equal(updateRootChangelogFile({ root, version: "0.5.0", changesets, packages }), false);

    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    assert.equal(changelog.match(/^## \[0\.5\.0\]/gm)?.length, 1);
    assert.ok(changelog.indexOf("Core feature.") < changelog.indexOf("React fix."));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
