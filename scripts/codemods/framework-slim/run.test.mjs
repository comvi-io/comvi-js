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
  "chain-plugin-host", // 3: unknown plugin -> `.use(definePlugin(p))`
  "ctor-icu-compiler", // 4: inline ICU catalog -> `compiler: icuCompiler`
  "ctor-devtools-options", // 5: exposeGlobal / instanceId -> `devtools({…})`
  "ctor-type-only-import", // runtime installer never merges into `import type`
  "chain-with-verb", // 6: a 0.5-pre `.with(installer)` chain -> `.use(installer)`
  "chain-with-residual", // 6: a `.with` reached through a STORED binding
  "chain-loader-attach-only", // 14: a bare `loader()` -> the bare `attachLoader`
  "stored-register-plugin", // 7: `host.use(raw)` on a proven plugin host
  "flatten-catalog-subpath", // 8: `flattenCatalog` off `@comvi/core/loader`
  "flatten-catalog-binding-root", // 8: the same, off a binding root, aliased
  // a NESTED inline catalog: byte-identical, empty report — the base host
  // flattens it, so there is no migration and nothing to report.
  "ctor-nested-catalog",
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
  // the removed ICU installer: a chain that composes it is refused whole.
  "report-icu-installer",
  // a `.with` the sweep cannot attribute to a host: reported, never rewritten.
  "report-residual-with",
  // `flattenCatalog` reached through a namespace, an `import()` or a shared
  // re-export clause: the retarget cannot rewrite any of the three.
  "report-flatten-catalog-moved",
  // the `createNextI18n(…)` result (N1): the scoped queue and the four deleted
  // delegates become `.use(nextPlugin(…))` / `.use(nextPluginLazy(…))`.
  "next-use-scoped", // 9, 10, 13: `use(plugin, { runtime, lazy, … })` and the bare queue
  "next-delegates", // 11, 12: the delegates, chained and on a stored result
  "report-next-plugin-unproven", // options / `lazy` / spreads the codemod cannot decide
  "report-next-shadowed-factory", // a shadowed `createNextI18n` refuses the module
  // F18 (Q5): `<T raw>` -> `<T skipPostProcess>`.
  "t-props-react", // bare, valued, and a nested unrelated `raw` left alone
  "t-props-solid", // same rule, solid's import source
  "report-t-props-shadowed", // a local `T` declaration refuses the module
  "report-sfc-vue-template-raw", // template markup this codemod cannot parse
  "report-sfc-svelte-template-raw", // same, svelte's template syntax
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
      "chain-loader-attach-only",
      "chain-plugin-host",
      "chain-plugin-installers",
      "chain-with-residual",
      "chain-with-verb",
      "ctor-devtools-options",
      "ctor-icu-compiler",
      "ctor-type-only-import",
      "flatten-catalog-binding-root",
      "flatten-catalog-subpath",
      "hook-block-scoped",
      "hook-export-split",
      "hook-nospace-keyword",
      "hook-quoted-key",
      "hook-type-position-param",
      "next-delegates",
      "next-use-scoped",
      "prologue-shebang",
      "sfc-svelte",
      "sfc-vue",
      "sfc-vue-compact",
      "slim-factory-rename",
      "slim-specifier",
      "stored-register-plugin",
      "t-props-react",
      "t-props-solid",
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
import definePlugin from "./definePlugin";
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
      // The helper the raw-plugin wrap needs is a BINDING like any other, so a
      // same-named import from elsewhere refuses the chain rather than
      // emitting a reference to the wrong `definePlugin`.
      name: "a `definePlugin` helper imported from another library",
      source: `import { createI18n } from "@comvi/react";
import { definePlugin } from "other-lib";
const i18n = createI18n({ locale: "en" }).use(CustomPlugin({}));
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

/**
 * The removed `icu()` installer, in the two spellings the golden fixture cannot
 * carry at once and the two that must NOT be mistaken for it.
 *
 * The core-subpath case is the one worth stating: `@comvi/core/icu` is no longer
 * in the capability table at all, so a detector that resolved the step through
 * that table would see nothing here and migrate the chain around a step that
 * does not resolve.
 */
test("a chain composing the removed icu() installer is refused and reported", async (t) => {
  const reported = [
    {
      name: "imported under its own name from a wrapper package",
      source: `import { createI18n, icu } from "@comvi/react";
