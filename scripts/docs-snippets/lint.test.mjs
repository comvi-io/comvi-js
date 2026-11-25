import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, lintDocument, receiverOf } from "./lint.mjs";

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
// BANNED — 0.4 API that 0.5.0 removed, and 0.7 API that 0.8 removed.
// ---------------------------------------------------------------------------

test("registerLoader on an instance → banned, at the call's line and column", () => {
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
  assert.equal(findings[0].migration, ".changeset/core-08-instance.md (the `loader` option)");
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

test("i18n.core.registerPlugin on a wrapper whose core was never composed → banned", () => {
  const body = [
    "```ts",
    "const i18n = createI18n({ locale: 'en' });",
    "i18n.core.registerPlugin(myPlugin);",
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body), ["banned/register-plugin-without-plugins"]);
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

test("app.use(i18n) installing the Vue plugin → clean, it is not a comvi plugin registration", () => {
  const body = ["```ts", "createApp(App).use(i18n).mount('#app');", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
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

test("prose saying useI18n() returns reloadMessages → banned", () => {
  const body = "The `useI18n()` hook returns `t`, `locale` and `reloadMessages`.";

  assert.deepEqual(rulesOf(body), ["prose/use-i18n-returns-capability"]);
});

test("prose claiming clearMessages deactivates a namespace → banned", () => {
  const body = "Calling `clearMessages(undefined, ns)` deactivates the namespace.";

  assert.deepEqual(rulesOf(body), ["prose/clear-messages-deactivates"]);
});

test("MIGRATION.md's past-tense narration of the same change → clean", () => {
  // The rule has to survive the document that DOCUMENTS the break: MIGRATION.md
  // §8 says `clearMessages(undefined, ns)` also DEACTIVATED the namespace,
  // and then that it no longer does.
  const body =
    "In 0.4 `clearMessages(undefined, ns)` also DEACTIVATED the namespace. It no longer does.";

  assert.deepEqual(rulesOf(body), []);
});

test("the same claim inside a code comment in a fence → not a prose finding", () => {
  const body = ["```ts", "// registerLoader() is a method on the core instance", "```"].join("\n");

  assert.deepEqual(rulesOf(body), []);
});

// ---------------------------------------------------------------------------
// CLASSES, and REQUIRED — what must be present, which typecheck can never notice.
// ---------------------------------------------------------------------------

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

test("docs/design/README.md → design, not framework: an index owes no walkthrough", () => {
  // It fell through to the README branch, where an unrecognisable package
  // directory means "an installed package README" and grants `framework`. So
  // the decision-record INDEX owed a `.use(installer)` fence, and was handed a
  // four-line one whose only purpose was to satisfy the rule.
  assert.deepEqual([...classify("docs/design/README.md")], ["design"]);
  assert.deepEqual([...classify("docs/design/composition.md")], ["design"]);
  // Including the two records whose basenames collide with a framework page.
  assert.deepEqual([...classify("docs/design/ssr.md")], ["design"]);
});

test("a design page with no fences at all → clean", () => {
  assert.deepEqual(rulesOf("Just prose.", { file: "docs/design/README.md" }), []);
});

test("a design page still answers for a banned token", () => {
  // The class is not an exemption. A record that names an API 0.5.0 removed is
  // exactly as wrong as a README that does, and only the REQUIRED rules are
  // class-gated.
  const body = ["```ts", "const i18n = createI18n({ locale: 'en' }).with(icu());", "```"].join(
    "\n",
  );
  const rules = rulesOf(body, { file: "docs/design/composition.md" });

  assert.ok(rules.length > 0, "a banned token in a design page must still be reported");
  assert.ok(!rules.includes("required/use-composition"));
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

test("the site-forms fixture → exactly the findings its 0.7 shapes plant", () => {
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
      "46:54 banned/use-on-instance",
      "44:30 banned/removed-entry",
      // Both call sites: the `.use(loader())` above clears nothing in 0.8.
      "52:6 banned/register-loader-on-instance",
      "58:6 banned/register-loader-on-instance",
      "9:2 prose/register-loader-is-core-method",
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
// Receivers that are not ours, and the 0.5 capability calls 0.8 also lacks.
// ---------------------------------------------------------------------------

test("app.use(Vuetify) and friends → exempt, those pages are correct", () => {
  // Shapes verified in the platform docs. Nothing on the page can clear a
  // banned rule, so a finding here would be unclearable on a correct page —
  // which is how a pinned baseline moves.
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
    "const c = createI18n({ locale: 'en' }).with(fetchLoaderPlugin());",
    "```",
  ].join("\n");

  assert.deepEqual(
    rulesOf(body).filter((rule) => rule === "banned/with-composition"),
    ["banned/with-composition", "banned/with-composition", "banned/with-composition"],
  );
});

// ---------------------------------------------------------------------------
// 0.8 — the forms the 0.7 rules REQUIRED are banned (stage D lot S1).
// ---------------------------------------------------------------------------

const ts = (...lines) => ["```ts", ...lines, "```"].join("\n");

test("receiverOf → the receiver's last segment and the root of its chain", () => {
  const at = (code) => receiverOf(code, code.lastIndexOf("."));
  assert.deepEqual(at("i18n.use("), { tail: "i18n", root: "i18n" });
  assert.deepEqual(at("nuxtApp.$i18n.use("), { tail: "$i18n", root: "nuxtApp" });
  assert.deepEqual(at("nuxtApp.vueApp.use("), { tail: "vueApp", root: "nuxtApp" });
  assert.deepEqual(at("createI18n({ locale: 'en' }).use("), { tail: "", root: "createI18n" });
  assert.deepEqual(at("createApp(App).use(router).use("), { tail: "", root: "createApp" });
  assert.deepEqual(at("createI18n({\n  locale: 'en',\n})\n  .use("), {
    tail: "",
    root: "createI18n",
  });
  assert.deepEqual(at("i18n?.use("), { tail: "i18n", root: "i18n" });
});

test(".use( on the instance → banned/use-on-instance, in every receiver shape", () => {
  for (const code of [
    "i18n.use(loader({ de: () => import('./de.json') }));",
    "const i18n = createI18n({ locale: 'en' }).use(cdnLoader({ cdnUrl }));",
    "i18n?.use(devtools());",
    "nuxtApp.$i18n.use(myPlugin);",
    "i18n.core.use(plugins());",
    "const host = createI18n({ locale: 'en' });\nhost.use(myPlugin);",
    "export const i18n = createNextI18n({ locale: 'en' }).use(nextPlugin(f, { runtime }));",
    "instance.use(localeDetector({ order: ['querystring'] }));",
    "instance.use(fetchLoaderPlugin({ apiKey }));",
  ]) {
    assert.deepEqual(rulesOf(ts(code)), ["banned/use-on-instance"], code);
  }
});

test("a chain broken across lines → banned at the `.use(` line and column", () => {
  const findings = findingsOf(
    ts("export const i18n = createI18n({", "  locale: 'en',", "})", "  .use(fetchLoader());"),
  );

  assert.deepEqual(
    findings.map((f) => `${f.line}:${f.col} ${f.rule}`),
    ["9:3 banned/use-on-instance"],
  );
  assert.match(findings[0].message, /^\.use\( — the 0\.8 instance has no \.use\(\)/);
  assert.match(findings[0].message, /`loader: cdn\(url\)`/);
});

test("Vue's app.use(i18n) and other receivers' .use( → clean", () => {
  const body = ts(
    "const i18n = createI18n({ locale: 'en', messages });",
    "app.use(i18n);",
    "createApp(App).use(router).use(i18n).mount('#app');",
    "nuxtApp.vueApp.use(i18n);",
    "app.use(Vuetify);",
    "server.use(Middleware());",
    "i18next.use(HttpBackend);",
    "x.use(y);",
  );

  assert.deepEqual(rulesOf(body), []);
});

test("a foreign receiver is clean even with an installer-shaped argument", () => {
  // `app.use(loader())` is not a comvi call whatever its argument is named:
  // the receiver decides before the argument is read.
  assert.deepEqual(rulesOf(ts("app.use(loader());", "nuxtApp.vueApp.use(devtools());")), []);
});

test(".use(icu()) → one finding, banned/use-on-instance", () => {
  assert.deepEqual(rulesOf(ts("createI18n({ locale: 'en' }).use(icu());")), [
    "banned/use-on-instance",
  ]);
});

test(".use( in a diff fence's removed line → not linted; in its added line → banned", () => {
  const removed = ["```diff", "-i18n.use(loader());", "+loader: cdn(url),", "```"].join("\n");
  const added = ["```diff", "-loader: cdn(url),", "+i18n.use(loader());", "```"].join("\n");

  assert.deepEqual(rulesOf(removed), []);
  assert.deepEqual(rulesOf(added), ["banned/use-on-instance"]);
});

test("i18n.init() → banned/instance-init, in every receiver shape", () => {
  for (const code of [
    "await i18n.init();",
    "await createI18n({ locale: 'en' }).init();",
    "const c = createI18n({ locale: 'en' });\nawait c.init();",
    "nuxtApp.$i18n.init();",
  ]) {
    assert.deepEqual(rulesOf(ts(code)), ["banned/instance-init"], code);
  }
  const findings = findingsOf(ts("await i18n.init();"));
  assert.match(findings[0].message, /i18n\.ready/);
});

test("another library's init() → clean", () => {
  assert.deepEqual(rulesOf(ts("i18next.init({ lng: 'en' });", "app.init();", "chart.init();")), []);
});

test("compiler: icuCompiler → banned/icu-compiler at the option and at the import", () => {
  const findings = findingsOf(
    ts(
      "import { icuCompiler } from '@comvi/core/icu';",
      "const i18n = createI18n({ locale: 'en', compiler: icuCompiler });",
    ),
  );

  assert.deepEqual(
    findings.map((f) => `${f.line}:${f.col} ${f.rule}`),
    ["6:10 banned/icu-compiler", "7:51 banned/icu-compiler", "6:30 banned/removed-entry"],
  );
});

test("the removed icu installer's import → banned/icu-compiler, an alias does not hide it", () => {
  assert.deepEqual(rulesOf(ts("import { icu as installIcu } from '@comvi/core';")), [
    "banned/icu-compiler",
  ]);
  assert.deepEqual(rulesOf(ts("import { icuCompiler as icu } from '@comvi/core';")), [
    "banned/icu-compiler",
  ]);
  // Another library's `icu` is not ours.
  assert.deepEqual(rulesOf(ts("import { icu } from 'some-icu-lib';")), []);
});

test("an ICU catalog with no compiler named → clean: 0.8 compiles ICU always", () => {
  const body = [
    '```json title="locales/en.json"',
    '{ "cart.items": "{count, plural, one {# item} other {# items}}" }',
    "```",
  ].join("\n");

  assert.deepEqual(rulesOf(body, { file: "docs/i18n/react.mdx" }), []);
});

test("every removed entry point → banned/removed-entry, by specifier", () => {
  for (const specifier of [
    "@comvi/core/loader",
    "@comvi/core/icu",
    "@comvi/core/rich-text",
    "@comvi/core/tags",
    "@comvi/core/editor-bridge",
    "@comvi/plugin-fetch-loader",
    "@comvi/plugin-locale-detector",
    "@comvi/plugin-in-context-editor",
    "@comvi/next",
    "@comvi/next/config",
    "@comvi/nuxt/setup",
  ]) {
    const findings = findingsOf(ts(`import { x } from "${specifier}";`));
    assert.deepEqual(
      findings.map((f) => f.rule),
      ["banned/removed-entry"],
      specifier,
    );
    assert.match(findings[0].message, new RegExp(`^${specifier.replace(/\//g, "\\/")} — `));
  }
  assert.deepEqual(rulesOf(ts("const m = await import('@comvi/plugin-fetch-loader');")), [
    "banned/removed-entry",
  ]);
});

test("the 0.8 entry points → clean", () => {
  const body = ts(
    "import { createI18n } from '@comvi/core';",
    "import { cdn, api, createCatalogStore } from '@comvi/core/cdn';",
    "import { detect, persist } from '@comvi/core/plugins';",
    "import { formatNumber } from '@comvi/core/format';",
    "import { devtools } from '@comvi/core/devtools';",
    "import { handover } from '@comvi/core/ssr';",
    "import { createGetI18n } from '@comvi/next/server';",
    "import { I18nProvider } from '@comvi/next/client';",
    "import { defineI18nOptions } from '@comvi/nuxt/i18n';",
    "import { useI18n } from '@comvi/react';",
    "const i18n = createI18n({",
    "  locale: 'en',",
    "  loader: cdn('https://cdn.comvi.io/abc'),",
    "  plugins: [detect({ supported: ['en', 'de'] }), devtools()],",
    "});",
    "await i18n.ready;",
  );

  assert.deepEqual(rulesOf(body), []);
});

test("devtools options → banned in 0.8, on the constructor and inside devtools() alike", () => {
  for (const code of [
    "createI18n({ locale: 'en', plugins: [devtools({ instanceId: 'app' })] });",
    "createI18n({ locale: 'en', editorVersion: '1.2.0' });",
  ]) {
    assert.deepEqual(rulesOf(ts(code)), ["banned/devtools-options-on-constructor"], code);
  }
});

test(".with(icu()) → banned/with-composition, the one finding", () => {
  assert.deepEqual(rulesOf(ts("createI18n({ locale: 'en' }).with(icu());")), [
    "banned/with-composition",
  ]);
});

test("a 0.7 page lands every banned form on one rule each", () => {
  // The shape of a 0.7 site page, once per removed form.
  const body = ts(
    "import { createI18n } from '@comvi/react';",
    "import { icuCompiler } from '@comvi/core/icu';",
    "import { fetchLoader } from '@comvi/plugin-fetch-loader';",
    "export const i18n = createI18n({ locale: 'en', compiler: icuCompiler })",
    "  .use(fetchLoader({ cdnUrl }));",
    "await i18n.init();",
  );

  assert.deepEqual([...new Set(rulesOf(body))].sort(), [
    "banned/icu-compiler",
    "banned/instance-init",
    "banned/removed-entry",
    "banned/use-on-instance",
  ]);
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
