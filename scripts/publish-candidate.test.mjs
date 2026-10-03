import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  assertChecksums,
  checksums,
  isPublished,
  parseArgs,
  publishOrder,
} from "./publish-candidate.mjs";

test("parseArgs: --dir is required, the tag defaults to latest", () => {
  assert.throws(() => parseArgs([]), /--dir is required/);
  assert.deepEqual(parseArgs(["--dir", "rc"]), {
    dir: "rc",
    tag: "latest",
    gitTag: false,
    dryRun: false,
  });
  assert.deepEqual(parseArgs(["--dir", "rc", "--tag", "next", "--git-tag", "--dry-run"]), {
    dir: "rc",
    tag: "next",
    gitTag: true,
    dryRun: true,
  });
  assert.throws(() => parseArgs(["--dir", "rc", "--tag", "$(id)"]), /not a dist-tag/);
  assert.throws(() => parseArgs(["--dir", "rc", "--publish"]), /unknown argument/);
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

test("assertChecksums: passes on unchanged files, fails when a verified tarball changes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "publish-candidate-"));
  try {
    const a = path.join(dir, "comvi-core-0.5.0.tgz");
    const b = path.join(dir, "comvi-react-0.5.0.tgz");
    fs.writeFileSync(a, "core");
    fs.writeFileSync(b, "react");
    const recorded = checksums([b, a]);
    assert.match(recorded.split("\n")[0], /^[0-9a-f]{64} {2}comvi-core-0\.5\.0\.tgz$/);
    assertChecksums(dir, recorded);
    fs.writeFileSync(b, "react, rebuilt");
    assert.throws(() => assertChecksums(dir, recorded), /changed after verification/);
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
