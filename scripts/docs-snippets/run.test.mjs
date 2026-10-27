import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectDocs,
  collectInstalledReadmes,
  collectReadmes,
  formatReport,
  loadSizeBaselines,
  parseArgs,
  runGate,
} from "./run.mjs";
import { computeModuleSha, readMarker } from "./module-sha.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, "run.mjs");
const REPO = path.resolve(HERE, "..", "..");

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/**
 * A miniature of both surfaces at once: a package README that composes its
 * capability properly, a content page that does not, and one competitor fence so
 * the skip budget has something to count.
 */
function makeFixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-snippets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  write(
    path.join(root, "packages/react/README.md"),
    [
      "# @comvi/react",
      "",
      "```tsx",
      "const i18n = createI18n({ locale: 'en' }).use(loader());",
      "```",
      "",
    ].join("\n"),
  );
  write(path.join(root, "packages/cli/README.md"), "# @comvi/cli\n\nNo code here.\n");
  write(
    path.join(root, "README.md"),
    "# comvi\n\n```ts\nconst i18n = createI18n({ locale: 'en' }).use(loader());\n```\n",
  );

  write(
    path.join(root, "content/react.mdx"),
    [
      "---",
      "title: 'React'",
      "---",
      "",
      "```tsx",
      "i18n.registerLoader(myLoader);",
      "```",
      "",
    ].join("\n"),
  );
  write(
    path.join(root, "content/nested/guides/migrate.mdx"),
    [
      "---",
      "title: 'Migrate'",
      "---",
      "",
      "```ts",
      "import i18next from 'i18next';",
      "```",
      "",
    ].join("\n"),
  );
  write(
    path.join(root, "content/node_modules/ignored/skip.md"),
    "```ts\ni18n.registerLoader(x);\n```\n",
  );
  write(
    path.join(root, "node_modules/@comvi/core/README.md"),
    "# @comvi/core\n\n```ts\ni18n.registerLoader(myLoader);\n```\n",
  );
  return root;
}

test("parseArgs with neither --readmes nor --content → refuses instead of checking nothing", () => {
  assert.throws(() => parseArgs([]), /nothing to check/);
});

test("parseArgs with an unknown flag → refuses, naming the flag", () => {
  assert.throws(
    () => parseArgs(["--readmes", "--strict-mode"]),
    /unknown argument "--strict-mode"/,
  );
});

test("parseArgs: --typecheck without --sdk-root → refuses, and says where to get one", () => {
  // Silently type-checking against nothing is the failure this whole lot exists
  // to stop: it would report "no findings" over an SDK that was never there.
  assert.throws(() => parseArgs(["--readmes", "--typecheck"]), /--typecheck needs --sdk-root/);
});

test("parseArgs: --sdk-root without --typecheck → refuses rather than ignoring it", () => {
  assert.throws(
    () => parseArgs(["--readmes", "--sdk-root", "/tmp/x"]),
    /--sdk-root does nothing without --typecheck/,
  );
});

test("parseArgs: --typecheck --sdk-root together → both recorded", () => {
  const options = parseArgs(["--readmes", "--typecheck", "--sdk-root", "/tmp/sdk"]);

  assert.equal(options.typecheck, true);
  assert.equal(options.sdkRoot, "/tmp/sdk");
  assert.equal(options.sfc, true);
});

test("parseArgs: without --typecheck the D2a shape is unchanged", () => {
  const options = parseArgs(["--readmes"]);

  assert.equal(options.typecheck, false);
  assert.equal(options.sdkRoot, null);
});

test("parseArgs with both runners and a version → both surfaces in one run", () => {
  const options = parseArgs([
    "--readmes",
    "--content",
    "src/content",
    "--sdk-version",
    "0.5.0",
    "--json",
  ]);

  assert.equal(options.readmes, true);
  assert.equal(options.content, "src/content");
  assert.equal(options.sdkVersion, "0.5.0");
  assert.equal(options.json, true);
});