const i18n = createI18n({ locale: "en" }).with(icu());
`,
      local: "icu",
    },
    {
      name: "imported from the core subpath, which the capability table no longer maps",
      source: `import { createI18n } from "@comvi/core";
import { icu } from "@comvi/core/icu";
const i18n = createI18n({ locale: "en" }).with(icu());
`,
      local: "icu",
    },
    {
      name: "aliased, so only the imported name gives it away",
      source: `import { createI18n, icu as withIcu } from "@comvi/vue";
const i18n = createI18n({ locale: "en" }).with(withIcu());
`,
      local: "withIcu",
    },
  ];
  for (const { name, source, local } of reported) {
    await t.test(name, () => {
      const result = transformSource(source, "icu.ts");

      assert.equal(result.text, source, "the chain must come back byte-identical");
      assert.equal(result.rewrites, 0);
      const items = result.manual.filter(({ shape }) => shape === "icu-installer-removed");
      assert.equal(items.length, 1, JSON.stringify(result.manual));
      assert.match(items[0].detail, new RegExp(`\\.with\\(${local}\\(…\\)\\)`));
      assert.match(items[0].detail, /compiler: icuCompiler/);
    });
  }

  const untouched = [
    {
      name: "a local icu() helper of the reader's own",
      source: `import { createI18n } from "@comvi/react";
function icu() {
  return <T,>(host: T) => host;
}
const i18n = createI18n({ locale: "en" }).with(icu());
`,
    },
    {
      name: "icu() from another library",
      source: `import { createI18n } from "@comvi/react";
import { icu } from "other-i18n";
const i18n = createI18n({ locale: "en" }).with(icu());
`,
    },
    {
      name: "icuCompiler, the export that survived",
      source: `import { createI18n, icuCompiler } from "@comvi/react";
const i18n = createI18n({ locale: "en", compiler: icuCompiler });
`,
    },
  ];
  for (const { name, source } of untouched) {
    await t.test(name, () => {
      const result = transformSource(source, "icu.ts");

      assert.deepEqual(
        result.manual.filter(({ shape }) => shape === "icu-installer-removed"),
        [],
      );
    });
  }
});

test("the `compiler` option a chain already carries silences runtime-icu-unproven", () => {
  // The installer used to be the other proof. Now the option is the only one,
  // and a host that names it must not be told to name it again.
  const source = `import { createI18n, icuCompiler, loader } from "@comvi/react";
const i18n = createI18n({ locale: "en", compiler: icuCompiler }).with(loader({ de: async () => ({}) }));
`;

  const result = transformSource(source, "compiler-named.ts");

  assert.deepEqual(result.manual, []);
});

/**
 * Nesting is NOT a migration any more: the base host flattens
 * `{ nav: { home } }` itself, at the one seam a catalog enters, whether or not
 * anything is composed onto it. The old rule wrapped every nested locale in
 * `flattenCatalog(…)`, which is now pure noise — and an advisory saying "check
 * this by hand for nested keys" is worse than noise, because there is nothing
 * to find. So the whole shape is silent: no edit, no import, no report.
 *
 * Every host entry is checked, because the hook that made nesting a capability
 * was installed by composition and the bug it left behind was host-specific.
 */
test("a nested inline catalog is silent on every host entry", async (t) => {
  const hosts = [
    ["@comvi/core", "createI18n"],
    ["@comvi/core", "I18n"],
    ["@comvi/react", "createI18n"],
    ["@comvi/vue", "createI18n"],
    ["@comvi/next/server", "createI18n"],
  ];
  for (const [module, factory] of hosts) {
    await t.test(`${factory} from ${module}`, () => {
      const construct = factory === "I18n" ? `new ${factory}` : factory;
      const source = `import { ${factory} } from "${module}";
