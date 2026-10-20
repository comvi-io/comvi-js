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
  compareVersions,
  coverageGaps,
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

test("coverageGaps: an uncovered package outside the allowlist fails, a stale entry fails", () => {
  const reports = [{ results: [{ resolved: ["@comvi/core", "@comvi/react"] }] }];
  const allowlist = { "@comvi/cli": "a CLI" };
  assert.deepEqual(
    coverageGaps(["@comvi/cli", "@comvi/core", "@comvi/react"], reports, allowlist),
    {
      uncovered: [],
      stale: [],
    },
  );
  // A binding that dropped out of every example is not silently published.
  assert.deepEqual(coverageGaps(["@comvi/cli", "@comvi/core", "@comvi/vue"], reports, allowlist), {
    uncovered: ["@comvi/vue"],
    stale: [],
  });
  // An entry for a package an example now installs, or for no candidate, is stale.
  assert.deepEqual(
    coverageGaps(["@comvi/core"], reports, { "@comvi/core": "x", "@comvi/gone": "y" }),
    { uncovered: [], stale: ["@comvi/core", "@comvi/gone"] },
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
const sri = (file) =>
  `sha512-${crypto.createHash("sha512").update(fs.readFileSync(file)).digest("base64")}`;

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

// The registry is `state.json`:
// { [name]: { versions: [...], tags: { [tag]: version }, integrity: { [version]: sri } } }.
// FAKE_NPM_FAIL makes `npm publish` of those names 503; FAKE_NPM_FAIL_PROMOTE
// does the same to `npm dist-tag add`. Like npm, a version is published once:
// publishing it again is refused (E403), and its integrity is the sha512 of
// the bytes that were published.
const FAKE_NPM = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const argv = process.argv.slice(2);
const registry = process.env.FAKE_NPM_REGISTRY;
fs.appendFileSync(path.join(registry, "calls.log"), argv.join(" ") + "\\n");
const stateFile = path.join(registry, "state.json");
const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
const save = () => fs.writeFileSync(stateFile, JSON.stringify(state));
const listed = (env) => (process.env[env] || "").split(",").filter(Boolean);
const split = (spec) => [spec.slice(0, spec.lastIndexOf("@")), spec.slice(spec.lastIndexOf("@") + 1)];
const e404 = () => {
  process.stderr.write("npm error code E404\\n404 Not Found\\n");
  process.exit(1);
};
const e503 = () => {
  process.stderr.write("npm error code E503\\n503 Service Unavailable\\n");
  process.exit(1);
};
const [command, ...rest] = argv;
if (command === "view" && rest[1] === "dist.integrity") {
  const [name, version] = split(rest[0]);
  // A transient registry failure: FAKE_NPM_FAIL_INTEGRITY always, integrityFail N times.
  if (listed("FAKE_NPM_FAIL_INTEGRITY").includes(name)) e503();
  if (state[name]?.integrityFail) {
    state[name].integrityFail -= 1;
    save();
    e503();
  }
  if (!state[name]?.versions.includes(version)) e404();
  // A stale replica: the version is there, its integrity not yet.
  if (state[name].integrityLag) {
    state[name].integrityLag -= 1;
    save();
    process.exit(0);
  }
  const sri = state[name].integrity?.[version];
  if (sri) process.stdout.write(JSON.stringify(sri) + "\\n");
} else if (command === "view" && rest[1] === "version") {
  const [name, version] = split(rest[0]);
  // Accepted, but not shown before visibleAt (FAKE_NPM_LATE: minutes on npm).
  if (state[name]?.visibleAt?.[version] > Date.now()) e404();
  if (state[name]?.lag) {
    state[name].lag -= 1;
    save();
    e404();
  }
  if (!state[name]?.versions.includes(version)) e404();
  process.stdout.write(JSON.stringify(version) + "\\n");
} else if (command === "view" && rest[1] === "dist-tags") {
  if (!state[rest[0]]) e404();
  process.stdout.write(JSON.stringify(state[rest[0]].tags) + "\\n");
} else if (command === "publish") {
  const manifest = JSON.parse(execFileSync("tar", ["-xOzf", rest[0], "package/package.json"], { encoding: "utf8" }));
  if (listed("FAKE_NPM_FAIL").includes(manifest.name)) e503();
  if (rest.includes("--dry-run")) process.exit(0);
  const tagAt = rest.indexOf("--tag");
  const tag = tagAt === -1 ? "latest" : rest[tagAt + 1];
  const pkg = (state[manifest.name] ??= { versions: [], tags: {} });
  if (pkg.versions.includes(manifest.version)) {
    process.stderr.write("npm error code E403\\n403 Forbidden - You cannot publish over the previously published versions: " + manifest.version + ".\\n");
    process.exit(1);
  }
  pkg.versions.push(manifest.version);
  pkg.integrity = { ...pkg.integrity, [manifest.version]: "sha512-" + require("node:crypto").createHash("sha512").update(fs.readFileSync(rest[0])).digest("base64") };
  // Read-after-write lag: the next lookup of this version still 404s.
  if (listed("FAKE_NPM_LAG").includes(manifest.name)) pkg.lag = 1;
  if (listed("FAKE_NPM_LATE").includes(manifest.name)) {
    pkg.visibleAt = { ...pkg.visibleAt, [manifest.version]: Date.now() + Number(process.env.FAKE_NPM_LATE_MS) };
  }
  pkg.tags[tag] = manifest.version;
  save();
} else if (command === "dist-tag" && rest[0] === "add") {
  const [name, version] = split(rest[1]);
  if (listed("FAKE_NPM_FAIL_PROMOTE").includes(name)) e503();
  if (!state[name]?.versions.includes(version)) e404();
  state[name].tags[rest[2]] = version;
  save();
  process.stdout.write("+" + rest[2] + ": " + rest[1] + "\\n");
} else if (command === "dist-tag" && rest[0] === "rm") {
  if (!state[rest[1]]?.tags[rest[2]]) e404();
  delete state[rest[1]].tags[rest[2]];
  save();
} else {
  process.exit(2);
}
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
  // Every package already has an older release on `latest`.
  fs.writeFileSync(
    path.join(registry, "state.json"),
    JSON.stringify(
      Object.fromEntries(
        packages.map((p) => [`@comvi/${p}`, { versions: ["0.4.1"], tags: { latest: "0.4.1" } }]),
      ),
    ),
  );

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
  let sums = digest(path.join(dir, "SHA256SUMS"));

  const staging = `release-${sums.slice(0, 12)}`;
  // `attempt` is GITHUB_RUN_ATTEMPT; unset (the default) is a run outside CI.
  // `tagging: false` and `tag: "next"` are the RC job's flags (no git tags).
  const run = ({
    fail = [],
    failPromote = [],
    lag = [],
    late = [],
    lateMs = 0,
    visibleWaitMs = 5000,
    failIntegrity = [],
    dryRun = false,
    attempt,
    tagging = true,
    tag = "latest",
  } = {}) => {
    const outputFile = path.join(root, `output-${Date.now()}-${Math.random()}`);
    const env = {
      ...gitEnv(repo),
      PATH: `${bin}${path.delimiter}${process.env.PATH}`,
      GITHUB_OUTPUT: outputFile,
      FAKE_NPM_REGISTRY: registry,
      FAKE_NPM_FAIL: fail.join(","),
      FAKE_NPM_FAIL_PROMOTE: failPromote.join(","),
      FAKE_NPM_LAG: lag.join(","),
      FAKE_NPM_LATE: late.join(","),
      FAKE_NPM_LATE_MS: String(lateMs),
      FAKE_NPM_FAIL_INTEGRITY: failIntegrity.join(","),
      COMVI_PUBLISH_RECHECK_MS: "10",
      COMVI_PUBLISH_VISIBLE_POLL_MS: "20",
      COMVI_PUBLISH_VISIBLE_WAIT_MS: String(visibleWaitMs),
    };
    delete env.GITHUB_RUN_ATTEMPT;
    if (attempt !== undefined) env.GITHUB_RUN_ATTEMPT = String(attempt);
    const result = spawnSyncNode(
      [
        SCRIPT,
        "publish",
        "--dir",
        dir,
        "--expect-sums",
        sums,
        "--tag",
        tag,
        ...(tagging ? ["--git-tag", "--push-tags"] : []),
        ...(dryRun ? ["--dry-run"] : []),
      ],
      { cwd: repo, env },
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
  const state = () => JSON.parse(fs.readFileSync(path.join(registry, "state.json"), "utf8"));
  const distTags = (p) => state()[`@comvi/${p}`].tags;
  /** The SRI integrity of the local candidate's tarball of `p`. */
  const integrity = (p) => sri(path.join(dir, `comvi-${p}-0.5.0.tgz`));
  /**
   * Put `p@0.5.0` on the fake registry with exactly `tags` added, holding the
   * bytes whose integrity is `bytes` (by default the local candidate's).
   */
  const onNpm = (p, tags = { latest: "0.5.0" }, bytes = integrity(p)) => {
    const next = state();
    next[`@comvi/${p}`].versions.push("0.5.0");
    next[`@comvi/${p}`].integrity = { "0.5.0": bytes };
    Object.assign(next[`@comvi/${p}`].tags, tags);
    fs.writeFileSync(path.join(registry, "state.json"), JSON.stringify(next));
  };
  const npmCalls = () =>
    fs.existsSync(path.join(registry, "calls.log"))
      ? fs.readFileSync(path.join(registry, "calls.log"), "utf8")
      : "";
  /** Edit one package's registry entry in place. */
  const patch = (p, edit) => {
    const next = state();
    edit(next[`@comvi/${p}`]);
    fs.writeFileSync(path.join(registry, "state.json"), JSON.stringify(next));
  };
  /**
   * Pack the candidate again with different bytes at the same versions (what
   * a fresh dispatch does at another commit, or with a non-reproducible
   * build); later `run`s publish it. Returns its staging tag.
   */
  const repack = (marker) => {
    for (const p of packages) {
      tarball(dir, `comvi-${p}-0.5.0.tgz`, { name: `@comvi/${p}`, version: "0.5.0", marker });
    }
    const next = checksums(packages.map((p) => path.join(dir, `comvi-${p}-0.5.0.tgz`)));
    fs.writeFileSync(path.join(dir, "SHA256SUMS"), `${next}\n`);
    sums = digest(path.join(dir, "SHA256SUMS"));
    return `release-${sums.slice(0, 12)}`;
  };
  return {
    root,
    repo,
    origin,
    head,
    staging,
    run,
    remoteTags,
    onNpm,
    distTags,
    patch,
    npmCalls,
    repack,
    integrity,
  };
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
  const result = ws.run({ attempt: 2 });
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

test("transaction: a fresh run (attempt 1) refuses versions on npm that have no tag, and publishes and promotes nothing", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core", {});
  const before = ws.npmCalls().length;
  const result = ws.run({ attempt: 1 });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(
    result.log,
    /@comvi\/core@0\.5\.0 is on npm but has no tag: it was published by another run\. Re-run that run \('Re-run failed jobs'\), or dispatch a new version\./,
  );
  const calls = ws.npmCalls().slice(before);
  assert.doesNotMatch(calls, /^publish /m);
  assert.doesNotMatch(calls, /^dist-tag /m);
  assert.deepEqual(ws.remoteTags(), {});
});

test("transaction: the same untagged state outside CI (no GITHUB_RUN_ATTEMPT) reconciles", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core");
  ws.onNpm("react");
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(ws.remoteTags()["v0.5.0"], ws.head);
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

// ---------------------------------------------------------------------------
// Staged promotion: every candidate is published under a staging dist-tag
// derived from the candidate, and `--tag` (latest for GA) moves only once
// npm has the whole set.

test("promotion: a partial train leaves `latest` where it was", (t) => {
  const ws = releaseWorkspace(t);
  const result = ws.run({ fail: ["@comvi/react"] });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(ws.distTags("core").latest, "0.4.1");
  assert.equal(ws.distTags("core")[ws.staging], "0.5.0");
  assert.equal(ws.distTags("react").latest, "0.4.1");
  assert.match(result.log, /@comvi\/core@0\.5\.0\s+on npm\s+NOT on latest/);
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag add/m);
});

test("promotion: a complete train moves `latest` for every package and drops the staging tag", (t) => {
  const ws = releaseWorkspace(t);
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(result.outputs.publishedPackages, FULL_SET);
  for (const p of ["core", "react"]) {
    assert.deepEqual(ws.distTags(p), { latest: "0.5.0" });
  }
  assert.match(
    ws.npmCalls(),
    new RegExp(`^publish .*comvi-core-0\\.5\\.0\\.tgz .*--tag ${ws.staging}$`, "m"),
  );
  assert.match(result.log, /@comvi\/react@0\.5\.0\s+on npm\s+on latest/);
});

test("promotion: a re-run after a crash between publish and promotion promotes the rest", (t) => {
  const ws = releaseWorkspace(t);
  // The previous run published everything under the staging tag and promoted core only.
  ws.onNpm("core", { latest: "0.5.0", [ws.staging]: "0.5.0" });
  ws.onNpm("react", { [ws.staging]: "0.5.0" });
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.doesNotMatch(ws.npmCalls(), /^publish /m);
  // Core is already on latest: not moved again.
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag add @comvi\/core/m);
  assert.deepEqual(ws.distTags("core"), { latest: "0.5.0" });
  assert.deepEqual(ws.distTags("react"), { latest: "0.5.0" });
  assert.equal(ws.remoteTags()["v0.5.0"], ws.head);
});

test("promotion: one package failing to move `latest` fails the release and says which moved", (t) => {
  const ws = releaseWorkspace(t);
  const result = ws.run({ failPromote: ["@comvi/react"] });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(result.log, /@comvi\/core@0\.5\.0\s+on npm\s+on latest/);
  assert.match(result.log, /@comvi\/react@0\.5\.0\s+on npm\s+NOT on latest/);
  assert.equal(ws.distTags("react").latest, "0.4.1");
  // The staging tag stays until the train is promoted; the release tag waits.
  assert.equal(ws.distTags("react")[ws.staging], "0.5.0");
  assert.equal(ws.remoteTags()["v0.5.0"], undefined);

  const retry = ws.run();
  assert.equal(retry.status, 0, retry.log);
  assert.equal(retry.outputs.published, "true");
  assert.deepEqual(ws.distTags("react"), { latest: "0.5.0" });
});

// ---------------------------------------------------------------------------
// Guards against mixing trains and moving tags backwards.

test("mixed train: a run at a newer commit after a partial publish at another one publishes and promotes nothing", (t) => {
  const ws = releaseWorkspace(t);
  ws.run({ fail: ["@comvi/react"] });
  // main moved on; a fresh workflow run packs and publishes from commit B.
  fs.writeFileSync(path.join(ws.repo, "later.txt"), "B");
  git(ws.repo, "add", "later.txt");
  git(ws.repo, "commit", "-q", "-m", "B");
  const b = git(ws.repo, "rev-parse", "HEAD");
  const before = ws.npmCalls().length;

  const result = ws.run();
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(
    result.log,
    new RegExp(`@comvi/core@0\\.5\\.0 points at ${ws.head}, not at the release commit ${b}`),
  );
  const calls = ws.npmCalls().slice(before);
  assert.doesNotMatch(calls, /^publish /m);
  assert.doesNotMatch(calls, /^dist-tag /m);
  assert.equal(ws.distTags("core").latest, "0.4.1");
});

test("mixed candidate (RC): a fresh dispatch of the same rc number from a later commit publishes and promotes nothing", (t) => {
  const ws = releaseWorkspace(t);
  // RC N at commit A: core is published under A's staging tag, react 503s.
  const partial = ws.run({ fail: ["@comvi/react"], tagging: false, tag: "next", attempt: 1 });
  assert.equal(partial.status, 1, partial.log);
  assert.equal(ws.distTags("core")[ws.staging], "0.5.0");

  // main moves on; RC N is dispatched again and packs candidate B, same versions.
  fs.writeFileSync(path.join(ws.repo, "later.txt"), "B");
  git(ws.repo, "add", "later.txt");
  git(ws.repo, "commit", "-q", "-m", "B");
  const stagingB = ws.repack("commit B");
  assert.notEqual(stagingB, ws.staging);
  const before = ws.npmCalls().length;

  const result = ws.run({ tagging: false, tag: "next", attempt: 1 });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(
    result.log,
    new RegExp(
      `@comvi/core@0\\.5\\.0 is on npm from another candidate: expected dist-tag ${stagingB}, ` +
        `found ${ws.staging}`,
    ),
  );
  assert.match(result.log, /'Re-run failed jobs'/);
  const calls = ws.npmCalls().slice(before);
  assert.doesNotMatch(calls, /^publish /m);
  assert.doesNotMatch(calls, /^dist-tag /m);
  assert.equal(ws.distTags("core").next, undefined);
  assert.equal(ws.distTags("react").next, undefined);
  assert.deepEqual(ws.remoteTags(), {});
});

test("mixed candidate (GA): a fresh run at the SAME commit with other bytes publishes and promotes nothing", (t) => {
  const ws = releaseWorkspace(t);
  ws.run({ fail: ["@comvi/react"], attempt: 1 });
  // core@0.5.0 is tagged at this commit, so the commit check passes; only the
  // candidate's bytes (its staging tag) tell the two candidates apart.
  assert.deepEqual(ws.remoteTags(), { "@comvi/core@0.5.0": ws.head });
  const stagingB = ws.repack("rebuilt");
  const before = ws.npmCalls().length;

  const result = ws.run({ attempt: 1 });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.match(
    result.log,
    new RegExp(
      `@comvi/core@0\\.5\\.0 is on npm from another candidate: expected dist-tag ${stagingB}`,
    ),
  );
  const calls = ws.npmCalls().slice(before);
  assert.doesNotMatch(calls, /^publish /m);
  assert.doesNotMatch(calls, /^dist-tag /m);
  assert.equal(ws.distTags("core").latest, "0.4.1");
  assert.equal(ws.remoteTags()["@comvi/react@0.5.0"], undefined);
});

test("mixed candidate: a version on npm with no staging tag and other bytes is refused while others are pending", (t) => {
  const ws = releaseWorkspace(t);
  const foreign = `sha512-${"B".repeat(86)}==`;
  ws.onNpm("core", {}, foreign);
  const result = ws.run({ tagging: false, tag: "next" });
  assert.equal(result.status, 1, result.log);
  assert.match(
    result.log,
    new RegExp(
      `@comvi/core@0\\.5\\.0 is on npm from another candidate: expected dist-tag ${ws.staging}, found none; ` +
        `expected integrity ${ws.integrity("core").replace(/[+/]/g, "\\$&")}, found ${foreign}`,
    ),
  );
  assert.doesNotMatch(ws.npmCalls(), /^publish /m);
});

test("mixed candidate: a version on npm with no staging tag but THIS candidate's bytes is not foreign", (t) => {
  // A retry after the staging tag was cleaned up whose first read of another
  // version was a stale 404: identical bytes are this candidate's.
  const ws = releaseWorkspace(t);
  ws.onNpm("core", {});
  const result = ws.run({ tagging: false, tag: "next" });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.deepEqual(ws.distTags("react"), { latest: "0.4.1", next: "0.5.0" });
});

test("mixed candidate: an RC re-run of the same candidate finishes the train", (t) => {
  const ws = releaseWorkspace(t);
  ws.run({ fail: ["@comvi/react"], tagging: false, tag: "next", attempt: 1 });
  const result = ws.run({ tagging: false, tag: "next", attempt: 2 });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.deepEqual(ws.distTags("core"), { latest: "0.4.1", next: "0.5.0" });
  assert.deepEqual(ws.distTags("react"), { latest: "0.4.1", next: "0.5.0" });
});

test("compareVersions: semver precedence, prereleases included", () => {
  assert.equal(compareVersions("0.5.1", "0.5.0") > 0, true);
  assert.equal(compareVersions("0.5.0", "0.5.0"), 0);
  assert.equal(compareVersions("0.10.0", "0.9.9") > 0, true);
  assert.equal(compareVersions("0.5.0", "0.5.0-rc.9") > 0, true);
  assert.equal(compareVersions("0.5.0-rc.10", "0.5.0-rc.9") > 0, true);
  assert.equal(compareVersions("0.5.0-rc.1", "0.5.0-rc.2") < 0, true);
  assert.equal(compareVersions("0.5.0-rc.1", "0.5.0-rc.1.1") < 0, true);
  assert.equal(compareVersions("0.5.0-alpha", "0.5.0-1") > 0, true);
});

test("backwards promotion: `latest` already on a newer version is refused, both versions named, nothing moved", (t) => {
  const ws = releaseWorkspace(t);
  // 0.5.1 shipped since; this is a stale re-run of the 0.5.0 publish job.
  ws.patch("core", (pkg) => {
    pkg.versions.push("0.5.1");
    pkg.tags.latest = "0.5.1";
  });
  const result = ws.run();
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.match(result.log, /@comvi\/core: latest is 0\.5\.1, newer than the candidate's 0\.5\.0/);
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag add/m);
  assert.equal(ws.distTags("core").latest, "0.5.1");
  assert.equal(ws.distTags("react").latest, "0.4.1");
  assert.equal(ws.remoteTags()["v0.5.0"], undefined);
});

test("read-after-write: a version this run published that npm does not show yet is asked again", (t) => {
  const ws = releaseWorkspace(t);
  const result = ws.run({ lag: ["@comvi/react"] });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(ws.npmCalls().match(/^view @comvi\/react@0\.5\.0 version/gm).length, 3);
});

test("read-after-write: a version npm accepted is waited for past the ~30 s of backoff (0.6.0: react showed after ~4 min)", (t) => {
  const ws = releaseWorkspace(t);
  // Backoff alone (COMVI_PUBLISH_RECHECK_MS 10 ms: 10 + 20 + 40 + 80 ms) gives
  // up long before react shows; the visibility wait does not.
  const result = ws.run({ late: ["@comvi/react"], lateMs: 1500, visibleWaitMs: 20_000 });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(result.outputs.publishedPackages, FULL_SET);
  assert.equal(ws.distTags("react").latest, "0.5.0");
  assert.doesNotMatch(result.log, /MISSING/);
  // Every wait is logged, not only the first.
  assert.ok(result.log.match(/waiting for npm to show @comvi\/react@0\.5\.0/g).length > 1);
  assert.ok(ws.npmCalls().match(/^view @comvi\/react@0\.5\.0 version/gm).length > 6);
});

test("read-after-write: a version npm accepted but never shows within the wait is MISSING, and nothing is promoted", (t) => {
  const ws = releaseWorkspace(t);
  const started = Date.now();
  const result = ws.run({ late: ["@comvi/react"], lateMs: 600_000, visibleWaitMs: 400 });
  assert.ok(Date.now() - started < 30_000, "the wait stops at COMVI_PUBLISH_VISIBLE_WAIT_MS");
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.match(result.log, /@comvi\/react@0\.5\.0\s+MISSING/);
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag add/m);
  assert.equal(ws.distTags("core").latest, "0.4.1");
  assert.equal(ws.remoteTags()["v0.5.0"], undefined);
});

test("first-ever version: a package with no dist-tags on npm gets a warning, and the run goes on", (t) => {
  const ws = releaseWorkspace(t);
  ws.patch("react", (pkg) => {
    pkg.versions = [];
    pkg.tags = {};
  });
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.match(
    result.stderr,
    /warning: @comvi\/react has no dist-tags on npm, so npm will put its first-ever version on `latest`/,
  );
  assert.doesNotMatch(result.stderr, /warning: @comvi\/core/);
});

// ---------------------------------------------------------------------------
// Byte identity: whatever this run did (published, skipped, failed because
// the version exists, or found everything present), npm's `dist.integrity`
// of every candidate must be the sha512 of the candidate's own tarball
// before anything is promoted or git-tagged.

const MODES = [
  { mode: "GA", flags: { tagging: true, tag: "latest" } },
  { mode: "RC", flags: { tagging: false, tag: "next" } },
];

/** The refusal when no integrity differs but some cannot be seen, pinned. */
function assertBytesUnseen(result, staging, lines) {
  assert.ok(
    result.stderr.includes(
      `could not verify this candidate's bytes on npm (${staging}):\n` +
        `${lines.join("\n")}\n` +
        "npm does not show the integrity yet. Re-run this job; nothing was promoted or tagged.",
    ),
    result.log,
  );
  assert.doesNotMatch(result.stderr, /can never be replaced/);
}

/** The refusal, pinned: package, expected and found integrity, recovery. */
function assertBytesRefusal(result, staging, lines) {
  assert.ok(
    result.stderr.includes(
      `refusing to promote or tag anything: npm does not hold this candidate's bytes (${staging}).\n` +
        `${lines.join("\n")}\n` +
        "A version on npm can never be replaced. If one other run published all of these, finish " +
        "its train with 'Re-run failed jobs' on that run; if they mix candidates, no run can " +
        "finish them: dispatch a new version.",
    ),
    result.log,
  );
}

for (const { mode, flags } of MODES) {
  test(`byte identity (${mode}, Codex sequence 1): a stale 404, a publish refused because the version exists, another candidate's core — nothing promoted or tagged`, (t) => {
    const ws = releaseWorkspace(t);
    // Candidate A: core published, react 503s.
    const partial = ws.run({ ...flags, fail: ["@comvi/react"], attempt: 1 });
    assert.equal(partial.status, 1, partial.log);
    const coreA = ws.integrity("core");
    const remoteBefore = ws.remoteTags();
    const localBefore = git(ws.repo, "tag", "-l");

    // Candidate B, same versions, same commit (GA) or another ref (RC).
    const stagingB = ws.repack("candidate B");
    const coreB = ws.integrity("core");
    assert.notEqual(coreA, coreB);
    // B's first read of core is a stale 404, so core counts as pending.
    ws.patch("core", (pkg) => {
      pkg.lag = 1;
    });
    const before = ws.npmCalls().length;

    const result = ws.run({ ...flags, attempt: 1 });
    assert.equal(result.status, 1, result.log);
    assert.equal(result.outputs.published, "false");
    assert.equal(result.outputs.publishedPackages, "[]");
    const calls = ws.npmCalls().slice(before);
    // Core's publish was attempted and refused; react's went through.
    assert.match(calls, /^publish .*comvi-core-0\.5\.0\.tgz/m);
    assert.match(result.log, /You cannot publish over the previously published versions/);
    assert.doesNotMatch(calls, /^dist-tag add/m);
    assert.equal(ws.distTags("core")[flags.tag], flags.tag === "latest" ? "0.4.1" : undefined);
    assert.equal(ws.distTags("react")[flags.tag], flags.tag === "latest" ? "0.4.1" : undefined);
    // No git tag for B's react and no release tag, on origin or locally.
    assert.deepEqual(ws.remoteTags(), remoteBefore);
    assert.equal(git(ws.repo, "tag", "-l"), localBefore);
    assertBytesRefusal(result, stagingB, [
      `  @comvi/core@0.5.0: expected ${coreB}, found ${coreA}`,
    ]);
  });

  test(`byte identity (${mode}, Codex sequence 2): every version present with another candidate's bytes — nothing promoted or tagged`, (t) => {
    const ws = releaseWorkspace(t);
    // Candidate A published the whole set and crashed before promotion.
    const a = ws.run({ ...flags, failPromote: ["@comvi/core", "@comvi/react"], attempt: 1 });
    assert.equal(a.status, 1, a.log);
    const [coreA, reactA] = [ws.integrity("core"), ws.integrity("react")];
    const remoteBefore = ws.remoteTags();

    const stagingB = ws.repack("candidate B");
    const before = ws.npmCalls().length;
    const result = ws.run({ ...flags, attempt: 1 });
    assert.equal(result.status, 1, result.log);
    assert.equal(result.outputs.published, "false");
    assert.equal(result.outputs.publishedPackages, "[]");
    const calls = ws.npmCalls().slice(before);
    assert.doesNotMatch(calls, /^publish /m);
    assert.doesNotMatch(calls, /^dist-tag /m);
    assert.deepEqual(ws.remoteTags(), remoteBefore);
    assertBytesRefusal(result, stagingB, [
      `  @comvi/core@0.5.0: expected ${ws.integrity("core")}, found ${coreA}`,
      `  @comvi/react@0.5.0: expected ${ws.integrity("react")}, found ${reactA}`,
    ]);
  });
}

test("byte identity: the same candidate after a stale 404 and a publish refused as existing completes", (t) => {
  const ws = releaseWorkspace(t);
  ws.run({ fail: ["@comvi/react"], attempt: 1 });
  ws.patch("core", (pkg) => {
    pkg.lag = 1;
  });
  const result = ws.run({ attempt: 2 });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(result.outputs.publishedPackages, FULL_SET);
  assert.equal(ws.remoteTags()["v0.5.0"], ws.head);
});

test("byte identity: a GA retry after full promotion and staging cleanup re-emits the set", (t) => {
  const ws = releaseWorkspace(t);
  assert.equal(ws.run({ attempt: 1 }).status, 0);
  assert.deepEqual(ws.distTags("core"), { latest: "0.5.0" });
  const before = ws.npmCalls().length;
  const retry = ws.run({ attempt: 2 });
  assert.equal(retry.status, 0, retry.log);
  assert.equal(retry.outputs.published, "true");
  assert.equal(retry.outputs.publishedPackages, FULL_SET);
  const calls = ws.npmCalls().slice(before);
  assert.doesNotMatch(calls, /^publish /m);
  assert.doesNotMatch(calls, /^dist-tag /m);
  assert.match(calls, /^view @comvi\/core@0\.5\.0 dist\.integrity/m);
});

test("byte identity: a re-run after a crash between promotion and staging cleanup completes and cleans up", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core", { latest: "0.5.0", [ws.staging]: "0.5.0" });
  ws.onNpm("react", { latest: "0.5.0", [ws.staging]: "0.5.0" });
  const result = ws.run({ attempt: 2 });
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.deepEqual(ws.distTags("core"), { latest: "0.5.0" });
  assert.deepEqual(ws.distTags("react"), { latest: "0.5.0" });
});

test("byte identity: a stale integrity read (missing, then right) is asked again and passes", (t) => {
  const ws = releaseWorkspace(t);
  ws.patch("react", (pkg) => {
    pkg.integrityLag = 1;
  });
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(ws.npmCalls().match(/^view @comvi\/react@0\.5\.0 dist\.integrity/gm).length, 2);
});

test("byte identity: an integrity npm never shows is refused as missing", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core", { [ws.staging]: "0.5.0" }, null);
  ws.onNpm("react", { [ws.staging]: "0.5.0" });
  const result = ws.run({ attempt: 2 });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag add/m);
  assertBytesUnseen(result, ws.staging, [
    `  @comvi/core@0.5.0: expected ${ws.integrity("core")}, found none`,
  ]);
});

