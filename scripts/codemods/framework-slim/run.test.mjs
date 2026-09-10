import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

import { runCodemod, transformSource } from "./run.mjs";
import { HOOKS, MEMBER_TO_HOOK } from "./rules/capabilities.mjs";

/**
 * The verification gate: a golden per transform-matrix row AND per report-only
 * shape, idempotence, CRLF fidelity, `tsc --noEmit` over the transformed TS
 * goldens, and the CLI's exit-code contract.
 */
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../..");
const FIXTURES = path.join(HERE, "__fixtures__");

const inputs = fs
  .readdirSync(FIXTURES)
  .filter((name) => name.includes(".input."))
  .sort();

const caseNameOf = (input) => input.replace(/\.input\.[^.]+$/, "");
const expectedOf = (input) => path.join(FIXTURES, input.replace(".input.", ".expected."));
const reportOf = (input) => path.join(FIXTURES, `${caseNameOf(input)}.report.json`);
const isRewritten = (input) =>
  fs.readFileSync(expectedOf(input), "utf8") !==
  fs.readFileSync(path.join(FIXTURES, input), "utf8");

// Every matrix row and every report-only shape needs a fixture — a silently
// missing golden is the failure mode this list exists to prevent.
const REQUIRED_CASES = [
  // the capability-hook destructures.
  "t1-pure-loader",
  "t2-pure-plugins",
  "t3-mixed",
  "t4-aliased",
  "t5-repeated",
  "sfc-vue",
  "sfc-svelte",
  // the shapes round-2 review found silently corrupting or silently missing.
  "hook-nospace-keyword", // N1: `const{…}=useI18n()` has no whitespace to scan for
  "sfc-vue-compact", // N1 inside a non-prettier `<script setup>`
  "hook-block-scoped", // N2: the merge unit is the block, not the function
  "hook-export-split", // N3: a T3 split keeps `export` on both halves
  "hook-quoted-key", // P2-1: a quoted static key migrates like the bare one
  "hook-type-position-param", // a parameter name in a TYPE binds nothing
  "report-shadowed-host", // P1-2: a shadowed host binding is never rewritten
  "report-shadowed-hook", // P1-2: a shadowed `useI18n` is never rewritten
  "report-annotated-destructure", // N4: an annotation cannot be split
  "report-comment-destructure", // N4: an in-pattern comment cannot be split
  "report-comment-declaration", // a comment in the re-printed range cannot be placed
  "report-switch-cases", // sibling cases share one scope: no sound merge position
  "report-escaped-key", // an undecodable escaped key fails closed
  "report-collision",
  "report-stored-result",
  "report-rest-spread",
  "report-computed",
  "report-vue-proxy",
  // the same shape in nuxt's `comvi.setup` hook, whose context `i18n` is a
  // VueI18n — detected by filename, not by extension.
  "comvi.setup",
  "report-script-extract",
  // one golden per enumerated single-entry shape.
  "slim-specifier", // 1: `@comvi/<pkg>/slim` -> `@comvi/<pkg>`
  "slim-factory-rename", // 2: `createSlimI18n` -> `createI18n`
  "chain-plugin-installers", // 3: known factory -> lowercase installer
  "chain-plugin-host", // 3: unknown plugin -> `.with(plugins())` + `.use`
  "ctor-icu-compiler", // 4: inline ICU catalog -> `compiler: icuCompiler`
  "ctor-devtools-options", // 5: exposeGlobal / instanceId -> `devtools({…})`
  "ctor-type-only-import", // runtime installer never merges into `import type`
  "ctor-nested-catalog", // 6: non-flat catalog -> `flattenCatalog(…)`
  "chain-icu-order", // the one provable remote-ICU reorder
  "prologue-shebang", // shebang + directive prologue keep their positions
  // one golden per report-only residual.
  "report-slim-rename",
  "report-dynamic-slim",
  "report-dynamic-plugins",
  "report-ambiguous-factory",
  "report-host-options",
  "report-host-module",
  "report-host-spread",
  "report-namespace-host",
];

test("every matrix row and report-only shape has a golden fixture", () => {
  assert.deepEqual(inputs.map(caseNameOf).sort(), [...REQUIRED_CASES].sort());
});

for (const input of inputs) {
  test(`golden: ${caseNameOf(input)}`, () => {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8");
    const result = transformSource(source, path.join(FIXTURES, input));

    assert.equal(result.text, fs.readFileSync(expectedOf(input), "utf8"));
    assert.deepEqual(
      result.manual.map(({ line, column, shape, detail }) => ({ line, column, shape, detail })),
      JSON.parse(fs.readFileSync(reportOf(input), "utf8")),
    );
  });

  test(`idempotent: ${caseNameOf(input)}`, () => {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8");
    const once = transformSource(source, path.join(FIXTURES, input)).text;
    const twice = transformSource(once, path.join(FIXTURES, input));

    assert.equal(twice.text, once, "second run must be a byte-identical no-op");
    assert.equal(twice.rewrites, 0, "second run must plan no rewrites");
  });
}

