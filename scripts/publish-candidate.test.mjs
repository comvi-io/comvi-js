import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

import {
  assertChecksums,
  assertVerifiedCandidate,
  candidatesFromSums,
  checksums,
  isPublished,
  parseArgs,
  publishAll,
  publishOrder,
  unexercised,
} from "./publish-candidate.mjs";

const SUMS = "a".repeat(64);

test("parseArgs: a subcommand and --dir are required; publish needs pack's digest", () => {
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(["verify"]), /--dir is required/);
  assert.equal(parseArgs(["pack", "--dir", "rc"]).command, "pack");
  assert.equal(parseArgs(["verify", "--dir", "rc"]).command, "verify");
  // Publishing flags belong to the publishing job only.
  assert.throws(() => parseArgs(["verify", "--dir", "rc", "--tag", "next"]), /unknown argument/);
  assert.throws(
    () => parseArgs(["pack", "--dir", "rc", "--expect-sums", SUMS]),
    /unknown argument/,
  );
  assert.throws(() => parseArgs(["publish", "--dir", "rc"]), /--expect-sums/);
  assert.deepEqual(
    parseArgs([
      "publish",
      "--dir",
      "rc",
      "--expect-sums",
      SUMS,
      "--tag",
      "next",
      "--git-tag",
      "--push-tags",
      "--dry-run",
    ]),
    {
      command: "publish",
      dir: "rc",
      tag: "next",
      expectSums: SUMS,
      gitTag: true,
      pushTags: true,
      dryRun: true,
    },
  );
  assert.throws(
    () => parseArgs(["publish", "--dir", "rc", "--expect-sums", SUMS, "--tag", "$(id)"]),
    /not a dist-tag/,
  );
});

test("isPublished: a version npm reports is published, a 404 is not, anything else throws", () => {
  assert.equal(isPublished({ status: 0, stdout: '"0.5.0"\n', stderr: "" }, "0.5.0"), true);
  assert.equal(isPublished({ status: 0, stdout: "", stderr: "" }, "0.5.0"), false);
  assert.equal(isPublished({ status: 0, stdout: '["0.5.0"]', stderr: "" }, "0.5.0"), true);
  assert.equal(
    isPublished({ status: 1, stdout: "", stderr: "npm error code E404\n404 Not Found" }, "0.5.1"),
    false,
  );
  assert.throws(
    () => isPublished({ status: 1, stdout: "", stderr: "npm error code ETIMEDOUT" }, "0.5.1"),
    /npm view failed/,
  );
});