export const i18n = ${construct}({
  locale: "en",
  translation: { en: { nav: { home: "Home" } }, "en:footer": { legal: { imprint: "I" } } },
});
`;

      const result = transformSource(source, "nested.ts");

      assert.equal(result.text, source, "a nested catalog must come back byte-identical");
      assert.equal(result.rewrites, 0);
      assert.deepEqual(result.manual, []);
    });
  }
});

/**
 * The catalogs the codemod CANNOT read still get an advisory, and it must not
 * send the reader looking for nesting: whatever shape the runtime value turns
 * out to be, the host flattens it. ICU is the one thing left to check by hand.
 */
test("an unreadable catalog is flagged for ICU only, never for nesting", () => {
  const source = `import { createI18n } from "@comvi/core";
import catalogs from "./catalogs.json";
export const i18n = createI18n({ locale: "en", translation: catalogs });
`;

  const details = transformSource(source, "opaque.ts").manual.map(({ detail }) => detail);

  assert.deepEqual(details, [
    "`translation` is not an inline catalog — check it by hand for ICU comma syntax",
  ]);
});

/**
 * `{ en }` is ordinary JavaScript, legal wherever an object literal is, and the
 * ICU scan used to read `.kind()` off a property that has no value node. So
 * `createI18n({ locale: "en", translation: { en } })` did not get a worse
 * migration — it CRASHED the tool, and a 0.4 app written that way could not run
 * the codemod at all. The migration the rest of the file earns has to land.
 */
test("a shorthand catalog property migrates the file instead of crashing", () => {
  const source = `import { createSlimI18n } from "@comvi/react/slim";
import en from "./en.json";
export const i18n = createSlimI18n({ locale: "en", translation: { en } });
`;

  const result = transformSource(source, "shorthand-catalog.ts");

  assert.equal(
    result.text,
    `import { createI18n } from "@comvi/react";
import en from "./en.json";
export const i18n = createI18n({ locale: "en", translation: { en } });
`,
  );
  assert.deepEqual(Object.fromEntries(result.transforms), {
    "slim-factory-rename": 2,
    "slim-specifier": 1,
  });
  // Not silence either: the leaves are somewhere the codemod cannot follow, so
  // the ICU it cannot prove is the reader's to check — the same advisory
  // `translation: en` has always earned, named after the locale it is about.
  assert.deepEqual(
    result.manual.map(({ shape, detail }) => ({ shape, detail })),
    [
      {
        shape: "opaque-host-options",
        detail: "`en` is not an inline catalog — check it by hand for ICU comma syntax",
      },
    ],
  );
});

/**
 * "No ICU found" and "no ICU provable" are not the same fact, and every locale
 * value the scan cannot read produces the second one — the shorthand is only
 * the spelling that used to throw. The advisory names the key AS WRITTEN, which
 * for a `"locale:ns"` key means the quotes stay on.
 */
test("every unreadable locale value earns the cannot-prove-ICU advisory", async (t) => {
  const unreadable = [
    ["shorthand", "{ en, de: { a: \\`b\\` } }", "`en`"],
    ["a binding", '{ en: catalog, de: { a: "b" } }', "`en`"],
    ["a call", '{ en: load(), de: { a: "b" } }', "`en`"],
    ["a namespaced key", '{ "en:footer": catalog, de: { a: "b" } }', '`"en:footer"`'],
  ];
  for (const [label, translation, named] of unreadable) {
    await t.test(label, () => {
      const source = `import { createI18n } from "@comvi/core";
export const i18n = createI18n({ locale: "en", translation: ${translation} });
`;

      const result = transformSource(source, "unreadable.ts");

      assert.equal(result.text, source, "an unreadable locale is never rewritten");
      assert.deepEqual(
        result.manual.map(({ shape, detail }) => ({ shape, detail })),
        [
          {
            shape: "opaque-host-options",
            detail: `${named} is not an inline catalog — check it by hand for ICU comma syntax`,
          },
        ],
      );
    });
  }
});

/**
 * The unreadable half must not cost the readable one its migration: ICU proven
 * anywhere in the catalog names the compiler, and the compiler then serves every
 * catalog this host ingests — including the locale the codemod could not read.
 * So that locale gets the rewrite, not an advisory telling it to do this by hand.
 */
test("a shorthand locale does not stop the readable half proving ICU", () => {
  const source = `import { createI18n } from "@comvi/core";
import de from "./de.json";
export const i18n = createI18n({
  locale: "en",
  translation: { en: { n: "{count, plural, one {#} other {#}}" }, de },
});
`;

  const result = transformSource(source, "shorthand-beside-icu.ts");

  assert.equal(
    result.text,
    `import { createI18n } from "@comvi/core";
