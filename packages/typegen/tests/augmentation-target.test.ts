import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AUGMENTABLE_MODULES,
  chooseAugmentationTarget,
  emitDeclarations,
  resolveAugmentationTarget,
} from "../src/index";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** An app directory whose `package.json` declares exactly `manifest`. */
function appDir(manifest: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comvi-typegen-target-"));
  tempDirs.push(dir);
  if (manifest !== undefined) {
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
  }
  return dir;
}

describe("chooseAugmentationTarget", () => {
  it("takes @comvi/core when the app declares it", () => {
    expect(
      chooseAugmentationTarget({
        dependencies: { "@comvi/react": "^0.5.0", "@comvi/core": "^0.5.0" },
      }),
    ).toBe("@comvi/core");
  });

  it("takes the declared binding when core is not declared", () => {
    // The documented install is one package. Core arrives as the binding's
    // transitive dependency, which a strict layout does not let the app name.
    expect(chooseAugmentationTarget({ dependencies: { "@comvi/react": "^0.5.0" } })).toBe(
      "@comvi/react",
    );
  });

  it("reads devDependencies too, where a type-only dependency belongs", () => {
    expect(chooseAugmentationTarget({ devDependencies: { "@comvi/nuxt": "^0.5.0" } })).toBe(
      "@comvi/nuxt",
    );
  });

  it("picks by a fixed order, not by the manifest's key order", () => {
    // Two machines must choose the same target for the same app, or the file
    // one writes is drift to the other's `--check`.
    const manifest = { dependencies: { "@comvi/solid": "*", "@comvi/vue": "*" } };
    const reversed = { dependencies: { "@comvi/vue": "*", "@comvi/solid": "*" } };

    expect(chooseAugmentationTarget(manifest)).toBe(chooseAugmentationTarget(reversed));
    expect(chooseAugmentationTarget(manifest)).toBe("@comvi/vue");
  });

  it("ignores a Comvi package that is not an augmentation target", () => {
    expect(
      chooseAugmentationTarget({ devDependencies: { "@comvi/vite-plugin": "^0.5.0" } }),
    ).toBeUndefined();
  });

  it("ignores inherited keys on the dependency maps", () => {
    const dependencies = Object.create({ "@comvi/react": "^0.5.0" }) as Record<string, string>;

    expect(chooseAugmentationTarget({ dependencies })).toBeUndefined();
  });

  it("offers core and the six bindings, core first", () => {
    expect([...AUGMENTABLE_MODULES]).toEqual([
      "@comvi/core",
      "@comvi/react",
      "@comvi/next",
      "@comvi/vue",
      "@comvi/nuxt",
      "@comvi/svelte",
      "@comvi/solid",
    ]);
  });
});

describe("resolveAugmentationTarget", () => {
  it("reads the app's manifest and returns the chosen module", () => {
    const app = appDir({ dependencies: { "@comvi/svelte": "^0.5.0" } });

    expect(resolveAugmentationTarget(app)).toBe("@comvi/svelte");
  });

  it("takes an explicit override over anything the manifest declares", () => {
    const app = appDir({ dependencies: { "@comvi/react": "^0.5.0" } });

    expect(resolveAugmentationTarget(app, "@my/own-wrapper")).toBe("@my/own-wrapper");
  });

  it("rejects an override that is not a module specifier", () => {
    expect(() => resolveAugmentationTarget(appDir({}), "  ")).toThrow(/augment/);
  });

  it("names every module the app could declare when it declares none", () => {
    const app = appDir({ dependencies: { react: "^19.0.0" } });

    expect(() => resolveAugmentationTarget(app)).toThrow(
      expect.objectContaining({
        message: expect.stringContaining("@comvi/react"),
      }),
    );
    expect(() => resolveAugmentationTarget(app)).toThrow(/augment/);
  });

  it("says where it looked when the app has no manifest", () => {
    const app = appDir(undefined);

    expect(() => resolveAugmentationTarget(app)).toThrow(app);
  });

  it("does not look at node_modules, so a strict or PnP layout resolves the same", () => {
    // The old guard walked `node_modules` for an installed copy. Yarn PnP has
    // no `node_modules` at all, so a correctly configured PnP app could not
    // generate types. Declaring the dependency is the whole question now.
    const app = appDir({ dependencies: { "@comvi/react": "^0.5.0" } });

    expect(fs.existsSync(path.join(app, "node_modules"))).toBe(false);
    expect(resolveAugmentationTarget(app)).toBe("@comvi/react");
  });
});

describe("the module the emitter augments", () => {
  it("imports, declares and names the requested module", () => {
    const output = emitDeclarations(
      { keys: { "default:hello": { params: [] } } },
      { augment: "@comvi/nuxt" },
    );

    expect(output).toContain("import '@comvi/nuxt';");
    expect(output).toContain("declare module '@comvi/nuxt' {");
    expect(output.split("\n")[1]).toContain("@comvi/nuxt");
  });

  it("augments @comvi/core when the caller names no module", () => {
    const output = emitDeclarations({ keys: { "default:hello": { params: [] } } });

    expect(output).toContain("declare module '@comvi/core' {");
  });
});
