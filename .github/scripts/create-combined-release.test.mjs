/**
 * Integration tests for .github/scripts/create-combined-release.mjs.
 *
 * The script is driven the way release.yml drives it: PUBLISHED_PACKAGES in the
 * environment, run from a repo root. COMVI_RELEASE_DRY_RUN=1 stops it before
 * `gh release create`, and COMVI_RELEASE_ARCHIVE_DIR keeps the tarball out of
 * the tree, so `gh` is never reached and nothing is written to the repo.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./create-combined-release.mjs", import.meta.url));
const notesCheckPath = fileURLToPath(new URL("./check-release-notes.mjs", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

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

function gitEnv(root) {
  return {
    ...process.env,
    GIT_DIR: path.join(root, ".git"),
    GIT_WORK_TREE: root,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
}

function git(root, ...args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", env: gitEnv(root) });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

/**
 * A minimal workspace: .changeset/config.json plus packable packages/*, as one
 * commit (the release SHA) carrying the release tag `tag` (null: no tag).
 */
function makeFixture(t, packages, { tag = "v0.5.0", files = {} } = {}) {
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

  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }

  git(root, "init", "-q");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "release commit");
  if (tag) git(root, "tag", tag);

  const archiveDir = path.join(root, "artifacts");
  return { root, archiveDir, head: git(root, "rev-parse", "HEAD") };
}

function runScript({ root, archiveDir, published, tarballsDir, dryRun = true, env = {} }) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...gitEnv(root),
      ...env,
      PUBLISHED_PACKAGES: JSON.stringify(published),
      ...(dryRun ? { COMVI_RELEASE_DRY_RUN: "1" } : {}),
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
  writeSums(tarballsDir, ["comvi-core-0.5.0.tgz", "comvi-react-0.5.0.tgz"]);
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

/** SHA256SUMS for `files` in `dir`, in the format the pack job writes. */
function writeSums(dir, files) {
  const lines = files.map(
    (file) =>
      `${createHash("sha256")
        .update(fs.readFileSync(path.join(dir, file)))
        .digest("hex")}  ${file}`,
  );
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

const TRAIN = [
  { name: "@comvi/core", version: "0.5.0" },
  { name: "@comvi/react", version: "0.5.0" },
];

test("the release tag must exist: a missing v-tag is refused, not created on the default branch", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2), { tag: null });
  const result = runScript({ root, archiveDir, published: TRAIN });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /v0\.5\.0 does not exist/);
  assert.equal(fs.existsSync(archiveDir), false);
});

test("the release tag must point at the checked-out release SHA: both SHAs are named", (t) => {
  const { root, archiveDir, head } = makeFixture(t, MIXED_PACKAGES.slice(0, 2), { tag: null });
  fs.writeFileSync(path.join(root, "later.txt"), "D");
  git(root, "add", "later.txt");
  git(root, "commit", "-q", "-m", "D");
  const other = git(root, "rev-parse", "HEAD");
  git(root, "tag", "v0.5.0");
  git(root, "reset", "-q", "--hard", head);

  const result = runScript({ root, archiveDir, published: TRAIN });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, new RegExp(`v0\\.5\\.0 points at ${other}[\\s\\S]*${head}`));
  assert.equal(fs.existsSync(archiveDir), false);
});

/**
 * A fake `gh` on PATH that logs each call (one JSON array per line). `release
 * view` succeeds when FAKE_GH_RELEASE_EXISTS=1, fails with gh's "release not
 * found" otherwise, or with an auth error when FAKE_GH_VIEW_ERROR=1.
 */
function fakeGh(root) {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const log = path.join(root, "gh-calls.log");
  fs.writeFileSync(
    path.join(bin, "gh"),
    `#!/usr/bin/env node
const args = process.argv.slice(2);
require("node:fs").appendFileSync(${JSON.stringify(log)}, JSON.stringify(args) + "\\n");
if (args[0] === "release" && args[1] === "view") {
  if (process.env.FAKE_GH_VIEW_ERROR === "1") {
    process.stderr.write("HTTP 401: Bad credentials\\n");
    process.exit(1);
  }
  if (process.env.FAKE_GH_RELEASE_EXISTS !== "1") {
    process.stderr.write("release not found\\n");
    process.exit(1);
  }
  process.stdout.write(JSON.stringify({ tagName: args[2] }) + "\\n");
}
`,
    { mode: 0o755 },
  );
  return {
    env: { PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    calls: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, "utf8")
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
        : [],
  };
}