import { icuCompiler } from "@comvi/core/icu";
import de from "./de.json";
export const i18n = createI18n({
  locale: "en",
  translation: { en: { n: "{count, plural, one {#} other {#}}" }, de },
  compiler: icuCompiler,
});
`,
  );
  assert.deepEqual(result.manual, []);
});

/**
 * The other two options positions a shorthand reaches. `translation` itself has
 * always been read through `?.value?.kind()`, so it already fell through to the
 * unreadable-catalog advisory; `instanceId` is read for its MEMBER text, which
 * is why the shorthand moves into `devtools({ instanceId })` verbatim. Both are
 * pinned here so a future reader of `objectProperties` cannot quietly break
 * them the way the ICU scan was broken.
 */
test("a shorthand option is handled in every other options position", async (t) => {
  await t.test("translation", () => {
    const source = `import { createI18n } from "@comvi/core";
const translation = { en: { a: "b" } };
export const i18n = createI18n({ locale: "en", translation });
`;

    const result = transformSource(source, "shorthand-translation.ts");

    assert.equal(result.text, source);
    assert.deepEqual(
      result.manual.map(({ detail }) => detail),
      ["`translation` is not an inline catalog — check it by hand for ICU comma syntax"],
    );
  });

  await t.test("instanceId", () => {
    const source = `import { createI18n } from "@comvi/core";
const instanceId = "app";
export const i18n = createI18n({ locale: "en", instanceId });
`;

    const result = transformSource(source, "shorthand-devtools.ts");

    assert.equal(
      result.text,
      `import { createI18n } from "@comvi/core";
import { devtools } from "@comvi/core/devtools";
const instanceId = "app";
export const i18n = createI18n({ locale: "en" }).use(devtools({ instanceId }));
`,
    );
    assert.deepEqual(result.manual, []);
  });
});

/**
 * `flattenCatalog` itself did not change; only the entry that publishes it did.
 * So the retarget is an IMPORT rewrite and nothing else — the call site is not
 * even read — and it has to reach every 0.4 spelling of the old home.
 */
test("a flattenCatalog import is retargeted from every entry that dropped it", async (t) => {
  const dropped = [
    "@comvi/core/loader",
    "@comvi/react",
    "@comvi/solid",
    "@comvi/svelte",
    "@comvi/vue",
    "@comvi/next/client",
    "@comvi/next/server",
  ];
  for (const module of dropped) {
    await t.test(module, () => {
      const source = `import { flattenCatalog } from "${module}";
export const flat = flattenCatalog({ nav: { home: "Home" } });
`;

      const result = transformSource(source, "flatten.ts");

      assert.equal(
        result.text,
        `import { flattenCatalog } from "@comvi/core";
export const flat = flattenCatalog({ nav: { home: "Home" } });
`,
      );
      assert.deepEqual(result.manual, []);
      assert.deepEqual(Object.fromEntries(result.transforms), { "flatten-catalog-source": 1 });
    });
  }
});

/**
 * `@comvi/next` (the ROOT) never re-exported the flattener, and neither does
 * anyone's own barrel file. Retargeting an import the codemod cannot vouch for
 * would point it at a module that may not have the name either.
 */
test("an entry that never published flattenCatalog is left alone", async (t) => {
  for (const module of ["@comvi/next", "@comvi/core", "./i18n/barrel"]) {
    await t.test(module, () => {
      const source = `import { flattenCatalog } from "${module}";
export const flat = flattenCatalog({ nav: { home: "Home" } });
`;

      const result = transformSource(source, "flatten.ts");

      assert.equal(result.text, source);
      assert.deepEqual(result.manual, []);
    });
  }
});

/**
 * A clause the flattener SHARES is split, not dragged: `createI18n` still comes
 * from the binding root. Two shapes have to survive that split — a default
 * import, whose braces must not be left empty, and an alias, which is the
 * user's own name at every call site.
 */
test("a shared import clause is split and the surrounding bindings keep their module", () => {
  const source = `import host, { createI18n, flattenCatalog as flat } from "@comvi/vue";
