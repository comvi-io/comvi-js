#!/usr/bin/env node
/**
 * Copies the shared locale-routing source into this package's runtime tree.
 *
 * WHY a copy and not an import: `nuxt-module-build` transpiles `src/runtime/`
 * FILE BY FILE and leaves bare specifiers in place, so a runtime module that
 * imports a workspace-private package would ship an unresolvable import. next's
 * rolldown build inlines the same source instead; nuxt has no bundling step to
 * inline it with, so the copy is the inlining.
 *
 * The generated file is COMMITTED: it must be inside the published tarball, and
 * it must exist on a fresh clone before `nuxt-module-build` runs. A generated
 * file that is only produced by a prebuild step is a file that breaks the first
 * build after checkout.
 *
 * `tests/vendor-parity.test.ts` fails if the committed copy drifts from the
 * source, so regenerating is never optional.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const repoRoot = path.resolve(packageDir, "..", "..");

export const SOURCE_FILE = path.join(repoRoot, "packages/locale-routing/src/index.ts");
export const VENDORED_FILE = path.join(packageDir, "src/runtime/_vendor/locale-routing.ts");

/** Prepended to the copy. `tests/vendor-parity.test.ts` splits on it. */
export const HEADER = [
  "// GENERATED from packages/locale-routing/src/index.ts — do not edit;",
  "// run pnpm --filter @comvi/nuxt vendor",
  "",
].join("\n");

export function renderVendored(source) {
  return `${HEADER}${source}`;
}

export function vendorLocaleRouting() {
  const source = readFileSync(SOURCE_FILE, "utf8");
  mkdirSync(path.dirname(VENDORED_FILE), { recursive: true });
  writeFileSync(VENDORED_FILE, renderVendored(source));
  return VENDORED_FILE;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const written = vendorLocaleRouting();
  console.log(`vendor-locale-routing: wrote ${path.relative(repoRoot, written)}`);
}
