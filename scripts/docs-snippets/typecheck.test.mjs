import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProjects, mapPosition, titleToPath } from "./project.mjs";
import { createTypecheckContext, typecheckDocument } from "./typecheck.mjs";
import { extractFences } from "./extract.mjs";
import { lintDocument } from "./lint.mjs";
import { writeStubSdk } from "./__fixtures__/stub-sdk.mjs";

let sdkRoot;
let context;

before(() => {
  sdkRoot = writeStubSdk(fs.mkdtempSync(path.join(os.tmpdir(), "comvi-docs-stub-")));
  context = createTypecheckContext({ sdkRoot });
});

after(() => {
  fs.rmSync(sdkRoot, { recursive: true, force: true });
});

/** A page the way the site writes them: frontmatter, then body. */
function page(body, file = "docs/i18n/page.mdx") {
  return { file, source: `---\ntitle: 'Page'\n---\n\n${body}\n` };
}

function check(body, file = "docs/i18n/page.mdx") {
  const { source } = page(body, file);
  return typecheckDocument({ file, source, context });
}

/** Findings the gate counts, i.e. everything but the node16 advisories. */
function errors(result) {
  return result.findings.filter((finding) => !finding.advisory);
}

function at(finding) {
  return `${finding.line}:${finding.col}`;
}

// ---------------------------------------------------------------------------
// Isolation — the reason a page, not the corpus, is the unit of compilation.
// ---------------------------------------------------------------------------

test("a page that augments TranslationKeys does not narrow t() on the next page", () => {
  // core derives `PermissiveKey = keyof TranslationKeys extends never ? string
  // : never`, so ONE augmentation in a shared program turns `t(anyString)` into
  // an error for every other fence in it. Eight site fences carry one.
  const augmenting = check(
    [
      '```ts title="src/types/i18n.d.ts"',
      "import '@comvi/core';",
      "declare module '@comvi/core' {",
      "  interface TranslationKeys {",
      "    'hello': never;",
      "  }",
      "}",
      "```",
      "",
      "```ts",
      "import { createI18n } from '@comvi/core';",
      "import './types/i18n';",
      "export const greeting = createI18n({ locale: 'en' }).t('hello');",
      "```",
    ].join("\n"),
    "docs/i18n/type-safety.mdx",
  );

  const plain = check(
    [
      "```ts",
      "import { createI18n } from '@comvi/core';",
      "export const anything = createI18n({ locale: 'en' }).t('literally.any.key');",
      "```",
    ].join("\n"),
    "docs/i18n/quick-start.mdx",
  );

  assert.deepEqual(errors(augmenting), []);
  assert.deepEqual(errors(plain), []);
});

test("the same augmentation DOES narrow t() inside its own page", () => {
  // The negative half: isolation is per page, not per fence, so a key the page's
  // own augmentation does not declare must still fail on that page. Without
  // this, "isolated" could mean "the augmentation never applied at all".
  const result = check(
    [
      '```ts title="src/types/i18n.d.ts"',
      "import '@comvi/core';",
      "declare module '@comvi/core' {",
      "  interface TranslationKeys {",
      "    'hello': never;",
      "  }",
      "}",
      "```",
      "",
      "```ts",
      "import { createI18n } from '@comvi/core';",
      "import './types/i18n';",
      "export const oops = createI18n({ locale: 'en' }).t('not.declared');",
      "```",
    ].join("\n"),
  );

  assert.equal(errors(result).length, 1);
  assert.match(errors(result)[0].message, /TS2345/);
});

// ---------------------------------------------------------------------------
// Grouping — `title=` is a virtual file name, and a tab is the project it names.
// ---------------------------------------------------------------------------