import { loader } from "@comvi/core/loader";
export const catalog = flat({ a: { b: "c" } });
export const i18n = createI18n({ locale: "en", translation: { en: { a: "b" } } });
export const parts = [host, loader];
`;

  const result = transformSource(source, "shared.ts");

  assert.equal(
    result.text,
    `import host, { createI18n } from "@comvi/vue";
import { loader } from "@comvi/core/loader";
import { flattenCatalog as flat } from "@comvi/core";
export const catalog = flat({ a: { b: "c" } });
export const i18n = createI18n({ locale: "en", translation: { en: { a: "b" } } });
export const parts = [host, loader];
`,
  );
  assert.deepEqual(result.manual, []);
});

test("the sole name in a clause beside a default import leaves no empty braces", () => {
  const source = `import host, { flattenCatalog } from "@comvi/svelte";
export const parts = [host, flattenCatalog({ a: { b: "c" } })];
`;

  const result = transformSource(source, "default-plus-named.ts");

  assert.equal(
    result.text,
    `import host from "@comvi/svelte";
import { flattenCatalog } from "@comvi/core";
export const parts = [host, flattenCatalog({ a: { b: "c" } })];
`,
  );
});

/**
 * A `/slim` entry that also names the flattener has ONE right answer, and both
 * rules want the same string. Planning the retarget first — and letting it
 * claim the declaration — is what keeps this from being either an overlapping
 * edit (a thrown codemod) or a two-pass convergence.
 */
test("a /slim entry naming flattenCatalog converges in one pass", () => {
  const source = `import { flattenCatalog } from "@comvi/react/slim";
import { createSlimI18n } from "@comvi/react/slim";
export const i18n = createSlimI18n({ locale: "en", translation: { en: flattenCatalog({}) } });
`;

  const result = transformSource(source, "slim-flatten.ts");

  assert.equal(
    result.text,
    `import { flattenCatalog } from "@comvi/core";