test("byte identity: a mismatch next to an unseen integrity keeps the mismatch message", (t) => {
  const ws = releaseWorkspace(t);
  const foreign = `sha512-${"B".repeat(86)}==`;
  ws.onNpm("core", { [ws.staging]: "0.5.0" }, null);
  ws.onNpm("react", { [ws.staging]: "0.5.0" }, foreign);
  const result = ws.run({ attempt: 2 });
  assert.equal(result.status, 1, result.log);
  assertBytesRefusal(result, ws.staging, [
    `  @comvi/core@0.5.0: expected ${ws.integrity("core")}, found none`,
    `  @comvi/react@0.5.0: expected ${ws.integrity("react")}, found ${foreign}`,
  ]);
});

test("byte identity: a registry error on the integrity read is asked again, and one 503 passes", (t) => {
  const ws = releaseWorkspace(t);
  ws.patch("react", (pkg) => {
    pkg.integrityFail = 1;
  });
  const result = ws.run();
  assert.equal(result.status, 0, result.log);
  assert.equal(result.outputs.published, "true");
  assert.equal(ws.npmCalls().match(/^view @comvi\/react@0\.5\.0 dist\.integrity/gm).length, 2);
});

test("byte identity: an integrity read that always fails refuses, naming the error's last line", (t) => {
  const ws = releaseWorkspace(t);
  const result = ws.run({ failIntegrity: ["@comvi/react"] });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.equal(result.outputs.publishedPackages, "[]");
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag add/m);
  assert.equal(ws.npmCalls().match(/^view @comvi\/react@0\.5\.0 dist\.integrity/gm).length, 5);
  assertBytesUnseen(result, ws.staging, [
    `  @comvi/react@0.5.0: expected ${ws.integrity("react")}, found none (503 Service Unavailable)`,
  ]);
});

