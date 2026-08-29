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
  assert.equal(
    changeset.body.trim(),
    "Instance-level defaults:\n\n- Details stay in package changelogs.",
  );
});

test("summarizeChangeset joins a soft-wrapped first paragraph into one line", () => {
  assert.equal(
    summarizeChangeset(
      "**BREAKING: the default host is the base\nhost.** Migration follows.\n\nDetails.",
    ),
    "**BREAKING: the default host is the base host.** Migration follows.",
  );
});

test("summarizeChangeset stops a list item before its nested detail", () => {
  assert.equal(
    summarizeChangeset("- **Removed** the old API.\n  - Nested detail."),
    "**Removed** the old API.",
  );
});

test("summarizeChangeset drops the colon that introduces a list", () => {
  assert.equal(
    summarizeChangeset("Instance-level defaults:\n\n- Details stay in package changelogs.\n"),
    "Instance-level defaults",
  );
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
  assert.match(
    section,
    /Independently versioned packages included below keep their own versions\./,
  );
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
  assert.deepEqual(result.content.match(/^## \[[\d.]+\]/gm), ["## [0.5.0]", "## [0.2.0]"]);
  assert.deepEqual(result.content.match(/^\[[\d.]+\]:/gm), ["[0.5.0]:", "[0.2.0]:"]);
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

test("parseChangeset rejects a release entry whose bump type is not a semver keyword", () => {
  assert.throws(
    () => parseChangeset("---\n@comvi/core: feature\n---\nSummary"),
    /invalid release entry/,
  );
});

test("parseChangeset rejects a changeset with no summary", () => {
  assert.throws(() => parseChangeset("---\n@comvi/core: minor\n---\n"), /no summary/);
});

test("coordinatedVersion rejects a partial fixed-group bump", () => {
  assert.throws(
    () =>
      coordinatedVersion([
        { name: "@comvi/core", version: "0.5.0" },
        { name: "@comvi/react", version: "0.4.0" },
      ]),
    /must share one version/,
  );
});

test("coordinatedVersion returns the version the fixed group shares, ignoring independently versioned packages", () => {
  assert.equal(
    coordinatedVersion([
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/react", version: "0.5.0" },
    ]),
    "0.5.0",
  );
  assert.equal(
    coordinatedVersion([
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/locale-routing", version: "0.1.0" },
      { name: "@comvi/react", version: "0.5.0" },
    ]),
    "0.5.0",
    "@comvi/locale-routing is versioned independently and must not decide the release version",
  );
});

test("coordinatedVersion rejects a package set with nothing coordinated in it", () => {
  assert.throws(
    () => coordinatedVersion([{ name: "@comvi/locale-routing", version: "0.1.0" }]),
    /no publishable packages found/,
  );
});

/**
 * A repo root the filesystem helpers can read: two changesets whose filenames
 * are deliberately out of authoring order, one private package, and a root
 * CHANGELOG.md to prepend to.
 */
function makeFixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-root-changelog-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".changeset"));
  fs.writeFileSync(path.join(root, ".changeset/README.md"), "ignored");
  fs.writeFileSync(
    path.join(root, ".changeset/z-last.md"),
    '---\n"@comvi/react": patch\n---\n\nReact fix.\n',
  );
  fs.writeFileSync(
    path.join(root, ".changeset/a-first.md"),
    '---\n"@comvi/core": minor\n---\n\nCore feature.\n',
  );

  for (const [dir, manifest] of [
    ["core", '{"name":"@comvi/core","version":"0.5.0"}\n'],
    ["react", '{"name":"@comvi/react","version":"0.5.0"}\n'],
    ["internal", '{"name":"@comvi/internal","version":"0.0.0","private":true}\n'],
  ]) {
    fs.mkdirSync(path.join(root, "packages", dir), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", dir, "package.json"), manifest);
  }
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), baseChangelog);
  return root;
}

test("collectChangesets returns every changeset sorted by filename, skipping README.md", (t) => {
  const root = makeFixtureRoot(t);

  const changesets = collectChangesets(root);

  assert.deepEqual(
    changesets.map((changeset) => changeset.id),
    ["a-first.md", "z-last.md"],
  );
});

test("getPublishablePackages reads each manifest and skips private packages", (t) => {
  const root = makeFixtureRoot(t);

  const packages = getPublishablePackages(root);

  assert.deepEqual(packages, [
    { name: "@comvi/core", version: "0.5.0" },
    { name: "@comvi/react", version: "0.5.0" },
  ]);
  assert.equal(coordinatedVersion(packages), "0.5.0");
});

test("updateRootChangelogFile writes one release entry and is a no-op the second time", (t) => {
  const root = makeFixtureRoot(t);
  const changesets = collectChangesets(root);
  const packages = getPublishablePackages(root);

  const first = updateRootChangelogFile({ root, version: "0.5.0", changesets, packages });
  const second = updateRootChangelogFile({ root, version: "0.5.0", changesets, packages });

  assert.equal(first, true);
  assert.equal(second, false);
  const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.deepEqual(changelog.match(/^## \[[\d.]+\]/gm), ["## [0.5.0]", "## [0.2.0]"]);
  assert.deepEqual(changelog.match(/Core feature\.|React fix\./g), ["Core feature.", "React fix."]);
});
