import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractFences,
  extractProse,
  normalizeLang,
  parseFrontmatter,
  parseMeta,
  tokenizeMeta,
} from "./extract.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "__fixtures__", "site-page.mdx");

/** The one fence a case is about, so an assertion names it instead of an index. */
function fenceTitled(fences, title) {
  const found = fences.find((fence) => fence.title === title);
  assert.ok(found, `no fence titled ${title} among ${fences.map((f) => f.title).join(", ")}`);
  return found;
}

test("a 4-backtick line closing a 3-backtick fence → closes it, and does not open a new one", () => {
  // The exact shape of pluralization.mdx, where six fences are closed by a
  // longer fence than they opened with. Read as an OPENING fence, everything
  // after this line inverts: prose becomes code and code becomes prose.
  const source = [
    "```tsx",
    "const a = 1;",
    "````",
    "",
    "Prose between.",
    "",
    "```ts",
    "const b = 2;",
    "```",
  ].join("\n");

  const { fences, errors } = extractFences(source, "page.mdx");

  assert.deepEqual(errors, []);
  assert.equal(fences.length, 2);
  assert.equal(fences[0].code, "const a = 1;");
  assert.equal(fences[1].code, "const b = 2;");
});

test("a 3-backtick line inside a 4-backtick fence → stays content, not a close", () => {
  const source = ["````md", "```ts", "const a = 1;", "```", "````"].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences.length, 1);
  assert.equal(fences[0].code, "```ts\nconst a = 1;\n```");
});

test("an unterminated fence → one error naming the opening line", () => {
  const source = ["Intro.", "```ts", "const a = 1;"].join("\n");

  const { errors } = extractFences(source, "page.mdx");

  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.match(errors[0].message, /unterminated/);
});

test("a fence indented inside <Tabs> → indentation is stripped and recorded per line", () => {
  const source = [
    "<Tabs>",
    '  <TabItem label="Vue">',
    "  ```ts",
    "  const a = 1;",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences[0].indent, 2);
  assert.equal(fences[0].code, "const a = 1;");
  assert.deepEqual(fences[0].lines[0], {
    text: "const a = 1;",
    srcLine: 4,
    srcCol: 3,
    indentStripped: 2,
  });
});

test("a fence indented five columns inside <Steps> → every code line keeps its source line", () => {
  const source = [
    "<Steps>",
    "",
    "1. **Install**",
    "",
    "     ```ts",
    "     const a = 1;",
    "     const b = 2;",
    "     ```",
    "",
    "</Steps>",
  ].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.deepEqual(
    fences[0].lines.map((line) => line.srcLine),
    [6, 7],
  );
});

test("a content line shorter than the fence indentation → strips only what is there", () => {
  const source = ["  ```ts", "  const a = 1;", "", "  const b = 2;", "  ```"].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences[0].code, "const a = 1;\n\nconst b = 2;");
});

test("an inline code span with three backticks on one line → is not a fence", () => {
  const source = "Write ```ts`` in prose and nothing opens.";

  const { fences, errors } = extractFences(source, "page.mdx");

  assert.deepEqual(fences, []);
  assert.deepEqual(errors, []);
});

test("normalizeLang on typescript → ts", () => {
  assert.equal(normalizeLang("typescript"), "ts");
  assert.equal(normalizeLang("TypeScript"), "ts");
  assert.equal(normalizeLang("javascript"), "js");
  assert.equal(normalizeLang("tsx"), "tsx");
});

test("tokenizeMeta with a quoted title containing a space → one token", () => {
  assert.deepEqual(tokenizeMeta('title="src/my file.ts" check=js'), [
    'title="src/my file.ts"',
    "check=js",
  ]);
});

test("parseMeta on a title plus every check key → the full vocabulary", () => {
  const meta =
    'title="src/i18n.ts" check=skip:competitor-example check=group=vue-app check=js check=expect-error=TS2345';

  const parsed = parseMeta(meta);

  assert.equal(parsed.title, "src/i18n.ts");
  assert.deepEqual(parsed.check, {
    skip: true,
    skipReason: "competitor-example",
    expectError: true,
    errorCode: "TS2345",
    group: "vue-app",
    js: true,
  });
  assert.deepEqual(parsed.errors, []);
});

test("parseMeta on check=skip with no reason → skip set, reason null", () => {
  const parsed = parseMeta("check=skip");

  assert.equal(parsed.check.skip, true);
  assert.equal(parsed.check.skipReason, null);
});

test("parseMeta on an unknown check key → one error naming the vocabulary", () => {
  const parsed = parseMeta("check=continues");

  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0], /unknown check "continues"/);
});

