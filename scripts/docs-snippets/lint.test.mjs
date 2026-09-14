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
// BANNED — 0.4 API that 0.5.0 removed or rehomed (MIGRATION.md §0, §2–§4).
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
  assert.equal(findings[0].migration, "MIGRATION.md §0 (loader row) and §3 `.use(installer)`");
});

test("registerLoader after .use(loader()) in the same fence → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(loader());",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("registerLoader after .use(loader(map)) keeps its exemption", () => {
  // The chain-exemption tokens are keyed on the VERB, so retiring `.with` took
  // the exemption with it until they were moved: nine correctly-composed pages
  // in the corpus were reported for `registerLoader` calls their own chain had
  // already earned. The map argument is the shape the pages actually write.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(loader({ de: () => import('./de.json') }));",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("registerPlugin after .use(plugins()) keeps its exemption", () => {
  // Same fact for the other capability, and the rule that asks for it is new:
  // the 0.4 `.use(Plugin())` sites all became `registerPlugin(…)`.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(plugins());",
    "i18n.registerPlugin(myPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("registerLoader after .use(attachLoader) in the same fence → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(attachLoader);",
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
    "  export const i18n = createI18n({ locale: 'en' }).use(loader());",
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
    "  export const i18n = createI18n({ locale: 'en' }).use(loader());",
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
    "  export const i18n = createI18n({ locale: 'en' }).use(loader());",
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
    "export const i18n = createI18n({ locale: 'en' }).use(loader());",
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
    "export const i18n = createI18n({ locale: 'en' }).use(loader());",
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

test("i18n.core.registerLoader after createCore(…).use(loader()) in the chain → clean", () => {
  const body = [
    "```ts",
    "const core = createCore({ locale: 'en' }).use(loader());",
    "const i18n = createI18nFromCore(core);",
    "i18n.core.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("i18n.core.registerPlugin on a wrapper whose core was never composed → banned", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.core.registerPlugin(myPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-plugin-without-plugins"]);
});

test("core.registerLoader inside a nuxt hook typed with I18nLoaderApi → clean", () => {
  // MIGRATION.md §6: annotating the hook with the host the factory returns is
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

test(".use(RawPlugin()) → banned, a raw plugin is not an installer", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.use(FetchLoader({ apiKey }));",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.deepEqual(
    findings.map((f) => f.rule),
    ["banned/raw-plugin-in-use-slot"],
  );
  assert.match(findings[0].message, /E_USE_NOT_INSTALLER/);
});

test(".use(RawPlugin()) after .use(plugins()) → STILL banned, the chain cannot clear it", () => {
  // This is where the premise inverted at decision E. While `use` was the raw
  // plugin queue, composing `plugins()` was exactly what made the call legal.
  // Now `use` is the installer pipe on every host, so the capability changes
  // nothing: a raw plugin hits the E_USE_NOT_INSTALLER guard either way, and
  // the rule is unconditional rather than chain-scoped.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(loader()).use(plugins());",
    "i18n.use(FetchLoader({ apiKey }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/raw-plugin-in-use-slot"]);
});

test(".use(LocaleDetector()) → banned, and the message names the lowercase installer", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(attachPlugins);",
    "i18n.use(LocaleDetector());",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.deepEqual(
    findings.map((f) => f.rule),
    ["banned/raw-plugin-in-use-slot"],
  );
  assert.match(findings[0].message, /localeDetector\(\), not LocaleDetector\(\)/);
  assert.match(findings[0].message, /\.use\(definePlugin\(fn\)\)/);
});

