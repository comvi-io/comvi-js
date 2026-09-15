import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  classifyActions,
  isPublishedPath,
  loadPublishablePackages,
  parseSeverityArg,
  severityAtLeast,
  DEFAULT_SEVERITY,
} from "./audit-published.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(SCRIPT_DIR, "audit-published.mjs");

/**
 * A synthetic workspace: one publishable package with a runtime dependency
 * and a dev-only one, and one PRIVATE package — mirrors the real shapes
 * (`@comvi/plugin-in-context-editor` publishable, `@comvi/typegen` private)
 * without depending on either's actual manifest staying the same.
 */
function writeFixtureWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "audit-published-"));
  const write = (dir, pkg) => {
    fs.mkdirSync(path.join(root, "packages", dir), { recursive: true });
    fs.writeFileSync(
      path.join(root, "packages", dir, "package.json"),
      JSON.stringify(pkg, null, 2),
    );
  };
  write("foo-public", {
    name: "@fixture/foo-public",
    dependencies: { lodash: "^4.0.0" },
    devDependencies: { vitest: "^1.0.0" },
  });
  write("bar-private", {
    name: "@fixture/bar-private",
    private: true,
    dependencies: { leftpad: "^1.0.0" },
  });
  return root;
}

test("loadPublishablePackages keeps only non-private packages/* members, keyed by their runtime deps", () => {
  const root = writeFixtureWorkspace();
  const publishable = loadPublishablePackages(root);

  assert.deepEqual([...publishable.keys()].sort(), ["packages__foo-public"]);
  assert.deepEqual([...publishable.get("packages__foo-public")], ["lodash"]);
});

test("isPublishedPath: RC review #15 — a private-tooling path is never published", () => {
  const root = writeFixtureWorkspace();
  const publishable = loadPublishablePackages(root);

  assert.equal(isPublishedPath("tooling__test-utils>vitest>@vitest/mocker", publishable), false);
  assert.equal(isPublishedPath("test-apps__nuxt>nuxt>@nuxt/devtools>ws", publishable), false);
  // Rooted in packages/*, but that member is `private: true` — still not published.
  assert.equal(isPublishedPath("packages__bar-private>leftpad", publishable), false);
});

test("isPublishedPath: a published-package runtime path is reported", () => {
  const root = writeFixtureWorkspace();
  const publishable = loadPublishablePackages(root);

  assert.equal(isPublishedPath("packages__foo-public>lodash>deep-thing", publishable), true);
});

test("isPublishedPath: a path reachable only through a devDependency of a published package is not published", () => {
  const root = writeFixtureWorkspace();
  const publishable = loadPublishablePackages(root);

  assert.equal(isPublishedPath("packages__foo-public>vitest>@vitest/mocker", publishable), false);
});

test("severityAtLeast orders info < low < moderate < high < critical and fails open on unknown severities", () => {
  assert.equal(severityAtLeast("high", "high"), true);
  assert.equal(severityAtLeast("critical", "high"), true);
  assert.equal(severityAtLeast("moderate", "high"), false);
  assert.equal(severityAtLeast("low", "moderate"), false);
  assert.equal(severityAtLeast("weird-future-level", "high"), true);
});

test("parseSeverityArg reads --severity <value> and --severity=<value>, defaulting to high", () => {
  assert.equal(parseSeverityArg([]), DEFAULT_SEVERITY);
  assert.equal(parseSeverityArg(["--severity", "moderate"]), "moderate");
  assert.equal(parseSeverityArg(["--severity=critical"]), "critical");
});

test("classifyActions: RC review #15 — `--severity high` drops a moderate finding, keeps a high one, both in a published package", () => {
  const root = writeFixtureWorkspace();
  const publishablePackages = loadPublishablePackages(root);

  const data = {
    actions: [
      {
        module: "fflate",
        target: "0.9.0",
        resolves: [{ id: 1, path: "tooling__test-utils>vitest>@vitest/mocker", dev: false }],
      },
      {
        module: "leftpad-vuln",
        target: "1.0.1",
        resolves: [{ id: 2, path: "packages__foo-public>lodash", dev: false }],
      },
      {
        module: "critical-lib",
        target: "2.0.1",
        resolves: [{ id: 3, path: "packages__foo-public>lodash>critical-lib", dev: false }],
      },
    ],
    advisories: {
      1: { severity: "moderate" },
      2: { severity: "moderate" },
      3: { severity: "high" },
    },
  };

  const atModerate = classifyActions(data, { publishablePackages, severity: "moderate" });
  assert.deepEqual(atModerate.map((a) => a.module).sort(), ["critical-lib", "leftpad-vuln"]);

  const atHigh = classifyActions(data, { publishablePackages, severity: "high" });
  assert.deepEqual(
    atHigh.map((a) => a.module),
    ["critical-lib"],
  );
});

test("classifyActions throws on a missing `actions` array instead of silently reporting nothing", () => {
  assert.throws(() => classifyActions({}, { publishablePackages: new Map() }), /actions/);
});

/** Puts a stub `pnpm` ahead of PATH that answers `audit --prod --json` with fixed JSON. */
function withStubPnpm(auditJson, callback) {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-published-bin-"));
  const stub = path.join(binDir, "pnpm");
  const jsonFile = path.join(binDir, "audit.json");
  fs.writeFileSync(jsonFile, JSON.stringify(auditJson));
  fs.writeFileSync(
    stub,
    `#!/usr/bin/env node\nprocess.stdout.write(require("fs").readFileSync(${JSON.stringify(jsonFile)}, "utf8"));\n`,
  );
  fs.chmodSync(stub, 0o755);
  try {
    return callback({ PATH: `${binDir}:${process.env.PATH}` });
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
}

test("CLI end-to-end: a vulnerability rooted only in a private workspace member never fails the gate", () => {
  const auditJson = {
    actions: [
      {
        module: "fflate",
        target: "0.9.0",
        resolves: [{ id: 1, path: "tooling__test-utils>vitest>@vitest/mocker", dev: false }],
      },
    ],
    advisories: { 1: { severity: "moderate" } },
  };

  withStubPnpm(auditJson, (env) => {
    const result = execFileSync(process.execPath, [SCRIPT, "--severity", "high"], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    assert.match(result, /no vulnerabilities/);
  });
});