test("a line-range meta glued to the language (```ts{2}) → lang ts, meta {2}", () => {
  // Expressive Code writes its highlight range with no separating space. Ending
  // the language at whitespace alone yields the language "ts{2}", which is in no
  // language set, so the fence drops silently out of every rule.
  const source = ["```ts{2}", "const a = 1;", "const b = 2;", "```"].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences[0].lang, "ts");
  assert.equal(fences[0].meta, "{2}");
});

test("a glued range beside a title (```tsx{1-3} title=…) → both survive", () => {
  const source = ['```tsx{1-3} title="src/App.tsx"', "const a = 1;", "```"].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences[0].lang, "tsx");
  assert.equal(fences[0].title, "src/App.tsx");
});

test("fences in different <TabItem>s → different container ids", () => {
  // The container is what keeps a bare `title=` tab-local: two tabs writing
  // `src/i18n.ts` are two apps, not one file in two halves.
  const source = [
    "<Tabs>",
    '  <TabItem label="React">',
    '  ```ts title="src/i18n.ts"',
    "  const a = 1;",
    "  ```",
    "  </TabItem>",
    '  <TabItem label="Vue">',
    '  ```ts title="src/i18n.ts"',
    "  const b = 2;",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.notEqual(fences[0].container, fences[1].container);
});

test("two fences inside one <TabItem> → the same container id", () => {
  const source = [
    "<Tabs>",
    '  <TabItem label="React">',
    '  ```ts title="src/i18n.ts"',
    "  const a = 1;",
    "  ```",
    '  ```ts title="src/i18n.ts"',
    "  const b = 2;",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences[0].container, fences[1].container);
});

test("a <TabItem> written inside a fence → not a container boundary", () => {
  const source = [
    "```mdx",
    '<TabItem label="React">',
    "</TabItem>",
    "```",
    "```ts",
    "const a = 1;",
    "```",
  ].join("\n");

  const { fences } = extractFences(source, "page.mdx");

  assert.equal(fences[0].container, fences[1].container);
});

test("parseMeta on Expressive Code meta it does not own → ignored, not an error", () => {
  const parsed = parseMeta('title="src/i18n.ts" {1-3} ins={4} frame="none"');

  assert.equal(parsed.title, "src/i18n.ts");
  assert.deepEqual(parsed.errors, []);
});

test("an unknown check key in a real fence → an extractor error at the fence line", () => {
  const source = ["Intro.", "```ts check=continues", "const a = 1;", "```"].join("\n");

  const { errors } = extractFences(source, "page.mdx");

  assert.equal(errors.length, 1);
  assert.equal(errors[0].line, 2);
  assert.equal(errors[0].col, 1);
});

test("extractProse → every line outside a fence, with its source line", () => {
  const source = ["Before.", "```ts", "const a = 1;", "```", "After."].join("\n");

  const prose = extractProse(source, "page.mdx");

  assert.deepEqual(prose, [
    { text: "Before.", srcLine: 1 },
    { text: "After.", srcLine: 5 },
  ]);
});

test("parseFrontmatter on a Starlight page → the quoted values unquoted", () => {
  const source = "---\ntitle: 'Loading translations'\nverified: '@comvi/react@0.5.0'\n---\n\nBody.";

  assert.deepEqual(parseFrontmatter(source), {
    title: "Loading translations",
    verified: "@comvi/react@0.5.0",
  });
});

test("parseFrontmatter on a README with no frontmatter → an empty map", () => {
  assert.deepEqual(parseFrontmatter("# Title\n\nBody."), {});
});

test("the site-forms fixture → nine fences, no extraction errors", () => {
  const source = fs.readFileSync(FIXTURE, "utf8");

  const { fences, errors } = extractFences(source, "site-page.mdx");

  assert.deepEqual(errors, []);
  assert.equal(fences.length, 9);
});

test("the site-forms fixture → the tab closed by a 4-backtick fence keeps its own code", () => {
  const source = fs.readFileSync(FIXTURE, "utf8");

  const { fences } = extractFences(source, "site-page.mdx");

  assert.equal(
    fenceTitled(fences, "src/App.tsx").code,
    "export function App() {\n  return null;\n}",
  );
});

test("the site-forms fixture → the two src/i18n.ts fences share one title", () => {
  const source = fs.readFileSync(FIXTURE, "utf8");

  const { fences } = extractFences(source, "site-page.mdx");

  assert.equal(fences.filter((fence) => fence.title === "src/i18n.ts").length, 2);
});