test("report-only fixtures are never rewritten", () => {
  for (const input of inputs.filter((name) => name.startsWith("report-"))) {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8");
    const result = transformSource(source, path.join(FIXTURES, input));
    assert.equal(result.text, source, `${input} must come back byte-identical`);
    assert.ok(result.manual.length > 0, `${input} must produce a manual action`);
  }
});

/**
 * A migration must not convert a Windows checkout to LF: every line the codemod
 * emits (a split destructure, an inserted import, a moved installer) has to
 * carry the file's own ending. Synthesized from the LF goldens rather than
 * stored as CRLF fixtures, because git normalization would silently defeat a
 * CRLF file on disk.
 */
test("CRLF sources come back with CRLF", () => {
  const rewritten = inputs.filter(isRewritten);
  assert.deepEqual(
    rewritten.map(caseNameOf).sort(),
    [
      "chain-icu-order",
      "chain-plugin-host",
      "chain-plugin-installers",
      "ctor-devtools-options",
      "ctor-icu-compiler",
      "ctor-nested-catalog",
      "ctor-type-only-import",
      "hook-block-scoped",
      "hook-export-split",
      "hook-nospace-keyword",
      "hook-quoted-key",
      "hook-type-position-param",
      "prologue-shebang",
      "sfc-svelte",
      "sfc-vue",
      "sfc-vue-compact",
      "slim-factory-rename",
      "slim-specifier",
      "t1-pure-loader",
      "t2-pure-plugins",
      "t3-mixed",
      "t4-aliased",
      "t5-repeated",
    ],
    "the CRLF invariant must cover every rewritten golden",
  );
  for (const input of rewritten) {
    const source = fs.readFileSync(path.join(FIXTURES, input), "utf8").replaceAll("\n", "\r\n");
    const expected = fs.readFileSync(expectedOf(input), "utf8").replaceAll("\n", "\r\n");
    assert.equal(transformSource(source, path.join(FIXTURES, input)).text, expected, input);
  }
});

test("the migration table is the single source of truth", () => {
  assert.deepEqual([...MEMBER_TO_HOOK.entries()].sort(), [
    ["addActiveNamespace", "useI18nLoader"],
    ["addActiveNamespaces", "useI18nLoader"],
    ["onLoadError", "useI18nLoader"],
    ["onMissingKey", "useI18nPlugins"],
    ["reloadTranslations", "useI18nLoader"],
  ]);
  assert.deepEqual(
    HOOKS.map(({ capability }) => capability),
    ["loader", "plugins"],
  );
});

/**
 * Sibling unbraced `switch` cases share ONE scope, so neither answer is sound:
 * a call per case redeclares the same `const` in that scope, and merging them
 * into the first case leaves the read in the second in the temporal dead zone.
 * This is the exact runtime failure, measured:
 *
 *   case 1: const { addActiveNamespace, onLoadError } = useI18nLoader();
 *   case 2: onLoadError(() => {});
 *   Bare(1) -> OK;  Bare(2) -> ReferenceError: Cannot access 'onLoadError'
 *                              before initialization
 *
 * So the cross-case merge is REFUSED and reported, and nothing is rewritten.
 * A braced case is a real block and migrates normally.
 */
test("a merge across unbraced switch cases is refused, not rewritten", () => {
  const source = `import { useI18n } from "@comvi/react";

export function Bare(kind: number) {
  switch (kind) {
    case 1:
      const { addActiveNamespace } = useI18n();
      addActiveNamespace("a");
      break;
    case 2:
      const { onLoadError } = useI18n();
      onLoadError(() => {});
      break;
  }
}
`;

  const result = transformSource(source, "switch.ts");

  assert.equal(result.text, source, "the file must come back byte-identical");
  assert.equal(result.rewrites, 0);
  const cases = result.manual.filter(
    (item) => item.shape === "unsupported-destructure" && /`switch` cases/.test(item.detail),
  );
  assert.equal(cases.length, 2, `both cases must be named, got ${JSON.stringify(result.manual)}`);
  assert.deepEqual(
    cases.map((item) => item.line),
    [6, 10],
  );
});

test("braced switch cases each get their own capability call", () => {
  const source = `import { useI18n } from "@comvi/react";

export function Braced(kind: number) {
  switch (kind) {
    case 1: {
      const { addActiveNamespace } = useI18n();
      addActiveNamespace("a");
      break;
    }
    case 2: {
      const { onLoadError } = useI18n();
      onLoadError(() => {});
      break;
    }
  }
}
`;

  const result = transformSource(source, "switch-braced.ts");

  assert.deepEqual(result.manual, []);
  assert.equal(
    (result.text.match(/= useI18nLoader\(\)/g) ?? []).length,
    2,
    "a braced case is its own block, so neither borrows the other's binding",
  );
});

