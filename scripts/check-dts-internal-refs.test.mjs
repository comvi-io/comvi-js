import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { create } from "tar";

import { isDeclarationFile, scanTarball } from "./check-dts-internal-refs.mjs";

// A real `.tgz` laid out as `npm pack` writes it: every entry under `package/`.
async function fixtureTarball(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "comvi-dts-refs-test-"));
  const pkg = path.join(dir, "package");
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(pkg, file)), { recursive: true });
    writeFileSync(path.join(pkg, file), text);
  }
  const tgz = path.join(dir, "fixture.tgz");
  await create({ gzip: true, file: tgz, cwd: dir }, ["package"]);
  return { tgz, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("isDeclarationFile: .d.ts, .d.mts and .d.cts only", () => {
  assert.ok(isDeclarationFile("dist/index.d.ts"));
  assert.ok(isDeclarationFile("dist/index.d.mts"));
  assert.ok(isDeclarationFile("dist/index.d.cts"));
  assert.ok(isDeclarationFile("dist/T.svelte.d.ts"));
  assert.ok(!isDeclarationFile("dist/index.js"));
  assert.ok(!isDeclarationFile("dist/index.d.ts.map"));
  assert.ok(!isDeclarationFile("README.md"));
});

test("scanTarball: a declaration that cites the process fails with file:line and text", async () => {
  const { tgz, cleanup } = await fixtureTarball({
    "package.json": "{}",
    "dist/index.d.ts": "export {};\n/** Rejects early (review A). */\n",
    "dist/sub/a.d.mts": "// COM-123 and R3-18\nexport declare const a: 1;\n",
  });
  try {
    const matches = await scanTarball(tgz);
    assert.deepEqual(
      matches.map(({ file, line, text }) => ({ file, line, text })),
      [
        { file: "dist/index.d.ts", line: 2, text: "review A" },
        { file: "dist/sub/a.d.mts", line: 1, text: "COM-123" },
        { file: "dist/sub/a.d.mts", line: 1, text: "R3-18" },
      ],
    );
  } finally {
    cleanup();
  }
});

test("scanTarball: every alternative of the pattern is caught", async () => {
  const samples = [
    "R12-3",
    "lot 4",
    "review B",
    "owner decision",
    "owner brief",
    "Codex",
    "COM-7",
    "MEDIUM 2",
    "(H3)",
    "design §4",
    "design\n * §1.5",
    "synthesis §4.2",
    "owner 30.10",
  ];
  const { tgz, cleanup } = await fixtureTarball({
    "dist/index.d.ts": samples.map((s) => `// ${s}`).join("\n"),
  });
  try {
    assert.equal((await scanTarball(tgz)).length, samples.length);
  } finally {
    cleanup();
  }
});

test("scanTarball: a clean tarball passes; a match outside a declaration file is ignored", async () => {
  const { tgz, cleanup } = await fixtureTarball({
    "package.json": '{"description": "see COM-1"}',
    "README.md": "Decided in review A (owner decision, lot 3).",
    "dist/index.js": "// R3-18 COM-12 Codex\nexport const a = 1;\n",
    "dist/index.d.ts.map": '{"sources":["lot 1"]}',
    "dist/index.d.ts": "/** Translates a key. Returns the key when it is missing. */\nexport {};\n",
  });
  try {
    assert.deepEqual(await scanTarball(tgz), []);
  } finally {
    cleanup();
  }
});

test("scanTarball: a tarball without any declaration file is an error, not a pass", async () => {
  const { tgz, cleanup } = await fixtureTarball({ "dist/index.js": "export {};\n" });
  try {
    await assert.rejects(scanTarball(tgz), /no declaration file/);
  } finally {
    cleanup();
  }
});

test("scanTarball: a package without types may ship no declaration file", async () => {
  const { tgz, cleanup } = await fixtureTarball({ "dist/standalone.iife.js": "// COM-1\n" });
  try {
    assert.deepEqual(await scanTarball(tgz, { requireDeclarations: false }), []);
  } finally {
    cleanup();
  }
});
