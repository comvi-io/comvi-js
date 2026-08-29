import assert from "node:assert/strict";
import test from "node:test";
import { compareManifest, renderComparison } from "./test-manifest.mjs";

const REACT_A = "packages/react/tests/useI18n.test.tsx > useI18n > returns t";
const REACT_B = "packages/react/tests/useI18n.test.tsx > useI18n > exposes reloadTranslations";
const VUE_A = "packages/vue/tests/VueI18n.test.ts > VueI18n > proxies reloadTranslations";
// Added and retired between two baselines, so it appears in neither.
const WAVE_ID =
  "packages/react/tests/slim-preset.test.tsx > @comvi/react/slim > carries every binding";
const WAVE_SUCCESSOR =
  "packages/react/tests/root-entry.test.tsx > @comvi/react > publishes exactly the named surface";

function manifest({ removals = [], renames = [] } = {}) {
  return {
    packages: [
      { name: "@comvi/react", dir: "packages/react", count: 2, tests: [REACT_A, REACT_B] },
      { name: "@comvi/vue", dir: "packages/vue", count: 1, tests: [VUE_A] },
    ],
    renames,
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

test("an unknown removal id is rejected unless it declares the wave that added it", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [{ id: "packages/react/tests/typo.test.tsx > gone", reason: "x" }],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /needs `addedIn`|the id is wrong/);
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

// --- the rename map: post-baseline retirements and file-level renames -------
// A test added and retired between two baselines is invisible to that gate.
// These rows are how it stops being invisible, and every one of them is checked
// against the live listing rather than believed.

test("a post-baseline retirement is accepted when it names its wave and its live successor", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [
        {
          id: WAVE_ID,
          addedIn: "framework-slim P2 (react)",
          reason: "the cross-entry surface comparison died with the second entry",
          supersededBy: WAVE_SUCCESSOR,
        },
      ],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B, WAVE_SUCCESSOR], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.packages[0].retired, 1);
  assert.match(renderComparison(result), /1 post-baseline retirements/);
});

test("a post-baseline retirement whose test is still listed is rejected", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [{ id: WAVE_ID, addedIn: "framework-slim P2 (react)", reason: "retired" }],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B, WAVE_ID], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /recorded as retired, but the test is still listed/);
});

test("a baseline removal that also claims `addedIn` is rejected as a contradiction", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [{ id: REACT_B, addedIn: "framework-slim P2 (react)", reason: "gone" }],
    }),
    current: { "@comvi/react": [REACT_A], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /`addedIn` contradicts it/);
});

test("a removal whose `supersededBy` names no listed test is rejected", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [
        { id: REACT_B, reason: "migrated", supersededBy: "packages/react/tests/root.test.tsx > x" },
      ],
    }),
    current: { "@comvi/react": [REACT_A], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /dropped rather than migrated/);
});

test("a file rename passes when the source is empty and the target holds its audited floor", () => {
  const result = compareManifest({
    manifest: manifest({
      renames: [
        {
          fromFile: "packages/react/tests/slim-preset.test.tsx",
          toFile: "packages/react/tests/root-entry.test.tsx",
          minIds: 1,
          reason: "the /slim-entry suite became the root-entry suite",
        },
      ],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B, WAVE_SUCCESSOR], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, true);
  assert.equal(result.packages[0].renamedFiles, 1);
  assert.match(renderComparison(result), /1 renamed file\(s\)/);
});

test("a file rename whose source still lists tests is rejected", () => {
  const result = compareManifest({
    manifest: manifest({
      renames: [
        {
          fromFile: "packages/react/tests/useI18n.test.tsx",
          toFile: "packages/react/tests/root-entry.test.tsx",
          minIds: 1,
          reason: "claims a rename that did not happen",
        },
      ],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B, WAVE_SUCCESSOR], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /still lists tests, so the rename did not happen/);
});

test("a file rename whose target fell below its audited floor is rejected", () => {
  const result = compareManifest({
    manifest: manifest({
      renames: [
        {
          fromFile: "packages/react/tests/slim-preset.test.tsx",
          toFile: "packages/react/tests/root-entry.test.tsx",
          minIds: 4,
          reason: "four moved with the file",
        },
      ],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B, WAVE_SUCCESSOR], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /below the 4 audited at the rename/);
});

test("a rename row without a floor or a reason is rejected", () => {
  const result = compareManifest({
    manifest: manifest({
      renames: [
        {
          fromFile: "packages/react/tests/slim-preset.test.tsx",
          toFile: "packages/react/tests/root-entry.test.tsx",
          reason: "no floor",
        },
        {
          fromFile: "packages/react/tests/slim-host.test.tsx",
          toFile: "packages/react/tests/base-host.test.tsx",
          minIds: 1,
          reason: "   ",
        },
      ],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B, WAVE_SUCCESSOR], "@comvi/vue": [VUE_A] },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /needs `minIds` >= 1/);
  assert.match(result.errors.join("\n"), /needs a non-empty `reason`/);
});

test("rename and retirement rows for a package outside the run are left unchecked", () => {
  const result = compareManifest({
    manifest: manifest({
      removals: [
        {
          id: "packages/vue/tests/slim-host.test.ts > vue > x",
          addedIn: "framework-slim P4",
          reason: "retired",
        },
      ],
      renames: [
        {
          fromFile: "packages/vue/tests/slim-host.test.ts",
          toFile: "packages/vue/tests/base-host.test.ts",
          minIds: 9,
          reason: "renamed in the vue phase",
        },
      ],
    }),
    current: { "@comvi/react": [REACT_A, REACT_B] },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});