test("early check: a failed npm read says to re-run, not that another candidate owns the version", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core", {});
  const result = ws.run({ tagging: false, tag: "next", failIntegrity: ["@comvi/core"] });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assert.ok(
    result.stderr.includes(
      "nothing was published or promoted: could not read npm, re-run this job.\n" +
        "503 Service Unavailable",
    ),
    result.log,
  );
  assert.doesNotMatch(result.log, /another candidate/);
  assert.doesNotMatch(ws.npmCalls(), /^publish /m);
});

test("dry run: one version skipped, one pending — the dry publish is not compared and the run passes", (t) => {
  const ws = releaseWorkspace(t);
  ws.onNpm("core", { [ws.staging]: "0.5.0" });
  const result = ws.run({ dryRun: true });
  assert.equal(result.status, 0, result.log);
  assert.match(ws.npmCalls(), /^publish .*comvi-react-0\.5\.0\.tgz .*--dry-run$/m);
  assert.match(ws.npmCalls(), /^view @comvi\/core@0\.5\.0 dist\.integrity/m);
  assert.doesNotMatch(ws.npmCalls(), /^view @comvi\/react@0\.5\.0 dist\.integrity/m);
  assert.doesNotMatch(ws.npmCalls(), /^dist-tag /m);
  assert.deepEqual(ws.remoteTags(), {});
});

