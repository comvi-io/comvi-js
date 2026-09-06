import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { isValidSpecifier } from "./examples-use-tag.mjs";
import { strays } from "./examples-sync-locales.mjs";

/**
 * The two pure exports the examples tooling grew that
 * `examples-verify.test.mjs` does not reach: the argument validator that stands
 * between a typo and five rewritten manifests, and the half of the locale check
 * that looks in the direction the copy loop cannot.
 */

/** A fixture repo root: `examples/<name>/src/locales/*.json` plus a manifest. */
function fixture(examples) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-examples-tools-"));
  for (const [name, catalogs] of Object.entries(examples)) {
    const dir = path.join(root, "examples", name, "src", "locales");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(root, "examples", name, "package.json"), "{}\n");
    for (const catalog of catalogs) fs.writeFileSync(path.join(dir, catalog), "{}\n");
  }
  return root;
}

/** The shared `examples/locales`, as its own directory so it can be varied. */
function source(catalogs) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-examples-source-"));
  for (const catalog of catalogs) fs.writeFileSync(path.join(dir, catalog), "{}\n");
  return dir;
}

test("isValidSpecifier accepts a dist-tag", () => {
  assert.equal(isValidSpecifier("next"), true);
  assert.equal(isValidSpecifier("latest"), true);
});

test("isValidSpecifier accepts the range forms the README documents", () => {
  // `^0.5.0` is the one that matters most: it is the documented way back off a
  // dist-tag, so a pattern that rejects it makes the script one-way.
  assert.equal(isValidSpecifier("^0.5.0"), true);
  assert.equal(isValidSpecifier("~0.5.0"), true);
  assert.equal(isValidSpecifier("0.5.0-rc.1"), true);
  assert.equal(isValidSpecifier(">=0.5.0 <0.6.0"), true);
});

test("isValidSpecifier rejects an empty specifier", () => {
  assert.equal(isValidSpecifier(""), false);
});

test("isValidSpecifier rejects anything starting with a dash", () => {
  // `-anything` is a flag the caller thought they were passing, not a version.
  assert.equal(isValidSpecifier("-1.0.0"), false);
  assert.equal(isValidSpecifier("--force"), false);
});

test("isValidSpecifier rejects specifiers that would install from outside npm", () => {
  // The examples exist to prove they install from the registry; a `file:` or
  // git specifier written into all five manifests destroys exactly that.
  assert.equal(isValidSpecifier("file:../evil"), false);
  assert.equal(isValidSpecifier("git+ssh://x/y"), false);
});

test("isValidSpecifier rejects a specifier carrying a newline", () => {
  // JavaScript's `$` without the `m` flag does not match before a trailing
  // newline, so a shell-mangled `next\n` is refused rather than written.
  assert.equal(isValidSpecifier("next\n"), false);
  assert.equal(isValidSpecifier("a\nb"), false);
});

test("strays reports a catalog that exists only in an example, with its path", () => {
  const root = fixture({ solid: ["en.json", "uk.json", "de.json", "fr.json"] });

  assert.deepEqual(strays(root, source(["en.json", "uk.json", "de.json"])), [
    path.join("examples", "solid", "src", "locales", "fr.json"),
  ]);
});

test("strays reports nothing when every example carries exactly the shared set", () => {
  const root = fixture({
    react: ["en.json", "uk.json", "de.json"],
    vue: ["en.json", "uk.json", "de.json"],
  });

  assert.deepEqual(strays(root, source(["en.json", "uk.json", "de.json"])), []);
});

test("strays does not report a shared catalog that an example is missing", () => {
  // That is drift too, but it is the copy loop's finding — this direction only
  // answers "what is here that should not be".
  const root = fixture({ vanilla: ["en.json"] });

  assert.deepEqual(strays(root, source(["en.json", "uk.json", "de.json"])), []);
});

test("strays collects from every example, not just the first", () => {
  const root = fixture({
    react: ["en.json", "fr.json"],
    svelte: ["en.json"],
    vue: ["en.json", "es.json"],
  });

  assert.deepEqual(strays(root, source(["en.json"])), [
    path.join("examples", "react", "src", "locales", "fr.json"),
    path.join("examples", "vue", "src", "locales", "es.json"),
  ]);
});

test("strays ignores files that are not catalogs", () => {
  const root = fixture({ react: ["en.json"] });
  fs.writeFileSync(
    path.join(root, "examples", "react", "src", "locales", "README.md"),
    "not a catalog\n",
  );

  assert.deepEqual(strays(root, source(["en.json"])), []);
});