/**
 * A parameter name inside a TYPE is erased by TypeScript: it binds nothing and
 * shadows nothing, so treating one as a collision refuses a whole module over a
 * type alias. The positive shapes below must still refuse.
 */
test("a parameter name in type position is not a shadow", async (t) => {
  const migrates = [
    {
      name: "function type alias",
      source: `import { useI18n } from "@comvi/react";
type Injected = (useI18n: () => unknown) => void;
export const { reloadTranslations } = useI18n();
export type { Injected };
`,
    },
    {
      name: "ambient function declaration",
      source: `import { createI18n } from "@comvi/core";
declare function inject(createI18n: () => unknown): void;
export const i18n = createI18n({ locale: "en", exposeGlobal: true });
export { inject };
`,
    },
    {
      name: "interface method signature",
      source: `import { useI18n } from "@comvi/react";
interface Deps {
  provide(useI18n: () => unknown): void;
}
export const { reloadTranslations } = useI18n();
export type { Deps };
`,
    },
    {
      name: "construct signature",
      source: `import { useI18n } from "@comvi/react";
interface Factory {
  new (useI18n: () => unknown): object;
}
export const { reloadTranslations } = useI18n();
export type { Factory };
`,
    },
    {
      name: "overload signature with no body",
      source: `import { useI18n } from "@comvi/react";
export function inject(useI18n: () => unknown): void;
export function inject(hook: unknown): void {
  void hook;
}
export const { reloadTranslations } = useI18n();
`,
    },
  ];

  for (const { name, source } of migrates) {
    await t.test(`migrates: ${name}`, () => {
      const result = transformSource(source, "type-position.ts");

      assert.notEqual(result.text, source, "a type-position name must not refuse the module");
      assert.deepEqual(result.manual, []);
    });
  }

  const refused = [
    {
      name: "a real value parameter",
      source: `import { useI18n } from "@comvi/react";
export function render(useI18n) {
  const { reloadTranslations } = useI18n();
  return reloadTranslations;
}
`,
      shape: "shadowed-hook-source",
    },
    {
      name: "an implemented function's typed parameter",
      source: `import { createI18n } from "@comvi/core";
export function make(createI18n: (options: unknown) => unknown) {
  return createI18n({ exposeGlobal: true });
}
`,
      shape: "shadowed-host-binding",
    },
  ];

  for (const { name, source, shape } of refused) {
    await t.test(`still refuses: ${name}`, () => {
      const result = transformSource(source, "type-position.ts");

      assert.equal(result.text, source);
      assert.equal(result.rewrites, 0);
      assert.ok(
        result.manual.some((item) => item.shape === shape),
        `expected a ${shape} action, got ${JSON.stringify(result.manual)}`,
      );
    });
  }
});

/**
 * A quoted key is the same member as the bare one, escapes included. Reading a
 * quoted body raw made `"\\u0072eloadTranslations"` a member the table does not
 * know: no rewrite, no report, "nothing to migrate". Double quotes are JSON and
 * decode exactly; anything else with a backslash fails closed.
 */
test("escaped quoted keys either decode or fail closed", async (t) => {
  await t.test("a double-quoted escape decodes", () => {
    const source = `import { useI18n } from "@comvi/react";
export function C() {
  const { "\\u0072eloadTranslations": reload, t } = useI18n();
  reload();
  return t("x");
}
`;

    const result = transformSource(source, "escaped.ts");

    assert.deepEqual(result.manual, []);
    assert.match(result.text, /const \{ "\\u0072eloadTranslations": reload \} = useI18nLoader\(\)/);
    assert.match(result.text, /const \{ t \} = useI18n\(\)/);
  });

  await t.test("a single-quoted escape is refused, never read raw", () => {
    const source = `import { useI18n } from "@comvi/react";
export function C() {
  const { '\\u0072eloadTranslations': reload, t } = useI18n();
  reload();
  return t("x");
}
`;

    const result = transformSource(source, "escaped.ts");

    assert.equal(result.text, source, "an undecodable key must not be guessed at");
    assert.equal(result.rewrites, 0);
    assert.ok(
      result.manual.some(
        (item) => item.shape === "unsupported-destructure" && /escaped key/.test(item.detail),
      ),
      `expected an escaped-key action, got ${JSON.stringify(result.manual)}`,
    );
  });
});

/**
 * Both shadow families report when both are present: one fact hiding the other
 * is how the next re-run surprises the user.
 */
test("a shadowed source hook and a shadowed introduced hook both report", () => {
  const source = `import { useI18n } from "@comvi/react";

function useI18nLoader() {
  return { reloadTranslations: () => {} };
}

export function Shadowed(useI18n) {
  const { reloadTranslations } = useI18n();
  return { reloadTranslations, useI18nLoader };
}
`;

  const result = transformSource(source, "both-shadows.ts");

  assert.equal(result.text, source);
  assert.equal(result.rewrites, 0);
  assert.deepEqual(result.manual.map((item) => item.shape).sort(), [
    "local-name-collision",
    "shadowed-hook-source",
  ]);
});

