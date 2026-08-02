import assert from "node:assert/strict";
import test from "node:test";
import { compareManifest, renderComparison } from "./test-manifest.mjs";

const REACT_A = "packages/react/tests/useI18n.test.tsx > useI18n > returns t";
const REACT_B = "packages/react/tests/useI18n.test.tsx > useI18n > exposes reloadTranslations";
const VUE_A = "packages/vue/tests/VueI18n.test.ts > VueI18n > proxies reloadTranslations";

function manifest({ removals = [] } = {}) {
  return {
    packages: [
      { name: "@comvi/react", dir: "packages/react", count: 2, tests: [REACT_A, REACT_B] },
      { name: "@comvi/vue", dir: "packages/vue", count: 1, tests: [VUE_A] },
    ],
    removals,
  };
}

test("passes when every manifest ID is still listed", () => {
  const result = compareManifest({
    manifest: manifest(),
    current: { "@comvi/react": [REACT_A, REACT_B], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.packages.map((pkg) => pkg.missing),
    [[], []],
  );
});

test("fails when a manifest test ID disappears without an allowlist entry", () => {
  const result = compareManifest({
    manifest: manifest(),
    current: { "@comvi/react": [REACT_A], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.packages[0].missing, [REACT_B]);
  assert.match(renderComparison(result), /MISSING .*exposes reloadTranslations/);
});

test("an allowlisted removal with a rationale turns a missing ID green", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [
        { id: REACT_B, reason: "useI18n() no longer returns reloadTranslations (D′ §2.4)" },
      ],
    }),
    current: { "@comvi/react": [REACT_A], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.packages[0].missing, []);
  assert.deepEqual(result.packages[0].removed, [REACT_B]);
});

test("an allowlisted removal without a rationale is rejected", () => {
  const result = compareManifest({
    manifest: manifest({ removals: [{ id: REACT_B, reason: "  " }] }),
    current: { "@comvi/react": [REACT_A], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.equal(result.packages[0].missing.length, 1);
  assert.match(result.errors.join("\n"), /non-empty `reason`/);
});

test("an allowlist entry that names no manifest ID is rejected", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [{ id: "packages/react/tests/typo.test.tsx > gone", reason: "x" }],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /is not a manifest test ID/);
});

test("a manifest whose count disagrees with its ID list is rejected", () => {
  const broken = manifest();
  broken.packages[0].count = 3;
  const result = compareManifest({
    manifest: broken,
    current: { "@comvi/react": [REACT_A, REACT_B], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /count 3 does not match/);
});

test("new tests pass, and a stale allowlist entry reports without failing", () => {
  const result = compareManifest({
    manifest: manifest({ removals: [{ id: REACT_B, reason: "migrated to useI18nLoader" }] }),
    current: {
      "@comvi/react": [
        REACT_A,
        REACT_B,
        "packages/react/tests/capabilityHooks.test.tsx > throws on slim",
      ],
      "@comvi/vue": [VUE_A],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.packages[0].added, 1);
  assert.deepEqual(result.packages[0].stale, [REACT_B]);
  assert.match(renderComparison(result), /stale allowlist entry/);
});

test("packages missing from the listing are skipped, so per-wrapper runs work", () => {
  const result = compareManifest({
    manifest: manifest(),
    current: { "@comvi/react": [REACT_A, REACT_B] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.packages.map((pkg) => pkg.name),
    ["@comvi/react"],
  );
});
