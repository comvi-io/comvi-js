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
  parseSeverityArg,
  severityAtLeast,
  workspaceRootWord,
  DEFAULT_SEVERITY,
} from "./audit-published.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(SCRIPT_DIR, "audit-published.mjs");

test("workspaceRootWord normalizes both separator conventions the audit JSON uses for the same chain", () => {
  // `actions[].resolves[].path`: "__" for the folder separator, ">" between deps.
  assert.equal(workspaceRootWord("test-apps__nuxt>nuxt>@nuxt/devtools>ws"), "test-apps");
  assert.equal(workspaceRootWord("packages__plugin-in-context-editor>vue>reka-ui"), "packages");
  assert.equal(workspaceRootWord("tooling__test-utils>vitest>@vitest/mocker"), "tooling");
  // `advisories[<id>].findings[].paths`: "/" for the folder separator, " > " between deps.
  assert.equal(workspaceRootWord("test-apps/next > next@15.5.18 > postcss@8.4.31"), "test-apps");
  // A bare word with none of the three separators is its own root.
  assert.equal(workspaceRootWord("packages"), "packages");
});

test("isPublishedPath: RC review M9 — packages/* is published-relevant regardless of the member's own private field", () => {
  // `@comvi/typegen` and `@comvi/locale-routing` are `private: true` under
  // packages/* but get inlined into twelve other published packages — the
  // classifier no longer reads any package.json at all to decide this.
  assert.equal(isPublishedPath("packages__typegen>some-dep"), true);
  assert.equal(isPublishedPath("packages__locale-routing>some-dep"), true);
});

test("isPublishedPath: RC review M9 — a devDependency-only path in a published package is still published-relevant", () => {
  // `@comvi/plugin-in-context-editor`'s `./standalone` entry bundles with
  // `external: []`, inlining devDependencies (vue, reka-ui, …) into a
  // published artifact — dependencies-vs-devDependencies is not a signal of
  // what a bundler inlined, so it is no longer consulted.
  assert.equal(isPublishedPath("packages__plugin-in-context-editor>vue>reka-ui"), true);
});

test("isPublishedPath: only test-apps/tooling/examples roots are private", () => {
  assert.equal(isPublishedPath("test-apps__nuxt>nuxt>@nuxt/devtools>ws"), false);
  assert.equal(isPublishedPath("tooling__test-utils>vitest>@vitest/mocker"), false);
  assert.equal(isPublishedPath("examples__basic>some-dep"), false);
});

test("isPublishedPath: RC review M9 — apps/* (e.g. the Chrome extension) is published-relevant, and an unrecognized root fails CLOSED", () => {
  assert.equal(isPublishedPath("apps__chrome-extension>some-dep"), true);
  assert.equal(isPublishedPath("some-future-top-level-dir__thing>dep"), true);
});

test("isPublishedPath: the alternate advisories-style path spelling classifies the same as the actions-style one", () => {
  assert.equal(isPublishedPath("test-apps/next > next@15.5.18 > postcss@8.4.31"), false);
  assert.equal(isPublishedPath("packages/core > some-dep@1.0.0"), true);
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

test("classifyActions: `--severity high` drops a moderate finding, keeps a high one, both in a published package", () => {
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

  const atModerate = classifyActions(data, { severity: "moderate" });
  assert.deepEqual(atModerate.map((a) => a.module).sort(), ["critical-lib", "leftpad-vuln"]);

  const atHigh = classifyActions(data, { severity: "high" });
  assert.deepEqual(
    atHigh.map((a) => a.module),
    ["critical-lib"],
  );
});

test("classifyActions throws on a missing `actions` array instead of silently reporting nothing", () => {
  assert.throws(() => classifyActions({}), /actions/);
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

test("CLI end-to-end: RC review M9 — a vulnerability in a packages/* devDependency chain fails the gate", () => {
  const auditJson = {
    actions: [
      {
        module: "vue",
        target: "3.9.9",
        resolves: [{ id: 1, path: "packages__plugin-in-context-editor>vue>reka-ui", dev: false }],
      },
    ],
    advisories: { 1: { severity: "high" } },
  };

  withStubPnpm(auditJson, (env) => {
    assert.throws(() => {
      execFileSync(process.execPath, [SCRIPT, "--severity", "high"], {
        env: { ...process.env, ...env },
        encoding: "utf8",
      });
    }, /Command failed/);
  });
});