test("every declaration that shadows the source hook is listed", () => {
  const source = `import { useI18n } from "@comvi/react";

export function First(useI18n) {
  const { reloadTranslations } = useI18n();
  return reloadTranslations;
}

export function Second() {
  try {
    return null;
  } catch (useI18n) {
    const { onMissingKey } = useI18n();
    return onMissingKey;
  }
}
`;

  const result = transformSource(source, "many-shadows.ts");

  assert.equal(result.text, source);
  assert.deepEqual(
    result.manual.filter((item) => item.shape === "shadowed-hook-source").map((item) => item.line),
    [3, 11],
    "one item per shadowing declaration, not just the first",
  );
});

test("installer imports refuse every local-binding collision shape", () => {
  const cases = [
    {
      name: "same-named import from an unrelated comvi package",
      source: `import { createI18n } from "@comvi/react";
import { icuCompiler } from "@comvi/plugin-fetch-loader";
const i18n = createI18n({ locale: "en", translation: { en: { items: "{count, plural, one {# item} other {# items}}" } } });
`,
    },
    {
      name: "wrong export aliased to the expected local name",
      source: `import { createI18n } from "@comvi/core";
import { otherExport as devtools } from "@comvi/core/devtools";
const i18n = createI18n({ locale: "en", exposeGlobal: false });
`,
    },
    {
      name: "namespace import",
      source: `import { createI18n } from "@comvi/react";
import * as devtools from "./devtools";
const i18n = createI18n({ locale: "en", exposeGlobal: false });
`,
    },
    {
      name: "default import",
      source: `import { createI18n } from "@comvi/react";
import plugins from "./plugins";
const i18n = createI18n({ locale: "en" }).use(CustomPlugin({}));
`,
    },
    {
      name: "destructured local",
      source: `import { createI18n } from "@comvi/react";
const { devtools } = toolkit;
const i18n = createI18n({ locale: "en", instanceId: "app" });
`,
    },
    {
      name: "catch binding",
      source: `import { createI18n } from "@comvi/react";
try {} catch (devtools) {
  createI18n({ locale: "en", exposeGlobal: false });
}
`,
    },
    {
      name: "enum binding",
      source: `import { createI18n } from "@comvi/react";
enum devtools { Disabled }
const i18n = createI18n({ locale: "en", exposeGlobal: false });
`,
    },
    {
      name: "namespace declaration",
      source: `import { createI18n } from "@comvi/react";
namespace devtools {}
const i18n = createI18n({ locale: "en", exposeGlobal: false });
`,
    },
    {
      name: "import equals",
      source: `import { createI18n } from "@comvi/react";
import devtools = require("./devtools");
const i18n = createI18n({ locale: "en", exposeGlobal: false });
`,
    },
    {
      name: "ambient function",
      source: `import { createI18n } from "@comvi/react";
declare function devtools(): void;
const i18n = createI18n({ locale: "en", exposeGlobal: false });
`,
    },
  ];
  for (const { name, source } of cases) {
    const result = transformSource(source, `${name}.ts`);
    assert.equal(result.text, source, `${name} must remain byte-identical`);
    assert.equal(result.rewrites, 0, `${name} must not partially rewrite`);
    assert.ok(
      result.manual.some(({ shape }) => shape === "local-name-collision"),
      `${name} must report the collision`,
    );
  }
});

test("hook rewrites require exact Comvi value-import provenance", async (t) => {
  const refused = [
    {
      name: "useI18n imported from another library",
      source: `import { useI18n } from "other-i18n";
const { reloadTranslations } = useI18n();
`,
    },
    {
      name: "a locally declared useI18n",
      source: `function useI18n() { return { reloadTranslations() {} }; }
const { reloadTranslations } = useI18n();
`,
    },
    {
      name: "the useI18nLoader name already bound to another library's hook",
      source: `import { useI18n } from "@comvi/react";
import { otherHook as useI18nLoader } from "other-i18n";
const { reloadTranslations } = useI18n();
`,
    },
    {
      name: "useI18nLoader imported as a type only",
      source: `import { useI18n } from "@comvi/react";
import type { useI18nLoader } from "@comvi/react";
const { reloadTranslations } = useI18n();
`,
    },
  ];

  for (const { name, source } of refused) {
    await t.test(name, () => {
      const result = transformSource(source, "hook-provenance.ts");

      assert.equal(result.text, source);
      assert.equal(result.rewrites, 0);
      assert.ok(
        result.manual.some(({ shape }) =>
          ["unproven-hook-source", "local-name-collision"].includes(shape),
        ),
        `expected an unproven-hook-source or local-name-collision action, got ${JSON.stringify(result.manual)}`,
      );
    });
  }
});

