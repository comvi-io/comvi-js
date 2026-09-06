import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, lintDocument } from "./lint.mjs";

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

test("registerLoader in a fence whose GROUP composes the loader in another tab → clean", () => {
  // The trap the critic named: `check=continues`-style positional grouping reads
  // the PREVIOUS fence in the file, which under <Tabs> is a different framework's
  // tab. Grouping is by `title=` / `check=group=`, so a later tab writing the
  // same virtual file sees the composition, and an unrelated neighbour does not.
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

test("i18n.core.registerLoader on a VueI18n wrapper → clean", () => {
  const body = ["```ts", "i18n.core.registerLoader(myLoader);", "```"].join("\n");

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

test("a diff fence's removed line showing the 0.4 call → clean, the added line is what counts", () => {
  const body = [
    "```diff",
    "-i18n.registerLoader(myLoader);",
    "+i18n.core.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
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

test("exposeGlobal passed to the constructor with no devtools() in sight → banned", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en', exposeGlobal: true });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/devtools-options-on-constructor"]);
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

test("the same catalog on a page that composes .with(icu()) → clean", () => {
  const body = [
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(icu()).with(loader(map));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
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
