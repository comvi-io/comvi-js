import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { bump, declaredBumps, planRcVersions } from "./rc-version.mjs";

const REPO = process.cwd();

test("bump follows semver for the three types and strips a prerelease suffix", () => {
  assert.equal(bump("0.4.0", "minor"), "0.5.0");
  assert.equal(bump("0.4.3", "patch"), "0.4.4");
  assert.equal(bump("0.4.0", "major"), "1.0.0");
  assert.equal(bump("0.5.0-rc.1", "minor"), "0.6.0");
});

test("declaredBumps keeps the max type per package across changesets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-version-"));
  fs.mkdirSync(path.join(dir, ".changeset"));
  fs.writeFileSync(
    path.join(dir, ".changeset/a.md"),
    '---\n"@comvi/x": patch\n"@comvi/y": minor\n---\n\nA\n',
  );
  fs.writeFileSync(path.join(dir, ".changeset/b.md"), '---\n"@comvi/x": minor\n---\n\nB\n');
  fs.writeFileSync(path.join(dir, ".changeset/README.md"), "# not a changeset\n");
  assert.deepEqual(declaredBumps(dir), { "@comvi/x": "minor", "@comvi/y": "minor" });
});

test("plan against this repo: fixed group + locale-routing, ignored and private packages excluded", () => {
  const { manifests, versions } = planRcVersions({ root: REPO, rc: "3" });
  const names = manifests.map((m) => m.name).sort();
  assert.ok(names.includes("@comvi/core"));
  assert.ok(names.includes("@comvi/locale-routing"));
  assert.ok(!names.includes("@comvi/vite-config"), "ignored package must not be versioned");
  assert.ok(!names.includes("@comvi/chrome-extension"), "apps are outside packages/");
  const core = versions["@comvi/core"];
  assert.match(core, /^\d+\.\d+\.\d+-rc\.3$/);
  const fixed = JSON.parse(
    fs.readFileSync(path.join(REPO, ".changeset/config.json"), "utf8"),
  ).fixed.flat();
  for (const name of fixed)
    assert.equal(versions[name], core, `${name} must share the fixed rc version`);
  assert.notEqual(
    versions["@comvi/locale-routing"],
    core,
    "locale-routing is versioned on its own",
  );
  assert.match(versions["@comvi/locale-routing"], /-rc\.3$/);
});

test("--rc is validated", () => {
  assert.throws(() => planRcVersions({ root: REPO, rc: "x" }), /non-negative integer/);
});

test("dry-run CLI writes nothing and names every peer edit as an exact rc version", () => {
  const before = execFileSync("git", ["status", "--porcelain", "--", "packages"], {
    cwd: REPO,
    encoding: "utf8",
  });
  const out = execFileSync(process.execPath, ["scripts/rc-version.mjs", "--rc", "0", "--dry-run"], {
    cwd: REPO,
    encoding: "utf8",
  });
  const after = execFileSync("git", ["status", "--porcelain", "--", "packages"], {
    cwd: REPO,
    encoding: "utf8",
  });
  assert.equal(after, before, "dry-run must not modify manifests");
  assert.match(out, /rc-version: @comvi\/core \d+\.\d+\.\d+ -> \d+\.\d+\.\d+-rc\.0/);
  // plugins peer-depend on @comvi/core with a caret range: it must become the exact rc version.
  assert.match(
    out,
    /@comvi\/plugin-fetch-loader .* \(peers: @comvi\/core: \^\d+\.\d+\.\d+ -> \d+\.\d+\.\d+-rc\.0\)/,
  );
});