test("an aliased Comvi useI18n import is rewritten to useI18nLoader", () => {
  const aliased = `import { useI18n as useComviI18n } from "@comvi/react";
const { reloadTranslations } = useComviI18n();
`;

  const transformed = transformSource(aliased, "hook-alias.ts");

  assert.equal(transformed.rewrites, 1);
  assert.match(transformed.text, /import \{ useI18nLoader \} from "@comvi\/react"/);
  assert.match(transformed.text, /const \{ reloadTranslations \} = useI18nLoader\(\)/);
  assert.doesNotMatch(transformed.text, /useComviI18n/);
});

test("plugin and existing-installer classification requires owning imports", async (t) => {
  const cases = [
    {
      name: "an uppercase plugin factory imported from another library",
      source: `import { createI18n } from "@comvi/react";
import { FetchLoader } from "other-lib";
const i18n = createI18n({ locale: "en" }).use(FetchLoader({ cdnUrl: "/x" }));
`,
    },
    {
      name: "a `plugins` installer imported from another library",
      source: `import { createI18n } from "@comvi/react";
import { plugins } from "other-lib";
const i18n = createI18n({ locale: "en" }).with(plugins()).use(CustomPlugin({}));
`,
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      const result = transformSource(source, "installer-provenance.ts");

      assert.equal(result.text, source);
      assert.equal(result.rewrites, 0);
      assert.ok(result.manual.length > 0, "the shape must be reported for a human");
    });
  }
});

test("namespace hooks are reported across ESM, dynamic import, and require", async (t) => {
  const cases = [
    {
      name: "ESM namespace import",
      source: `import * as Comvi from "@comvi/react";
const { reloadTranslations } = Comvi.useI18n();
`,
    },
    {
      name: "dynamic import",
      source: `const Comvi = await import("@comvi/react");
const { reloadTranslations } = Comvi.useI18n();
`,
    },
    {
      name: "require",
      source: `const Comvi = require("@comvi/react");
const { reloadTranslations } = Comvi.useI18n();
`,
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      const result = transformSource(source, "namespace-hook.ts");

      assert.equal(result.text, source);
      assert.equal(result.rewrites, 0);
      assert.ok(
        result.manual.some(({ shape }) => shape === "namespace-hook-source"),
        `expected a namespace-hook-source action, got ${JSON.stringify(result.manual)}`,
      );
    });
  }
});

test("unsupported host import shapes never receive partial slim rewrites", async (t) => {
  const cases = [
    {
      name: "createSlimI18n re-exported straight from the module",
      source: `export { createSlimI18n } from "@comvi/next/client";\n`,
    },
    {
      name: "createSlimI18n imported, called and re-exported",
      source: `import { createSlimI18n } from "@comvi/next/client";
export { createSlimI18n };
createSlimI18n({ locale: "en" });
`,
    },
    {
      name: "createSlimI18n imported, called and re-exported under an alias",
      source: `import { createSlimI18n } from "@comvi/next/client";
export { createSlimI18n as makeI18n };
createSlimI18n({ locale: "en" });
`,
    },
    {
      name: "createI18n destructured from require()",
      source: `const { createI18n } = require("@comvi/react");
createI18n({ locale: "en" });
`,
    },
    {
      name: "createI18n destructured from a dynamic import",
      source: `const { createI18n } = await import("@comvi/react");
createI18n({ locale: "en" });
`,
    },
    {
      name: "createI18n called on a dynamic-import namespace",
      source: `const Comvi = await import("@comvi/react");
Comvi.createI18n({ locale: "en" });
`,
    },
    {
      name: "createI18n called on a require() namespace",
      source: `const Comvi = require("@comvi/react");
Comvi.createI18n({ locale: "en" });
`,
    },
    {
      name: "createSlimI18n called on a dynamic-import namespace",
      source: `const Comvi = await import("@comvi/react/slim");
Comvi.createSlimI18n({ locale: "en" });
`,
    },
    {
      name: "createSlimI18n called on a require() namespace",
      source: `const Comvi = require("@comvi/react/slim");
Comvi.createSlimI18n({ locale: "en" });
`,
    },
    {
      name: "createSlimI18n called on an ESM namespace",
      source: `import * as Comvi from "@comvi/react/slim";
Comvi.createSlimI18n({ locale: "en" });
`,
    },
    {
      name: "an aliased re-export from the slim subpath",
      source: `export { createSlimI18n as makeI18n } from "@comvi/react/slim";\n`,
    },
    {
      name: "createSlimI18n shadowed by a function parameter",
      source: `import { createSlimI18n } from "@comvi/next/client";
function preview(createSlimI18n) {
  return createSlimI18n({ locale: "de" });
}
createSlimI18n({ locale: "en" });
`,
    },
  ];

  for (const { name, source } of cases) {
    await t.test(name, () => {
      const result = transformSource(source, "unsupported-host.ts");

      assert.equal(result.text, source);
      assert.equal(result.rewrites, 0);
      assert.ok(result.manual.length > 0, "the shape must be reported for a human");
    });
  }
});

/**
 * P1-2, every shape the round-2 review found: a name that is BOTH imported
 * from a Comvi entry and declared locally is refused for the whole module and
 * reported. The `localDeclarations()` guard existed for the host RENAME only,
 * so these call-site families rewrote against the wrong binding and exited 0.
 */
