import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
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
