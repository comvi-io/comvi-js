/**
 * Integration tests for .github/scripts/create-combined-release.mjs.
 *
 * The script is driven the way release.yml drives it: PUBLISHED_PACKAGES in the
 * environment, run from a repo root. COMVI_RELEASE_DRY_RUN=1 stops it before
 * `gh release create`, and COMVI_RELEASE_ARCHIVE_DIR keeps the tarball out of
 * the tree, so `gh` is never reached and nothing is written to the repo.
 */
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./create-combined-release.mjs", import.meta.url));

// A synthetic train. The names are real published packages so the fixture reads
// like a release, but the group is the fixture's own: the script reads whatever
// `fixed` the config it runs against declares. `@comvi/standalone` below is
// deliberately NOT a real package name — nothing in this repo is versioned
// independently any more, and the code path that handles one still needs a test.
const FIXED_GROUP = ["@comvi/core", "@comvi/react", "@comvi/next"];

function changelog(name, entries) {
  return [
    `# ${name}`,
    "",
    ...entries.flatMap(([version, line]) => [
      `## ${version}`,
      "",
      "### Minor Changes",
      "",
      `- ${line}`,
      "",
    ]),
  ].join("\n");
}

/** A minimal workspace: .changeset/config.json plus packable packages/*. */
function makeFixture(t, packages) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-combined-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  fs.mkdirSync(path.join(root, ".changeset"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".changeset/config.json"),
    `${JSON.stringify({ fixed: [FIXED_GROUP], ignore: [] }, null, 2)}\n`,
  );

  for (const pkg of packages) {
    const dir = path.join(root, "packages", pkg.dir);
    fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist/index.js"), "export const x = 1;\n");
    fs.writeFileSync(
      path.join(dir, "package.json"),
      `${JSON.stringify({ name: pkg.name, version: pkg.version, files: ["dist"] }, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), changelog(pkg.name, pkg.changelog));
  }

  const archiveDir = path.join(root, "artifacts");
  return { root, archiveDir };
}

function runScript({ root, archiveDir, published, tarballsDir }) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PUBLISHED_PACKAGES: JSON.stringify(published),
      COMVI_RELEASE_DRY_RUN: "1",
      COMVI_RELEASE_ARCHIVE_DIR: archiveDir,
      ...(tarballsDir ? { COMVI_RELEASE_TARBALLS_DIR: tarballsDir } : {}),
    },
  });
}

function extractArchive(t, archiveDir, archiveName) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-combined-release-extract-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const tar = spawnSync(
    "tar",
    ["-xzf", path.join(archiveDir, `${archiveName}.tar.gz`), "-C", out],
    {
      encoding: "utf8",
    },
  );
  assert.equal(tar.status, 0, tar.stderr);
  return path.join(out, archiveName);
}

const MIXED_PACKAGES = [
  {
    dir: "core",
    name: "@comvi/core",
    version: "0.5.0",
    changelog: [
      ["0.5.0", "core train entry"],
      ["0.4.1", "older core entry"],
    ],
  },
  {
    dir: "react",
    name: "@comvi/react",
    version: "0.5.0",
    changelog: [["0.5.0", "react train entry"]],
  },
  {
    dir: "standalone",
    name: "@comvi/standalone",
    version: "0.1.0",
    changelog: [["0.1.0", "standalone initial release"]],
  },
];

test("a mixed published set tags the fixed-group version and keeps every package's own version", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES);
  const result = runScript({
    root,
    archiveDir,
    published: [
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/react", version: "0.5.0" },
      { name: "@comvi/standalone", version: "0.1.0" },
    ],
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Creating GitHub Release: v0\.5\.0/);
  assert.match(result.stdout, /would create v0\.5\.0/);

  const body = result.stdout.split("---BODY---")[1].split("---END BODY---")[0];
  assert.match(body, /Released `0\.5\.0` across the coordinated `@comvi\/\*` release train\./);
  assert.match(body, /Independently versioned in this release: `@comvi\/standalone@0\.1\.0`\./);
  // Each section carries the section of the changelog for that package's OWN version.
  assert.match(body, /### `@comvi\/core`[\s\S]*core train entry/);
  assert.match(body, /### `@comvi\/react`[\s\S]*react train entry/);
  assert.match(body, /### `@comvi\/standalone`[\s\S]*standalone initial release/);
  assert.doesNotMatch(body, /older core entry/);

  const archiveRoot = extractArchive(t, archiveDir, "comvi-v0.5.0");
  const manifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.version, "0.5.0");
  assert.deepEqual(
    manifest.packages.map((pkg) => [pkg.name, pkg.version]),
    [
      ["@comvi/core", "0.5.0"],
      ["@comvi/react", "0.5.0"],
      ["@comvi/standalone", "0.1.0"],
    ],
  );
  assert.deepEqual(
    manifest.packages.map((pkg) => pkg.file),
    [
      "packages/comvi-core-0.5.0.tgz",
      "packages/comvi-react-0.5.0.tgz",
      "packages/comvi-standalone-0.1.0.tgz",
    ],
  );

  // NEW-5: the archive README must not claim a single shared version.
  const readme = fs.readFileSync(path.join(archiveRoot, "README.md"), "utf8");
  assert.doesNotMatch(readme, /share the same version\./);
  assert.match(readme, /The release train shares\nversion `0\.5\.0`/);
  assert.match(readme, /independently versioned packages keep their own version/);
});

test("a fixed-group disagreement still refuses", (t) => {
  const { root, archiveDir } = makeFixture(t, [
    ...MIXED_PACKAGES,
    {
      dir: "next",
      name: "@comvi/next",
      version: "0.4.1",
      changelog: [["0.4.1", "stale next entry"]],
    },
  ]);
  const result = runScript({
    root,
    archiveDir,
    published: [
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/next", version: "0.4.1" },
      { name: "@comvi/standalone", version: "0.1.0" },
    ],
  });

  assert.equal(result.status, 1, result.stdout);
  assert.match(
    result.stderr,
    /Refusing to create v0\.5\.0: published packages in the `fixed` group must share one version\./,
  );
  assert.match(result.stderr, /- @comvi\/next@0\.4\.1/);
  // The independent package is not part of the disagreement report.
  assert.doesNotMatch(result.stderr, /standalone/);
  assert.equal(fs.existsSync(archiveDir), false);
});

test("a release with no fixed-group package refuses: there is no train version to tag", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES);
  const result = runScript({
    root,
    archiveDir,
    published: [{ name: "@comvi/standalone", version: "0.1.0" }],
  });

  assert.equal(result.status, 1, result.stdout);
  assert.match(
    result.stderr,
    /no published package belongs to the `fixed` group in \.changeset\/config\.json/,
  );
  assert.match(result.stderr, /- @comvi\/standalone@0\.1\.0/);
  assert.equal(fs.existsSync(archiveDir), false);
});

test("no published packages is a no-op", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES);
  const result = runScript({ root, archiveDir, published: [] });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No packages were published/);
});

test("COMVI_RELEASE_TARBALLS_DIR: the archive holds the published tarballs byte for byte", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2));
  const tarballsDir = path.join(root, "release-candidate");
  fs.mkdirSync(tarballsDir);
  fs.writeFileSync(path.join(tarballsDir, "comvi-core-0.5.0.tgz"), "the core bytes npm received");
  fs.writeFileSync(path.join(tarballsDir, "comvi-react-0.5.0.tgz"), "the react bytes npm received");
  const result = runScript({
    root,
    archiveDir,
    tarballsDir,
    published: [
      { name: "@comvi/core", version: "0.5.0" },
      { name: "@comvi/react", version: "0.5.0" },
    ],
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const archiveRoot = extractArchive(t, archiveDir, "comvi-v0.5.0");
  assert.equal(
    fs.readFileSync(path.join(archiveRoot, "packages", "comvi-core-0.5.0.tgz"), "utf8"),
    "the core bytes npm received",
  );
});