test("a tab's `title=` file is the one its own fences import", () => {
  const body = [
    "<Tabs>",
    "  <TabItem label='React'>",
    "  ```ts title='src/i18n.ts'",
    "  export const flavour = 'react' as const;",
    "  ```",
    "  </TabItem>",
    "  <TabItem label='Vue'>",
    "  ```ts title='src/i18n.ts'",
    "  export const flavour = 'vue' as const;",
    "  ```",
    "",
    "  ```ts title='src/app.ts'",
    "  import { flavour } from './i18n';",
    "  export const it: 'vue' = flavour;",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

test("a tab does NOT see the file its neighbour tab titled the same", () => {
  const body = [
    "<Tabs>",
    "  <TabItem label='React'>",
    "  ```ts title='src/i18n.ts'",
    "  export const flavour = 'react' as const;",
    "  ```",
    "  </TabItem>",
    "  <TabItem label='Vue'>",
    "  ```ts title='src/i18n.ts'",
    "  export const flavour = 'vue' as const;",
    "  ```",
    "",
    "  ```ts title='src/app.ts'",
    "  import { flavour } from './i18n';",
    "  export const it: 'react' = flavour;",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /TS2322/);
});

test("check=group pools across tabs, which a bare title cannot", () => {
  const body = [
    "<Tabs>",
    "  <TabItem label='Config'>",
    "  ```ts title='src/i18n.ts' check=group=nuxt-app",
    "  export const flavour = 'nuxt' as const;",
    "  ```",
    "  </TabItem>",
    "  <TabItem label='Usage'>",
    "  ```ts title='src/app.ts' check=group=nuxt-app",
    "  import { flavour } from './i18n';",
    "  export const it: 'nuxt' = flavour;",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

// ---------------------------------------------------------------------------
// check=expect-error — the fences that document what does NOT work.
// ---------------------------------------------------------------------------

test("expect-error on a fence that fails → the failure is the assertion, not a finding", () => {
  const body = ["```ts check=expect-error", "export const n: number = 'not a number';", "```"].join(
    "\n",
  );

  assert.deepEqual(errors(check(body)), []);
});

test("expect-error on a fence that compiles → a finding on the fence", () => {
  // These are the fences that rot first under `check=skip`: nothing notices when
  // the error they promise stops happening.
  const body = ["```ts check=expect-error", "export const n: number = 1;", "```"].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "typecheck/expect-error-missing");
  assert.equal(at(found[0]), "5:1");
});

test("expect-error=TS2322 matching the reported code → clean", () => {
  const body = [
    "```ts check=expect-error=TS2322",
    "export const n: number = 'not a number';",
    "```",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

test("expect-error naming the wrong code → a finding that names both", () => {
  const body = [
    "```ts check=expect-error=TS2345",
    "export const n: number = 'not a number';",
    "```",
  ].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.equal(found[0].rule, "typecheck/expect-error-wrong-code");
  assert.match(found[0].message, /TS2345/);
  assert.match(found[0].message, /TS2322/);
});

// ---------------------------------------------------------------------------
// Skips by rule — counted categories, never silence.
// ---------------------------------------------------------------------------

test("a fence importing a competitor is skipped and counted, not compiled", () => {
  const body = [
    "```ts",
    "import { useTranslation } from 'react-i18next';",
    "export const broken: number = useTranslation();",
    "```",
  ].join("\n");

  const result = check(body);
  assert.deepEqual(errors(result), []);
  assert.deepEqual(result.stats.skips, { "foreign-import": 1 });
});

test("a fence importing over https is skipped and counted", () => {
  const body = [
    "```ts",
    "import { createI18n } from 'https://esm.sh/@comvi/core';",
    "export const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  const result = check(body);
  assert.deepEqual(errors(result), []);
  assert.deepEqual(result.stats.skips, { "url-import": 1 });
});

test("a fence importing neither is compiled", () => {
  const body = ["```ts", "export const broken: number = 'no';", "```"].join("\n");

  const result = check(body);
  assert.equal(errors(result).length, 1);
  assert.deepEqual(result.stats.skips, {});
});

// ---------------------------------------------------------------------------
// The fixture layer — what 92 fences import and no page shows.
// ---------------------------------------------------------------------------

test("a fence importing ./i18n resolves the fixture host", () => {
  const body = [
    "```ts",
    "import { i18n } from './i18n';",
    "export const hello = i18n.t('hello');",
    "```",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

test("a page that defines src/i18n.ts itself wins over the fixture", () => {
  const body = [
    "```ts title='src/i18n.ts'",
    "export const i18n = { marker: 'page-owned' as const };",
    "```",
    "",
    "```ts title='src/app.ts'",
    "import { i18n } from './i18n';",
    "export const it: 'page-owned' = i18n.marker;",
    "```",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

test("a catalog nobody wrote down is synthesised, not reported missing", () => {
  const body = [
    "```ts",
    "import de from './locales/de.admin.json';",
    "export const keys = Object.keys(de);",
    "```",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

// ---------------------------------------------------------------------------
// Diagnostic → source mapping. A finding a reader cannot jump to is not a
// finding; these are the two fence shapes the corpus actually uses.
// ---------------------------------------------------------------------------

test("a diagnostic inside a five-column-indented <Tabs> fence maps to its source line and column", () => {
  const body = [
    "<Tabs>",
    "  <TabItem label='React'>",
    "    ```ts",
    "    export const n: number = 'no';",
    "    ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  // Source line 8 is `    export const n: number = 'no';`. TypeScript blames the
  // DECLARATION NAME, and `n` sits at column 18 of that line: four columns of
  // stripped indentation plus thirteen inside the fence. A driver that reported
  // column 14 — the column inside the dedented snippet — would be off by the
  // indentation on every fence in a `<Tabs>`, which is where most of them are.
  assert.equal(at(found[0]), "8:18");
});

test("a diagnostic inside a 4-backtick fence maps to its source line", () => {
  // `pluralization.mdx` closes six 3-backtick fences with 4 backticks; a parser
  // that mishandles the length inverts every fence after the first.
  const body = ["````ts", "export const n: number = 'no';", "// ```", "````"].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.equal(at(found[0]), "6:14");
});

test("the appended module marker never appears as a source position", () => {
  // Script-shaped fences get `export {}` appended so their top-level `const`s do
  // not collide as globals. A diagnostic past the end of the fence must land on
  // the fence's opening line, not on a line the reader's file does not have.
  const body = ["```ts", "const n: number = 'no';", "```"].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 6);
});

// ---------------------------------------------------------------------------
// bundler vs node16 — the same fence, the two resolutions readers actually run.
// ---------------------------------------------------------------------------

test("an extensionless relative import is clean under bundler and advisory under node16", () => {
  const body = [
    "```ts title='src/helper.ts'",
    "export const help = 1;",
    "```",
    "",
    "```ts title='src/app.ts'",
    "import { help } from './helper';",
    "export const it = help;",
    "```",
  ].join("\n");

  const result = check(body);
  assert.deepEqual(errors(result), []);
  const advisory = result.findings.filter((finding) => finding.advisory);
  assert.equal(advisory.length, 1);
  assert.equal(advisory[0].rule, "typecheck/node16-only");
  assert.match(advisory[0].message, /TS2834|TS2835/);
});

test("an import with its extension diverges under neither", () => {
  const body = [
    "```ts title='src/helper.ts'",
    "export const help = 1;",
    "```",
    "",
    "```ts title='src/app.ts'",
    "import { help } from './helper.js';",
    "export const it = help;",
    "```",
  ].join("\n");

  const result = check(body);
  assert.deepEqual(errors(result), []);
  assert.deepEqual(
    result.findings.filter((finding) => finding.advisory),
    [],
  );
});

test("an error both resolutions see is reported once, not twice", () => {
  const body = ["```ts", "export const n: number = 'no';", "```"].join("\n");

  const result = check(body);
  assert.equal(errors(result).length, 1);
  assert.deepEqual(
    result.findings.filter((finding) => finding.advisory),
    [],
  );
});

// ---------------------------------------------------------------------------
// The SFC boundary — the type-check pass must not make an untyped SFC look fine.
// ---------------------------------------------------------------------------

test("an untyped vue SFC is still rejected upstream, by the lint pass", () => {
  // vue-tsc types nothing in a `<script>` without lang="ts", so the SFC pass
  // would report a clean page. The rejection lives in lint.mjs and this test
  // exists to keep it there: the two passes together must never let an untyped
  // SFC through as "checked".
  const body = ["```vue", "<script setup>", "const x = 1;", "</script>", "```"].join("\n");
  const { file, source } = page(body);

  const lint = lintDocument({ file, source });
  assert.deepEqual(
    lint.findings.map((finding) => finding.rule),
    ["fence/untyped-sfc"],
  );
});

test("a vue SFC marked check=js is a deliberate exception and passes the lint", () => {
  const body = ["```vue check=js", "<script setup>", "const x = 1;", "</script>", "```"].join("\n");
  const { file, source } = page(body);

  assert.deepEqual(lintDocument({ file, source }).findings, []);
});

test("vue and svelte fences are not counted as type-checked by the TS pass", () => {
  // They are written into the project so the `.ts` fences can import them, but
  // sfc-check.mjs is what checks them. Counting them here too would report every
  // SFC fence twice in one summary.
  const body = [
    "```vue",
    '<script setup lang="ts">',
    "const x = 1;",
    "</script>",
    "```",
    "",
    "```ts",
    "export const y = 1;",
    "```",
  ].join("\n");

  assert.equal(check(body).stats.checkedFences, 1);
});

// ---------------------------------------------------------------------------
// Project construction, in isolation from the compiler.
// ---------------------------------------------------------------------------

test("a title that names no file is a caption, and the fence gets a synthetic name", () => {
  const { fences } = extractFences("```ts title='Terminal'\nconst a = 1;\n```", "p.mdx");
  const { projects } = buildProjects(fences);

  assert.equal(titleToPath("Terminal"), null);
  assert.deepEqual([...projects[0].files.keys()], ["src/__snippet_1.ts"]);
});

test("a repeated file name inside one tab starts the next project", () => {
  const source = [
    "```ts title='src/i18n.ts'",
    "export const v = 1;",
    "```",
    "```ts title='src/i18n.ts'",
    "export const v = 2;",
    "```",
  ].join("\n");
  const { fences } = extractFences(source, "p.mdx");
  const { projects } = buildProjects(fences);

  assert.equal(projects.length, 2);
});

test("the same file name with the same content stays in one project", () => {
  const source = [
    "```ts title='src/i18n.ts'",
    "export const v = 1;",
    "```",
    "```ts title='src/i18n.ts'",
    "export const v = 1;",
    "```",
  ].join("\n");
  const { fences } = extractFences(source, "p.mdx");
  const { projects } = buildProjects(fences);

  assert.equal(projects.length, 1);
});

test("mapPosition subtracts an injected prelude so a pragma does not shift the report", () => {
  const file = {
    prelude: 1,
    lines: [{ srcLine: 42, srcCol: 3 }],
    fence: { line: 41, col: 1 },
  };

  assert.deepEqual(mapPosition(file, 1, 4), { line: 42, col: 7 });
});

test("a Solid project gets Solid's JSX factory, so its components are not React's", () => {
  const source = [
    "```tsx",
    "import { createSignal } from 'solid-js';",
    "export const App = () => <div>{createSignal(1)[0]()}</div>;",
    "```",
  ].join("\n");
  const { fences } = extractFences(source, "p.mdx");
  const { projects } = buildProjects(fences);
  const file = [...projects[0].files.values()][0];

  assert.match(file.content, /^\/\*\* @jsxImportSource solid-js \*\//);
  assert.equal(file.prelude, 1);
});

test("a React project gets no pragma", () => {
  const source = [
    "```tsx",
    "import { useState } from 'react';",
    "export const App = () => <div>{useState(1)[0]}</div>;",
    "```",
  ].join("\n");
  const { fences } = extractFences(source, "p.mdx");
  const { projects } = buildProjects(fences);
  const file = [...projects[0].files.values()][0];

  assert.doesNotMatch(file.content, /jsxImportSource/);
  assert.equal(file.prelude, 0);
});
