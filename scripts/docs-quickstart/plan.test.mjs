import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CDN_PLACEHOLDER,
  DEFAULT_SCAFFOLDS,
  FRAMEWORKS,
  QUIET_ENV,
  expectation,
  fenceForLine,
  firstFailingLine,
  nonInteractive,
  parseTerminal,
  planPage,
  renderTable,
  splitCommands,
  substituteCdn,
  tabLabels,
  TOOLCHAIN,
} from "./plan.mjs";
import { parseArgs, projectPlan } from "./run.mjs";

const PAGE = `---
title: Quick start
---

<Tabs syncKey="fw">
  <TabItem label="React">
  \`\`\`bash title="Terminal"
  npm create vite@latest my-app -- --template react-ts
  cd my-app && npm install
  npm install @comvi/react
  \`\`\`
  </TabItem>
  <TabItem label="Vue">
  \`\`\`bash title="Terminal"
  npm create vite@latest my-app -- --template vue-ts
  \`\`\`
  </TabItem>
</Tabs>

<Tabs syncKey="fw">
  <TabItem label="React">
  \`\`\`tsx title="src/main.tsx" check=group=quick-start-react-1
  import App from './App';
  \`\`\`
  </TabItem>
  <TabItem label="Vue">
  \`\`\`ts title="src/main.ts" check=group=quick-start-react-1
  import App from './App.vue';
  \`\`\`

  \`\`\`json
  { "untitled": "is not a file" }
  \`\`\`
  </TabItem>
</Tabs>
`;

test("tabLabels: each line knows the tab it sits in, and a comment is not a tab", () => {
  const labels = tabLabels(
    ['<TabItem label="React">', "x", "</TabItem>", '{/* <TabItem label="Vue"> */}', "y"].join("\n"),
  );
  assert.equal(labels[1], "React");
  assert.equal(labels[2], "React");
  assert.equal(labels[3], null);
  assert.equal(labels[5], null);
});

test("planPage: titled fences map to files per tab, Terminal lines are collected", () => {
  const plans = planPage(PAGE, "quick-start");
  assert.deepEqual([...plans.keys()].sort(), ["react", "vue"]);

  const react = plans.get("react");
  assert.deepEqual([...react.files.keys()], ["src/main.tsx"]);
  assert.equal(react.files.get("src/main.tsx").content, "import App from './App';\n");
  assert.equal(react.files.get("src/main.tsx").line, 22);
  assert.equal(react.terminal.length, 3);

  const vue = plans.get("vue");
  // The untitled JSON fence is an illustration, not a file of the project.
  assert.deepEqual([...vue.files.keys()], ["src/main.ts"]);
});

test("planPage: a fence whose group names another framework is flagged", () => {
  const vue = planPage(PAGE, "quick-start").get("vue");
  assert.equal(vue.notes.length, 1);
  assert.match(vue.notes[0], /Vue tab but carries check=group=quick-start-react-1/);
});

test("splitCommands: && splits, comments and blank lines go", () => {
  assert.deepEqual(splitCommands(["cd my-app && npm install", "", "# note", "npm i x # why"]), [
    ["cd", "my-app"],
    ["npm", "install"],
    ["npm", "i", "x"],
  ]);
});

test("nonInteractive: create-vite keeps the template and adds --no-interactive", () => {
  const step = nonInteractive("npm create vite@latest my-app -- --template react-ts".split(" "));
  assert.deepEqual(step.argv, [
    "npm",
    "create",
    "vite@latest",
    "my-app",
    "--",
    "--template",
    "react-ts",
    "--no-interactive",
  ]);
  assert.equal(step.dir, "my-app");
});

test("nonInteractive: create-next-app answers every prompt with its default", () => {
  const step = nonInteractive("npx create-next-app@latest my-app".split(" "));
  assert.deepEqual(step.argv, [
    "npx",
    "--yes",
    "create-next-app@latest",
    "my-app",
    "--yes",
    "--skip-install",
    "--disable-git",
  ]);
  assert.equal(step.dir, "my-app");
});

test("nonInteractive: create-nuxt gets a `--` so the flags reach the scaffolder", () => {
  const step = nonInteractive("npm create nuxt@latest my-app".split(" "));
  assert.deepEqual(step.argv.slice(0, 5), ["npm", "create", "nuxt@latest", "my-app", "--"]);
  assert.ok(step.argv.includes("--no-install"));
  const template = step.argv.indexOf("--template");
  assert.equal(step.argv[template + 1], "minimal");
  assert.equal(step.dir, "my-app");
});