test("assertChecksums / assertVerifiedCandidate: the publishing job refuses changed bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-candidate-"));
  try {
    const a = path.join(dir, "comvi-core-0.5.0.tgz");
    const b = path.join(dir, "comvi-react-0.5.0.tgz");
    fs.writeFileSync(a, "core");
    fs.writeFileSync(b, "react");
    const recorded = checksums([b, a]);
    assert.match(recorded.split("\n")[0], /^[0-9a-f]{64} {2}comvi-core-0\.5\.0\.tgz$/);
    fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${recorded}\n`);
    const sums = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(dir, "SHA256SUMS")))
      .digest("hex");
    assertChecksums(dir, recorded);
    assertVerifiedCandidate(dir, sums);
    assert.throws(
      () => assertVerifiedCandidate(dir, SUMS),
      /not the candidate that was packed and verified/,
    );
    fs.writeFileSync(b, "react, rebuilt");
    assert.throws(() => assertVerifiedCandidate(dir, sums), /changed after packing/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publishOrder: core first, then by name", () => {
  const order = publishOrder([
    { name: "@comvi/vue" },
    { name: "@comvi/core" },
    { name: "@comvi/cli" },
  ]).map((pkg) => pkg.name);
  assert.deepEqual(order, ["@comvi/core", "@comvi/cli", "@comvi/vue"]);
});

test("publishAll: a failure mid-loop is recorded and the rest still publish", () => {
  const attempted = [];
  const { published, failed } = publishAll(
    [{ name: "@comvi/vue" }, { name: "@comvi/core" }, { name: "@comvi/react" }],
    (pkg) => {
      attempted.push(pkg.name);
      if (pkg.name === "@comvi/react") throw new Error("E503");
    },
  );
  assert.deepEqual(attempted, ["@comvi/core", "@comvi/react", "@comvi/vue"]);
  assert.deepEqual(
    published.map((pkg) => pkg.name),
    ["@comvi/core", "@comvi/vue"],
  );
  assert.deepEqual(failed, [{ name: "@comvi/react", error: "E503" }]);
});

test("unexercised: candidate packages no example install resolved", () => {
  const reports = [
    { results: [{ resolved: ["@comvi/core", "@comvi/react"] }, { resolved: undefined }] },
    { results: [{ resolved: ["@comvi/nuxt"] }] },
  ];
  assert.deepEqual(
    unexercised(["@comvi/cli", "@comvi/core", "@comvi/nuxt", "@comvi/vite-plugin"], reports),
    ["@comvi/cli", "@comvi/vite-plugin"],
  );
});

/** A real tarball: `package/package.json` with `manifest`, packed as `file`. */
function tarball(dir, file, manifest) {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "publish-candidate-pkg-"));
  try {
    fs.mkdirSync(path.join(staging, "package"));
    fs.writeFileSync(path.join(staging, "package", "package.json"), JSON.stringify(manifest));
    execFileSync("tar", ["-czf", path.join(dir, file), "-C", staging, "package"]);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

const digest = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

/** A packed candidate: core only, with its SHA256SUMS and pending.json. */
function packedCandidate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-candidate-trust-"));
  tarball(dir, "comvi-core-0.5.0.tgz", { name: "@comvi/core", version: "0.5.0" });
  const recorded = checksums([path.join(dir, "comvi-core-0.5.0.tgz")]);
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${recorded}\n`);
  fs.writeFileSync(
    path.join(dir, "pending.json"),
    JSON.stringify([{ name: "@comvi/core", version: "0.5.0", file: "comvi-core-0.5.0.tgz" }]),
  );
  return { dir, recorded, sums: digest(path.join(dir, "SHA256SUMS")) };
}

