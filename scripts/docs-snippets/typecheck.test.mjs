import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProjects, mapPosition, titleToPath } from "./project.mjs";
import {
  EXPECT_ERROR_MISSING,
  createHostFactory,
  loadTypeScript,
  summarize,
} from "./typecheck.mjs";
import { createTypecheckContext, typecheckDocument } from "./typecheck.mjs";
import { extractFences } from "./extract.mjs";
import { lintDocument } from "./lint.mjs";
import { fileURLToPath } from "node:url";
import { writeStubSdk } from "./__fixtures__/stub-sdk.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
  assert.equal(errors(result)[0].line, 17);
  // The stub reports TS2345 on the argument; the real `@comvi/core` overloads
  // `t()` and reports TS2769 for the same mistake. Which one arrives depends on
  // the SDK under `--sdk-root`, and the behaviour under test is that the
  // narrowing HAPPENED on this page, at this fence.
  assert.match(errors(result)[0].message, /TS(2345|2769)/);
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
  // Same words as the SFC pass, which reports the same rule for the same reason.
  assert.equal(found[0].message, EXPECT_ERROR_MISSING);
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

test("a file name repeated with DIFFERENT content also splits", () => {
  // The half of the rule that was always there. Kept as its own case so the
  // split is pinned from both sides: identical content splits (below), and
  // differing content must not stop splitting.
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

test("distinct file names stay in one project, which is what makes a group a project", () => {
  const source = [
    "```ts title='src/i18n.ts'",
    "export const v = 1;",
    "```",
    "```ts title='src/app.ts'",
    "export const w = 2;",
    "```",
  ].join("\n");
  const { fences } = extractFences(source, "p.mdx");
  const { projects } = buildProjects(fences);

  assert.equal(projects.length, 1);
  assert.equal(projects[0].files.size, 2);
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

test("a url-import skip in a non-TypeScript fence is counted, so both halves report the same budget", () => {
  // `vanilla.mdx:23` is an `html` fence whose `<script type="module">` imports
  // over https. Filtering by language before counting skips made the type pass
  // print a budget one short of the lint pass's, in the same report, for the
  // same page.
  const body = [
    "```html",
    '<script type="module">',
    "  import { createI18n } from 'https://esm.sh/@comvi/core';",
    "</script>",
    "```",
  ].join("\n");
  const { file, source } = page(body);

  const typed = typecheckDocument({ file, source, context });
  const linted = lintDocument({ file, source });

  assert.deepEqual(typed.stats.skips, { "url-import": 1 });
  assert.deepEqual(typed.stats.skips, linted.stats.skips);
});

// ---------------------------------------------------------------------------
// Node globals. `types: []` excluded @types/node entirely, so an explicit
// `import "node:fs/promises"` failed with TS2591 even though the package was
// installed under the SDK root.
// ---------------------------------------------------------------------------

test("a node: import resolves when @types/node is installed under the sdk root", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-docs-node-"));
  writeStubSdk(dir);
  fs.mkdirSync(path.join(dir, "node_modules", "@types", "node"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "node_modules", "@types", "node", "package.json"),
    JSON.stringify({ name: "@types/node", version: "22.0.0", types: "index.d.ts" }),
  );
  fs.writeFileSync(
    path.join(dir, "node_modules", "@types", "node", "index.d.ts"),
    'declare module "fs/promises" { export function writeFile(p: string, d: string): Promise<void>; }\n' +
      'declare module "node:fs/promises" { export * from "fs/promises"; }\n',
  );
  const local = createTypecheckContext({ sdkRoot: dir });
  const body = [
    "```ts",
    "import { writeFile } from 'node:fs/promises';",
    "export const save = (p: string) => writeFile(p, 'x');",
    "```",
  ].join("\n");

  assert.equal(local.nodeTypes, true);
  assert.deepEqual(
    errors(
      typecheckDocument({ file: "docs/i18n/page.mdx", source: page(body).source, context: local }),
    ),
    [],
  );
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a node: module that does not exist still fails", () => {
  // The negative half: `types: ["node"]` must not make every `node:` specifier
  // resolve to something.
  const body = ["```ts", "import { nope } from 'node:nope';", "export const x = nope;", "```"].join(
    "\n",
  );

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.match(found[0].message, /TS2307/);
});

test("an sdk root with no @types/node reports it rather than failing every page", () => {
  // Naming a types package that is not installed is TS2688 on every page. The
  // context records which way it went so the report can say so.
  assert.equal(context.nodeTypes, false);
  assert.deepEqual(errors(check(["```ts", "export const a = 1;", "```"].join("\n"))), []);
});

test("a browser-flavoured fence still typechecks with the node globals present", () => {
  // @types/node redeclares setTimeout, clearTimeout and fetch. A corpus that is
  // mostly browser code must not start failing because the Node types arrived —
  // `setTimeout` returning `NodeJS.Timeout` instead of `number` is the classic
  // way that goes wrong. Run against the repo, which is the only root here with
  // a real @types/node.
  const real = createTypecheckContext({ sdkRoot: REPO_ROOT });
  const body = [
    "```ts",
    "export function schedule() {",
    "  const id = setTimeout(() => {}, 100);",
    "  clearTimeout(id);",
    "  void fetch('https://example.com').then((r) => r.text());",
    "  return document.title + String(id);",
    "}",
    "```",
  ].join("\n");

  assert.equal(real.nodeTypes, true);
  assert.deepEqual(
    errors(
      typecheckDocument({ file: "docs/i18n/page.mdx", source: page(body).source, context: real }),
    ),
    [],
  );
});

test("a TS2304 whose name an earlier fence declares is labelled as continuing it", () => {
  // Half the corpus's type errors are this one code, and the two populations
  // behind it want opposite fixes.
  const body = [
    "```ts",
    "import { createI18n } from '@comvi/core';",
    "export const i18n = createI18n({ locale: 'en' });",
    "```",
    "",
    "```ts",
    "i18n.t('hello');",
    "```",
  ].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.equal(found[0].cause, "continues-an-earlier-fence");
});

test("a TS2304 nobody declares anywhere carries no such label", () => {
  const body = ["```ts", "notDeclaredAnywhere.t('hello');", "```"].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 1);
  assert.equal(found[0].cause, undefined);
});

// ---------------------------------------------------------------------------
// expect-error on an SFC fence. The TS pass compiles no SFC, so holding one to
// an assertion it cannot evaluate made every such fence permanently red.
// ---------------------------------------------------------------------------

test("the TS pass does not claim an SFC expect-error fence compiled clean", () => {
  // It contributes zero diagnostics to a program that cannot parse it. Counting
  // it produced `expect-error-missing` on a fence sfc-check.mjs was already
  // checking correctly — an assertion with no way to pass.
  //
  // The TS fence beside it is what makes this reproduce: a project with no TS
  // fence at all is skipped before the assertion runs, so the bug only ever
  // showed on the shape the corpus actually has — an SFC anti-pattern fence in a
  // tab that also sets the host up (`packages/nuxt/README.md:433`,
  // `packages/svelte/README.md:558`).
  const body = [
    "```ts title='src/i18n.ts'",
    "export const i18n = { t: (k: string) => k };",
    "```",
    "",
    "```vue check=expect-error",
    '<script setup lang="ts">',
    "const n: number = 'not a number';",
    "</script>",
    "```",
  ].join("\n");

  assert.deepEqual(errors(check(body)), []);
});

test("the TS pass still claims a ts expect-error fence that compiled clean", () => {
  // The negative half: narrowing the rule to TS fences must not switch it off.
  const body = ["```ts check=expect-error", "export const n: number = 1;", "```"].join("\n");

  assert.deepEqual(
    errors(check(body)).map((finding) => finding.rule),
    ["typecheck/expect-error-missing"],
  );
});

// ---------------------------------------------------------------------------
// Nuxt auto-imports: globals where Nuxt is, and nowhere else.
// ---------------------------------------------------------------------------

test("a project importing @comvi/nuxt is a Nuxt project", () => {
  const source = [
    "```ts",
    "import { defineComviSetup } from '@comvi/nuxt/setup';",
    "export default defineComviSetup(() => {});",
    "```",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects[0].isNuxt, true);
});

test("a project carrying a nuxt.config.ts is a Nuxt project even with no import", () => {
  const source = [
    "```ts title='nuxt.config.ts'",
    "export default defineNuxtConfig({ modules: ['@comvi/nuxt'] });",
    "```",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects[0].isNuxt, true);
});

test("a React project in a neighbouring tab is not", () => {
  // `ssr.mdx` puts a Nuxt tab beside a Next one. A React fence that silently
  // gained `useI18n()` as a global would compile where a reader's would not.
  const source = [
    "<TabItem label='Nuxt'>",
    "```ts",
    "import { defineComviSetup } from '@comvi/nuxt/setup';",
    "export default defineComviSetup(() => {});",
    "```",
    "</TabItem>",
    "<TabItem label='React'>",
    "```tsx",
    "import { useI18n } from '@comvi/react';",
    "export const App = () => <p>{useI18n().t('hello')}</p>;",
    "```",
    "</TabItem>",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.deepEqual(
    projects.map((project) => project.isNuxt),
    [true, false],
  );
});

test("only a Nuxt project gets the auto-import shim as a compilation root", () => {
  const ts = loadTypeScript();
  const make = createHostFactory(ts, { sdkRoot, mode: "bundler" });
  const file = {
    rel: "src/a.ts",
    lang: "ts",
    content: "export const a = 1;\n",
    lines: [],
    fence: { line: 1, col: 1, check: {} },
  };

  const nuxt = make({
    id: "p0",
    pageSlug: "x",
    isNuxt: true,
    files: new Map([["src/a.ts", file]]),
  });
  const plain = make({
    id: "p1",
    pageSlug: "x",
    isNuxt: false,
    files: new Map([["src/a.ts", file]]),
  });

  assert.ok(nuxt.rootNames.some((name) => name.endsWith("/src/nuxt-shims.d.ts")));
  assert.ok(!plain.rootNames.some((name) => name.endsWith("/src/nuxt-shims.d.ts")));
  // The SFC shims stay a root of both.
  assert.ok(plain.rootNames.some((name) => name.endsWith("/src/shims.d.ts")));
});

test("the shim declares exactly the Nuxt globals the module registers — both ways", () => {
  // Bidirectional on purpose. A composable registered without a line here is a
  // fence that fails on the one symbol its page is about; a line here for a
  // composable the module no longer registers is a global the reader does not
  // have, and a fence that compiles only inside this gate. Reading only the
  // first `addImports([` block missed the server utilities entirely, which is
  // how `check=skip:nuxt-server-auto-imports` survived.
  const module = fs.readFileSync(path.join(REPO_ROOT, "packages/nuxt/src/module.ts"), "utf8");
  const registered = new Set();
  for (const block of module.matchAll(/addImports\(\[([\s\S]*?)\]\)/g)) {
    for (const entry of block[1].matchAll(/name:\s*"([^"]+)"/g)) registered.add(entry[1]);
  }
  // `addServerImportsDir` registers a DIRECTORY: every export of every file in
  // it is a global, so the directory listing is the list.
  const serverDir = module.match(/addServerImportsDir\(resolve\("\.\/([^"]+)"\)\)/)?.[1];
  assert.ok(serverDir, "the module no longer calls addServerImportsDir");
  const serverPath = path.join(REPO_ROOT, "packages/nuxt/src", serverDir);
  for (const entry of fs.readdirSync(serverPath)) {
    if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
    const source = fs.readFileSync(path.join(serverPath, entry), "utf8");
    for (const fn of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/gm)) {
      registered.add(fn[1]);
    }
  }

  const shim = fs.readFileSync(
    path.join(REPO_ROOT, "scripts/docs-snippets/fixtures/src/nuxt-shims.d.ts"),
    "utf8",
  );
  const declared = new Set(
    [...shim.matchAll(/const ([A-Za-z0-9_]+): typeof import\("@comvi\/nuxt[^"]*"\)/g)].map(
      (match) => match[1],
    ),
  );

  assert.ok(registered.size >= 12, `expected composables and server utils, got ${[...registered]}`);
  assert.deepEqual(
    [...registered].filter((name) => !declared.has(name)).sort(),
    [],
    "the Nuxt module registers a global the shim does not declare",
  );
  assert.deepEqual(
    [...declared].filter((name) => !registered.has(name)).sort(),
    [],
    "the shim declares a global the Nuxt module no longer registers",
  );
});

test("Nuxt globals are withheld when the unit also holds another framework", () => {
  // A page with no `<Tabs>` is ONE project: `ssr.mdx` puts Next, Nuxt,
  // SvelteKit and Solid fences under four `##` headings and they all land in
  // `tab:0`. A `declare global` is per program, so handing it to that unit gave
  // `useI18n()` to fourteen fences whose frameworks do not auto-import it.
  const source = [
    "```ts title='nuxt.config.ts'",
    "import type {} from '@comvi/nuxt';",
    "export default { modules: ['@comvi/nuxt'] };",
    "```",
    "",
    "```tsx title='src/Counter.tsx'",
    "export const Counter = () => <p>{String(1)}</p>;",
    "```",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects[0].isNuxt, false);
  assert.deepEqual(projects[0].nuxtRivals, ["a JSX file (src/Counter.tsx)"]);
});

test("a mixed unit reports the ambiguity rather than guessing", () => {
  const body = [
    "```ts title='nuxt.config.ts'",
    "import type {} from '@comvi/nuxt';",
    "export default { modules: ['@comvi/nuxt'] };",
    "```",
    "",
    "```tsx title='src/Counter.tsx'",
    "export const Counter = () => <p>{useI18n().t('hello')}</p>;",
    "```",
  ].join("\n");

  const found = errors(check(body));
  assert.equal(found[0].rule, "typecheck/nuxt-scope-ambiguous");
  assert.match(found[0].message, /check=group=/);
  // And the fence that borrowed the global it does not have now fails.
  assert.ok(found.some((finding) => /Cannot find name 'useI18n'/.test(finding.message)));
});

test("@comvi/vue does not count as a rival, because Nuxt is Vue", () => {
  // `api/nuxt.mdx` imports both on purpose: the module re-exports the Vue-side
  // types.
  const source = [
    "```ts title='src/i18n.ts'",
    "import type { VueI18n } from '@comvi/vue';",
    "import type {} from '@comvi/nuxt';",
    "export type H = VueI18n;",
    "```",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects[0].isNuxt, true);
  assert.equal(projects[0].nuxtRivals, null);
});

// ---------------------------------------------------------------------------
// A repeated `title=` with no `check=group=`. Map.set would overwrite; the
// second fence must get a project of its own instead of vanishing.
// ---------------------------------------------------------------------------

test("two ungrouped fences sharing a title on a tab-less page both survive", () => {
  const source = [
    "```ts title='src/i18n.ts'",
    "export const flavour = 'before' as const;",
    "```",
    "",
    "```ts title='src/i18n.ts'",
    "export const flavour = 'after' as const;",
    "```",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects.length, 2);
  assert.deepEqual(
    projects.map((project) => [...project.files.values()][0].fence.line),
    [1, 5],
  );
  assert.match([...projects[1].files.values()][0].content, /'after'/);
});

test("two ungrouped fences sharing a title inside one <TabItem> both survive", () => {
  const source = [
    "<TabItem label='Vue'>",
    "```ts title='src/i18n.ts'",
    "export const flavour = 'before' as const;",
    "```",
    "",
    "```ts title='src/i18n.ts'",
    "export const flavour = 'after' as const;",
    "```",
    "</TabItem>",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects.length, 2);
  assert.match([...projects[0].files.values()][0].content, /'before'/);
  assert.match([...projects[1].files.values()][0].content, /'after'/);
});

test("both halves of a repeated title are compiled, not just the last", () => {
  // The failure this guards is silent: a dropped fence is a fence the gate
  // reports zero findings for.
  const body = [
    "```ts title='src/i18n.ts'",
    "export const bad: number = 'first';",
    "```",
    "",
    "```ts title='src/i18n.ts'",
    "export const bad: number = 'second';",
    "```",
  ].join("\n");

  const found = errors(check(body));
  assert.equal(found.length, 2);
  assert.deepEqual(
    found.map((finding) => finding.line),
    [6, 10],
  );
});

test("two byte-identical fences sharing a title are two projects, not one", () => {
  // Splitting only on differing content collapsed them into a single file
  // mapped to the SECOND fence, so the first fence's lines belonged to no
  // project and nothing could ever be reported against them.
  const source = [
    "```ts title='src/i18n.ts'",
    "export const v = 1;",
    "```",
    "",
    "```ts title='src/i18n.ts'",
    "export const v = 1;",
    "```",
  ].join("\n");
  const { projects } = buildProjects(extractFences(source, "p.mdx").fences);

  assert.equal(projects.length, 2);
  assert.deepEqual(
    projects.map((project) => [...project.files.values()][0].fence.line),
    [1, 5],
  );
});

test("both identical fences are compiled, and each reports at its own line", () => {
  const body = [
    "```ts title='src/i18n.ts'",
    "export const bad: number = 'no';",
    "```",
    "",
    "```ts title='src/i18n.ts'",
    "export const bad: number = 'no';",
    "```",
  ].join("\n");

  const found = errors(check(body));
  assert.deepEqual(
    found.map((finding) => finding.line),
    [6, 10],
  );
});

test("a long rival list is capped so the finding stays readable", () => {
  // `ssr.mdx` names eleven. A finding whose message is a comma-separated
  // inventory is a finding people skim past.
  assert.equal(summarize(["a", "b"]), "a, b");
  assert.equal(summarize(["a", "b", "c", "d"]), "a, b, c, d");
  assert.equal(summarize(["a", "b", "c", "d", "e", "f"]), "a, b, c, d and 2 more");
});