test("nonInteractive: sv create takes the first answer of each prompt", () => {
  const step = nonInteractive("npx sv create my-app".split(" "));
  assert.deepEqual(step.argv, [
    "npx",
    "--yes",
    "sv",
    "create",
    "my-app",
    "--template",
    "minimal",
    "--types",
    "ts",
    "--no-add-ons",
    "--no-install",
  ]);
  assert.equal(step.dir, "my-app");
});

test("nonInteractive: an unknown scaffolder is an error, not a guess", () => {
  assert.throws(() => nonInteractive(["npx", "degit", "foo/bar", "my-app"]), /no non-interactive/);
});

test("parseTerminal: scaffold, installs, and every line it cannot classify", () => {
  const plan = parseTerminal([
    "npx create-next-app@latest my-app",
    "cd my-app",
    "npm install @comvi/next server-only",
    "npx comvi pull",
  ]);
  assert.equal(plan.scaffold.dir, "my-app");
  assert.deepEqual(plan.installs, ["@comvi/next", "server-only"]);
  assert.deepEqual(plan.unknown, ["npx comvi pull"]);
});

test("substituteCdn: the placeholder is replaced and counted", () => {
  const source = `cdnLoader({ cdnUrl: '${CDN_PLACEHOLDER}' })`;
  const out = substituteCdn(source, "http://127.0.0.1:9/t");
  assert.equal(out.content, "cdnLoader({ cdnUrl: 'http://127.0.0.1:9/t' })");
  assert.equal(out.count, 1);
  assert.equal(out.stray, false);
});

test("substituteCdn: a production URL in another form is reported, not built", () => {
  const out = substituteCdn("cdnUrl: 'https://cdn.comvi.io/abc123'", "http://127.0.0.1:9/t");
  assert.equal(out.count, 0);
  assert.equal(out.stray, true);
});

test("expectation: connect pages look for the CDN wording, Vanilla also in the console", () => {
  assert.equal(expectation("react", "quick-start").text, "Hello, Alice!");
  assert.equal(expectation("react", "connect-comvi").text, "Hello from the CDN, Alice!");
  assert.equal(expectation("next", "quick-start").path, "/");
  assert.deepEqual(expectation("next", "connect-comvi").switchTo, {
    link: "Switch",
    path: "/uk",
    text: "Привіт з CDN, Alice!",
  });
  assert.equal(expectation("react", "quick-start").switchTo, undefined);
  assert.equal(TOOLCHAIN.next.serve(3000).host, "localhost");
  assert.match(expectation("vanilla", "quick-start").where, /console/);
});

test("QUIET_ENV: every telemetry opt-out the gate's tools read", () => {
  for (const name of ["DO_NOT_TRACK", "NEXT_TELEMETRY_DISABLED", "NUXT_TELEMETRY_DISABLED"]) {
    assert.equal(QUIET_ENV[name], "1");
  }
});

test("firstFailingLine: the first error line, ANSI stripped", () => {
  const output = [
    "\u001b[32mvite v8\u001b[39m building",
    "warning: something soft",
    "src/app/page.tsx(4,25): error TS2307: Cannot find module '@/i18n'",
    "later error",
  ].join("\n");
  assert.equal(
    firstFailingLine(output),
    "src/app/page.tsx(4,25): error TS2307: Cannot find module '@/i18n'",
  );
  assert.equal(firstFailingLine("all\nquiet"), "quiet");
});

test("fenceForLine: the longest written path named in the line wins", () => {
  const files = new Map([
    ["src/i18n.ts", { rel: "src/i18n.ts", page: "q.mdx", line: 10 }],
    ["src/app/[locale]/page.tsx", { rel: "src/app/[locale]/page.tsx", page: "q.mdx", line: 40 }],
  ]);
  assert.equal(
    fenceForLine("src/app/[locale]/page.tsx(1,1): error", files),
    "q.mdx:40 (src/app/[locale]/page.tsx)",
  );
  assert.equal(fenceForLine("node_modules/x.js: error", files), null);
});

test("renderTable: a row per project, and the first failing line per failed step", () => {
  const table = renderTable([
    { fw: "react", page: "quick-start", steps: { scaffold: { status: "pass" } } },
    {
      fw: "next",
      page: "quick-start",
      steps: {
        scaffold: { status: "pass" },
        build: { status: "fail", line: "boom", fence: "q:1" },
      },
    },
  ]);
  assert.match(table, /\| react\s+\| quick-start \| pass/);
  assert.match(table, /- next \/ quick-start \/ build: boom \[q:1\]/);
});