test("a shadowed host or hook binding is refused at every call-site family", async (t) => {
  const cases = [
    {
      name: "createI18n shadowed by a function parameter, with chain-eligible options",
      source: `import { createI18n } from "@comvi/core";

export function wrapper(createI18n) {
  return createI18n({ exposeGlobal: true });
}

export const real = createI18n({ locale: "en" });
`,
      shape: "shadowed-host-binding",
    },
    {
      name: "createI18n shadowed by a local const inside a function",
      source: `import { createI18n } from "@comvi/core";

export function make() {
  const createI18n = (options) => options;
  return createI18n({ exposeGlobal: true });
}
`,
      shape: "shadowed-host-binding",
    },
    {
      name: "createI18n shadowed by a TYPED parameter",
      source: `import { createI18n } from "@comvi/core";

export function make(createI18n: (options: unknown) => unknown) {
  return createI18n({ instanceId: "app" });
}
`,
      shape: "shadowed-host-binding",
    },
    {
      name: "new I18n(param) on a shadowed class binding",
      source: `import { I18n } from "@comvi/core";

export function make(I18n) {
  return new I18n({ instanceId: "app" });
}
`,
      shape: "shadowed-host-binding",
    },
    {
      name: ".use(FetchLoader(o)) on a shadowed host",
      source: `import { createI18n } from "@comvi/react";
import { FetchLoader } from "@comvi/plugin-fetch-loader";

export function make(createI18n) {
  return createI18n({ locale: "en" }).use(FetchLoader({ cdnUrl: "/x" }));
}
`,
      shape: "shadowed-host-binding",
    },
    {
      name: "createSlimI18n shadowed WITH chain-eligible options",
      source: `import { createSlimI18n } from "@comvi/next/client";

export function preview(createSlimI18n) {
  return createSlimI18n({ locale: "de", exposeGlobal: true });
}
`,
      shape: "shadowed-host-binding",
    },
    {
      name: "useI18n shadowed by a function parameter",
      source: `import { useI18n } from "@comvi/react";

export function render(useI18n) {
  const { reloadTranslations } = useI18n();
  return reloadTranslations;
}
`,
      shape: "shadowed-hook-source",
    },
    {
      name: "useI18n shadowed by a catch parameter",
      source: `import { useI18n } from "@comvi/react";

export function render() {
  try {
    return null;
  } catch (useI18n) {
    const { reloadTranslations } = useI18n();
    return reloadTranslations;
  }
}
`,
      shape: "shadowed-hook-source",
    },
  ];

  for (const { name, source, shape } of cases) {
    await t.test(name, () => {
      const result = transformSource(source, "shadowed.ts");

      assert.equal(result.text, source, "a shadowed binding must come back byte-identical");
      assert.equal(result.rewrites, 0);
      assert.ok(
        result.manual.some((item) => item.shape === shape),
        `expected a ${shape} action, got ${JSON.stringify(result.manual)}`,
      );
      for (const item of result.manual) {
        assert.ok(Number.isInteger(item.line) && item.line > 0, "every action names a line");
        assert.ok(Number.isInteger(item.column) && item.column > 0, "every action names a column");
      }
    });
  }
});

test("transformed TypeScript goldens compile", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-tsc-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // Only the goldens the codemod actually REWROTE: the report-only fixtures
  // keep their unmigrated shape on purpose, and TypeScript rejecting that
  // shape is the point of reporting it.
  const tsGoldens = inputs.filter((name) => /\.(ts|tsx)$/.test(name) && isRewritten(name));
  assert.deepEqual(
    tsGoldens.map(caseNameOf).sort(),
    [
      "chain-icu-order",
      "chain-plugin-host",
      "chain-plugin-installers",
      "ctor-devtools-options",
      "ctor-icu-compiler",
      "ctor-nested-catalog",
      "ctor-type-only-import",
      "hook-block-scoped",
      "hook-export-split",
      "hook-nospace-keyword",
      "hook-quoted-key",
      "hook-type-position-param",
      "slim-factory-rename",
      "slim-specifier",
      "t1-pure-loader",
      "t2-pure-plugins",
      "t3-mixed",
      "t4-aliased",
      "t5-repeated",
    ],
    "every rewritten TypeScript golden must reach the tsc gate",
  );

  writeStandIns(dir);
  for (const input of tsGoldens) {
    fs.copyFileSync(expectedOf(input), path.join(dir, input.replace(".input.", ".")));
  }
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          types: [],
          // The stand-ins below ARE `@comvi/*` for this compilation: the gate
          // asserts the EMITTED code type-checks (installer arity, alias
          // bindings, no leftover members), not that the workspace resolves.
          paths: { "@comvi/*": ["./comvi/*"] },
        },
        include: ["**/*.ts", "**/*.tsx"],
      },
      null,
      2,
    ),
  );

  try {
    execFileSync(process.execPath, [tscBin(), "--noEmit", "-p", dir], { stdio: "pipe" });
  } catch (error) {
    // tsc writes diagnostics to stdout; execFileSync only puts stderr in
    // `error.message`, so without this a red run says nothing but "Command failed".
    assert.fail(`the transformed goldens do not type-check:\n${error.stdout}`);
  }
});

