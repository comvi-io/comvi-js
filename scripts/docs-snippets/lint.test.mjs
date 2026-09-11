import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, lintDocument, stripComments, stripCommentsAndStrings } from "./lint.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "__fixtures__", "site-page.mdx");

/** A page the way the site writes them: frontmatter, then body. */
function page(
  body,
  { file = "docs/i18n/loading-translations.mdx", frontmatter = "title: 'Page'" } = {},
) {
  return { file, source: `---\n${frontmatter}\n---\n\n${body}\n` };
}

function rulesOf(body, options = {}) {
  const { file, source } = page(body, options);
  return lintDocument({ file, source, sdkVersion: options.sdkVersion }).findings.map((f) => f.rule);
}

function findingsOf(body, options = {}) {
  const { file, source } = page(body, options);
  return lintDocument({ file, source, sdkVersion: options.sdkVersion }).findings;
}

// ---------------------------------------------------------------------------
// BANNED — 0.4 API that 0.5.0 removed or rehomed (MIGRATION.md §0, §2–§5).
// ---------------------------------------------------------------------------

test("registerLoader on an instance whose chain composes nothing → banned, at the call's line and column", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.registerLoader({ uk: () => import('./uk.json') });",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/register-loader-on-instance");
  assert.equal(findings[0].line, 7);
  assert.equal(findings[0].col, 1);
  assert.equal(findings[0].migration, "MIGRATION.md §0 (loader row) and §4 `.with(installer)`");
});

