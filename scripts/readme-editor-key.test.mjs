/**
 * The in-context editor's API key can overwrite translations, and a key in a
 * browser bundle is readable by every visitor. A README snippet that composes
 * the editor must therefore read the key behind a condition a deployed build
 * cannot set: `import.meta.env.DEV`. A flag such as `VITE_COMVI_EDITOR` is not
 * one, because a preview deployment is a production build with that flag on.
 *
 * This lives outside scripts/docs-snippets on purpose: that module is copied
 * into the www repository and pinned there by hash.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const readmes = [
  "README.md",
  ...fs
    .readdirSync(path.join(root, "packages"))
    .map((entry) => path.join("packages", entry, "README.md"))
    .filter((file) => fs.existsSync(path.join(root, file))),
];

/** Every fenced block of `source` that composes the editor. */
function editorFences(source) {
  return [...source.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)]
    .map((match) => match[1])
    .filter((code) => /\binContextEditor\(/.test(code));
}

/** The lines of `code` that read `apiKey` from the environment without a condition. */
export function ungatedKeyLines(code) {
  return code
    .split("\n")
    .filter((line) => /\bapiKey\s*:.*\benv\b/.test(line))
    .filter((line) => !/\bapiKey\s*:\s*(import\.meta\.env\.DEV|editorEnabled)\s*\?/.test(line))
    .map((line) => line.trim());
}

/** The declarations of `editorEnabled` in `code` that are anything but `import.meta.env.DEV`. */
export function widenedGates(code) {
  return code
    .split("\n")
    .filter((line) => /\beditorEnabled\s*=/.test(line))
    .filter((line) => !/\beditorEnabled\s*=\s*import\.meta\.env\.DEV;\s*$/.test(line))
    .map((line) => line.trim());
}

test("an ungated key → reported", () => {
  assert.deepEqual(ungatedKeyLines("  apiKey: import.meta.env.VITE_COMVI_EDITOR_API_KEY,"), [
    "apiKey: import.meta.env.VITE_COMVI_EDITOR_API_KEY,",
  ]);
});

test("a key behind import.meta.env.DEV → not reported", () => {
  assert.deepEqual(
    ungatedKeyLines(
      "  apiKey: import.meta.env.DEV ? import.meta.env.VITE_COMVI_EDITOR_API_KEY : undefined,",
    ),
    [],
  );
});

test("a gate widened with a flag a deployed build can set → reported", () => {
  const line =
    'const editorEnabled = import.meta.env.DEV || import.meta.env.VITE_COMVI_EDITOR === "true";';

  assert.deepEqual(widenedGates(line), [line]);
});

test("a gate that is import.meta.env.DEV alone → not reported", () => {
  assert.deepEqual(widenedGates("const editorEnabled = import.meta.env.DEV;"), []);
});

for (const file of readmes) {
  test(`${file}: every editor snippet reads the key behind import.meta.env.DEV`, () => {
    const fences = editorFences(fs.readFileSync(path.join(root, file), "utf8"));

    assert.deepEqual(fences.flatMap(ungatedKeyLines), []);
    assert.deepEqual(fences.flatMap(widenedGates), []);
  });
}

test("the editor README has snippets for the rule to read", () => {
  const source = fs.readFileSync(
    path.join(root, "packages/plugin-in-context-editor/README.md"),
    "utf8",
  );

  assert.equal(editorFences(source).length, 2);
});