/**
 * A local stand-in for the published surface: the base host and its `.with(…)`
 * installers, the capability hooks, the three uppercase plugin factories and
 * their lowercase installers. Deliberately does NOT declare `process` or any
 * DOM global (`types: []`), so a golden can only reference what it imports.
 */
function writeStandIns(dir) {
  const files = {
    "comvi/api.ts": `export interface MessageCompiler {
  readonly cid: number;
}
export interface I18nPlugin {
  (host: unknown): void | (() => void);
}
export interface HostOptions {
  locale: string;
  translation?: Record<string, Record<string, string>>;
  compiler?: MessageCompiler;
  exposeGlobal?: boolean;
  instanceId?: string;
}
export interface Host {
  readonly locale: string;
  t: (key: string, params?: Record<string, unknown>) => string;
  with<R>(installer: (host: this) => R): R;
}
export interface LoaderApi {
  reloadTranslations: (locale?: string, ns?: string) => Promise<void>;
}
export interface PluginApi {
  use(plugin: I18nPlugin): this;
}
export declare function createI18n(options: HostOptions): Host;
export declare const I18n: new (options: HostOptions) => Host;
export declare function flattenCatalog(catalog: Record<string, unknown>): Record<string, string>;
export declare const icuCompiler: MessageCompiler;
export declare function icu(compiler?: MessageCompiler): <T extends Host>(host: T) => T;
export declare function loader(
  importMap?: Record<string, () => Promise<unknown>>,
): <T extends Host>(host: T) => T & LoaderApi;
export declare function plugins(): <T extends Host>(host: T) => T & PluginApi;
export interface DevtoolsOptions {
  instanceId?: string;
  exposeGlobal?: boolean;
}
export declare function devtools(options?: DevtoolsOptions): <T extends Host>(host: T) => T;
export declare const FetchLoader: (options: { cdnUrl: string }) => I18nPlugin;
export declare function fetchLoader(options: {
  cdnUrl: string;
}): <T extends Host>(host: T) => T & LoaderApi & PluginApi;
export declare const LocaleDetector: (options?: { order?: string[] }) => I18nPlugin;
export declare function localeDetector(options?: {
  order?: string[];
}): <T extends Host>(host: T) => T & PluginApi;
export declare const InContextEditorPlugin: (options?: { apiKey?: string }) => I18nPlugin;
export declare function inContextEditor(options?: {
  apiKey?: string;
}): <T extends Host>(host: T) => T & PluginApi;
`,
    "comvi/core.ts": `export { createI18n, flattenCatalog, I18n } from "./api";
export type * from "./api";
`,
    "comvi/core/plugins.ts": `export { plugins } from "../api";
`,
    "comvi/core/devtools.ts": `export { devtools } from "../api";
export type { DevtoolsOptions } from "../api";
`,
    "comvi/react.ts": `export { createI18n, devtools, flattenCatalog, I18n } from "./api";
export { icu, icuCompiler, loader, plugins } from "./api";
export type * from "./api";

export interface UseI18nReturn {
  t: (key: string) => string;
  locale: string;
}
export interface UseI18nLoaderReturn {
  addActiveNamespace: (ns: string) => Promise<void>;
  addActiveNamespaces: (ns: string[]) => Promise<void>;
  reloadTranslations: (locale?: string, ns?: string) => Promise<void>;
  onLoadError: (cb: (locale: string, ns: string, error: Error) => void) => () => void;
}
export interface UseI18nPluginsReturn {
  onMissingKey: (cb: (key: string, locale: string, ns: string) => string | void) => () => void;
}
export declare function useI18n(ns?: string): UseI18nReturn;
export declare function useI18nLoader(): UseI18nLoaderReturn;
export declare function useI18nPlugins(): UseI18nPluginsReturn;
`,
    "comvi/next/client.ts": `export { createI18n, devtools, loader, plugins } from "../api";
export type * from "../api";
`,
    "comvi/next/server.ts": `export { createI18n, devtools, loader, plugins } from "../api";
export type * from "../api";
`,
    "comvi/plugin-fetch-loader.ts": `export { FetchLoader, fetchLoader } from "./api";
`,
    "comvi/plugin-locale-detector.ts": `export { LocaleDetector, localeDetector } from "./api";
`,
    "comvi/plugin-in-context-editor.ts": `export { InContextEditorPlugin, inContextEditor } from "./api";
`,
    "analytics.ts": `import type { I18nPlugin } from "./comvi/api";

export declare function Analytics(options?: { id?: number }): I18nPlugin;
export declare function Metrics(): I18nPlugin;
`,
  };
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), contents);
  }
}

