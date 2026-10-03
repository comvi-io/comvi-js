import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertChecksums,
  assertVerifiedCandidate,
  checksums,
  isPublished,
  parseArgs,
  publishAll,
  publishOrder,
  unexercised,
} from "./publish-candidate.mjs";

const SUMS = "a".repeat(64);

test("parseArgs: a subcommand and --dir are required; publish needs verify's digest", () => {
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(["verify"]), /--dir is required/);
  assert.equal(parseArgs(["verify", "--dir", "rc"]).command, "verify");
  // Publishing flags belong to the publishing job only.
  assert.throws(() => parseArgs(["verify", "--dir", "rc", "--tag", "next"]), /unknown argument/);
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
    assert.throws(() => assertVerifiedCandidate(dir, SUMS), /not the candidate that was verified/);
    fs.writeFileSync(b, "react, rebuilt");
    assert.throws(() => assertVerifiedCandidate(dir, sums), /changed after verification/);
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
