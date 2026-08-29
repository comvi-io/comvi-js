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
      "prologue-shebang",
      "sfc-svelte",
      "sfc-vue",
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

function run(args, cwd) {
  const result = spawnSync(process.execPath, [path.join(HERE, "run.mjs"), ...args], {
    cwd,
    encoding: "utf8",
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