test(".use(localeDetector()) → clean, the lowercase factory IS the installer", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(localeDetector({ order: ['navigator'] }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test(".use(definePlugin(fn)) → clean, and it composes the plugin capability for the chain", () => {
  // `definePlugin(fn)` attaches the capability and queues `fn` (brief E §3), so
  // a later `registerPlugin` in the same chain is served by the host it built.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(definePlugin((i18n) => undefined));",
    "i18n.registerPlugin(myOtherPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("app.use(i18n) installing the Vue plugin → clean, it is not a comvi plugin registration", () => {
  const body = ["```ts", "createApp(App).use(i18n).mount('#app');", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("an installer handed to .use() → clean, that is the one composition verb", () => {
  // The rule that used to fire here said the opposite: an installer belonged in
  // `.with()` and `.use()` was the raw plugin queue. After decision E there is
  // one verb and this is it.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(plugins());",
    "i18n.use(cdnLoader({ cdnUrl }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a .use( fence is clean but a .with( fence is banned, with no chain to clear it", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).with(loader()).with(plugins());",
    "```",
  ].join("\n");

  const findings = findingsOf(body);

  assert.deepEqual(
    findings.map((f) => f.rule),
    ["banned/with-composition", "banned/with-composition"],
  );
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].col, "const i18n = createI18n({ locale: 'en' })".length + 1);
  assert.match(findings[0].message, /the composition verb is `\.use\(\.\.\.\)`/);
});

test("a .with( on a framework page is banned AND leaves the composition requirement unmet", () => {
  // The two rules are independent halves of the same fact: `.with(` is not the
  // verb, and a page whose only composition is spelled that way has not shown
  // the reader a chain they can copy.
  const body = ["```tsx", "const i18n = createI18n({ locale: 'en' }).with(loader());", "```"].join(
    "\n",
  );

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), [
    "banned/with-composition",
    "required/use-composition",
  ]);
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

test("instanceId inside .use(devtools({ … })) → clean", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(devtools({ instanceId: 'app' }));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

// ---------------------------------------------------------------------------
// Acquisition evidence has to be code, not talk about code.
// ---------------------------------------------------------------------------

test("a line comment naming .use(loader()) above a bare registerLoader → does NOT clear it", () => {
  // The bypass reads as the most natural sentence a doc could write, which is
  // why it has to be closed: the comment describes the bug, not the fix.
  const body = [
    "```ts",
    "// Wrong: you must write .use(loader()) first.",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("a block comment naming .use(plugins()) above a bare registerPlugin → does NOT clear it", () => {
  const body = [
    "```ts",
    "/* Compose .use(plugins()) before this line. */",
    "i18n.registerPlugin(myPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-plugin-without-plugins"]);
});

test("a string literal quoting .use(loader()) → does NOT clear a bare registerLoader", () => {
  const body = [
    "```ts",
    "throw new Error('compose .use(loader()) first');",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("a comment in ANOTHER fence of the same chain → does NOT clear the call", () => {
  const body = [
    '```ts title="src/i18n.ts"',
    "// Remember to call .use(loader()) here.",
    "export const i18n = createI18n({ locale: 'en' });",
    "```",
    '```ts title="src/i18n.ts"',
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-loader-on-instance"]);
});

test("stripCommentsAndStrings → comments and literals gone, template substitutions kept", () => {
  const code = "const a = `x${count}y`; // .use(loader())\nconst b = '.use(plugins())';";

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

test("a framework page that never writes .use( → required/use-composition", () => {
  const body = ["```tsx", "const i18n = createI18n({ locale: 'en' });", "```"].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/use-composition"]);
});

test("a framework page that composes a capability → clean", () => {
  const body = ["```tsx", "const i18n = createI18n({ locale: 'en' }).use(loader());", "```"].join(
    "\n",
  );

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), []);
});

test("a framework page whose only .use( is Vue's app.use(i18n) → still flagged", () => {
  // The one verb shares its NAME with Vue's, not its meaning: `app.use(i18n)`
  // installs the Vue plugin on the app and composes no capability at all. A
  // bare `\.use\(` probe would have greened every 0.4 Vue page in the corpus,
  // since `app.use(i18n)` is the line they all already had.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "createApp(App).use(i18n).mount('#app');",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/vue.mdx" }), ["required/use-composition"]);
});

test("a framework page composing before app.use(i18n) → clean, the chain is what counts", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(cdnLoader({ cdnUrl }));",
    "createApp(App).use(i18n).mount('#app');",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/vue.mdx" }), []);
});

test("a framework page whose composition is .use(attachLoader) → clean, a bare installer counts", () => {
  const body = [
    "```tsx",
    "const i18n = createI18n({ locale: 'en' }).use(attachLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), []);
});

test("a framework page whose only .use( is in prose → still flagged", () => {
  // `quick-start.mdx` lists `.use(loader({…}))` in a comparison table while
  // every tab below it still constructs a 0.4 host. A reader copies the tab.
  const body = [
    "| capability | how |",
    "| --- | --- |",
    "| lazy locale files | `.use(loader({ de: () => import('./de.json') }))` |",
    "",
    "```tsx",
    "const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/use-composition"]);
});

test("a framework page whose only .use( is in a code comment → still flagged", () => {
  const body = [
    "```tsx",
    "// later: .use(loader())",
    "const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/use-composition"]);
});

test("a framework page whose only .use( is in a skipped competitor fence → still flagged", () => {
  const body = [
    "```ts check=skip:competitor-example",
    "import i18next from 'i18next';",
    "const other = build().use(loader());",
    "```",
    "```tsx",
    "const i18n = createI18n({ locale: 'en' });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/use-composition"]);
});

test("a framework page where one tab composes and another does not → clean, the page shows the API", () => {
  // The requirement is "does this page's code show composition at all". Whether
  // a particular tab still calls a dead member is the BANNED rules' job, and
  // they are chain-scoped so the migrated tab cannot cover for the other one.
  const body = [
    "<Tabs>",
    '  <TabItem label="React">',
    "  ```tsx",
    "  const i18n = createI18n({ locale: 'en' }).use(loader());",
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

test("a non-framework page with no .use( → clean, the requirement is by page class", () => {
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
  // so cli, typegen, vite-plugin and locale-routing owed a `.use(` that their
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
  assert.doesNotMatch(findings[0].message, /\.use\(\s*icu/);
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

test("the same catalog on a page that composes .use(icu()) → the installer is NOT evidence", () => {
  // The installer used to vouch for the page. It is gone, so it
  // vouches for nothing and is itself banned: a reader copying this fence gets
  // an unresolved import, and the page still never names a usable compiler.
  const body = [
    '```json title="locales/en.json"',
    '{ "cart": "{count, plural, one {# item} other {# items}}" }',
    "```",
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(icu()).use(loader(map));",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/icu-installer", "required/icu-compiler"]);
});

test(".use(icu()) alone → banned at the call, whatever else the page says", () => {
  const body = ["```ts", "const i18n = createI18n({ locale: 'en' }).use(icu());", "```"].join("\n");

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/icu-installer");
  assert.equal(findings[0].line, 6);
  assert.equal(findings[0].col, "const i18n = createI18n({ locale: 'en' })".length + 1);
  assert.match(findings[0].message, /compiler: icuCompiler/);
});

test(".use(icu()) in an import-less fence → banned/icu-installer, and nothing else", () => {
  // `icu` is deliberately absent from the raw-plugin rule's list and exempted
  // from `banned/with-composition`: both would have the reader rewrap a call
  // that has to GO, which is the wrong fix for a name that no longer exists.
  // Import-less on purpose: the site's fences routinely omit the imports, so
  // the call half cannot lean on the provenance check the import half makes.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(plugins());",
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

test(".with(icu()) → the same one finding, because a reader may still have the old verb", () => {
  // The matcher keeps BOTH spellings. `.with(` is banned in its own right, but
  // not here: one call site earns one finding, and this is the finding whose fix
  // removes the call instead of renaming the verb around it.
  const body = ["```ts", "const i18n = createI18n({ locale: 'en' }).with(icu());", "```"].join(
    "\n",
  );

  const findings = findingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, "banned/icu-installer");
  assert.equal(findings[0].col, "const i18n = createI18n({ locale: 'en' })".length + 1);
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

test("a diff fence's removed .use(icu()) line → not linted, it teaches the fix", () => {
  const body = [
    "```diff",
    "-import { icu } from '@comvi/core/icu';",
    "-const i18n = createI18n({ locale: 'en' }).use(icu());",
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
  // Unlike the composition requirement, this one asks whether the PAGE warns —
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
  // `.use(loader())` that appears nowhere in the 0.5 code on the page.
  const body = [
    "```ts check=group=app check=skip:historical",
    "const i18n = createI18n({ locale: 'en' }).use(loader());",
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
    "const i18n = createI18n({ locale: 'en' }).use(loader());",
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
  // `.use(loader())` that follows it on the same line and reported a framework
  // page that composes correctly as one that never composes.
  const body = [
    "```ts",
    "import { createI18n } from '@comvi/core';",
    "const i18n = createI18n({ locale: 'en', baseUrl: \"https://cdn.comvi.io/x\" }).use(loader());",
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
  const kept = stripCommentsAndStrings("<p>don't</p>\nconst i18n = base.use(loader());");

  assert.match(kept, /\.use\(loader\(\)\)/);
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

// ---------------------------------------------------------------------------
// Decision-E follow-up: which `.use(` is ours, and which receiver is not.
// ---------------------------------------------------------------------------

test("createApp(App).use(createPinia()).use(i18n) → composes nothing comvi, so still flagged", () => {
  // The receiver denylist was a capture group in FRONT of `\.use`, optional
  // because a chained `.use` has no identifier there — so on this line it was
  // undefined and did no work, while `createPinia()` satisfied "any lowercase
  // call". A Vue page that never composes a capability came back clean.
  const body = ["```ts", "createApp(App).use(createPinia()).use(i18n).mount('#app');", "```"].join(
    "\n",
  );

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/vue.mdx" }), ["required/use-composition"]);
});

test("nuxtApp.vueApp.use(loader()) → the denylist reaches a CHAINED receiver too", () => {
  const body = ["```ts", "nuxtApp.vueApp.use(loader());", "```"].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/nuxt.mdx" }), ["required/use-composition"]);
});

test("a lowercase call that is not an installer by NAME → not composition evidence", () => {
  const body = [
    "```tsx",
    "const i18n = createI18n({ locale: 'en' }).use(myFavouriteThing());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), ["required/use-composition"]);
});

test("every named installer counts as composition, one fence each", () => {
  for (const installer of [
    "loader()",
    "plugins()",
    "devtools({})",
    "definePlugin(fn)",
    "fetchLoader({ apiKey })",
    "cdnLoader({ cdnUrl })",
    "localeDetector()",
    "inContextEditor()",
    "attachLoader",
    "attachPlugins",
    "attachDevtools",
  ]) {
    const body = [
      "```tsx",
      `const i18n = createI18n({ locale: 'en' }).use(${installer});`,
      "```",
    ].join("\n");

    assert.deepEqual(
      rulesOf(body, { file: "docs/i18n/react.mdx" }).filter(
        (rule) => rule === "required/use-composition",
      ),
      [],
      installer,
    );
  }
});

test(".use (\\n  loader()) → the anchoring accepts a space after the verb", () => {
  const body = [
    "```tsx",
    "const i18n = createI18n({ locale: 'en' }).use (loader());",
    "i18n.registerLoader(myLoader);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), []);
});

test("app.use(Vuetify) and friends → exempt, those pages are correct", () => {
  // Four shapes verified in the platform docs. Nothing in a comvi chain can
  // ever clear this rule (it is scope `always`), so a finding here would be
  // unclearable on a correct page — which is how a pinned baseline moves.
  const body = [
    "```ts",
    "app.use(Vuetify);",
    "app.use(PrimeVue);",
    "nuxtApp.vueApp.use(Antd);",
    "i18next.use(HttpBackend);",
    "server.use(Middleware());",
    "router.use(Guard());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("a raw plugin on a receiver that is NOT exempt → still banned", () => {
  const body = ["```ts", "myHost.use(Vuetify);", "```"].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/raw-plugin-in-use-slot"]);
});

test("createNextI18n's result.use(RawPlugin()) → exempt, a deliberate compat surface", () => {
  // `createNextI18n` is preserved exactly across 0.5.0 (MIGRATION.md §5) and
  // its composed host keeps the raw plugin queue.
  const stored = [
    "```ts",
    "const result = createNextI18n({ locale: 'en' });",
    "result.use(RawPlugin());",
    "```",
  ].join("\n");
  const chained = [
    "```ts",
    "export const i18n = createNextI18n({ locale: 'en' }).use(RawPlugin());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(stored), []);
  assert.deepEqual(rulesOf(chained), []);
});

test("a raw plugin on an unrelated binding beside a createNextI18n call → still banned", () => {
  const body = [
    "```ts",
    "const next = createNextI18n({ locale: 'en' });",
    "other.use(RawPlugin());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/raw-plugin-in-use-slot"]);
});

test("an inline function or arrow in the .use slot → banned, it cannot be an installer", () => {
  // An installer widens the host and returns it, so a literal function in the
  // slot is a raw plugin by construction, and `definePlugin` is what wraps it.
  // The lint used to see only an Uppercase callee.
  const body = [
    "```ts",
    "const a = createI18n({ locale: 'en' }).use((i18n) => { track(i18n); });",
    "const b = createI18n({ locale: 'en' }).use(function (i18n) { track(i18n); });",
    "const c = createI18n({ locale: 'en' }).use(async (i18n) => { await track(i18n); });",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), [
    "banned/raw-plugin-in-use-slot",
    "banned/raw-plugin-in-use-slot",
    "banned/raw-plugin-in-use-slot",
  ]);
});

test("new Uppercase() and pkg.Uppercase() in the .use slot → banned, same convention", () => {
  const body = [
    "```ts",
    "const a = createI18n({ locale: 'en' }).use(new MetricsPlugin());",
    "const b = createI18n({ locale: 'en' }).use(vendor.MetricsPlugin());",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), [
    "banned/raw-plugin-in-use-slot",
    "banned/raw-plugin-in-use-slot",
  ]);
});

test("registerPlugin without an identifier receiver → banned in every receiver shape", () => {
  // `registerPlugin` needs the capability whatever the receiver LOOKS like: a
  // call result, an optional chain and an element read all throw on an
  // uncomposed host, and an identifier-only pattern could see none of them.
  for (const call of [
    "createI18n({ locale: 'en' }).registerPlugin(fn);",
    "getI18n().registerPlugin(fn);",
    "i18n?.registerPlugin(fn);",
    "hosts[0].registerPlugin(fn);",
  ]) {
    assert.deepEqual(
      rulesOf(["```ts", call, "```"].join("\n")),
      ["banned/register-plugin-without-plugins"],
      call,
    );
  }
});

test("registerLoader without an identifier receiver → banned in every receiver shape", () => {
  for (const call of [
    "createI18n({ locale: 'en' }).registerLoader(fn);",
    "getI18n().registerLoader(fn);",
    "i18n?.registerLoader(fn);",
    "hosts[0].registerLoader(fn);",
  ]) {
    const { findings, stats } = lintDocument(page(["```ts", call, "```"].join("\n")));

    assert.deepEqual(
      findings.map((f) => f.rule),
      ["banned/register-loader-on-instance"],
      call,
    );
    assert.equal(stats.registerLoaderCalls, 1, call);
  }
});

test("a BARE registerPlugin / registerLoader call → still exempt, it names an acquired capability", () => {
  const body = [
    "```ts",
    "const { registerPlugin } = useI18nPlugins();",
    "const { registerLoader } = useI18nLoader();",
    "registerPlugin(fn);",
    "registerLoader(map);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test("Temporal's date.with and Array.prototype.with → clean, the argument is not an installer", () => {
  // Both were flagged by `banned/with-composition` with nothing but
  // `check=skip` to escape with. A composition step hands `with` a CALL.
  const body = [
    "```ts",
    "const shifted = date.with({ month: 2 });",
    "const swapped = locales.with(0, 'en');",
    "const named = locales.with('en');",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

test(".with(installer()) and .with(attachLoader) → still banned, the verb is gone", () => {
  const body = [
    "```ts",
    "const a = createI18n({ locale: 'en' }).with(myOwnInstaller());",
    "const b = createI18n({ locale: 'en' }).with(attachLoader);",
    "const c = createI18n({ locale: 'en' }).with(FetchLoader());",
    "```",
  ].join("\n");

  assert.deepEqual(
    rulesOf(body).filter((rule) => rule === "banned/with-composition"),
    ["banned/with-composition", "banned/with-composition", "banned/with-composition"],
  );
});

test(".use(inContextEditor()) does NOT clear a registerPlugin finding", () => {
  // Its installer is `<T extends I18n<any>>(i18n: T) => T` in both entries and
  // the production entry is a no-op: it widens nothing, so the host it hands
  // back still has no `registerPlugin`.
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(inContextEditor());",
    "i18n.registerPlugin(myPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-plugin-without-plugins"]);
});

test(".use(localeDetector()) still DOES clear one — that installer really widens", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' }).use(localeDetector());",
    "i18n.registerPlugin(myPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

// ---------------------------------------------------------------------------
// PROSE — a size figure transcribed from scripts/size-budgets.json.
// ---------------------------------------------------------------------------

/** The three numbers the gate records per fixture, in the shape run.mjs builds. */
const BASELINES = new Map([
  ["fw-react-default", { minBytes: 19035, gzipBytes: 6902, gzipBudgetBytes: 7248 }],
  ["fw-next-client-default", { minBytes: 20325, gzipBytes: 7354, gzipBudgetBytes: 7722 }],
]);

function sizeFindingsOf(body) {
  const { file, source } = page(body);
  return lintDocument({ file, source, sizeBaselines: BASELINES }).findings.filter(
    (finding) => finding.rule === "prose/stale-size-figure",
  );
}

test("a table row quoting a stale figure beside a fixture name → reported, at the figure", () => {
  const body = "| base host | `fw-react-default` | **6622 B** |";

  const findings = sizeFindingsOf(body);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].line, 5);
  assert.equal(findings[0].col, body.indexOf("6622") + 1);
  assert.match(findings[0].message, /states 6622 B beside `fw-react-default`/);
  assert.match(findings[0].message, /records fw-react-default: 6902 B min\+gz/);
});

test("the recorded gzip, min and budget figures are each accepted → clean", () => {
  // Which column a README quotes is the README's business. Whether the number
  // is one the repo measured is not.
  assert.deepEqual(sizeFindingsOf("| a | `fw-react-default` | **6902 B** |"), []);
  assert.deepEqual(sizeFindingsOf("| a | `fw-react-default` | 19035 B |"), []);
  assert.deepEqual(sizeFindingsOf("| a | `fw-react-default` | 7248 B |"), []);
  assert.deepEqual(sizeFindingsOf("| a | `fw-react-default` | 6,902 B |"), []);
});

test("a figure with no `B` unit, the way the next and nuxt tables write it → still graded", () => {
  const findings = sizeFindingsOf(
    "| client, base host hydrated | **7331** | `fw-next-client-default` |",
  );

  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /states 7331 B beside `fw-next-client-default`/);
});

test("a SIGNED figure on the row is a delta between sweeps, not a size → ignored", () => {
  assert.deepEqual(sizeFindingsOf("| a | `fw-react-default` | 6902 B | +1234 B over 0.4 |"), []);
});

test("a date, an issue number and a bare year in a prose cell → ignored", () => {
  // These three were false positives while the rule scanned the whole row for
  // any unit-less four-digit number. `scripts/size-budgets.json` records a
  // `measuredAt` per fixture, so a `measured` column is one edit away, and a
  // gate that fires on a correct page is a gate people switch off.
  assert.deepEqual(
    sizeFindingsOf("| base | `fw-react-default` | 6902 B | measured 2026-09-12 |"),
    [],
  );
  assert.deepEqual(sizeFindingsOf("| base | `fw-react-default` | 6902 B | see PR #1234 |"), []);
  assert.deepEqual(sizeFindingsOf("| base | `fw-react-default` | 6902 B | node 2024 |"), []);
  // Not one of the review's three, and the reason the fix is the CELL rather
  // than an ISO-date and `#` exclusion: this one has neither marker.
  assert.deepEqual(sizeFindingsOf("| base | `fw-react-default` | 6902 B | see PR 1234 |"), []);
});

test("a stale figure in a cell of its own is still graded, unit or no unit", () => {
  // The other half of the cell rule: narrowing it must not green the rows the
  // rule exists for. Both spellings appear in the corpus.
  const suffixed = sizeFindingsOf("| base | `fw-react-default` | **6622 B** |");
  assert.equal(suffixed.length, 1);
  assert.match(suffixed[0].message, /states 6622 B beside `fw-react-default`/);

  const bare = sizeFindingsOf("| base | `fw-react-default` | **7240** |");
  assert.equal(bare.length, 1);
  assert.match(bare[0].message, /states 7240 B beside `fw-react-default`/);
});

test("percentages, multipliers and short numbers on a size row → ignored", () => {
  assert.deepEqual(
    sizeFindingsOf("| a | `fw-react-default` | 6902 B | 34.1% | x1.05 | 5 kB | 12 |"),
    [],
  );
});

test("a backticked token that names no fixture → the row is not a size row", () => {
  assert.deepEqual(sizeFindingsOf("| `<T>` | `@comvi/react` | **6622 B** |"), []);
});

test("the same figure outside a table row → ignored, rounded prose is not a transcription", () => {
  assert.deepEqual(
    sizeFindingsOf("The `fw-react-default` fixture measured 6622 B last spring."),
    [],
  );
});

test("without sizeBaselines the rule is inert — the www copy has no budgets file", () => {
  const { file, source } = page("| base host | `fw-react-default` | **6622 B** |");

  const findings = lintDocument({ file, source }).findings;

  assert.deepEqual(
    findings.filter((finding) => finding.rule === "prose/stale-size-figure"),
    [],
  );
});

test("a row naming two fixtures is cleared by EITHER baseline, never invented against one", () => {
  assert.deepEqual(
    sizeFindingsOf("| `fw-react-default` vs `fw-next-client-default` | 7354 B |"),
    [],
  );
});