test("registerLoader after .with(loader()) in the same fence → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(loader());",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("registerLoader after .with(attachLoader) in the same fence → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(attachLoader);",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("two fences sharing a title inside ONE <TabItem> → one chain, so the composition carries", () => {
  // Grouping is by `title=` / `check=group=`, never by position: a
  // `check=continues`-style rule would read the PREVIOUS fence in the file,
  // which under <Tabs> belongs to a different framework.
  const body = [
    "<Tabs>",
    '  <TabItem label="Next.js">',
    '  ```tsx title="src/other.tsx"',
    "  export const unrelated = 1;",
    "  ```",
    "  </TabItem>",
    '  <TabItem label="Vue">',
    '  ```ts title="src/i18n.ts"',
    "  export const i18n = createI18n({ locale: 'en' }).with(loader());",
    "  ```",
    '  ```ts title="src/i18n.ts"',
    "  i18n.registerLoader(myLoader);",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("two <TabItem>s writing the same title → the other tab's composition does NOT clear this one", () => {
  // `quick-start.mdx` writes `src/i18n.ts` eight times, once per framework tab.
  // Pooling on the bare title let the migrated React tab vouch for the Vue tab,
  // which is the one page in the corpus where that matters most.
  const body = [
    "<Tabs>",
    '  <TabItem label="React">',
    '  ```ts title="src/i18n.ts"',
    "  export const i18n = createI18n({ locale: 'en' }).with(loader());",
    "  ```",
    "  </TabItem>",
    '  <TabItem label="Vue">',
    '  ```ts title="src/i18n.ts"',
    "  i18n.registerLoader(myLoader);",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/register-loader-on-instance");
  assert.equal(findings[0].line, 13);
});

test("an explicit check=group crossing two <TabItem>s → still one chain", () => {
  // A bare title is tab-local; `check=group=` is the deliberate opt-in that says
  // "these fences really are one project", so it pools document-wide.
  const body = [
    "<Tabs>",
    '  <TabItem label="React">',
    "  ```ts check=group=app-host",
    "  export const i18n = createI18n({ locale: 'en' }).with(loader());",
    "  ```",
    "  </TabItem>",
    '  <TabItem label="Vue">',
    "  ```ts check=group=app-host",
    "  i18n.registerLoader(myLoader);",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("registerLoader in a fence the group does NOT reach → banned", () => {
  const body = [
    '```ts title="src/i18n.ts"',
    "export const i18n = createI18n({ locale: 'en' }).with(loader());",
    "```",
    '```ts title="src/other.ts"',
    "other.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("registerLoader with an explicit check=group shared across fences → clean", () => {
  const body = [
    "```ts check=group=app-host",
    "export const i18n = createI18n({ locale: 'en' }).with(loader());",
    "```",
    "```ts check=group=app-host",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("i18n.core.registerLoader on a wrapper whose core was never composed → banned", () => {
  // `.core` is where MIGRATION.md §2 moves the call, not proof the host can
  // serve it: `createI18n` from `@comvi/vue` wraps a BASE core, so this throws
  // exactly like the 0.4 call it replaced. D3-D5 will write `i18n.core.*` in
  // volume, and an unconditional receiver exemption would wave all of it through.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.core.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("i18n.core.registerLoader after createCore(…).with(loader()) in the chain → clean", () => {
  const body = [
    "```ts",
    "const core = createCore({ locale: 'en' }).with(loader());",
    "const i18n = createI18nFromCore(core);",
    "i18n.core.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("i18n.core.use(Plugin()) on a wrapper whose core was never composed → banned", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.core.use(FetchLoader({ apiKey }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/plugin-use-without-plugins"]);
});

test("core.registerLoader inside a nuxt hook typed with I18nLoaderApi → clean", () => {
  // MIGRATION.md §7: annotating the hook with the host the factory returns is
  // what makes a call the host cannot serve fail at type-check, so the
  // annotation is the composition evidence the fence can offer.
  const body = [
    "```ts",
    "export default (({ core }) => {",
    "  core.registerLoader(myLoader);",
    "}) satisfies NuxtI18nSetup<I18n & I18nLoaderApi>;",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("createNextI18n composing the loader inside the package → registerLoader on its host is clean", () => {
  const body = [
    "```ts",
    "export const nextI18n = createNextI18n({ locales: ['en'], defaultLocale: 'en' });",
    "nextI18n.i18n.registerLoader({ en: () => import('./en.json') });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a diff fence's removed line carrying a dead symbol → not linted", () => {
  // `packages/vue/README.md` shows the 0.4 call directly above its replacement;
  // linting the `-` line would flag the very example that teaches the fix.
  const body = [
    "```diff",
    '-import { createSlimI18n } from "@comvi/core/slim";',
    '+import { createI18n } from "@comvi/core";',
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a diff fence's ADDED line carrying a dead symbol → linted", () => {
  const body = [
    "```diff",
    '-import { createI18n } from "@comvi/core";',
    '+import { createSlimI18n } from "@comvi/core/slim";',
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/slim-entry", "banned/slim-entry"]);
});

test(".use(Plugin()) on a chain without the plugin capability → banned", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.use(FetchLoader({ apiKey }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/plugin-use-without-plugins"]);
});

test(".use(Plugin()) after .with(plugins()) → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(loader()).with(plugins());",
    "i18n.use(FetchLoader({ apiKey }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test(".use(Plugin()) after .with(attachPlugins) → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(attachPlugins);",
    "i18n.use(LocaleDetector());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("app.use(i18n) installing the Vue plugin → clean, it is not a comvi plugin registration", () => {
  const body = ["```ts", "createApp(App).use(i18n).mount('#app');", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("an installer handed to .use() instead of .with() → banned as E_INSTALLER_NESTED_USE", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(plugins());",
    "i18n.use(cdnLoader({ cdnUrl }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/installer-in-plugin-slot"]);
});

test("a slim entry import → banned, no chain can clear it", () => {
  const body = ["```ts", "import { createSlimI18n } from '@comvi/react/slim';", "```"].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/slim-entry", "banned/slim-entry"]);
});

test("allowedTags on <T> and createLanguageStore → banned, both removed in 0.5.0", () => {
  const body = [
    "```ts",
    "const store = createLanguageStore();",
    "const props = { allowedTags: ['b'] };",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/removed-svelte-api", "banned/removed-svelte-api"]);
});

test("exposeGlobal passed to the constructor with no devtools() in sight → banned at the symbol", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en', exposeGlobal: true });",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.deepEqual(
    findings.map((f) => f.rule),
    ["banned/devtools-options-on-constructor"],
  );
  // The column is the `e` of exposeGlobal, not the space before it: the rule
  // asserts its left boundary with a lookbehind instead of consuming a character.
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].col, "const i18n = createI18n({ locale: 'en', ".length + 1);
});

test("instanceId inside .with(devtools({ … })) → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(devtools({ instanceId: 'app' }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

// ---------------------------------------------------------------------------
// Acquisition evidence has to be code, not talk about code.
// ---------------------------------------------------------------------------

test("a line comment naming .with(loader()) above a bare registerLoader → does NOT clear it", () => {
  // The bypass reads as the most natural sentence a doc could write, which is
  // why it has to be closed: the comment describes the bug, not the fix.
  const body = [
    "```ts",
    "// Wrong: you must write .with(loader()) first.",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("a block comment naming .with(plugins()) above a bare .use(Plugin()) → does NOT clear it", () => {
  const body = [
    "```ts",
    "/* Compose .with(plugins()) before this line. */",
    "i18n.use(FetchLoader({ apiKey }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/plugin-use-without-plugins"]);
});

test("a string literal quoting .with(loader()) → does NOT clear a bare registerLoader", () => {
  const body = [
    "```ts",
    "throw new Error('compose .with(loader()) first');",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("a comment in ANOTHER fence of the same chain → does NOT clear the call", () => {
  const body = [
    '```ts title="src/i18n.ts"',
    "// Remember to call .with(loader()) here.",
    "export const i18n = createI18n({ locale: 'en' });",
    "```",
    '```ts title="src/i18n.ts"',
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("stripCommentsAndStrings → comments and literals gone, template substitutions kept", () => {
  const code = "const a = `x${count}y`; // .with(loader())\nconst b = '.with(plugins())';";

  assert.equal(stripCommentsAndStrings(code), "const a = ${count}; \nconst b = ;");
});

test("stripComments → comments gone, import specifiers kept", () => {
  const code = "// @comvi/core/icu\nimport { icuCompiler } from '@comvi/core/icu';";

  assert.equal(stripComments(code), "\nimport { icuCompiler } from '@comvi/core/icu';");
});

// ---------------------------------------------------------------------------
// Fence shape — a green typecheck over an untyped SFC is a green run over
// nothing at all (docs-0.5 plan §6.1.5).
// ---------------------------------------------------------------------------

test('a vue fence whose <script setup> has no lang="ts" → flagged at the script tag', () => {
  const body = ["```vue", "<script setup>", "const { t } = useI18n();", "</script>", "```"].join(
    "\n",
  );

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "fence/untyped-sfc");
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].col, 1);
});

test('a vue fence with lang="ts" → clean', () => {
  const body = [
    "```vue",
    '<script setup lang="ts">',
    "const { t } = useI18n();",
    "</script>",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("an untyped svelte fence marked check=js → clean, the JS is declared deliberate", () => {
  const body = [
    "```svelte check=js",
    "<script>",
    "  const { t } = useI18n();",
    "</script>",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a vue fence with no <script> block at all → clean", () => {
  const body = ["```vue", "<template>{{ t('hello') }}</template>", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

// ---------------------------------------------------------------------------
// Skip vocabulary and its budget.
// ---------------------------------------------------------------------------

test("check=skip without a reason slug → flagged, and the fence is still skipped", () => {
  const body = ["```ts check=skip", "i18n.registerLoader(myLoader);", "```"].join("\n");

  assert.deepEqual(rulesOf(body), ["meta/skip-without-reason"]);
});

test("check=skip:competitor-example → no findings, counted under its own slug", () => {
  const body = [
    "```ts check=skip:competitor-example",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  const result = lintDocument({ ...page(body) });

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.stats.skips, { "competitor-example": 1 });
});

test("a fence importing a competitor library → skipped by rule, counted as foreign-import", () => {
  const body = [
    "```ts",
    "import i18next from 'i18next';",
    "i18next.use(SomePlugin());",
    "```",
  ].join("\n");

  const result = lintDocument({ ...page(body) });

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.stats.skips, { "foreign-import": 1 });
});

test("a fence importing from a URL → skipped by rule, counted as url-import", () => {
  const body = [
    "```ts",
    "import { createI18n } from 'https://esm.sh/@comvi/core';",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  const result = lintDocument({ ...page(body) });

  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.stats.skips, { "url-import": 1 });
});

// ---------------------------------------------------------------------------
// Prose — the claims no compiler will ever read (docs-0.5 plan §6.1.6).
// ---------------------------------------------------------------------------

test("prose calling registerLoader a method on the core instance → banned at its column", () => {
  const body = "`registerLoader()` is a method on the core `I18n` instance, not a react export.";

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "prose/register-loader-is-core-method");
  assert.equal(findings[0].line, 5);
});

test("prose sourcing onLoadError from useI18n() → banned", () => {
  const body = "Use `onLoadError` and `onMissingKey` from `useI18n()` to handle errors.";

  assert.deepEqual(rulesOf(body), ["prose/capability-member-from-use-i18n"]);
});

test("prose saying useI18n() returns reloadTranslations → banned", () => {
  const body = "The `useI18n()` hook returns `t`, `locale` and `reloadTranslations`.";

  assert.deepEqual(rulesOf(body), ["prose/use-i18n-returns-capability"]);
});

test("prose claiming clearTranslations deactivates a namespace → banned", () => {
  const body = "Calling `clearTranslations(undefined, ns)` deactivates the namespace.";

  assert.deepEqual(rulesOf(body), ["prose/clear-translations-deactivates"]);
});

test("MIGRATION.md's past-tense narration of the same change → clean", () => {
  // The rule has to survive the document that DOCUMENTS the break: MIGRATION.md
  // §8 says `clearTranslations(undefined, ns)` also DEACTIVATED the namespace,
  // and then that it no longer does.
  const body =
    "In 0.4 `clearTranslations(undefined, ns)` also DEACTIVATED the namespace. It no longer does.";

  assert.deepEqual(rulesOf(body), []);
});

test("the same claim inside a code comment in a fence → not a prose finding", () => {
  const body = ["```ts", "// registerLoader() is a method on the core instance", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

// ---------------------------------------------------------------------------
// REQUIRED — API that must be present, which typecheck can never notice.
// ---------------------------------------------------------------------------

test("a framework page that never writes .with( → required/with-composition", () => {
  const body = ["```tsx", "const i18n = createI18n({ locale: 'en' });", "```"].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/with-composition"]);
});

test("a framework page that composes a capability → clean", () => {
  const body = ["```tsx", "const i18n = createI18n({ locale: 'en' }).with(loader());", "```"].join(
    "\n",
  );

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), []);
});

test("a framework page whose only .with( is in prose → still flagged", () => {
  // `quick-start.mdx` lists `.with(loader({…}))` in a comparison table while
  // every tab below it still constructs a 0.4 host. A reader copies the tab.
  const body = [
    "| capability | how |",
    "| --- | --- |",
    "| lazy locale files | `.with(loader({ de: () => import('./de.json') }))` |",
    "",
    "```tsx",
    "const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/with-composition"]);
});

test("a framework page whose only .with( is in a code comment → still flagged", () => {
  const body = [
    "```tsx",
    "// later: .with(loader())",
    "const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/with-composition"]);
});

test("a framework page whose only .with( is in a skipped competitor fence → still flagged", () => {
  const body = [
    "```ts check=skip:competitor-example",
    "import i18next from 'i18next';",
    "const other = build().with(loader());",
    "```",
    "```tsx",
    "const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/with-composition"]);
});

test("a framework page where one tab composes and another does not → clean, the page shows the API", () => {
  // The requirement is "does this page's code show composition at all". Whether
  // a particular tab still calls a dead member is the BANNED rules' job, and
  // they are chain-scoped so the migrated tab cannot cover for the other one.
  const body = [
    "<Tabs>",
    '  <TabItem label="React">',
    "  ```tsx",
    "  const i18n = createI18n({ locale: 'en' }).with(loader());",
    "  ```",
    "  </TabItem>",
    '  <TabItem label="Vue">',
    "  ```ts",
    "  const i18n = createI18n({ locale: 'en' });",
    "  i18n.registerLoader(myLoader);",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), [
    "banned/register-loader-on-instance",
  ]);
});

test("a non-framework page with no .with( → clean, the requirement is by page class", () => {
  const body = ["```ts", "const i18n = createI18n({ locale: 'en' });", "```"].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/formatting.mdx" }), []);
});

test("a package README under packages/react → classified framework", () => {
  assert.deepEqual([...classify("packages/react/README.md")], ["framework"]);
});

test("a README of a non-framework package → no class, so no composition requirement", () => {
  assert.deepEqual([...classify("packages/cli/README.md")], []);
});

test("the INSTALLED README of a non-framework package → the same class as its source", () => {
  // The www runner reads `node_modules/@comvi/*/README.md`. Matching only the
  // `packages/` layout made every installed copy fall through to `framework`,
  // so cli, typegen, vite-plugin and locale-routing owed a `.with(` that their
  // own sources are rightly never asked for.
  assert.deepEqual([...classify("node_modules/@comvi/cli/README.md")], []);
  assert.deepEqual([...classify("node_modules/@comvi/vite-plugin/README.md")], []);
});

test("the INSTALLED README of a framework package → framework, like its source", () => {
  assert.deepEqual([...classify("node_modules/@comvi/react/README.md")], ["framework"]);
});

test("api/react.mdx → classified api only, so it owes a stamp rather than a walkthrough", () => {
  assert.deepEqual([...classify("docs/i18n/api/react.mdx")], ["api"]);
});

test("an ICU argument in a JSON catalog fence with no compiler named → required/icu-compiler", () => {
  const body = [
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "required/icu-compiler");
  assert.equal(findings[0].line, 6);
  // The message names ONE enable form, and the citation names the section that
  // describes it. Both are pinned: the message is the only instruction a reader
  // gets, and a citation that outlives its section sends them to the wrong page.
  assert.match(findings[0].message, /compiler: icuCompiler/);
  assert.doesNotMatch(findings[0].message, /\.with\(\s*icu/);
  assert.equal(
    findings[0].migration,
    "MIGRATION.md §0 (ICU row) and §0.1 (the compiler is a constructor option)",
  );
});

test("the same catalog on a page that names icuCompiler → clean", () => {
  const body = [
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
    "```ts",
    "const i18n = createI18n({ locale: 'en', translation, compiler: icuCompiler });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("the same catalog on a page that composes .with(icu()) → the installer is NOT evidence", () => {
  // `.with(icu())` used to vouch for the page. The installer is gone, so it
  // vouches for nothing and is itself banned: a reader copying this fence gets
  // an unresolved import, and the page still never names a usable compiler.
  const body = [
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(icu()).with(loader(map));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/icu-installer", "required/icu-compiler"]);
});

test(".with(icu()) alone → banned at the call, whatever else the page says", () => {
  const body = ["```ts", "const i18n = createI18n({ locale: 'en' }).with(icu());", "```"].join(
    "\n",
  );

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/icu-installer");
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].col, "const i18n = createI18n({ locale: 'en' })".length + 1);
  assert.match(findings[0].message, /compiler: icuCompiler/);
});

test(".use(icu()) in an import-less fence → banned/icu-installer, NOT the wrong-slot rule", () => {
  // The wrong-slot rule would tell the reader to move the call to `.with()`,
  // which is the wrong fix for a name that no longer exists — so `icu` left that
  // rule's list and this one matches BOTH slots. Import-less on purpose: the
  // site's fences routinely omit the imports, so the call half cannot lean on
  // the provenance check the import half makes.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(plugins());",
    "i18n.use(icu());",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/icu-installer");
  assert.equal(findings[0].line, 7);
  assert.equal(findings[0].col, "i18n".length + 1);
  assert.match(findings[0].message, /compiler: icuCompiler/);
});

test("importing the bare `icu` from a @comvi specifier → banned even with no call in the fence", () => {
  // The alias is why the IMPORT is the fact: `icu as installIcu` writes
  // `installIcu()` at the call site, which no call-shape regex separates from a
  // local helper of the same name.
  const body = [
    "```ts",
    "import { createI18n, icu as installIcu } from '@comvi/react';",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/icu-installer");
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].col, "import { createI18n, ".length + 1);
});

test("importing `icu` from @comvi/core/icu → banned, the subpath still publishes the compiler", () => {
  const body = ["```ts", "import { icu } from '@comvi/core/icu';", "```"].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/icu-installer"]);
});

test("importing `icuCompiler` → clean, that is the surviving export", () => {
  // The prefix match is the trap: `icu` is a prefix of `icuCompiler`, and a
  // rule that read it as one would ban the very fix it recommends.
  const body = [
    "```ts",
    "import { createI18n, icuCompiler } from '@comvi/vue';",
    "const i18n = createI18n({ locale: 'en', compiler: icuCompiler });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("`icuCompiler as icu` → clean, the imported name is the live export", () => {
  const body = ["```ts", "import { icuCompiler as icu } from '@comvi/core/icu';", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("importing `icu` from another library → not this rule's business", () => {
  const body = ["```ts", "import { icu } from 'some-other-i18n';", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a diff fence's removed .with(icu()) line → not linted, it teaches the fix", () => {
  const body = [
    "```diff",
    "-import { icu } from '@comvi/core/icu';",
    "-const i18n = createI18n({ locale: 'en' }).with(icu());",
    "+import { icuCompiler } from '@comvi/core/icu';",
    "+const i18n = createI18n({ locale: 'en', compiler: icuCompiler });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a diff fence's ADDED icu import → linted, that is the line a reader copies", () => {
  const body = [
    "```diff",
    "-import { icuCompiler } from '@comvi/core/icu';",
    "+import { icu } from '@comvi/core/icu';",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/icu-installer"]);
});

test("the same catalog on a page that names icuCompiler only in prose → clean", () => {
  // Unlike `.with(`, this requirement asks whether the PAGE warns its reader —
  // one answer per host — so a sentence is evidence. `vite-plugin/README.md`
  // shows a catalog for typegen and names the explicit import in a bullet.
  const body = [
    "One explicit import: `compiler: icuCompiler` from `@comvi/core/icu`.",
    "",
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("icuCompiler named ONLY inside a skipped competitor fence → still flagged", () => {
  const body = [
    "```ts check=skip:competitor-example",
    "import i18next from 'i18next';",
    "const compiler = icuCompiler;",
    "```",
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["required/icu-compiler"]);
});

test("an ICU argument only inside a skipped competitor fence → clean", () => {
  const body = [
    "```ts check=skip:competitor-example",
    "const messages = { cart: '{count, plural, one {# item} other {# items}}' };",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("an API page stamped against an older version → required/version-stamp at the stamp's line", () => {
  const body = '<Aside type="note">Verified against `@comvi/react@0.3.0`.</Aside>';

  const findings = findingsOf(body, { file: "docs/i18n/api/react.mdx", sdkVersion: "0.5.0" });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "required/version-stamp");
  assert.equal(findings[0].line, 5);
  assert.match(findings[0].message, /@comvi\/react@0\.3\.0.*0\.5\.0/);
});

test("an API page stamped against the version under test → clean", () => {
  const body = "_Verified against `@comvi/react@0.5.0`._";

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/api/react.mdx", sdkVersion: "0.5.0" }), []);
});

test("an API page stamped in frontmatter → clean", () => {
  const source = "---\ntitle: 'API'\nverified: '@comvi/react@0.5.0'\n---\n\nBody.\n";

  const result = lintDocument({ file: "docs/i18n/api/react.mdx", source, sdkVersion: "0.5.0" });

  assert.deepEqual(result.findings, []);
});

test("an API page with no stamp at all → required/version-stamp", () => {
  const body = "No stamp anywhere on this page.";

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/api/react.mdx", sdkVersion: "0.5.0" }), [
    "required/version-stamp",
  ]);
});

test("an API page stamped but run without --sdk-version → clean, there is nothing to compare", () => {
  const body = '<Aside type="note">Verified against `@comvi/react@0.3.0`.</Aside>';

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/api/react.mdx" }), []);
});

// ---------------------------------------------------------------------------
// The fixture built from real site forms, end to end.
// ---------------------------------------------------------------------------

test("the site-forms fixture → exactly the four findings its shapes plant", () => {
  const source = fs.readFileSync(FIXTURE, "utf8");

  const result = lintDocument({
    file: "docs/i18n/loading-translations.mdx",
    source,
    sdkVersion: "0.5.0",
  });

  assert.deepEqual(
    result.findings.map((finding) => `${finding.line}:${finding.col} ${finding.rule}`),
    [
      "14:3 fence/untyped-sfc",
      "58:6 banned/register-loader-on-instance",
      "9:2 prose/register-loader-is-core-method",
      "73:1 required/icu-compiler",
    ],
  );
});

test("the site-forms fixture → the skip budget it declares, by category", () => {
  const source = fs.readFileSync(FIXTURE, "utf8");

  const result = lintDocument({
    file: "docs/i18n/loading-translations.mdx",
    source,
    sdkVersion: "0.5.0",
  });

  assert.deepEqual(result.stats.skips, { "competitor-example": 1, "url-import": 1 });
});

test("the site-forms fixture → call sites and mentions counted apart", () => {
  const source = fs.readFileSync(FIXTURE, "utf8");

  const result = lintDocument({
    file: "docs/i18n/loading-translations.mdx",
    source,
    sdkVersion: "0.5.0",
  });

  assert.equal(result.stats.registerLoaderCalls, 2);
  assert.equal(result.stats.registerLoaderMentions, 3);
});

// ---------------------------------------------------------------------------
// Holes the delta review found: evidence that is only evidence in position.
// ---------------------------------------------------------------------------

test("I18nLoaderApi named in an import, not intersected → does NOT vouch for registerLoader", () => {
  // The bare name appears where it proves the OPPOSITE of composition: a page
  // imports the type in order to talk about the API a base host lacks. Only the
  // intersection `I18n & I18nLoaderApi` says a host HAS it.
  const body = [
    "```ts",
    "import type { I18nLoaderApi } from '@comvi/core/loader';",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.registerLoader({ uk: () => import('./uk.json') });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("Omit<I18nLoaderApi, …> describing a host without the loader → still banned", () => {
  const body = [
    "```ts",
    "type BaseHost = Omit<I18nLoaderApi, 'registerLoader'>;",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.registerLoader({ uk: () => import('./uk.json') });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("NuxtServerLoaderHost in a type-argument position → vouches", () => {
  const body = [
    "```ts",
    "export default defineComviSetup((core: NuxtServerLoaderHost) => {",
    "  core.registerLoader(myLoader);",
    "});",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a check=skip fence sharing a group does NOT clear its linted sibling", () => {
  // A historical 0.3 example kept for reference composes nothing a 0.5 reader
  // can copy; letting it pool into the chain hands the live fence a
  // `.with(loader())` that appears nowhere in the 0.5 code on the page.
  const body = [
    "```ts check=group=app check=skip:historical",
    "const i18n = createI18n({ locale: 'en' }).with(loader());",
    "```",
    "",
    "```ts check=group=app",
    "i18n.registerLoader({ uk: () => import('./uk.json') });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("a linted fence in the same group still clears its sibling", () => {
  const body = [
    "```ts check=group=app",
    "const i18n = createI18n({ locale: 'en' }).with(loader());",
    "```",
    "",
    "```ts check=group=app",
    "i18n.registerLoader({ uk: () => import('./uk.json') });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a URL inside a string does not eat the rest of the line", () => {
  // `https://…` carries a `//`. Reading it as a line comment swallowed the
  // `.with(loader())` that follows it on the same line and reported a framework
  // page that composes correctly as one that never composes.
  const body = [
    "```ts",
    "import { createI18n } from '@comvi/core';",
    "const i18n = createI18n({ locale: 'en', baseUrl: \"https://cdn.comvi.io/x\" }).with(loader());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), []);
});

test("stripComments keeps a quoted URL verbatim and still drops real comments", () => {
  const kept = stripComments('const url = "https://cdn.comvi.io/x"; // gone\nnext();');

  assert.match(kept, /https:\/\/cdn\.comvi\.io\/x/);
  assert.doesNotMatch(kept, /gone/);
  assert.match(kept, /next\(\)/);
});

test("an apostrophe in JSX prose is not a string, so nothing after it is eaten", () => {
  const kept = stripCommentsAndStrings("<p>don't</p>\nconst i18n = base.with(loader());");

  assert.match(kept, /\.with\(loader\(\)\)/);
});

test("an ICU compiler named only in the frontmatter does not vouch for the page", () => {
  const body = [
    "```json",
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
  ].join("\n");

  assert.deepEqual(
    rulesOf(body, { frontmatter: "title: 'Page'\ndescription: 'About icuCompiler'" }),
    ["required/icu-compiler"],
  );
});

test("an ICU compiler named in the body does vouch for the page", () => {
  const body = [
    "Use `icuCompiler` from `@comvi/core/icu` for these catalogs.",
    "",
    "```json",
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});
