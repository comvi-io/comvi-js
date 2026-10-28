/**
 * Typegen wire schema v2 (design rev 3 §3.8) — the one input the emitter reads, from
 * every source: the platform route `GET /v1/projects/:id/schema/v2`, and a local
 * directory of JSON catalogs read by `local.ts`.
 *
 *   { "v": 2, "sourceLocale": "en", "namespaces": { "<ns>": { "<key>": {
 *       "params"?: { "<name>": { "kind": "<kind>", "options"?: [...], "other"?: bool } },
 *       "tags"?: ["<tag>", ...] } } } }
 *
 * The shape is the platform's (`platform/apps/api/src/modules/translations/typegen/
 * schema-v2.ts`, `WireSchemaV2`); this module validates it strictly, because a schema
 * the emitter half-understands produces declarations nobody can debug.
 */

export const WIRE_VERSION = 2;

/** Every kind a v2 schema can carry. `date`/`time`/`number` exist in messages core refuses (R3-8). */
export const PARAM_KINDS = [
  "string",
  "number",
  "plural",
  "selectordinal",
  "select",
  "date",
  "time",
] as const;
export type ParamKind = (typeof PARAM_KINDS)[number];

export interface WireParam {
  kind: ParamKind;
  /** `select` only: the selectors other than `other`, in message order. */
  options?: string[];
  /** `select` only: the message has an `other` branch, so any string renders. */
  other?: boolean;
}

export interface WireKey {
  params?: Record<string, WireParam>;
  tags?: string[];
}

export interface WireSchema {
  v: typeof WIRE_VERSION;
  sourceLocale: string;
  namespaces: Record<string, Record<string, WireKey>>;
}

/** Null-prototype record: a key or param named `__proto__` is ordinary data. */
export const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/**
 * Validates a parsed wire schema and returns a copy built from null-prototype records.
 * Throws one error naming the first thing that is wrong, with its path.
 */
export function parseWireSchema(input: unknown): WireSchema {
  const fail = (path: string, what: string): never => {
    throw new Error(`Invalid typegen schema v2 at ${path}: ${what}`);
  };
  if (!isObject(input)) fail("(root)", "expected an object");
  const root = input as Record<string, unknown>;
  if (root.v !== WIRE_VERSION)
    fail("v", `expected ${WIRE_VERSION}, received ${JSON.stringify(root.v)}`);
  if (typeof root.sourceLocale !== "string" || root.sourceLocale === "")
    fail("sourceLocale", "expected a non-empty string");
  if (!isObject(root.namespaces)) fail("namespaces", "expected an object");

  const namespaces = record<Record<string, WireKey>>();
  for (const [ns, keys] of Object.entries(root.namespaces as Record<string, unknown>)) {
    const nsPath = `namespaces[${JSON.stringify(ns)}]`;
    if (!isObject(keys)) fail(nsPath, "expected an object of keys");
    const out = record<WireKey>();
    for (const [key, entry] of Object.entries(keys as Record<string, unknown>)) {
      const keyPath = `${nsPath}[${JSON.stringify(key)}]`;
      if (!isObject(entry)) fail(keyPath, "expected an object");
      const e = entry as Record<string, unknown>;
      const copy: WireKey = {};
      if (e.params !== undefined) {
        if (!isObject(e.params)) fail(`${keyPath}.params`, "expected an object");
        const params = record<WireParam>();
        for (const [name, param] of Object.entries(e.params as Record<string, unknown>)) {
          const paramPath = `${keyPath}.params[${JSON.stringify(name)}]`;
          if (!isObject(param)) fail(paramPath, "expected an object");
          const p = param as Record<string, unknown>;
          if (!PARAM_KINDS.includes(p.kind as ParamKind))
            fail(
              `${paramPath}.kind`,
              `expected one of ${PARAM_KINDS.join(", ")}, received ${JSON.stringify(p.kind)}`,
            );
          const out: WireParam = { kind: p.kind as ParamKind };
          if (p.options !== undefined) {
            if (!isStringArray(p.options))
              fail(`${paramPath}.options`, "expected an array of strings");
            out.options = [...(p.options as string[])];
          }
          if (p.other !== undefined) {
            if (typeof p.other !== "boolean") fail(`${paramPath}.other`, "expected a boolean");
            out.other = p.other as boolean;
          }
          params[name] = out;
        }
        copy.params = params;
      }
      if (e.tags !== undefined) {
        if (!isStringArray(e.tags)) fail(`${keyPath}.tags`, "expected an array of strings");
        copy.tags = [...(e.tags as string[])];
      }
      out[key] = copy;
    }
    namespaces[ns] = out;
  }
  return { v: WIRE_VERSION, sourceLocale: root.sourceLocale as string, namespaces };
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The schema as canonical JSON: namespaces, keys and params in code-unit order, select
 * options and tags as given (message order of the source locale). Two sources that read
 * the same catalogs serialize to the same bytes (`comvi pull`, `.comvi/schema.json`).
 */
export function serializeWireSchema(schema: WireSchema): string {
  // Null-prototype records: a namespace, key or param named `__proto__` is data, kept.
  const namespaces = record<Record<string, WireKey>>();
  for (const ns of Object.keys(schema.namespaces).sort(byCodeUnit)) {
    const keys = record<WireKey>();
    const source = schema.namespaces[ns];
    for (const key of Object.keys(source).sort(byCodeUnit)) {
      const entry = source[key];
      const out: WireKey = {};
      if (entry.params && Object.keys(entry.params).length > 0) {
        const params = record<WireParam>();
        for (const name of Object.keys(entry.params).sort(byCodeUnit)) {
          const p = entry.params[name];
          params[name] = {
            kind: p.kind,
            ...(p.options !== undefined && { options: p.options }),
            ...(p.other !== undefined && { other: p.other }),
          };
        }
        out.params = params;
      }
      if (entry.tags && entry.tags.length > 0) out.tags = entry.tags;
      keys[key] = out;
    }
    namespaces[ns] = keys;
  }
  return (
    JSON.stringify({ v: schema.v, sourceLocale: schema.sourceLocale, namespaces }, null, 2) + "\n"
  );
}

export { byCodeUnit };
