import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "../..");
const fixture = path.join(here, "native-esm-rich-text.mjs");
const clientEntry = path.join(packageRoot, "dist", "client.js");
const reactTChunk = path.resolve(packageRoot, "../react/dist/chunks/comvi-react-T.js");

beforeAll(() => {
  for (const file of [clientEntry, reactTChunk]) {
    if (!fs.existsSync(file)) {
      throw new Error(
        `dist is missing — build @comvi/core, @comvi/react and @comvi/next before this test (${file})`,
      );
    }
  }
});

describe("@comvi/next/client dist: React T remains registration-free", () => {
  it("imports and renders T in a fresh process without enabling string-API tags", () => {
    const stdout = execFileSync(process.execPath, [fixture], {
      cwd: packageRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    expect(stdout).toContain("NEXT_NATIVE_ESM_RICH_TEXT_OK");
  });

  it("reaches React's pure rich-text T chunk, never the ambient tags entry", () => {
    expect(fs.readFileSync(clientEntry, "utf8")).not.toContain("@comvi/core/tags");
    const tChunk = fs.readFileSync(reactTChunk, "utf8");
    expect(tChunk).toContain("@comvi/core/rich-text");
    expect(tChunk).not.toContain("@comvi/core/tags");
  });
});