test("gh release create runs with --verify-tag, so gh never creates the tag itself", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2));
  const gh = fakeGh(root);
  const result = runScript({ root, archiveDir, published: TRAIN, dryRun: false, env: gh.env });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const create = gh.calls().find((args) => args[1] === "create");
  assert.ok(create, JSON.stringify(gh.calls()));
  assert.equal(create[2], "v0.5.0");
  assert.ok(create.includes("--verify-tag"), create.join(" "));
});

test("a release that already exists (asset upload failed last time) gets its asset re-uploaded, not a second create", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2));
  const gh = fakeGh(root);
  const result = runScript({
    root,
    archiveDir,
    published: TRAIN,
    dryRun: false,
    env: { ...gh.env, FAKE_GH_RELEASE_EXISTS: "1" },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const calls = gh.calls();
  assert.equal(
    calls.some((args) => args[1] === "create"),
    false,
    JSON.stringify(calls),
  );
  const upload = calls.find((args) => args[1] === "upload");
  assert.ok(upload, JSON.stringify(calls));
  assert.equal(upload[2], "v0.5.0");
  assert.match(upload[3], /comvi-v0\.5\.0\.tar\.gz#comvi-v0\.5\.0\.tar\.gz$/);
  assert.ok(upload.includes("--clobber"));
});

test("a gh failure other than 'release not found' stops the step", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2));
  const gh = fakeGh(root);
  const result = runScript({
    root,
    archiveDir,
    published: TRAIN,
    dryRun: false,
    env: { ...gh.env, FAKE_GH_VIEW_ERROR: "1" },
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /gh release view v0\.5\.0 failed/);
  assert.equal(
    gh.calls().some((args) => args[1] === "create" || args[1] === "upload"),
    false,
  );
});

test("an incomplete candidate is refused: the published set must be every package SHA256SUMS lists", (t) => {
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2));
  const tarballsDir = path.join(root, "release-candidate");
  fs.mkdirSync(tarballsDir);
  fs.writeFileSync(path.join(tarballsDir, "comvi-core-0.5.0.tgz"), "core");
  fs.writeFileSync(path.join(tarballsDir, "comvi-react-0.5.0.tgz"), "react");
  writeSums(tarballsDir, ["comvi-core-0.5.0.tgz", "comvi-react-0.5.0.tgz"]);
  const result = runScript({
    root,
    archiveDir,
    tarballsDir,
    published: [{ name: "@comvi/core", version: "0.5.0" }],
  });
  assert.equal(result.status, 1, result.stdout);
  assert.match(result.stderr, /not published: comvi-react-0\.5\.0\.tgz/);
  assert.equal(fs.existsSync(archiveDir), false);
});

test("the archive is reproducible: two builds from the same inputs have the same SHA-256", (t) => {
  const { root } = makeFixture(t, MIXED_PACKAGES.slice(0, 2));
  const tarballsDir = path.join(root, "release-candidate");
  fs.mkdirSync(tarballsDir);
  fs.writeFileSync(path.join(tarballsDir, "comvi-core-0.5.0.tgz"), "core");
  fs.writeFileSync(path.join(tarballsDir, "comvi-react-0.5.0.tgz"), "react");
  writeSums(tarballsDir, ["comvi-core-0.5.0.tgz", "comvi-react-0.5.0.tgz"]);
  const build = (archiveDir) => {
    const result = runScript({ root, archiveDir, tarballsDir, published: TRAIN });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const archive = path.join(archiveDir, "comvi-v0.5.0.tar.gz");
    return createHash("sha256").update(fs.readFileSync(archive)).digest("hex");
  };
  const first = build(path.join(root, "artifacts-1"));
  // A retry runs later, with fresh file times: they must not reach the bytes.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
  const second = build(path.join(root, "artifacts-2"));
  assert.equal(second, first);

  // The manifest's time is the release commit's, not the clock's.
  const archiveRoot = extractArchive(t, path.join(root, "artifacts-1"), "comvi-v0.5.0");
  const manifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, "manifest.json"), "utf8"));
  assert.equal(
    manifest.generatedAt,
    new Date(Number(git(root, "show", "-s", "--format=%ct", "HEAD")) * 1000).toISOString(),
  );
});

// GitHub rejects a release body above 125,000 characters, and this step runs
// AFTER npm publish. 0.5.0's package changelogs add up to about 553,000.
const BODY_CAP = 100_000;

/** One changelog entry of about `chars` characters: `count` bullets under it. */
function longEntry(label, chars) {
  const bullet = `${label} bullet ${"x".repeat(60)}`;
  return Array.from({ length: Math.ceil(chars / (bullet.length + 3)) }, () => bullet).join("\n- ");
}

