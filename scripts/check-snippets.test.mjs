// `pnpm check:snippets` / `check:snippets:types`: the docs snippet gate
// (scripts/docs-snippets/run.mjs) over this repo's READMEs and design records. No document is
// advisory: every finding blocks.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runGate } from "./docs-snippets/run.mjs";

const REPO = path.resolve(import.meta.dirname, "..");

test("both scripts run the gate itself over the READMEs, with nothing in between", () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
  assert.equal(scripts["check:snippets"], "node scripts/docs-snippets/run.mjs --readmes");
  assert.equal(
    scripts["check:snippets:types"],
    "node scripts/docs-snippets/run.mjs --readmes --typecheck --sdk-root .",
  );
});

/** Runs the gate over a root whose one binding README holds `fence`. */
function gateOver(fence) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-snippets-"));
  try {
    fs.mkdirSync(path.join(root, "packages", "react"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "packages", "react", "README.md"),
      `# @comvi/react\n\n\`\`\`ts\n${fence}\n\`\`\`\n`,
    );
    return runGate({ readmes: true, root }).findings;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const CREATE =
  'import { createI18n } from "@comvi/core";\nconst i18n = createI18n({ locale: "en" });';

test("a binding README on the 0.8 API passes", () => {
  assert.deepEqual(gateOver(CREATE), []);
});

test("a 0.7 form in a binding README blocks, and is not advisory", () => {
  const findings = gateOver(`${CREATE}\ni18n.use(installer);`);
  assert.deepEqual(
    findings.map((f) => [f.file, f.rule, Boolean(f.advisory)]),
    [["packages/react/README.md", "banned/use-on-instance", false]],
  );
});
