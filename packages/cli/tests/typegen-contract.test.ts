/**
 * The CLI's emitter is the workspace-private `@comvi/typegen`, inlined into this
 * package's build. These pin the seam between them: the published schema types
 * are the shared ones (declared by the CLI's own rolled-up `.d.ts`, since
 * nothing published may import the private package), `TypeEmitter` still
 * produces the CLI's own file, and a schema the emitter refuses reaches the
 * command as a `TypegenError` so `comvi typegen` keeps its exit code.
 */
import { afterEach, describe, it, expect, expectTypeOf } from "vitest";
import { emitDeclarations } from "@comvi/typegen";
import type {
  KeySchema as SharedKeySchema,
  ProjectSchema as SharedProjectSchema,
  SchemaParam as SharedSchemaParam,
} from "@comvi/typegen";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { assertAugmentationTarget, TypeEmitter } from "../src/core/TypeEmitter";
import { ErrorCodes } from "../src/utils/errors";
import type { KeySchema, ProjectSchema, SchemaParam } from "../src/types";

const SCHEMA: ProjectSchema = {
  keys: {
    "default:greeting": { params: [{ name: "name", type: "string" }] },
    "admin:dashboard": { params: [] },
  },
};

describe("@comvi/cli over @comvi/typegen", () => {
  it("publishes the shared schema types under its own names", () => {
    expectTypeOf<ProjectSchema>().toEqualTypeOf<SharedProjectSchema>();
    expectTypeOf<KeySchema>().toEqualTypeOf<SharedKeySchema>();
    expectTypeOf<SchemaParam>().toEqualTypeOf<SharedSchemaParam>();

    // A schema built against the CLI's names is accepted by the shared emitter.
    const shared: SharedProjectSchema = SCHEMA;
    expect(emitDeclarations(shared)).toContain('"admin:dashboard": never;');
  });

  it("keeps TypeEmitter byte-identical to the shared emitter", () => {
    expect(new TypeEmitter().generate(SCHEMA)).toBe(emitDeclarations(SCHEMA));
  });

  it("writes the tool-neutral header, byte-identical to the shared emitter's output", () => {
    // The Vite plugin writes the same bytes for the same schema. `check()`
    // compares the file on disk literally, so a CLI-only header line made a
    // Vite-generated file look stale in CI.
    expect(new TypeEmitter().generate(SCHEMA)).toBe(emitDeclarations(SCHEMA));
  });

  it("maps defaultNsName onto the shared defaultNs option", () => {
    expect(new TypeEmitter().generate(SCHEMA, { defaultNsName: "admin" })).toBe(
      emitDeclarations(SCHEMA, { defaultNs: "admin" }),
    );
  });

  describe("the @comvi/core dependency the generated declarations augment", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    });

    /** An app directory, with or without `@comvi/core` installed for it. */
    function appDir(withCore: boolean): string {
      const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "comvi-cli-augment-"));
      tempDirs.push(dir);

      if (withCore) {
        const pkg = nodePath.join(dir, "node_modules", "@comvi", "core");
        fs.mkdirSync(pkg, { recursive: true });
        fs.writeFileSync(nodePath.join(pkg, "package.json"), '{ "name": "@comvi/core" }');
      }

      return dir;
    }

    it("refuses an app that cannot resolve it, naming the install command", () => {
      // The documented framework install adds only the binding, and core is its
      // transitive dependency: under a strict layout the app cannot reach the
      // module the generated file augments, and the declarations do nothing.
      expect(() => assertAugmentationTarget(appDir(false))).toThrow(
        expect.objectContaining({
          name: "TypegenError",
          code: ErrorCodes.VALIDATION_FAILED,
          message: expect.stringContaining("pnpm add -D @comvi/core"),
        }),
      );
    });

    it("accepts an app that has it installed", () => {
      expect(() => assertAugmentationTarget(appDir(true))).not.toThrow();
    });
  });

  it("rethrows an emitter refusal as a TypegenError, message untouched", () => {
    const unemittable: ProjectSchema = {
      keys: { "admin:greeting": { params: [{ name: "onDone", type: "() => void" as never }] } },
    };

    expect(() => new TypeEmitter().generate(unemittable)).toThrow(
      expect.objectContaining({
        name: "TypegenError",
        code: ErrorCodes.VALIDATION_FAILED,
        message: expect.stringMatching(/^Unsupported param type for translation key/),
      }),
    );
  });

  it("rethrows a non-Error thrown by the emitter as a TypegenError", () => {
    const exploding = {
      get keys(): ProjectSchema["keys"] {
        throw "schema unreadable";
      },
    } as ProjectSchema;

    expect(() => new TypeEmitter().generate(exploding)).toThrow(
      expect.objectContaining({
        name: "TypegenError",
        code: ErrorCodes.VALIDATION_FAILED,
        message: "schema unreadable",
      }),
    );
  });
});