const OVERSIZED_PACKAGES = [
  {
    dir: "core",
    name: "@comvi/core",
    version: "0.5.0",
    changelog: [["0.5.0", longEntry("core", 200_000)]],
  },
  {
    dir: "react",
    name: "@comvi/react",
    version: "0.5.0",
    changelog: [["0.5.0", longEntry("react", 200_000)]],
  },
  {
    dir: "next",
    name: "@comvi/next",
    version: "0.5.0",
    changelog: [["0.5.0", "next short entry"]],
  },
];
const OVERSIZED_TRAIN = OVERSIZED_PACKAGES.map(({ name, version }) => ({ name, version }));
const HIGHLIGHTS = "## Highlights\n\nThe hand-written summary of 0.5.\n";

function releaseBody(t, packages, published, options = {}) {
  const { root, archiveDir } = makeFixture(t, packages, options);
  // Read from a file, not from stdout: a pipe on macOS loses everything past
  // 64 KiB when the script exits, which made an oversized body look small.
  const bodyFile = path.join(root, "release-body.md");
  const result = runScript({
    root,
    archiveDir,
    published,
    env: {
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "comvi-io/comvi-js",
      COMVI_RELEASE_BODY_FILE: bodyFile,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return fs.readFileSync(bodyFile, "utf8");
}

test("changelogs larger than GitHub's body limit → a body under the cap with the highlights and every package heading", (t) => {
  const body = releaseBody(t, OVERSIZED_PACKAGES, OVERSIZED_TRAIN, {
    files: { ".github/release-notes/0.5.0.md": HIGHLIGHTS },
  });

  assert.equal(body.length < BODY_CAP, true, `body is ${body.length} characters`);
  assert.match(body, /## Highlights\n\nThe hand-written summary of 0\.5\./);
  assert.deepEqual(body.match(/^### `@comvi\/[^`]+`$/gm), [
    "### `@comvi/core`",
    "### `@comvi/next`",
    "### `@comvi/react`",
  ]);
});

test("a truncated package section ends with a link to that package's CHANGELOG.md at the release tag", (t) => {
  const body = releaseBody(t, OVERSIZED_PACKAGES, OVERSIZED_TRAIN);

  const [, core, next, react] = body.split(/^### `@comvi\/[^`]+`$/m);
  assert.match(
    core.trimEnd(),
    /\(https:\/\/github\.com\/comvi-io\/comvi-js\/blob\/v0\.5\.0\/packages\/core\/CHANGELOG\.md\)\._$/,
  );
  assert.match(
    react.trimEnd(),
    /\(https:\/\/github\.com\/comvi-io\/comvi-js\/blob\/v0\.5\.0\/packages\/react\/CHANGELOG\.md\)\._$/,
  );
  // A section that fits is whole and carries no link.
  assert.equal(next.trim(), "#### Minor Changes\n\n- next short entry");
});

test("a section cut inside a code fence gets the fence closed at its own indentation, so the rest of the body is not rendered as code", (t) => {
  const fenced = `fenced entry\n\n  \`\`\`ts\n${"  const x = 1;\n".repeat(20_000)}  \`\`\``;
  const body = releaseBody(
    t,
    [{ ...OVERSIZED_PACKAGES[0], changelog: [["0.5.0", fenced]] }, OVERSIZED_PACKAGES[2]],
    [OVERSIZED_TRAIN[0], OVERSIZED_TRAIN[2]],
  );

  const core = body.split(/^### `@comvi\/[^`]+`$/m)[1];
  assert.match(core, /Truncated\./);
  assert.deepEqual(core.match(/^ *```.*$/gm), ["  ```ts", "  ```"]);
});

test("an oversized highlights file is cut too: the body never exceeds the cap", (t) => {
  const body = releaseBody(t, OVERSIZED_PACKAGES, OVERSIZED_TRAIN, {
    files: {
      ".github/release-notes/0.5.0.md": `## Highlights\n\n${"line of notes\n".repeat(20_000)}`,
    },
  });

  assert.equal(body.length < BODY_CAP, true, `body is ${body.length} characters`);
  assert.equal(body.match(/^### `@comvi\/[^`]+`$/gm).length, 3);
});

// ---------------------------------------------------------------------------
// The hand-written notes are published as they are, and a re-run never repairs
// a body: an HTML comment left in them (a draft marker, a "bullet goes here"
// slot) must stop the release before it is created.
// ---------------------------------------------------------------------------

const WITH_COMMENT = "## Fixes\n\n- one fix\n<!-- the next bullet goes here -->\n";

function runNotesCheck(cwd, ...args) {
  return spawnSync(process.execPath, [notesCheckPath, ...args], { cwd, encoding: "utf8" });
}

test("this repo: the notes of the version @comvi/core is at hold no HTML comment", () => {
  const result = runNotesCheck(repoRoot);

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("notes check: an HTML comment in the notes of core's version → exit 1 with an ::error naming file and line", (t) => {
  const { root } = makeFixture(t, MIXED_PACKAGES.slice(0, 2), {
    files: { ".github/release-notes/0.5.0.md": WITH_COMMENT },
  });

  const result = runNotesCheck(root);

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(
    result.stdout,
    /^::error file=\.github\/release-notes\/0\.5\.0\.md,line=4,.*\.github\/release-notes\/0\.5\.0\.md:4: /m,
  );
});

test("notes check: clean notes, or no notes for the version → exit 0", (t) => {
  const clean = makeFixture(t, MIXED_PACKAGES.slice(0, 2), {
    files: { ".github/release-notes/0.5.0.md": HIGHLIGHTS },
  });
  const none = makeFixture(t, MIXED_PACKAGES.slice(0, 2));

  assert.equal(runNotesCheck(clean.root).status, 0);
  assert.equal(runNotesCheck(none.root).status, 0);
});

test("notes check: a comment in another version's notes is not this release's business", (t) => {
  const { root } = makeFixture(t, MIXED_PACKAGES.slice(0, 2), {
    files: { ".github/release-notes/0.5.1.md": WITH_COMMENT },
  });

  assert.equal(runNotesCheck(root).status, 0);
  assert.equal(runNotesCheck(root, "0.5.1").status, 1);
});

test("an HTML comment in the notes → it is cut from the body with a ::warning naming file and line, and the rest of the body is unchanged", (t) => {
  const notes = (slot) =>
    `## Fixes\n\n- one fix\n${slot}- another fix, inline${slot && " <!-- b -->"}\n`;
  const withComments = notes("<!-- the next bullet\n     goes here -->\n");
  const body = (text, capture) => {
    const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2), {
      files: { ".github/release-notes/0.5.0.md": text },
    });
    const bodyFile = path.join(root, "release-body.md");
    const result = runScript({
      root,
      archiveDir,
      published: TRAIN,
      env: { COMVI_RELEASE_BODY_FILE: bodyFile },
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    capture.stdout = result.stdout;
    return fs.readFileSync(bodyFile, "utf8");
  };
  const dirty = {};
  const clean = {};

  const stripped = body(withComments, dirty);
  const reference = body(notes(""), clean);

  assert.equal(stripped, reference);
  assert.doesNotMatch(stripped, /<!--|-->|goes here/);
  assert.match(
    dirty.stdout,
    /^::warning file=\.github\/release-notes\/0\.5\.0\.md,line=4,.*HTML comment/m,
  );
  assert.match(dirty.stdout, /^::warning file=\.github\/release-notes\/0\.5\.0\.md,line=6,/m);
  assert.doesNotMatch(clean.stdout, /::warning/);
});

test("an HTML comment shown in a code block or a code span is a comment too: the check fails naming each line and the hint, and the body is published without them", (t) => {
  const notes =
    "## Fixes\n\n- Mark the slot with `<!-- slot -->`:\n\n  ```html\n  <!-- example -->\n  ```\n";
  const { root, archiveDir } = makeFixture(t, MIXED_PACKAGES.slice(0, 2), {
    files: { ".github/release-notes/0.5.0.md": notes },
  });
  const bodyFile = path.join(root, "release-body.md");

  const check = runNotesCheck(root);
  const result = runScript({
    root,
    archiveDir,
    published: TRAIN,
    env: { COMVI_RELEASE_BODY_FILE: bodyFile },
  });

  assert.equal(check.status, 1, check.stdout + check.stderr);
  assert.deepEqual(check.stdout.match(/^::error file=[^,]+,line=\d+/gm), [
    "::error file=.github/release-notes/0.5.0.md,line=3",
    "::error file=.github/release-notes/0.5.0.md,line=6",
  ]);
  assert.match(
    check.stdout,
    /release notes must not contain an HTML comment; to show one in a code sample write `&lt;!--`/,
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(fs.readFileSync(bodyFile, "utf8"), /<!--/);
  assert.match(result.stdout, /^::warning file=\.github\/release-notes\/0\.5\.0\.md,line=6,/m);
});