test("collectReadmes → every package README, then the root README", (t) => {
  const root = makeFixtureRoot(t);

  const files = collectReadmes(root).map((file) => path.relative(root, file));

  assert.deepEqual(files, ["packages/cli/README.md", "packages/react/README.md", "README.md"]);
});

test("collectReadmes → examples/README.md is gated too", (t) => {
  // A reader-facing page no gate covered, which is how it drifted while the
  // pages beside it were migrated. Last in the list, after the root README.
  const root = makeFixtureRoot(t);
  write(path.join(root, "examples/README.md"), "# Examples\n\nNo code here.\n");

  const files = collectReadmes(root).map((file) => path.relative(root, file));

  assert.deepEqual(files, [
    "packages/cli/README.md",
    "packages/react/README.md",
    "README.md",
    path.join("examples", "README.md"),
  ]);
});

test("collectReadmes → the design notes under docs/design are gated too", (t) => {
  // The wave-5 restructure moved the rationale essays out of the READMEs into
  // these notes, fences and all. An essay that leaves a gated page for an
  // ungated one has not been tidied away, it has been un-checked.
  const root = makeFixtureRoot(t);
  write(path.join(root, "docs/design/composition.md"), "# Composition\n\nNo code here.\n");
  write(path.join(root, "docs/design/icu.md"), "# ICU\n\nNo code here.\n");

  const files = collectReadmes(root).map((file) => path.relative(root, file));

  assert.deepEqual(files, [
    "packages/cli/README.md",
    "packages/react/README.md",
    "README.md",
    path.join("docs", "design", "composition.md"),
    path.join("docs", "design", "icu.md"),
  ]);
});

test("collectReadmes without a docs/design tree → unchanged, not an error", (t) => {
  const root = makeFixtureRoot(t);

  const files = collectReadmes(root).map((file) => path.relative(root, file));

  assert.deepEqual(files, ["packages/cli/README.md", "packages/react/README.md", "README.md"]);
});

test("a stale size figure in a design note fails the gate like one in a README", (t) => {
  // The whole point of collecting the notes: the fences and the tables a reader
  // copies are the same ones, and only the file they live in changed.
  const root = makeFixtureRoot(t);
  write(
    path.join(root, "scripts/size-budgets.json"),
    JSON.stringify({
      fixtures: [
        {
          name: "fw-react-default",
          gzipBudgetBytes: 7248,
          baseline: { minBytes: 19035, gzipBytes: 6902 },
        },
      ],
    }),
  );
  write(
    path.join(root, "docs/design/weight.md"),
    "# Weight\n\n| app | fixture | min+gz |\n| --- | --- | --- |\n| base | `fw-react-default` | 6622 B |\n",
  );

  const { findings } = runGate({ readmes: true, root, json: false, typecheck: false, sfc: true });

  assert.deepEqual(
    findings
      .filter((finding) => finding.rule === "prose/stale-size-figure")
      .map((finding) => finding.file),
    [path.join("docs", "design", "weight.md")],
  );
});

test("loadSizeBaselines → the three recorded numbers per fixture, keyed by name", () => {
  const baselines = loadSizeBaselines(REPO);

  const react = baselines.get("fw-react-default");
  assert.equal(typeof react.gzipBytes, "number");
  assert.equal(typeof react.minBytes, "number");
  assert.equal(typeof react.gzipBudgetBytes, "number");
  // Every gated row is present, and the budget rule the md file states holds:
  // measured + 5 %, capped by the row's design ceiling when it has one.
  const ceilings = new Map(
    JSON.parse(fs.readFileSync(path.join(REPO, "scripts/size-budgets.json"), "utf8")).fixtures.map(
      (fixture) => [fixture.name, fixture.ceilingBytes ?? Infinity],
    ),
  );
  for (const [name, recorded] of baselines) {
    assert.equal(
      recorded.gzipBudgetBytes,
      Math.min(ceilings.get(name), Math.ceil(recorded.gzipBytes * 1.05)),
      name,
    );
  }
});

