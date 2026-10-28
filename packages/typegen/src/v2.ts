/**
 * @comvi/typegen v2 — the 0.8 generator (design rev 3 §3.8, R3-18): wire schema v2, the
 * one `Catalogs` emitter, and the Node API `generate()` / `watch()` every wrapper calls.
 */
export { generate, watch, writeIfChanged } from "./v2/generate";
export type {
  From,
  GenerateMessage,
  GenerateOptions,
  GenerateResult,
  WatchOptions,
  Watcher,
} from "./v2/generate";
export { emitCatalogs, EmitError, RESERVED_PARAMS } from "./v2/emit";
export type { EmitCatalogsOptions } from "./v2/emit";
export { parseWireSchema, serializeWireSchema, PARAM_KINDS, WIRE_VERSION } from "./v2/wire";
export type { ParamKind, WireKey, WireParam, WireSchema } from "./v2/wire";
export { readMessage } from "./v2/read";
export type { ReadMessage, ReadParam } from "./v2/read";
export { buildWireKey } from "./v2/build";
export type { SchemaWarning } from "./v2/build";
export { CatalogFileError, LocalSource, DEFAULT_FILE_TEMPLATE } from "./v2/local";
export type { LocalSourceOptions } from "./v2/local";
export { PlatformError, PlatformSource } from "./v2/platform";
export type { PlatformSourceOptions } from "./v2/platform";
