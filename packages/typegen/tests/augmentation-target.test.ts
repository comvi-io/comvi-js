import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AUGMENTABLE_MODULES,
  chooseAugmentationTarget,
  emitCatalogs,
  resolveAugmentationTarget,
  type WireSchema,
} from "../src/index";

const SCHEMA: WireSchema = { v: 2, sourceLocale: "en", namespaces: { default: { hello: {} } } };

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

  /** The message `resolveAugmentationTarget` throws, or `undefined` when it returns. */
  function errorMessage(appRoot: string, override?: string): string | undefined {
    try {
      resolveAugmentationTarget(appRoot, override);
    } catch (error) {
      return (error as Error).message;
    }
    return undefined;
  }

  it("says an empty override is empty, blank or not", () => {
    const empty =
      "`augment` is empty. Name the module the generated types should augment, " +
      "or remove the option to use the one this app declares.";

    expect(errorMessage(appDir({}), "")).toBe(empty);
    expect(errorMessage(appDir({}), "  ")).toBe(empty);
  });

  it("trims the override it returns", () => {
    expect(resolveAugmentationTarget(appDir({}), "  @my/own-wrapper  ")).toBe("@my/own-wrapper");
  });

  it("quotes the override it refuses", () => {
    expect(errorMessage(appDir({}), "my wrapper")).toBe(
      "`augment` must be a module specifier (letters, digits and @ # . / : ~ + - _), " +
        'received "my wrapper"',
    );
  });

  it("explains in full what to declare when the app declares nothing", () => {
    const app = appDir({ dependencies: { react: "^19.0.0" } });

    expect(errorMessage(app)).toBe(
      `Generated types have to augment a Comvi module, and ${path.join(app, "package.json")} declares none.\n` +
        "Add the package this app imports `t()` from to its dependencies — one of " +
        "@comvi/react, @comvi/next, @comvi/vue, @comvi/nuxt, @comvi/svelte, @comvi/solid — " +
        "or `@comvi/core` itself. Declaring it in a workspace root or under peerDependencies " +
        "is not enough: this app's own package.json must list it, or set `augment` — which " +
        "is also how a private wrapper package that re-exports one of them is named.",
    );
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

  it("says that a workspace root or a peer declaration is not enough", () => {
    // The rule reads two fields of ONE manifest, so an app whose Comvi
    // dependency is declared only at a workspace root — or only as a peer — is
    // refused, where the old physical `node_modules` lookup found a hoisted
    // copy and passed. The message has to name that, or the fix looks absent.
    const app = appDir({ peerDependencies: { "@comvi/react": "^0.5.0" } });

    expect(() => resolveAugmentationTarget(app)).toThrow(
      /workspace root or under peerDependencies is not enough/,
    );
  });

  it("takes a Comvi package declared as a peer AND a devDependency", () => {
    // The honest peer case is a component library that localizes its own
    // components: it declares the binding as a peer for its consumers and as a
    // devDependency for itself, and the devDependency is what this reads.
    const app = appDir({
      peerDependencies: { "@comvi/react": "^0.5.0" },
      devDependencies: { "@comvi/react": "^0.5.0" },
    });

    expect(resolveAugmentationTarget(app)).toBe("@comvi/react");
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
    const output = emitCatalogs(SCHEMA, { augment: "@comvi/nuxt" });

    expect(output).toContain("import '@comvi/nuxt';");
    expect(output).toContain("declare module '@comvi/nuxt' {");
    expect(output.split("\n")[1]).toContain("@comvi/nuxt");
  });

  it("augments @comvi/core when the caller names no module", () => {
    const output = emitCatalogs(SCHEMA);

    expect(output).toContain("declare module '@comvi/core' {");
  });
});

/**
 * `augment` is pasted into the header comment, the side-effect import and the
 * `declare module` line. A quote, backslash or line break in it used to close
 * the string and inject declarations into the generated file.
 */
describe("augment must be a plain module specifier", () => {
  const INJECTION = "wrapper';\ndeclare global { var injected: true }\n//";

  const refused: Array<[label: string, value: string]> = [
    ["a quote-and-newline injection", INJECTION],
    ["a single quote", "a'b"],
    ["a double quote", 'a"b'],
    ["a backslash", "a\\b"],
    ["a backtick", "a`b"],
    ["a line feed", "a\nb"],
    ["a line separator", "a b"],
    ["a NUL", "a\u0000b"],
    ["inner whitespace", "my wrapper"],
    ["a comment closer", "a*/b"],
  ];

  const accepted = [
    "@acme/i18n",
    "acme-i18n",
    "@acme/i18n/types",
    "@my_org.x/pkg-1",
    "#i18n",
    "./wrapper",
    "~/i18n",
  ];

  it.each(refused)("resolveAugmentationTarget refuses %s", (_label, value) => {
    expect(() => resolveAugmentationTarget(appDir({}), value)).toThrow(
      `\`augment\` must be a module specifier`,
    );
  });

  it.each(refused)("emitCatalogs refuses %s", (_label, value) => {
    expect(() => emitCatalogs(SCHEMA, { augment: value })).toThrow(
      `\`augment\` must be a module specifier`,
    );
  });

  it.each(accepted)("accepts %s and emits it verbatim", (value) => {
    expect(resolveAugmentationTarget(appDir({}), value)).toBe(value);
    const output = emitCatalogs(SCHEMA, { augment: value });
    expect(output).toContain(`import '${value}';`);
    expect(output).toContain(`declare module '${value}' {`);
  });
});