test("publish trust path: a tarball not in SHA256SUMS is refused, even when pending.json lists it", () => {
  const { dir, sums } = packedCandidate();
  try {
    // What a process in the verify job could do before the upload: drop a
    // tarball in and announce it in pending.json. SHA256SUMS is untouched, so
    // its digest still matches pack's output.
    tarball(dir, "comvi-evil-1.0.0.tgz", { name: "@comvi/evil", version: "1.0.0" });
    fs.writeFileSync(
      path.join(dir, "pending.json"),
      JSON.stringify([
        { name: "@comvi/core", version: "0.5.0", file: "comvi-core-0.5.0.tgz" },
        { name: "@comvi/evil", version: "1.0.0", file: "comvi-evil-1.0.0.tgz" },
      ]),
    );
    assert.throws(
      () => assertVerifiedCandidate(dir, sums),
      /not in SHA256SUMS, refused: comvi-evil-1\.0\.0\.tgz/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publish trust path: pending.json never decides what is published", () => {
  const { dir, recorded, sums } = packedCandidate();
  try {
    fs.writeFileSync(
      path.join(dir, "pending.json"),
      JSON.stringify([{ name: "@comvi/evil", version: "1.0.0", file: "comvi-evil-1.0.0.tgz" }]),
    );
    assertVerifiedCandidate(dir, sums);
    assert.deepEqual(
      candidatesFromSums(dir, recorded).map(({ name, version, file }) => ({ name, version, file })),
      [{ name: "@comvi/core", version: "0.5.0", file: "comvi-core-0.5.0.tgz" }],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("publish trust path: name and version come from the tarball's own manifest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-candidate-manifest-"));
  try {
    // A file named like core that holds something else is refused, not
    // published under either claim.
    tarball(dir, "comvi-core-0.5.0.tgz", { name: "@comvi/react", version: "0.5.0" });
    const lying = checksums([path.join(dir, "comvi-core-0.5.0.tgz")]);
    assert.throws(() => candidatesFromSums(dir, lying), /holds @comvi\/react@0\.5\.0/);
    tarball(dir, "comvi-core-0.5.0.tgz", { name: "left-pad", version: "0.5.0" });
    assert.throws(
      () => candidatesFromSums(dir, checksums([path.join(dir, "comvi-core-0.5.0.tgz")])),
      /not an @comvi package/,
    );
    tarball(dir, "comvi-core-0.5.0.tgz", { name: "@comvi/core", version: "0.5.0" });
    const [entry] = candidatesFromSums(dir, checksums([path.join(dir, "comvi-core-0.5.0.tgz")]));
    assert.deepEqual(
      [entry.name, entry.version, entry.tarball],
      ["@comvi/core", "0.5.0", path.join(dir, "comvi-core-0.5.0.tgz")],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("assertChecksums: a listed file that is missing, or a malformed line, fails", () => {
  const { dir, recorded } = packedCandidate();
  try {
    assert.throws(
      () => assertChecksums(dir, `${recorded}\n${"c".repeat(64)}  comvi-vue-0.5.0.tgz`),
      /absent: comvi-vue-0\.5\.0\.tgz/,
    );
    assert.throws(() => assertChecksums(dir, "not a line"), /not a SHA256SUMS line/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// The release transaction, end to end: the CLI against a fake npm (a registry
// that is a directory) and a throwaway git repository with a bare `origin`.
// GIT_DIR/GIT_WORK_TREE pin every git call to that repository, so no test can
// tag or push the checkout it runs from.

const SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname), "publish-candidate.mjs");

const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const [command, target] = process.argv.slice(2);
const registry = process.env.FAKE_NPM_REGISTRY;
fs.appendFileSync(path.join(registry, "calls.log"), process.argv.slice(2).join(" ") + "\\n");
const key = (name, version) => name.replace(/^@/, "").replace("/", "-") + "-" + version;
if (command === "view") {
  const at = target.lastIndexOf("@");
  const [name, version] = [target.slice(0, at), target.slice(at + 1)];
  if (fs.existsSync(path.join(registry, key(name, version)))) {
    process.stdout.write(JSON.stringify(version) + "\\n");
    process.exit(0);
  }
  process.stderr.write("npm error code E404\\n404 Not Found\\n");
  process.exit(1);
}
if (command === "publish") {
  const id = path.basename(target, ".tgz");
  const failing = (process.env.FAKE_NPM_FAIL || "").split(",").filter(Boolean);
  if (failing.some((name) => id.startsWith(key(name, "")))) {
    process.stderr.write("npm error code E503\\n503 Service Unavailable\\n");
    process.exit(1);
  }
  fs.writeFileSync(path.join(registry, id), "");
  process.exit(0);
}
process.exit(2);
`;

const git = (repo, ...args) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8", env: gitEnv(repo) }).trim();

function gitEnv(repo) {
  return {
    ...process.env,
    GIT_DIR: path.join(repo, ".git"),
    GIT_WORK_TREE: repo,
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
  };
}

/**
 * A release workspace: a checkout (one commit, the release SHA) whose
 * `origin` is a bare repository, a fake npm, and a candidate of core + react.
 */
function releaseWorkspace(t, packages = ["core", "react"]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "publish-candidate-txn-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const registry = path.join(root, "registry");
  const origin = path.join(root, "origin.git");
  const repo = path.join(root, "checkout");
  const dir = path.join(root, "release-candidate");
  for (const d of [bin, registry, repo, dir]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(bin, "npm"), FAKE_NPM, { mode: 0o755 });

  execFileSync("git", ["init", "-q", "--bare", origin]);
  git(repo, "init", "-q");
  fs.mkdirSync(path.join(repo, ".changeset"));
  fs.writeFileSync(
    path.join(repo, ".changeset", "config.json"),
    JSON.stringify({ fixed: [packages.map((p) => `@comvi/${p}`)] }),
  );
  git(repo, "add", ".");
  git(repo, "commit", "-q", "-m", "release commit");
  git(repo, "remote", "add", "origin", origin);
  const head = git(repo, "rev-parse", "HEAD");

  for (const p of packages) {
    tarball(dir, `comvi-${p}-0.5.0.tgz`, { name: `@comvi/${p}`, version: "0.5.0" });
  }
  const recorded = checksums(packages.map((p) => path.join(dir, `comvi-${p}-0.5.0.tgz`)));
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${recorded}\n`);
  const sums = digest(path.join(dir, "SHA256SUMS"));

  const run = ({ fail = [] } = {}) => {
    const outputFile = path.join(root, `output-${Date.now()}-${Math.random()}`);
    const result = spawnSyncNode(
      [SCRIPT, "publish", "--dir", dir, "--expect-sums", sums, "--git-tag", "--push-tags"],
      {
        cwd: repo,
        env: {
          ...gitEnv(repo),
          PATH: `${bin}${path.delimiter}${process.env.PATH}`,
          GITHUB_OUTPUT: outputFile,
          FAKE_NPM_REGISTRY: registry,
          FAKE_NPM_FAIL: fail.join(","),
        },
      },
    );
    const outputs = Object.fromEntries(
      (fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : "")
        .split("\n")
        .filter(Boolean)
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    return { ...result, outputs, log: `${result.stdout}\n${result.stderr}` };
  };
  const remoteTags = () =>
    Object.fromEntries(
      git(repo, "ls-remote", "--tags", "origin")
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split("\t").reverse())
        .map(([ref, sha]) => [ref.replace("refs/tags/", ""), sha]),
    );
  const onNpm = (p) => fs.writeFileSync(path.join(registry, `comvi-${p}-0.5.0`), "");
  const npmCalls = () =>
    fs.existsSync(path.join(registry, "calls.log"))
      ? fs.readFileSync(path.join(registry, "calls.log"), "utf8")
      : "";
  return { root, repo, origin, head, run, remoteTags, onNpm, npmCalls };
}

function spawnSyncNode(args, options) {
  const result = spawnSync(process.execPath, args, { encoding: "utf8", ...options });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const FULL_SET = JSON.stringify([
  { name: "@comvi/core", version: "0.5.0" },
  { name: "@comvi/react", version: "0.5.0" },
]);

test("transaction: core publishes, react gets a 503 — exit 1, published=false, a status table, no v-tag", (t) => {
  const ws = releaseWorkspace(t);
  const result = ws.run({ fail: ["@comvi/react"] });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(result.log, /@comvi\/core@0\.5\.0\s+on npm/);
  assert.match(result.log, /@comvi\/react@0\.5\.0\s+MISSING/);
  // What npm has is tagged (a re-run must not lose it); the release tag waits.
  assert.deepEqual(ws.remoteTags(), { "@comvi/core@0.5.0": ws.head });
});

test("transaction: the re-run after a partial publish completes the set and tags everything at the release SHA", (t) => {
  const ws = releaseWorkspace(t);
  ws.run({ fail: ["@comvi/react"] });
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(result.outputs.publishedPackages, FULL_SET);
  assert.deepEqual(ws.remoteTags(), {
    "@comvi/core@0.5.0": ws.head,
    "@comvi/react@0.5.0": ws.head,
    "v0.5.0": ws.head,
  });
  // Core was already on npm: it is not published twice.
  assert.equal(ws.npmCalls().match(/^publish .*comvi-core/gm).length, 1);
});

test("transaction: everything already on npm but no tag pushed — the re-run reconciles tags and emits the full set", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core");
  ws.onNpm("react");
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(result.outputs.publishedPackages, FULL_SET);
  assert.doesNotMatch(ws.npmCalls(), /^publish /m);
  assert.deepEqual(ws.remoteTags(), {
    "@comvi/core@0.5.0": ws.head,
    "@comvi/react@0.5.0": ws.head,
    "v0.5.0": ws.head,
  });
});

test("transaction: a release tag that already exists at another commit is refused, naming both SHAs", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core");
  ws.onNpm("react");
  // Someone (or `gh release create` without --verify-tag) put v0.5.0 on a newer main.
  fs.writeFileSync(path.join(ws.repo, "later.txt"), "D");
  git(ws.repo, "add", "later.txt");
  git(ws.repo, "commit", "-q", "-m", "D");
  const other = git(ws.repo, "rev-parse", "HEAD");
  git(ws.repo, "push", "-q", "origin", `${other}:refs/tags/v0.5.0`);
  git(ws.repo, "reset", "-q", "--hard", ws.head);

  const result = ws.run();
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(result.log, new RegExp(`v0\\.5\\.0[\\s\\S]*${other}[\\s\\S]*${ws.head}`));
  assert.equal(ws.remoteTags()["v0.5.0"], other);
});
