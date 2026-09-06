import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseSvelteCheckOutput,
  parseVueTscOutput,
  resolveTool,
  sfcCheckDocuments,
  toolSearchRoots,
} from "./sfc-check.mjs";
import { fileURLToPath } from "node:url";
import { writeSfcProbeSdk, writeStubSdk } from "./__fixtures__/stub-sdk.mjs";
import { EXPECT_ERROR_MISSING } from "./typecheck.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A page the way the site writes them, with the body already indented for tabs. */
function page(body) {
  return new Map([["docs/i18n/page.mdx", `---\ntitle: 'Page'\n---\n\n${body}\n`]]);
}

function probeRoot() {
  return writeSfcProbeSdk(fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-probe-")), REPO_ROOT);
}

const CWD = "/tmp/page";

test("vue-tsc's non-pretty line is parsed into file, line, column and code", () => {
  const output = ["p0/src/App.vue(12,7): error TS2339: Property 'use' does not exist."].join("\n");

  assert.deepEqual(parseVueTscOutput(output, CWD), [
    {
      file: path.join(CWD, "p0/src/App.vue"),
      line: 12,
      col: 7,
      code: 2339,
      message: "Property 'use' does not exist.",
    },
  ]);
});

test("vue-tsc's summary and progress lines are not mistaken for diagnostics", () => {
  const output = ["Found 3 errors in 2 files.", "", "Errors  Files"].join("\n");

  assert.deepEqual(parseVueTscOutput(output, CWD), []);
});

test("svelte-check's machine columns are 0-based and are corrected to 1-based", () => {
  // Everything else in the report — tsc, the extractor, the reader's editor —
  // counts columns from one. An uncorrected svelte column points one character
  // to the left of the symbol, on every svelte finding.
  const output = '1590680325583 ERROR "p0/src/App.svelte" 10:4 "Property x does not exist"';

  assert.deepEqual(parseSvelteCheckOutput(output, CWD), [
    {
      file: path.join(CWD, "p0/src/App.svelte"),
      line: 10,
      col: 5,
      code: null,
      message: "Property x does not exist",
    },
  ]);
});

test("svelte-check WARNING lines are not read as errors", () => {
  const output = '1590680325583 WARNING "p0/src/App.svelte" 10:4 "Unused export"';

  assert.deepEqual(parseSvelteCheckOutput(output, CWD), []);
});

test("a checker that is not installed is a finding, never a silent pass", () => {
  // A gate that quietly checks 649 of 769 fences is worse than one that checks
  // none, because the number at the bottom still says 769. This repo HAS
  // vue-tsc, so the branch is unreachable unless the tool is injected — and an
  // unreachable branch whose failure mode is a green run is not a branch anyone
  // should trust unobserved.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-test-"));
  writeStubSdk(dir);
  const sources = new Map([
    [
      "docs/i18n/page.mdx",
      '---\ntitle: p\n---\n\n```vue\n<script setup lang="ts">\n</script>\n```\n',
    ],
  ]);

  const result = sfcCheckDocuments({ sources, sdkRoot: dir, tools: {} });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ["typecheck/sfc-tool-missing"],
  );
  assert.match(result.findings[0].message, /vue-tsc is not installed/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the checker that IS installed produces no missing-tool finding", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-test-"));
  writeStubSdk(dir);
  const sources = new Map([
    [
      "docs/i18n/page.mdx",
      '---\ntitle: p\n---\n\n```vue\n<script setup lang="ts">\n</script>\n```\n',
    ],
  ]);

  const result = sfcCheckDocuments({ sources, sdkRoot: dir });

  assert.deepEqual(
    result.findings.filter((finding) => finding.rule === "typecheck/sfc-tool-missing"),
    [],
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a document with no SFC fences spawns no checker at all", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-test-"));
  writeStubSdk(dir);
  const sources = new Map([
    ["docs/i18n/page.mdx", "---\ntitle: p\n---\n\n```ts\nexport const a = 1;\n```\n"],
  ]);

  const result = sfcCheckDocuments({ sources, sdkRoot: dir });

  assert.deepEqual(result, { findings: [], stats: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("vue-tsc resolves from the repo even though it is not a root devDependency", () => {
  // It is a devDependency of `packages/vue`, so a plain createRequire from this
  // module misses it under pnpm's isolated layout — which is why the search
  // walks a list rather than trusting one root.
  assert.notEqual(resolveTool("vue-tsc", toolSearchRoots(process.cwd())), null);
});

test("a package that does not exist resolves to null rather than throwing", () => {
  assert.equal(resolveTool("definitely-not-installed-xyz", toolSearchRoots(process.cwd())), null);
});

// ---------------------------------------------------------------------------
// One program per project, not per page. The bug these two cover shipped: a
// single tsconfig including every project put them all in ONE vue-tsc program.
// ---------------------------------------------------------------------------

const AUGMENTED_AND_PLAIN = [
  "<Tabs>",
  "  <TabItem label='Augmented'>",
  "  ```ts title='src/keys.d.ts'",
  "  import '@docs-probe/api';",
  "  declare module '@docs-probe/api' {",
  "    interface Registry { 'known': true }",
  "  }",
  "  ```",
  "",
  "  ```vue title='src/A.vue'",
  '  <script setup lang="ts">',
  "  import { t } from '@docs-probe/api';",
  "  import './keys';",
  "  const a = t('known');",
  "  </script>",
  "  <template><i>{{ a }}</i></template>",
  "  ```",
  "  </TabItem>",
  "  <TabItem label='Plain'>",
  "  ```vue title='src/B.vue'",
  '  <script setup lang="ts">',
  "  import { t } from '@docs-probe/api';",
  "  const b = t('anything at all');",
  "  </script>",
  "  <template><i>{{ b }}</i></template>",
  "  ```",
  "  </TabItem>",
  "</Tabs>",
].join("\n");

test("a tab that augments a shared module does not narrow the SFC in the next tab", () => {
  // Reproduced before the fix as
  // `TS2345 Argument of type '"anything at all"' is not assignable to parameter
  // of type '"known"'` on the Plain tab, which augmented nothing. That is
  // §6.1.2's corpus poisoning at page scale, and the memory driver already
  // refuses it by building one program per project.
  const dir = probeRoot();

  const result = sfcCheckDocuments({ sources: page(AUGMENTED_AND_PLAIN), sdkRoot: dir });

  assert.deepEqual(result.findings, []);
  assert.equal(result.stats[0].sfcProjects, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the augmentation still applies inside the tab that wrote it", () => {
  // The negative half: isolation must not mean the augmentation never ran.
  const body = AUGMENTED_AND_PLAIN.replace("const a = t('known');", "const a = t('not declared');");
  const dir = probeRoot();

  const result = sfcCheckDocuments({ sources: page(body), sdkRoot: dir });

  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /TS2345/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("each tab's $lib alias points into its own project", () => {
  // `Object.fromEntries` over every project emitted `@/*`, `~/*` and `$lib/*`
  // once per project and kept the LAST, so every alias import in every tab
  // resolved into the final tab's directory.
  const body = [
    "<Tabs>",
    "  <TabItem label='First'>",
    "  ```ts title='src/lib/i18n.ts'",
    "  export const flavour = 'first' as const;",
    "  ```",
    "",
    "  ```vue title='src/A.vue'",
    '  <script setup lang="ts">',
    "  import { flavour } from '$lib/i18n';",
    "  const it: 'first' = flavour;",
    "  </script>",
    "  <template><i>{{ it }}</i></template>",
    "  ```",
    "  </TabItem>",
    "  <TabItem label='Second'>",
    "  ```ts title='src/lib/i18n.ts'",
    "  export const flavour = 'second' as const;",
    "  ```",
    "",
    "  ```vue title='src/B.vue'",
    '  <script setup lang="ts">',
    "  import { flavour } from '$lib/i18n';",
    "  const it: 'second' = flavour;",
    "  </script>",
    "  <template><i>{{ it }}</i></template>",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");
  const dir = probeRoot();

  const result = sfcCheckDocuments({ sources: page(body), sdkRoot: dir });

  assert.deepEqual(result.findings, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an alias pointing at the wrong tab's file is still caught", () => {
  // The control: if the alias resolved to nothing at all, the test above would
  // pass for the wrong reason.
  const body = [
    "<Tabs>",
    "  <TabItem label='Only'>",
    "  ```ts title='src/lib/i18n.ts'",
    "  export const flavour = 'first' as const;",
    "  ```",
    "",
    "  ```vue title='src/A.vue'",
    '  <script setup lang="ts">',
    "  import { flavour } from '$lib/i18n';",
    "  const it: 'second' = flavour;",
    "  </script>",
    "  <template><i>{{ it }}</i></template>",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");
  const dir = probeRoot();

  const result = sfcCheckDocuments({ sources: page(body), sdkRoot: dir });

  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /TS2322/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// check=expect-error on an SFC fence. This is where the assertion lives, and it
// has to be evaluated here exactly once.
// ---------------------------------------------------------------------------

test("an SFC expect-error fence whose error is real reports nothing", () => {
  const body = [
    "```vue check=expect-error",
    '<script setup lang="ts">',
    "import { t } from '@docs-probe/api';",
    "const n: number = t('anything');",
    "</script>",
    "<template><i>{{ n }}</i></template>",
    "```",
  ].join("\n");
  const dir = probeRoot();

  const result = sfcCheckDocuments({ sources: page(body), sdkRoot: dir });

  assert.deepEqual(result.findings, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("an SFC expect-error fence that compiles clean is reported once, by this pass", () => {
  const body = [
    "```vue check=expect-error",
    '<script setup lang="ts">',
    "import { t } from '@docs-probe/api';",
    "const n: string = t('anything');",
    "</script>",
    "<template><i>{{ n }}</i></template>",
    "```",
  ].join("\n");
  const dir = probeRoot();

  const result = sfcCheckDocuments({ sources: page(body), sdkRoot: dir });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ["typecheck/expect-error-missing"],
  );
  assert.equal(result.findings[0].line, 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Run one SFC page and return the tsconfig written for its first project. */
function writtenTsconfig(sdkRoot, body) {
  const kept = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-cfg-"));
  sfcCheckDocuments({ sources: page(body), sdkRoot, tmpBase: kept });
  const config = JSON.parse(
    fs.readFileSync(path.join(kept, "docs_i18n_page_mdx", "p0", "tsconfig.json"), "utf8"),
  );
  fs.rmSync(kept, { recursive: true, force: true });
  return config;
}

const PLAIN_SFC = [
  "```vue title='src/A.vue'",
  '<script setup lang="ts">',
  "const a = 1;",
  "</script>",
  "<template><i>{{ a }}</i></template>",
  "```",
].join("\n");

test("the SFC tsconfig names @types/node when the sdk root has it", () => {
  // The probe root borrows the repo's `@types`, so this is the branch a real
  // run takes — and it is the branch that lets a `.vue` fence import
  // `node:fs/promises` the way the memory driver already allows.
  const dir = probeRoot();
  assert.ok(fs.existsSync(path.join(dir, "node_modules", "@types", "node")));

  assert.deepEqual(writtenTsconfig(dir, PLAIN_SFC).compilerOptions.types, ["node"]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("and omits it when the sdk root does not", () => {
  // Hardcoding `["node"]` gave every SFC project TS2688 on a root without Node
  // types — a diagnostic with no file, which `parseVueTscOutput` drops, so the
  // projects came back clean and the fences were never checked at all.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-nonode-"));
  writeSfcProbeSdk(dir, REPO_ROOT);
  fs.rmSync(path.join(dir, "node_modules", "@types"), { recursive: true, force: true });

  assert.deepEqual(writtenTsconfig(dir, PLAIN_SFC).compilerOptions.types, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a missing checker does not also claim its expect-error fences compiled clean", () => {
  // `raw` is empty because nothing ran. Reporting "it compiles clean" about a
  // fence nobody compiled stacks a second false finding on a real one.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-sfc-missing-"));
  writeStubSdk(dir);
  const body = [
    "```vue check=expect-error",
    '<script setup lang="ts">',
    "const n: number = 'no';",
    "</script>",
    "```",
  ].join("\n");

  const result = sfcCheckDocuments({ sources: page(body), sdkRoot: dir, tools: {} });

  assert.deepEqual(
    result.findings.map((finding) => finding.rule),
    ["typecheck/sfc-tool-missing"],
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("both passes report a missing expect-error in the same words", () => {
  // The same rule reported in two voices reads as two rules. Asserted on what
  // the passes EMIT rather than on their source text, so a refactor that keeps
  // the behaviour keeps the test.
  const body = [
    "```vue check=expect-error",
    '<script setup lang="ts">',
    "import { t } from '@docs-probe/api';",
    "const n: string = t('anything');",
    "</script>",
    "<template><i>{{ n }}</i></template>",
    "```",
  ].join("\n");
  const dir = probeRoot();

  const sfc = sfcCheckDocuments({ sources: page(body), sdkRoot: dir });

  assert.equal(sfc.findings[0].message, EXPECT_ERROR_MISSING);
  fs.rmSync(dir, { recursive: true, force: true });
});
