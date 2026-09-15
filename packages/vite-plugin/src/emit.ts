/**
 * The declaration format lives in the workspace-private typegen package, shared
 * with the Comvi CLI and inlined into both builds. This module is the plugin's
 * seam onto it and adds nothing to the file: a project that generates types
 * with the CLI in CI and with this plugin in dev gets the same bytes, because
 * neither tool contributes a line of its own any more.
 *
 * The two used to differ in header line 3, each naming itself. `--check`
 * compares the file on disk against fresh output literally, so that one line
 * reported drift a regeneration could never clear.
 */

import {
  emitDeclarations as emitShared,
  type EmitOptions as SharedEmitOptions,
  type ProjectSchema,
} from "@comvi/typegen";

export type EmitOptions = SharedEmitOptions;

export function emitDeclarations(schema: ProjectSchema, options: EmitOptions = {}): string {
  return emitShared(schema, options);
}
