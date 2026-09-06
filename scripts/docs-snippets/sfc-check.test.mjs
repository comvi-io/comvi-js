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
import { writeStubSdk } from "./__fixtures__/stub-sdk.mjs";

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
