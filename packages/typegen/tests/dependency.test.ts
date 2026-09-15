import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AUGMENTED_MODULE, augmentationTargetError, emitDeclarations } from "../src/index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** An app directory, optionally with `@comvi/core` installed at one ancestor. */
function appDir(options: { installedAt?: "app" | "parent" } = {}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-typegen-dep-"));
  tempDirs.push(root);
  const app = path.join(root, "workspace", "app");
  fs.mkdirSync(app, { recursive: true });

  if (options.installedAt) {
    const host = options.installedAt === "app" ? app : path.join(root, "workspace");
    const pkg = path.join(host, "node_modules", ...AUGMENTED_MODULE.split("/"));
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(path.join(pkg, "package.json"), '{ "name": "@comvi/core" }');
  }

  return app;
}

describe("augmentationTargetError", () => {
  it("passes when the augmented module is installed in the app itself", () => {
    expect(augmentationTargetError(appDir({ installedAt: "app" }))).toBeUndefined();
  });

  it("passes when a workspace root above the app holds the install", () => {
    // Hoisting is the common case: the app's own node_modules has no copy, and
    // TypeScript walks up to the one the workspace root installed.
    expect(augmentationTargetError(appDir({ installedAt: "parent" }))).toBeUndefined();
  });

  it("reports the app that cannot reach the augmented module", () => {
    const app = appDir();

    expect(augmentationTargetError(app)).toContain(app);
  });

  it("names the module and the command that installs it", () => {
    const message = augmentationTargetError(appDir())!;

    expect(message).toContain(AUGMENTED_MODULE);
    expect(message).toContain(`pnpm add -D ${AUGMENTED_MODULE}`);
  });

  it("says what TypeScript does without it, in both skipLibCheck settings", () => {
    // The failure the review found is silent: skipLibCheck hides TS2882 and
    // every unknown key then type-checks. The message has to name that, or a
    // reader turns skipLibCheck on and believes the problem is solved.
    const message = augmentationTargetError(appDir())!;

    expect(message).toContain("TS2882");
    expect(message).toContain("skipLibCheck");
  });
});

describe("the module the emitter augments", () => {
  it("is the one the generated file imports and declares", () => {
    const output = emitDeclarations({ keys: { "default:hello": { params: [] } } });

    expect(output).toContain(`import '${AUGMENTED_MODULE}';`);
    expect(output).toContain(`declare module '${AUGMENTED_MODULE}' {`);
  });
});
