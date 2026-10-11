/** Schema keys arrive as `"namespace:key"`, e.g. `"common:greeting"`. */

import { emitDeclarations, resolveAugmentationTarget, type ProjectSchema } from "@comvi/typegen";
import { ErrorCodes, TypegenError } from "../utils/errors";

export interface TypeEmitterOptions {
  /**
   * Whether params are required (true) or optional (false)
   * @default true
   */
  strictParams?: boolean;

  /**
   * Default namespace name. Keys from this namespace will be generated
   * without the namespace prefix for cleaner autocomplete.
   * @default 'default'
   * @example
   * // With defaultNsName: 'default'
   * // 'default:home.title' → 'home.title'
   * // 'admin:dashboard' → 'admin:dashboard'
   */
  defaultNsName?: string;

  /**
   * Module the declarations augment. `cliAugmentationTarget()` answers this
   * for a project; a caller that names nothing gets `@comvi/core`.
   */
  augment?: string;
}

/**
 * The CLI's call into the shared emitter.
 *
 * The shared emitter throws a plain `Error` for a schema it cannot express; the
 * CLI reports a `TypegenError` so `comvi typegen` keeps its exit code. The
 * message is carried over untouched — the command prints it verbatim, so a
 * context prefix would change what the user reads.
 */
export function emitCliDeclarations(
  schema: ProjectSchema,
  options: TypeEmitterOptions = {},
): string {
  try {
    // No header line of its own: `@comvi/typegen` owns the whole file, this
    // tool included. The CLI used to stamp its name on header line 3 while
    // `@comvi/vite-plugin` stamped its own, and `check()` compares the file on
    // disk against fresh output literally — so a project generating with the
    // plugin in dev and checking with the CLI in CI saw drift on every run.
    return emitDeclarations(schema, {
      strictParams: options.strictParams,
      defaultNs: options.defaultNsName,
      augment: options.augment,
    });
  } catch (error) {
    const cause = error instanceof Error ? error : undefined;
    throw new TypegenError(
      cause ? cause.message : String(error),
      ErrorCodes.VALIDATION_FAILED,
      cause,
    );
  }
}

/**
 * The module this project's generated declarations augment: `augment` from the
 * config when it is set, otherwise the Comvi package the project declares.
 *
 * Both the write path and `--check` go through here, so they always agree — the
 * answer comes from the project's own `package.json`, not from what happens to
 * be installed, and is therefore the same on every machine and under every
 * package manager.
 *
 * `appRoot` defaults to the directory `comvi typegen` was run in, which is the
 * project by construction: the config path and the output path are both read
 * relative to it.
 */
export function cliAugmentationTarget(override?: string, appRoot: string = process.cwd()): string {
  try {
    return resolveAugmentationTarget(appRoot, override);
  } catch (error) {
    const cause = error instanceof Error ? error : undefined;
    throw new TypegenError(
      cause ? cause.message : String(error),
      ErrorCodes.VALIDATION_FAILED,
      cause,
    );
  }
}

/**
 * The published, programmatic way to emit declarations from a schema.
 *
 * This class and the `comvi typegen` command are the two supported entry
 * points; the emitter itself is workspace-private and inlined into this build.
 */
export class TypeEmitter {
  generate(schema: ProjectSchema, options: TypeEmitterOptions = {}): string {
    return emitCliDeclarations(schema, options);
  }
}