test("projectPlan: connect-comvi layers its files and installs over the quick start", () => {
  const quick = planPage(PAGE, "quick-start");
  const connect = planPage(
    [
      '<TabItem label="React">',
      '```bash title="Terminal"',
      "npm install @comvi/plugin-fetch-loader",
      "```",
      '```tsx title="src/main.tsx" check=group=connect-comvi-react-1',
      "import { cdnLoader } from '@comvi/plugin-fetch-loader/cdn';",
      "```",
      "</TabItem>",
    ].join("\n"),
    "connect-comvi",
  );
  const plan = projectPlan(
    new Map([
      ["quick-start", quick],
      ["connect-comvi", connect],
    ]),
    "react",
    "connect-comvi",
  );
  assert.equal(plan.scaffold.dir, "my-app");
  assert.deepEqual(plan.installs, ["@comvi/react", "@comvi/plugin-fetch-loader"]);
  assert.match(plan.files.get("src/main.tsx").content, /cdnLoader/);
});

test("parseArgs: --content is required and --only must name known frameworks", () => {
  assert.throws(() => parseArgs([]), /--content/);
  assert.throws(() => parseArgs(["--content", "x", "--only", "angular"]), /unknown framework/);
  const options = parseArgs(["--content", "x", "--only", "react,vue", "--jobs", "2"]);
  assert.deepEqual(options.only, ["react", "vue"]);
  assert.equal(options.jobs, 2);
  assert.equal(options.nextWebpack, false);
  assert.equal(parseArgs(["--content", "x", "--next-webpack"]).nextWebpack, true);
});

test("planPage: a Terminal fence outside every tab applies to each framework on the page", () => {
  const page = [
    '```bash title="Terminal"',
    "npm install @comvi/plugin-fetch-loader",
    "```",
    '<Tabs syncKey="fw">',
    '  <TabItem label="React">',
    '  ```tsx title="src/main.tsx" check=group=connect-comvi-react-1',
    "  export {};",
    "  ```",
    "  </TabItem>",
    '  <TabItem label="Vue">',
    '  ```ts title="src/main.ts" check=group=connect-comvi-vue-1',
    "  export {};",
    "  ```",
    "  </TabItem>",
    "</Tabs>",
  ].join("\n");
  const plans = planPage(page, "connect-comvi");
  assert.deepEqual([...plans.keys()].sort(), ["react", "vue"]);
  assert.deepEqual(plans.get("react").terminal, ["npm install @comvi/plugin-fetch-loader"]);
  assert.deepEqual(plans.get("vue").terminal, ["npm install @comvi/plugin-fetch-loader"]);
});

test("parseTerminal: `npm run dev` is the reader's step the gate performs itself, not an unknown", () => {
  const plan = parseTerminal(["npm install @comvi/react", "npm run dev"]);
  assert.deepEqual(plan.installs, ["@comvi/react"]);
  assert.deepEqual(plan.unknown, []);
});

const INSTALL_ONLY_PAGE = [
  '<TabItem label="React">',
  '```bash title="Terminal"',
  "npm install @comvi/react",
  "```",
  "</TabItem>",
  '<TabItem label="Next.js">',
  '```bash title="Terminal"',
  "npm install @comvi/next",
  "```",
  "</TabItem>",
].join("\n");

test("projectPlan: an install-only page falls back to the default scaffold", () => {
  const pages = new Map([["quick-start", planPage(INSTALL_ONLY_PAGE, "quick-start")]]);
  const react = projectPlan(pages, "react", "quick-start");
  assert.equal(react.scaffoldSource, "default");
  assert.deepEqual(react.scaffold.argv.slice(0, 6), [
    "npm",
    "create",
    "vite@latest",
    "my-app",
    "--",
    "--template",
  ]);
  assert.ok(react.scaffold.argv.includes("--no-interactive"));
  assert.deepEqual(react.installs, ["@comvi/react"]);
  const next = projectPlan(pages, "next", "quick-start");
  assert.ok(next.scaffold.argv.includes("--src-dir"));
  assert.ok(next.scaffold.argv.includes("--yes"));
});

test("projectPlan: a scaffold on the page wins over the default", () => {
  const page = INSTALL_ONLY_PAGE.replace(
    "npm install @comvi/react",
    "npm create vite@latest other-app -- --template react-swc-ts\nnpm install @comvi/react",
  );
  const pages = new Map([["quick-start", planPage(page, "quick-start")]]);
  const react = projectPlan(pages, "react", "quick-start");
  assert.equal(react.scaffoldSource, "page");
  assert.equal(react.scaffold.dir, "other-app");
  assert.ok(react.scaffold.argv.includes("react-swc-ts"));
});

test("DEFAULT_SCAFFOLDS: covers every framework and each command is understood", () => {
  for (const fw of FRAMEWORKS) {
    assert.ok(DEFAULT_SCAFFOLDS[fw.key], `no default scaffold for ${fw.key}`);
    assert.equal(nonInteractive(splitCommands([DEFAULT_SCAFFOLDS[fw.key]])[0]).dir, "my-app");
  }
});
