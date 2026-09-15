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
import { cliAugmentationTarget, TypeEmitter } from "../src/core/TypeEmitter";
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

  it("writes a header that names no tool, only the augmented module", () => {
    // The Vite plugin writes the same bytes for the same schema. `check()`
    // compares the file on disk literally, so a CLI-only header line made a
    // Vite-generated file look stale in CI.
    const header = new TypeEmitter().generate(SCHEMA, { augment: "@comvi/vue" }).split("\n");

    expect(header[1]).toBe(" * Auto-generated translation keys, augmenting '@comvi/vue'");
    expect(header[2]).toBe(" * DO NOT EDIT — this file is generated from your translation schema");
    expect(header.slice(0, 4).join("\n")).not.toContain("@comvi/cli");
  });

  it("maps defaultNsName onto the shared defaultNs option", () => {
    expect(new TypeEmitter().generate(SCHEMA, { defaultNsName: "admin" })).toBe(
      emitDeclarations(SCHEMA, { defaultNs: "admin" }),
    );
  });

  describe("the module the declarations augment", () => {
    const tempDirs: string[] = [];

    afterEach(() => {
      for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
    });

    /** A project directory whose manifest declares `dependencies`. */
    function project(dependencies: Record<string, string>): string {
      const dir = fs.mkdtempSync(nodePath.join(os.tmpdir(), "comvi-cli-augment-"));
      tempDirs.push(dir);
      fs.writeFileSync(
        nodePath.join(dir, "package.json"),
        JSON.stringify({ name: "app", dependencies }),
      );
      return dir;
    }

    it("answers with the Comvi package the project declares", () => {
      expect(cliAugmentationTarget(undefined, project({ "@comvi/solid": "^0.5.0" }))).toBe(
        "@comvi/solid",
      );
    });

    it("takes the configured override over the manifest", () => {
      expect(cliAugmentationTarget("@acme/i18n", project({ "@comvi/solid": "*" }))).toBe(
        "@acme/i18n",
      );
    });

    it("reports a project that declares none as a TypegenError, so the exit code holds", () => {
      expect(() => cliAugmentationTarget(undefined, project({ react: "^19.0.0" }))).toThrow(
        expect.objectContaining({
          name: "TypegenError",
          code: ErrorCodes.VALIDATION_FAILED,
          message: expect.stringContaining("@comvi/react"),
        }),
      );
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