test("dry run: foreign bytes already on npm are refused, and only that version is named", (t) => {
  const ws = releaseWorkspace(t);
  const foreign = `sha512-${"B".repeat(86)}==`;
  ws.onNpm("core", { [ws.staging]: "0.5.0" }, foreign);
  const result = ws.run({ dryRun: true });
  assert.equal(result.status, 1, result.log);
  assert.equal(result.outputs.published, "false");
  assertBytesRefusal(result, ws.staging, [
    `  @comvi/core@0.5.0: expected ${ws.integrity("core")}, found ${foreign}`,
  ]);
});

test("promotion: every release-* dist-tag naming the promoted version is removed, others stay", (t) => {
  // A fresh-run recovery: core carries an older candidate's staging tag, same bytes.
  const ws = releaseWorkspace(t);
  ws.onNpm("core", { "release-000000000000": "0.5.0", "release-111111111111": "0.4.1" });
  const result = ws.run({ tagging: false, tag: "next" });
  assert.equal(result.status, 0, result.log);
  assert.deepEqual(ws.distTags("core"), {
    latest: "0.4.1",
    "release-111111111111": "0.4.1",
    next: "0.5.0",
  });
  assert.deepEqual(ws.distTags("react"), { latest: "0.4.1", next: "0.5.0" });
});