function tscBin() {
  const candidate = path.join(REPO_ROOT, "node_modules", "typescript", "bin", "tsc");
  if (!fs.existsSync(candidate)) throw new Error(`typescript not found at ${candidate}`);
  return candidate;
}

// One accumulating tree, run three times: the second and third runs are only
// meaningful against what the previous one left behind.
test("CLI run, rerun, then a residual manual action: exit 0, 0 rewritten, exit 2", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  fs.copyFileSync(path.join(FIXTURES, "t3-mixed.input.tsx"), path.join(dir, "a.tsx"));
  const applied = run(["*.tsx", "--report", "report.json"], dir);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(
    fs.readFileSync(path.join(dir, "a.tsx"), "utf8"),
    fs.readFileSync(expectedOf("t3-mixed.input.tsx"), "utf8"),
  );
  const report = JSON.parse(fs.readFileSync(path.join(dir, "report.json"), "utf8"));
  assert.equal(report.summary.filesChanged, 1);
  assert.equal(report.summary.manualActions, 0);

  const rerun = run(["*.tsx"], dir);
  assert.equal(rerun.status, 0);
  assert.match(rerun.stdout, /0 rewritten/);

  fs.copyFileSync(path.join(FIXTURES, "report-rest-spread.input.tsx"), path.join(dir, "b.tsx"));
  const partial = run(["*.tsx", "--report", "report.json"], dir);
  assert.equal(partial.status, 2, "manual items remaining must exit 2");
  assert.match(partial.stdout, /MANUAL .*rest spread/);
});

/**
 * The report says WHICH migrations a tree needed, not just how many edits
 * landed: a release checklist that claims "mechanical migration" has to be able
 * to name the shapes it mechanized.
 */
/** A tree covering three transform shapes across three file extensions. */
function makeShapesTree(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-shapes-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(FIXTURES, "prologue-shebang.input.mjs"), path.join(dir, "cli.mjs"));
  fs.copyFileSync(path.join(FIXTURES, "t1-pure-loader.input.tsx"), path.join(dir, "a.tsx"));
  fs.copyFileSync(path.join(FIXTURES, "ctor-nested-catalog.input.ts"), path.join(dir, "i18n.ts"));
  return dir;
}

test("the report counts every transform by shape", (t) => {
  const dir = makeShapesTree(t);

  const report = runCodemod({ patterns: ["*"], cwd: dir, write: false });

  assert.deepEqual(report.summary.transforms, {
    "capability-hook": 2,
    "devtools-options": 1,
    "nested-catalog": 2,
    "plugin-host": 1,
    "slim-specifier": 1,
  });
  assert.equal(report.summary.rewrites, 7);
});

test("the human report names the same breakdown the JSON carries", (t) => {
  const dir = makeShapesTree(t);

  const rendered = run(["*"], dir).stdout;

  assert.match(rendered, /transform {2}nested-catalog x2/);
});

test("the report is sorted by path:line", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-sort-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(FIXTURES, "report-stored-result.input.tsx"), path.join(dir, "z.tsx"));
  fs.copyFileSync(path.join(FIXTURES, "report-rest-spread.input.tsx"), path.join(dir, "a.tsx"));

  const report = runCodemod({ patterns: ["*.tsx"], cwd: dir, write: false });

  const keys = report.manual.map((item) => `${item.path}:${String(item.line).padStart(4, "0")}`);
  assert.deepEqual(keys, [...keys].sort());
  assert.ok(report.manual[0].path.endsWith("a.tsx"));
});

/**
 * The all-clear is a claim about the tree, and a tree with manual actions in it
 * is not clear. Printing both — "nothing to migrate" beside a MANUAL list — is
 * how a silent miss reads as a finished migration.
 */
test('a tree with manual actions never prints "nothing to migrate"', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-allclear-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(FIXTURES, "report-shadowed-host.input.ts"), path.join(dir, "i18n.ts"));
  fs.copyFileSync(path.join(FIXTURES, "report-computed.input.tsx"), path.join(dir, "computed.tsx"));

  const reported = run(["*.ts", "*.tsx"], dir);

  assert.equal(reported.status, 2, reported.stderr);
  assert.match(reported.stdout, /MANUAL .*shadowed-host-binding/);
  assert.match(reported.stdout, /MANUAL .*computed key/);
  assert.doesNotMatch(reported.stdout, /nothing to migrate/);
  assert.match(reported.stdout, /0 rewritten/);

  const clean = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-clean-"));
  t.after(() => fs.rmSync(clean, { recursive: true, force: true }));
  fs.writeFileSync(path.join(clean, "ok.ts"), "export const answer = 42;\n");

  const nothing = run(["*.ts"], clean);

  assert.equal(nothing.status, 0, nothing.stderr);
  assert.match(nothing.stdout, /nothing to migrate/);
});

function run(args, cwd) {
  const result = spawnSync(process.execPath, [path.join(HERE, "run.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
