/**
 * The CLI's emitter is `@comvi/typegen`. These pin the seam between them: the
 * published schema types are the shared ones, the deprecated `TypeEmitter`
 * still produces the CLI's own file, and a schema the emitter refuses reaches
 * the command as a `TypegenError` so `comvi typegen` keeps its exit code.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import { emitDeclarations } from "@comvi/typegen";
import type {
  KeySchema as SharedKeySchema,
  ProjectSchema as SharedProjectSchema,
  SchemaParam as SharedSchemaParam,
} from "@comvi/typegen";
import { CLI_GENERATED_BY, TypeEmitter } from "../src/core/TypeEmitter";
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

  it("keeps the deprecated TypeEmitter byte-identical to the shared emitter", () => {
    expect(new TypeEmitter().generate(SCHEMA)).toBe(
      emitDeclarations(SCHEMA, { generatedBy: CLI_GENERATED_BY }),
    );
  });

  it("maps defaultNsName onto the shared defaultNs option", () => {
    expect(new TypeEmitter().generate(SCHEMA, { defaultNsName: "admin" })).toBe(
      emitDeclarations(SCHEMA, { defaultNs: "admin", generatedBy: CLI_GENERATED_BY }),
    );
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