import { createI18n } from "@comvi/react";
export const i18n = createI18n({ locale: "en", translation: { en: flattenCatalog({}) } });
`,
  );
  const again = transformSource(result.text, "slim-flatten.ts");
  assert.equal(again.text, result.text, "one pass must be enough");
  assert.equal(again.rewrites, 0);
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
      "chain-loader-attach-only",
      "chain-plugin-host",
      "chain-plugin-installers",
      "chain-with-residual",
      "chain-with-verb",
      "ctor-devtools-options",
      "ctor-icu-compiler",
      "ctor-type-only-import",
      "flatten-catalog-binding-root",
      "flatten-catalog-subpath",
      "hook-block-scoped",
      "hook-export-split",
      "hook-nospace-keyword",
      "hook-quoted-key",
      "hook-type-position-param",
      "next-delegates",
      "next-use-scoped",
      "slim-factory-rename",
      "slim-specifier",
      "stored-register-plugin",
      "t-props-react",
      "t-props-solid",
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
          paths: {
            "@comvi/*": ["./comvi/*"],
            "react/jsx-runtime": ["./react/jsx-runtime"],
          },
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
 * A local stand-in for the published surface: the base host and its `.use(…)`
 * installers, the capability hooks, the three uppercase plugin factories and
 * their lowercase installers. Deliberately does NOT declare `process` or any
 * DOM global (`types: []`), so a golden can only reference what it imports.
 *
 * `use` is the ONE composition verb here, as on the real host, and the raw
 * plugin queue is `registerPlugin` — so a golden that still emitted `.with(` or
 * queued a plugin through `use` fails to compile instead of passing the gate.
 *
 * `flattenCatalog` is on the core ROOT and NOWHERE else, for the same reason: a
 * golden that left the specifier pointing at `@comvi/core/loader` or at a
 * binding root has to fail here, not resolve by accident.
 */
function writeStandIns(dir) {
  const files = {
    "comvi/api.ts": `export interface MessageCompiler {
  readonly cid: number;
}
export type TranslationValue = string | { [key: string]: TranslationValue };
export interface I18nPlugin {
  (host: Host): void | (() => void);
}
export interface HostOptions {
  locale: string;
  translation?: Record<string, Record<string, TranslationValue>>;
  compiler?: MessageCompiler;
  exposeGlobal?: boolean;
  instanceId?: string;
}
export interface Host {
  readonly locale: string;
  t: (key: string, params?: Record<string, unknown>) => string;
  use<R>(installer: (host: this) => R): R;
}
export interface LoaderApi {
  reloadTranslations: (locale?: string, ns?: string) => Promise<void>;
}
export interface PluginApi {
  registerPlugin(plugin: I18nPlugin, options?: Record<string, unknown>): this;
}
export declare function createI18n(options: HostOptions): Host;
export declare const I18n: new (options: HostOptions) => Host;
export declare function flattenCatalog(catalog: Record<string, unknown>): Record<string, string>;
export declare const icuCompiler: MessageCompiler;
export declare function loader(
  importMap: Record<string, () => Promise<unknown>>,
): <T extends Host>(host: T) => T & LoaderApi;
export declare function attachLoader<T extends Host>(host: T): T & LoaderApi;
export declare function plugins(): <T extends Host>(host: T) => T & PluginApi;
export declare function attachPlugins<T extends Host>(host: T): T & PluginApi;
export declare function definePlugin(
  plugin: I18nPlugin,
  options?: Record<string, unknown>,
): <T extends Host>(host: T) => T & PluginApi;
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
    "comvi/core/loader.ts": `export { attachLoader, loader } from "../api";
`,
    "comvi/core/plugins.ts": `export { attachPlugins, definePlugin, plugins } from "../api";
`,
    "comvi/core/devtools.ts": `export { devtools } from "../api";
export type { DevtoolsOptions } from "../api";
`,
    "comvi/react.ts": `export { createI18n, devtools, I18n } from "./api";
export { attachLoader, attachPlugins, definePlugin, icuCompiler, loader, plugins } from "./api";
export type * from "./api";

// Permissive on purpose: this stand-in only has to make \`<T raw>\` /
// \`<T skipPostProcess>\` type-check, not reproduce the real \`TProps\` union.
export declare function T(props: Record<string, unknown>): any;

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
    "comvi/next.ts": `import type { Host, I18nPlugin, LoaderApi, PluginApi } from "./api";
export { attachLoader, definePlugin, devtools, icuCompiler, loader, plugins } from "./api";
export type * from "./api";

export interface NextPluginOptions {
  runtime?: "client" | "server";
  environment?: "all" | "development" | "production";
  required?: boolean;
  timeout?: number;
}
export type NextComposedI18n = Host & LoaderApi & PluginApi;
export interface CreateNextI18nResult<C extends NextComposedI18n = NextComposedI18n> {
  readonly i18n: C;
  readonly routing: { locales: readonly string[]; defaultLocale: string };
  use<T extends C>(installer: (i18n: C) => T): CreateNextI18nResult<T>;
}
export declare function createNextI18n(options: {
  locales: readonly string[];
  defaultLocale: string;
  fallbackLocale?: string;
}): CreateNextI18nResult;
export declare function nextPlugin(
  plugin: I18nPlugin,
  options?: NextPluginOptions,
): <T extends Host>(host: T) => T & PluginApi;
export declare function nextPluginLazy(
  load: () => Promise<I18nPlugin | { default: I18nPlugin }>,
  options?: NextPluginOptions,
): <T extends Host>(host: T) => T & PluginApi;
`,
    // Solid's `T` only, for the same reason react's exists above: proving
    // the JSX attribute rename type-checks, not the real solid surface.
    "comvi/solid.ts": `export declare function T(props: Record<string, unknown>): any;
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
    // Minimal automatic-runtime + global \`JSX\` namespace, permissive on
    // purpose: the \`t-props-*\` goldens are the first ones with REAL JSX in
    // them, and this gate only needs the \`raw\`/\`skipPostProcess\` attribute
    // rename to type-check — not real React or Solid intrinsic-element typing.
    "react/jsx-runtime.ts": `export declare function jsx(type: any, props: any, key?: any): any;
export declare function jsxs(type: any, props: any, key?: any): any;
export declare function Fragment(props: any): any;
declare global {
  namespace JSX {
    interface Element {}
    interface IntrinsicElements {
      [elemName: string]: any;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
  }
}
`,
    "analytics.ts": `import type { Host, I18nPlugin } from "./comvi/api";

export declare function Analytics(options?: { id?: number }): I18nPlugin;
export declare function Metrics(): I18nPlugin;
export declare function wrapMetrics(): <T extends Host>(host: T) => T;
export declare const vendor: { Metrics: () => I18nPlugin };
export declare const VendorPlugin: new () => I18nPlugin;
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
  fs.copyFileSync(
    path.join(FIXTURES, "flatten-catalog-subpath.input.ts"),
    path.join(dir, "i18n.ts"),
  );
  return dir;
}

test("the report counts every transform by shape", (t) => {
  const dir = makeShapesTree(t);

  const report = runCodemod({ patterns: ["*"], cwd: dir, write: false });

  assert.deepEqual(report.summary.transforms, {
    "capability-hook": 2,
    "devtools-options": 1,
    "flatten-catalog-source": 1,
    "raw-plugin-helper": 1,
    "slim-specifier": 1,
  });
  assert.equal(report.summary.rewrites, 6);
});

test("the human report names the same breakdown the JSON carries", (t) => {
  const dir = makeShapesTree(t);

  const rendered = run(["*"], dir).stdout;

  assert.match(rendered, /transform {2}flatten-catalog-source x1/);
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

/**
 * A tree that still calls a DELETED method may not be certified clean.
 *
 * This is the sentence the residual sweep exists to stop printing. `.with` was
 * handled only inside a chain rooted at `createI18n(…)`, so one reached through
 * a stored binding survived and the tool announced "nothing to migrate — this
 * tree is already on the 0.5.0 surface" over it.
 */
test("a surviving `.with` is never certified: rewritten where provable, reported where not", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-codemod-residual-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.copyFileSync(path.join(FIXTURES, "chain-with-residual.input.ts"), path.join(dir, "i18n.ts"));

  const rewritten = run(["*.ts"], dir);

  assert.equal(rewritten.status, 0, rewritten.stderr);
  assert.match(rewritten.stdout, /use-verb-rename x3/);
  assert.doesNotMatch(rewritten.stdout, /nothing to migrate/);
  const code = fs
    .readFileSync(path.join(dir, "i18n.ts"), "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("//"))
    .join("\n");
  assert.doesNotMatch(code, /\.with\(/);
  // The residual sweep carries the bare-`loader()` rewrite too: the receiver is
  // proven, so leaving the call would rename the verb around an argument the
  // required map deleted.
  assert.match(code, /i18n\.use\(attachLoader\)/);
  assert.match(code, /withLoader\.use\(plugins\(\)\)/);
  assert.match(code, /withPlugins\.use\(wrapMetrics\(\)\)/);

  fs.copyFileSync(path.join(FIXTURES, "report-residual-with.input.ts"), path.join(dir, "other.ts"));
  const reported = run(["other.ts"], dir);

  assert.equal(reported.status, 2, reported.stderr);
  assert.match(reported.stdout, /MANUAL .*residual-with-verb/);
  assert.doesNotMatch(reported.stdout, /nothing to migrate/);
  // The Temporal and Array lines in the same fixture contribute nothing: one
  // installer-shaped `.with` is the whole report.
  assert.equal(reported.stdout.match(/residual-with-verb/g).length, 1);

  // And the all-clear becomes reachable again only once that call is gone.
  fs.writeFileSync(
    path.join(dir, "other.ts"),
    fs
      .readFileSync(path.join(dir, "other.ts"), "utf8")
      .replace("getHost().with(loader())", "getHost().use(loader({}))"),
  );
  const cleared = run(["other.ts"], dir);

  assert.equal(cleared.status, 0, cleared.stderr);
  assert.match(cleared.stdout, /nothing to migrate/);
});

/**
 * `with` is not a Comvi word. Temporal's `Temporal.PlainDate.prototype.with`
 * and `Array.prototype.with` are real, shipped APIs, and the retired verb only
 * ever took a CALL or a bare `attach*` reference — so an object literal or a
 * number in the slot means the receiver is somebody else's and the codemod owes
 * the reader silence, not a manual item for a verb they never wrote.
 */
test("Temporal and Array `.with` are silent, while the real chain in the same file migrates", () => {
  const source = `import { createI18n, loader } from "@comvi/react";

declare const date: { with: (fields: { month: number }) => unknown };
declare const locales: string[];

export const i18n = createI18n({ locale: "en" });
export const composed = i18n.with(loader());

export const shifted = date.with({ month: 2 });
export const swapped = locales.with(0, "en");
`;

  const result = transformSource(source, "temporal.ts");

  assert.match(result.text, /export const composed = i18n\.use\(attachLoader\);/);
  assert.match(result.text, /import \{ createI18n, attachLoader \} from "@comvi\/react";/);
  assert.match(result.text, /date\.with\(\{ month: 2 \}\)/);
  assert.match(result.text, /locales\.with\(0, "en"\)/);
  assert.deepEqual(result.manual, []);
  assert.equal(result.rewrites, 2);
});

/**
 * The other side of that line: an INSTALLER-SHAPED argument on a receiver the
 * codemod cannot see through stays a manual item, because `getHost()` may well
 * be returning a 0.5-pre host.
 */
test("an installer-shaped `.with` on an unprovable receiver is still reported", () => {
  const source = `import { attachLoader, loader } from "@comvi/react";

declare const getHost: () => { with: <R>(f: (host: unknown) => R) => R };

export const viaCall = getHost().with(loader());
export const bare = getHost().with(attachLoader);
`;

  const result = transformSource(source, "unprovable.ts");

  assert.equal(result.text, source, "an unprovable receiver is never rewritten");
  assert.deepEqual(
    result.manual.map((item) => item.shape),
    // The bare `loader()` on the unprovable receiver earns BOTH: the verb no
    // 0.5.0 host has, and the call the required map deleted.
    ["residual-with-verb", "loader-map-unproven", "residual-with-verb"],
  );
});

/**
 * The refusal message is about ONE chain, because that is the unit the planner
 * refuses. Saying "the chains in this file are left untouched" was false
 * exactly when it mattered: one chain rewritten, another refused, and the
 * report telling the reader to go and look at work that was already done.
 */
test("a collision refuses only its own chain, and the message says so", () => {
  const source = `import { createI18n, icuCompiler } from "@comvi/react";
import { Analytics } from "./analytics";

function definePlugin() {
  return Analytics();
}

export const refused = createI18n({ locale: "en" }).use(Analytics());

export const migrated = createI18n({
  locale: "en",
  translation: { en: { cart: "{count, plural, one {# item} other {# items}}" } },
});

export { definePlugin, icuCompiler };
`;

  const result = transformSource(source, "collision.ts");

  // The second chain really was migrated: the compiler option landed.
  assert.match(result.text, /compiler: icuCompiler/);
  assert.equal(result.text.includes("definePlugin(Analytics())"), false);
  const collision = result.manual.find((item) => item.shape === "local-name-collision");
  assert.ok(collision, JSON.stringify(result.manual));
  assert.match(collision.detail, /THIS `createI18n\(…\)` chain is left untouched/);
  assert.doesNotMatch(collision.detail, /chains in this file are left untouched/);
});

/**
 * `.use(x())` on a STORED host reads differently before and after decision E,
 * and the discriminator is the same one a chained `.use` uses. Renaming
 * whatever `installedBy` could not PLACE turned the reader's own installer into
 * a `registerPlugin` that throws `E_PLUGIN_INIT_RETURN` at `init()`.
 */
test("a stored host renames only a PROVABLE raw plugin, and flags the rest", () => {
  const source = `import { createI18n } from "@comvi/core";
import { plugins } from "@comvi/core/plugins";
import { Metrics, wrapMetrics } from "./analytics";

export const i18n = createI18n({ locale: "en" }).use(plugins());
i18n.use(wrapMetrics());
i18n.use(Metrics());
`;

  const result = transformSource(source, "stored.ts");

  assert.match(result.text, /i18n\.use\(wrapMetrics\(\)\);/);
  assert.match(result.text, /i18n\.registerPlugin\(Metrics\(\)\);/);
  assert.deepEqual(
    result.manual.map((item) => item.shape),
    ["raw-plugin-needs-helper"],
  );
  assert.match(result.manual[0].detail, /reads as an installer by its lowercase name/);
});

function run(args, cwd) {
  const result = spawnSync(process.execPath, [path.join(HERE, "run.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