test("loadSizeBaselines on a root without the budgets file → null, so the rule stays inert", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-snippets-nobudgets-"));
  try {
    assert.equal(loadSizeBaselines(root), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("collectDocs → .md and .mdx below the directory, node_modules excluded", (t) => {
  const root = makeFixtureRoot(t);

  const files = collectDocs(path.join(root, "content")).map((file) => path.relative(root, file));

  assert.deepEqual(files, ["content/nested/guides/migrate.mdx", "content/react.mdx"]);
});

test("collectInstalledReadmes → the README of each installed @comvi package", (t) => {
  const root = makeFixtureRoot(t);

  const files = collectInstalledReadmes(root).map((file) => path.relative(root, file));

  assert.deepEqual(files, ["node_modules/@comvi/core/README.md"]);
});

test("collectInstalledReadmes where nothing is installed → empty, not an error", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-snippets-empty-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.deepEqual(collectInstalledReadmes(root), []);
});

test("the readmes runner over composed READMEs → no findings", (t) => {
  const root = makeFixtureRoot(t);

  const result = runGate({ readmes: true, content: null, sdkVersion: "0.5.0", root });

  assert.deepEqual(result.findings, []);
});

test("the content runner → flags the page AND the installed README, each at its source line", (t) => {
  // Owner's decision §5.3: the site and the published READMEs are one surface or
  // they drift again, so `--content` checks both under the same rules.
  const root = makeFixtureRoot(t);

  const result = runGate({ readmes: false, content: "content", sdkVersion: "0.5.0", root });

  const registerLoader = result.findings.filter(
    (f) => f.rule === "banned/register-loader-on-instance",
  );
  assert.deepEqual(
    registerLoader.map((f) => `${f.file}:${f.line}:${f.col}`),
    ["content/react.mdx:6:1", "node_modules/@comvi/core/README.md:4:1"],
  );
});

test("the content runner → findings sorted by file, then line, then column", (t) => {
  const root = makeFixtureRoot(t);

  const { findings } = runGate({ readmes: false, content: "content", sdkVersion: "0.5.0", root });

  const keys = findings.map(
    (f) => `${f.file}:${String(f.line).padStart(4, "0")}:${String(f.col).padStart(4, "0")}`,
  );
  assert.deepEqual(keys, [...keys].sort());
});

test("formatReport on a clean run → the OK line and the document count", (t) => {
  const root = makeFixtureRoot(t);

  const report = formatReport(runGate({ readmes: true, content: null, sdkVersion: "0.5.0", root }));

  assert.match(report, /docs-snippets: 3 documents, 2 fences, 2 linted\./);
  assert.match(report, /docs-snippets: OK — no findings\./);
});

test("formatReport on a failing run → file:line:col, the rule, and the skip budget", (t) => {
  const root = makeFixtureRoot(t);

  const report = formatReport(
    runGate({ readmes: false, content: "content", sdkVersion: "0.5.0", root }),
  );

  assert.match(report, /content\/react\.mdx:6:1 {2}banned\/register-loader-on-instance/);
  assert.match(report, /foreign-import: 1/);
  assert.match(report, /docs-snippets: FAIL — 4 findings in 2 documents\./);
});

test("formatReport → the divergence baseline, page by page", (t) => {
  const root = makeFixtureRoot(t);

  const report = formatReport(
    runGate({ readmes: false, content: "content", sdkVersion: "0.5.0", root }),
  );

  assert.match(report, /pages mentioning registerLoader at all: 2/);
  assert.match(report, /of those, pages with a banned registerLoader call: 2/);
  assert.match(
    report,
    /framework pages missing \.use\(installer\): 2\n {4}content\/react\.mdx\n {4}node_modules\/@comvi\/core\/README\.md/,
  );
});

test("the CLI on the js-sdk npm surface → runs the whole corpus, and the tool itself is clean", () => {
  const result = spawnSync(process.execPath, [RUN, "--readmes", "--json"], {
    cwd: REPO,
    encoding: "utf8",
  });

  // This test asserts the TOOL, not the corpus. It used to pin `exit 0` — "the
  // live READMEs have no findings" — and that made the unit suite a second copy
  // of `pnpm check:snippets`: the day a rule correctly caught something in a
  // README, this test went red for a reason that has nothing to do with the
  // runner. Corpus cleanliness is the GATE's job, it is wired as
  // `check:snippets` in CI, and it is the document owner who clears it. What is
  // this test's job is that the runner reaches every document and does not
  // choke on any of them.
  assert.ok(result.status === 0 || result.status === 1, result.stdout + result.stderr);
  const { findings, stats } = JSON.parse(result.stdout);
  // One stat per gated document, however many there are today: pinning a
  // literal count made this test red the day a README was added, the exact
  // "red for a reason unrelated to the runner" this rewrite exists to remove.
  assert.equal(stats.length, collectReadmes(REPO).length);
  assert.ok(stats.every((stat) => stat.fences >= 0 && stat.linted <= stat.fences));

  // TOOL-level findings, as opposed to API ones: an unparsed fence or a
  // meta token the vocabulary does not define means the gate misread the
  // corpus, and every verdict downstream of it is worthless.
  //
  // The tool rules are NAMED, rather than spelled "everything that is not
  // `banned/`". That shorthand held only while the corpus happened to have no
  // `prose/` or `required/` finding, and it put this test back in the business
  // the paragraph above says is not its business: the day a prose rule
  // correctly caught a stale sentence in a README, a test about the runner went
  // red for it. Which rules read the DOCUMENT is a fact about the tool; which
  // findings the corpus has is the gate's verdict, and `check:snippets` is
  // where a reader should see it.
  const TOOL_RULES = ["extract/", "meta/", "fence/"];
  assert.deepEqual(
    findings
      .filter((finding) => TOOL_RULES.some((prefix) => finding.rule.startsWith(prefix)))
      .map((f) => f.rule),
    [],
  );
});

test("the CLI on a surface with findings → exit 1", (t) => {
  const root = makeFixtureRoot(t);

  const result = spawnSync(process.execPath, [RUN, "--content", "content"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /docs-snippets: FAIL/);
});

test("the CLI with no runner selected → exit 2 and the usage line", () => {
  const result = spawnSync(process.execPath, [RUN], { cwd: REPO, encoding: "utf8" });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage: node scripts\/docs-snippets\/run\.mjs/);
});

test("the CLI with --json → machine output, and still exit 1 on findings", (t) => {
  const root = makeFixtureRoot(t);

  const result = spawnSync(process.execPath, [RUN, "--content", "content", "--json"], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).findings.length, 4);
});

test("the recorded parity marker → matches the module in this repo", () => {
  assert.equal(readMarker(HERE), computeModuleSha(HERE));
});

test("formatReport: an advisory finding is reported apart and does not make the run FAIL", () => {
  // `typecheck/node16-only` describes the reader's tsconfig, not the snippet. A
  // reader who cannot tell it from a broken example fixes the wrong thing, and a
  // gate that fails on it fails on every extensionless relative import in the
  // corpus — which is all of them.
  const report = formatReport({
    files: ["docs/i18n/page.mdx"],
    stats: [],
    typeStats: [{ projects: 1, files: 1, checkedFences: 1, node16Only: 1 }],
    findings: [
      {
        file: "docs/i18n/page.mdx",
        line: 7,
        col: 1,
        rule: "typecheck/node16-only",
        advisory: true,
        message: "TS2834 under moduleResolution=node16 only: needs an extension",
      },
    ],
  });

  assert.match(report, /advisory, not counted against the gate: 1/);
  assert.match(report, /TS2834×1/);
  assert.match(report, /OK — no findings\. \(1 advisory\)/);
});

test("formatReport: a non-advisory typecheck finding still fails the run", () => {
  const report = formatReport({
    files: ["docs/i18n/page.mdx"],
    stats: [],
    typeStats: [{ projects: 1, files: 1, checkedFences: 1, node16Only: 0 }],
    findings: [
      {
        file: "docs/i18n/page.mdx",
        line: 7,
        col: 14,
        rule: "typecheck/error",
        message: "TS2322: Type 'string' is not assignable to type 'number'.",
      },
    ],
  });

  assert.match(report, /docs\/i18n\/page\.mdx:7:14 {2}typecheck\/error/);
  assert.match(report, /FAIL — 1 finding in 1 document/);
});

test("the runner exits 0 when only advisories remain", () => {
  // The exit code is the gate. Asserting it on the process, not on a function,
  // because that is what CI reads.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-run-advisory-"));
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "docs", "page.mdx"),
    "---\ntitle: p\n---\n\n```ts\nexport const a = 1;\n```\n",
  );

  const result = spawnSync(process.execPath, [RUN, "--content", "docs", "--root", dir], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("parseArgs: a flag where a value belongs is refused, not swallowed", () => {
  // `--sdk-root --json` used to take `--json` as the directory and fail much
  // later, deep in the type driver, with a message about node_modules.
  assert.throws(
    () => parseArgs(["--readmes", "--typecheck", "--sdk-root", "--json"]),
    /--sdk-root needs a value, but got the flag "--json"/,
  );
});

test("parseArgs: a trailing flag with no value at all is refused", () => {
  assert.throws(() => parseArgs(["--content"]), /--content needs a value/);
});

test("formatReport: tsc programs and SFC programs are counted apart", () => {
  // A project holding both a `.ts` and a `.vue` fence is compiled twice — once
  // in memory, once by vue-tsc — and adding the two read as 272 projects on a
  // site that has 213.
  const report = formatReport({
    files: ["docs/i18n/page.mdx"],
    stats: [],
    findings: [],
    typeStats: [{ projects: 3, files: 9, checkedFences: 5, node16Only: 0, skips: {} }],
    sfcStats: [{ sfcProjects: 2, sfc: { vue: 1, svelte: 1 } }],
  });

  assert.match(report, /3 tsc programs over 9 virtual files \(5 ts\/tsx fences\)/);
  assert.match(report, /2 SFC programs \(1 vue, 1 svelte\)/);
  assert.doesNotMatch(report, /5 tsc programs/);
});

test("formatReport: agreeing skip budgets are printed once, as agreement", () => {
  const report = formatReport({
    files: ["docs/i18n/page.mdx"],
    findings: [],
    stats: [
      { file: "docs/i18n/page.mdx", fences: 2, linted: 1, skips: { "url-import": 1 }, classes: [] },
    ],
    typeStats: [
      { projects: 1, files: 1, checkedFences: 1, node16Only: 0, skips: { "url-import": 1 } },
    ],
    sfcStats: [],
  });

  assert.match(report, /skip budget: lint and typecheck agree \(url-import: 1\)/);
});

test("formatReport: disagreeing skip budgets are called out, not averaged", () => {
  // The budget is computed on both sides and was only ever printed on one. Two
  // passes reading different fences is a fact a reader has to be told.
  const report = formatReport({
    files: ["docs/i18n/page.mdx"],
    findings: [],
    stats: [
      { file: "docs/i18n/page.mdx", fences: 2, linted: 1, skips: { "url-import": 1 }, classes: [] },
    ],
    typeStats: [{ projects: 1, files: 1, checkedFences: 1, node16Only: 0, skips: {} }],
    sfcStats: [],
  });

  assert.match(report, /SKIP BUDGETS DISAGREE/);
  assert.match(report, /One pass is reading fences the other is not/);
});

test("formatReport: the TS2304 pile is split by whether an earlier fence declares the name", () => {
  const report = formatReport({
    files: ["docs/i18n/page.mdx"],
    stats: [],
    typeStats: [{ projects: 1, files: 2, checkedFences: 2, node16Only: 0, skips: {} }],
    sfcStats: [],
    findings: [
      {
        file: "docs/i18n/page.mdx",
        line: 9,
        col: 1,
        rule: "typecheck/error",
        cause: "continues-an-earlier-fence",
        message: "TS2304: Cannot find name 'i18n'.",
      },
      {
        file: "docs/i18n/page.mdx",
        line: 14,
        col: 1,
        rule: "typecheck/error",
        message: "TS2304: Cannot find name 'nobodyDeclaredThis'.",
      },
    ],
  });

  assert.match(report, /codes: TS2304×2/);
  assert.match(report, /of these, 1 name something an earlier fence on the same page declares/);
});
